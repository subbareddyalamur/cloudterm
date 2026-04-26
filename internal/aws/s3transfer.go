package aws

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

const (
	presignExpiry    = 15 * time.Minute
	s3TransferPrefix = "cloudterm-transfers"
)

// deleteAllVersions removes an S3 object and all its versions/delete markers,
// ensuring no trace is left even when bucket versioning is enabled.
func deleteAllVersions(ctx context.Context, client *s3.Client, bucket, key string) {
	paginator := s3.NewListObjectVersionsPaginator(client, &s3.ListObjectVersionsInput{
		Bucket: aws.String(bucket),
		Prefix: aws.String(key),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			break
		}
		for _, v := range page.Versions {
			client.DeleteObject(ctx, &s3.DeleteObjectInput{
				Bucket:    aws.String(bucket),
				Key:       aws.String(key),
				VersionId: v.VersionId,
			})
		}
		for _, dm := range page.DeleteMarkers {
			client.DeleteObject(ctx, &s3.DeleteObjectInput{
				Bucket:    aws.String(bucket),
				Key:       aws.String(key),
				VersionId: dm.VersionId,
			})
		}
	}
}

// newS3Client creates an S3 client that automatically follows bucket-region redirects.
func (d *Discovery) newS3Client(ctx context.Context, profile, region string) (*s3.Client, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, d.awsConfigOpts(profile, region)...)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}
	// UsePathStyle=false + no explicit region allows the SDK to follow 301 redirects
	// to the correct bucket region automatically.
	return s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = false
	}), nil
}

// newS3ClientForBucket creates an S3 client using the actual region of the bucket.
// This avoids TLS/redirect issues when the bucket is in a different region than the profile default.
func (d *Discovery) newS3ClientForBucket(ctx context.Context, profile, region, bucket string) (*s3.Client, error) {
	client, err := d.newS3Client(ctx, profile, region)
	if err != nil {
		return nil, err
	}
	// Determine actual bucket region.
	out, err := client.GetBucketLocation(ctx, &s3.GetBucketLocationInput{Bucket: aws.String(bucket)})
	var bucketRegion string
	if err == nil {
		bucketRegion = string(out.LocationConstraint)
	}

	// Fallback to HTTP HEAD request if GetBucketLocation fails (e.g. IAM permission denied)
	if bucketRegion == "" {
		if resp, reqErr := http.Head(fmt.Sprintf("https://%s.s3.amazonaws.com", bucket)); reqErr == nil {
			if r := resp.Header.Get("X-Amz-Bucket-Region"); r != "" {
				bucketRegion = r
			}
		}
	}

	if bucketRegion == "" {
		bucketRegion = "us-east-1"
	}
	if bucketRegion == region {
		return client, nil
	}
	return d.newS3Client(ctx, profile, bucketRegion)
}

func (d *Discovery) ExpressUpload(profile, region, bucket, instanceID, remotePath, platform string, data io.Reader, size int64, onProgress func(TransferProgress)) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	s3Client, err := d.newS3ClientForBucket(ctx, profile, region, bucket)
	if err != nil {
		return err
	}
	ssmClient, err := d.newSSMClient(ctx, profile, region)
	if err != nil {
		return err
	}

	// 1. Upload to S3.
	key := fmt.Sprintf("%s/%s/%s", s3TransferPrefix, uuid.New().String(), remotePath[strings.LastIndexAny(remotePath, "/\\")+1:])
	
	startTime := time.Now()
	var bytesDone int64
	wrappedReader := &progressReader{
		r: data,
		onRead: func(n int) {
			bytesDone += int64(n)
			elapsed := time.Since(startTime).Seconds()
			var speed int64
			var eta int64
			if elapsed > 0 {
				speed = int64(float64(bytesDone) / elapsed)
				if speed > 0 && size > 0 {
					eta = (size - bytesDone) / speed
				}
			}
			pct := 5 + int((float64(bytesDone)/float64(size))*30) // Scale 5-35%
			onProgress(TransferProgress{
				Progress:   pct,
				Message:    "Uploading to S3...",
				Status:     "progress",
				TotalBytes: size,
				SpeedBps:   speed,
				ETASec:     eta,
			})
		},
	}

	_, err = s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
		Body:   wrappedReader,
	})
	if err != nil {
		return fmt.Errorf("S3 upload failed: %w", err)
	}

	// Always clean up S3 object (all versions if versioning is enabled).
	defer func() {
		cleanCtx, cleanCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cleanCancel()
		deleteAllVersions(cleanCtx, s3Client, bucket, key)
	}()

	// 2. Generate presigned GET URL.
	onProgress(TransferProgress{Progress: 40, Message: "Generating download URL...", Status: "progress"})
	presigner := s3.NewPresignClient(s3Client)
	presigned, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(presignExpiry))
	if err != nil {
		return fmt.Errorf("failed to generate presigned URL: %w", err)
	}

	// 3. Tell EC2 to download via curl/PowerShell.
	onProgress(TransferProgress{Progress: 50, Message: "Downloading to instance...", Status: "progress"})

	isWin := strings.EqualFold(platform, "windows")
	docName := "AWS-RunShellScript"
	var cmd string
	if isWin {
		docName = "AWS-RunPowerShellScript"
		cmd = fmt.Sprintf(
			`$d=Split-Path %s; if($d -and !(Test-Path $d)){New-Item -ItemType Directory -Path $d -Force|Out-Null}; `+
				`Invoke-WebRequest -Uri %s -OutFile %s -UseBasicParsing; `+
				`if(Test-Path %s){"OK"}else{throw "file not found after download"}`,
			psQuote(remotePath), psQuote(presigned.URL), psQuote(remotePath), psQuote(remotePath))
	} else {
		qPath := shellQuote(remotePath)
		url := shellQuote(presigned.URL)
		// Try curl first, fall back to wget. Both use presigned URL — no AWS credentials needed on instance.
		cmd = fmt.Sprintf(
			`mkdir -p $(dirname %s) && `+
				`(curl -sSf -o %s %s 2>/dev/null || wget -q -O %s %s) && `+
				`test -s %s && echo OK`,
			qPath, qPath, url, qPath, url, qPath,
		)
	}

	out, err := ssmExecOutput(ctx, ssmClient, instanceID, cmd, docName)
	if err != nil {
		return fmt.Errorf("instance download failed (no curl/wget or S3 error): %w", err)
	}
	if !strings.Contains(out, "OK") {
		return fmt.Errorf("file not written to %s after express upload (empty or missing)", remotePath)
	}

	onProgress(TransferProgress{Progress: 95, Message: "Cleaning up...", Status: "progress"})
	return nil
}

// ExpressDownload generates a presigned PUT URL, tells EC2 to curl-upload the file, downloads from S3, then deletes from S3.
func (d *Discovery) ExpressDownload(profile, region, bucket, instanceID, remotePath, platform string, onProgress func(TransferProgress)) ([]byte, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	s3Client, err := d.newS3ClientForBucket(ctx, profile, region, bucket)
	if err != nil {
		return nil, "", err
	}
	ssmClient, err := d.newSSMClient(ctx, profile, region)
	if err != nil {
		return nil, "", err
	}

	// Extract filename from remote path.
	filename := remotePath[strings.LastIndexAny(remotePath, "/\\")+1:]
	key := fmt.Sprintf("%s/%s/%s", s3TransferPrefix, uuid.New().String(), filename)

	// Always clean up S3 object (all versions if versioning is enabled).
	defer func() {
		cleanCtx, cleanCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cleanCancel()
		deleteAllVersions(cleanCtx, s3Client, bucket, key)
	}()

	// 1. Generate presigned PUT URL.
	onProgress(TransferProgress{Progress: 10, Message: "Generating upload URL...", Status: "progress"})
	presigner := s3.NewPresignClient(s3Client)
	presigned, err := presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(presignExpiry))
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate presigned URL: %w", err)
	}

	// 2. Tell EC2 to upload via curl/PowerShell.
	onProgress(TransferProgress{Progress: 20, Message: "Uploading from instance to S3...", Status: "progress"})

	isWin := strings.EqualFold(platform, "windows")
	docName := "AWS-RunShellScript"
	var cmd string
	if isWin {
		docName = "AWS-RunPowerShellScript"
		cmd = fmt.Sprintf(
			`$bytes = [System.IO.File]::ReadAllBytes(%s); `+
				`Invoke-WebRequest -Uri %s -Method PUT -Body $bytes -ContentType "application/octet-stream" -UseBasicParsing | Out-Null`,
			psQuote(remotePath), psQuote(presigned.URL))
	} else {
		qPath := shellQuote(remotePath)
		url := shellQuote(presigned.URL)
		// curl with PUT, fall back to wget --method=PUT. No AWS credentials needed.
		cmd = fmt.Sprintf(
			`curl -sSf -X PUT -T %s -H "Content-Type: application/octet-stream" %s 2>/dev/null || `+
				`wget -q --method=PUT --body-file=%s --header="Content-Type: application/octet-stream" -O /dev/null %s`,
			qPath, url, qPath, url,
		)
	}

	if err := ssmExec(ctx, ssmClient, instanceID, cmd, docName); err != nil {
		return nil, "", fmt.Errorf("instance upload to S3 failed (no curl/wget or S3 error): %w", err)
	}

	// 3. Download from S3 to server.
	onProgress(TransferProgress{Progress: 70, Message: "Downloading from S3...", Status: "progress"})
	result, err := s3Client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, "", fmt.Errorf("S3 download failed: %w", err)
	}
	defer result.Body.Close()

	size := aws.ToInt64(result.ContentLength)
	startTime := time.Now()
	var bytesDone int64
	wrappedBody := &progressReader{
		r: result.Body,
		onRead: func(n int) {
			bytesDone += int64(n)
			elapsed := time.Since(startTime).Seconds()
			var speed int64
			var eta int64
			if elapsed > 0 {
				speed = int64(float64(bytesDone) / elapsed)
				if speed > 0 && size > 0 {
					eta = (size - bytesDone) / speed
				}
			}
			var pct int
			if size > 0 {
				pct = 70 + int((float64(bytesDone)/float64(size))*25) // Scale 70-95%
			} else {
				pct = 80
			}
			onProgress(TransferProgress{
				Progress:   pct,
				Message:    "Downloading from S3...",
				Status:     "progress",
				TotalBytes: size,
				SpeedBps:   speed,
				ETASec:     eta,
			})
		},
	}

	data, err := io.ReadAll(wrappedBody)
	if err != nil {
		return nil, "", fmt.Errorf("failed to read from S3: %w", err)
	}

	return data, filename, nil
}

type progressReader struct {
	r      io.Reader
	onRead func(int)
}

func (pr *progressReader) Read(p []byte) (n int, err error) {
	n, err = pr.r.Read(p)
	if n > 0 {
		pr.onRead(n)
	}
	return n, err
}
