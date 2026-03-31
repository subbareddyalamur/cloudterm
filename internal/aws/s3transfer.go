package aws

import (
	"bytes"
	"context"
	"fmt"
	"io"
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

// newS3Client creates an S3 client using the given profile and region.
func (d *Discovery) newS3Client(ctx context.Context, profile, region string) (*s3.Client, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, d.awsConfigOpts(profile, region)...)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}
	return s3.NewFromConfig(awsCfg), nil
}

// ExpressUpload uploads data to S3, generates a presigned GET URL, tells EC2 to curl it down, then deletes from S3.
func (d *Discovery) ExpressUpload(profile, region, bucket, instanceID, remotePath, platform string, data []byte, onProgress func(TransferProgress)) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	s3Client, err := d.newS3Client(ctx, profile, region)
	if err != nil {
		return err
	}
	ssmClient, err := d.newSSMClient(ctx, profile, region)
	if err != nil {
		return err
	}

	// 1. Upload to S3.
	key := fmt.Sprintf("%s/%s/%s", s3TransferPrefix, uuid.New().String(), remotePath[strings.LastIndexAny(remotePath, "/\\")+1:])
	onProgress(TransferProgress{Progress: 10, Message: "Uploading to S3...", Status: "progress"})

	_, err = s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
		Body:   bytes.NewReader(data),
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
		cmd = fmt.Sprintf(`Invoke-WebRequest -Uri %s -OutFile %s -UseBasicParsing`, psQuote(presigned.URL), psQuote(remotePath))
	} else {
		cmd = fmt.Sprintf(`curl -sS -f -o %s %s`, shellQuote(remotePath), shellQuote(presigned.URL))
	}

	if err := ssmExec(ctx, ssmClient, instanceID, cmd, docName); err != nil {
		return fmt.Errorf("instance download failed: %w", err)
	}

	onProgress(TransferProgress{Progress: 95, Message: "Cleaning up...", Status: "progress"})
	return nil
}

// ExpressDownload generates a presigned PUT URL, tells EC2 to curl-upload the file, downloads from S3, then deletes from S3.
func (d *Discovery) ExpressDownload(profile, region, bucket, instanceID, remotePath, platform string, onProgress func(TransferProgress)) ([]byte, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	s3Client, err := d.newS3Client(ctx, profile, region)
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
		cmd = fmt.Sprintf(`$bytes = [System.IO.File]::ReadAllBytes(%s); Invoke-WebRequest -Uri %s -Method PUT -Body $bytes -UseBasicParsing`, psQuote(remotePath), psQuote(presigned.URL))
	} else {
		cmd = fmt.Sprintf(`curl -sS -f -X PUT -T %s %s`, shellQuote(remotePath), shellQuote(presigned.URL))
	}

	if err := ssmExec(ctx, ssmClient, instanceID, cmd, docName); err != nil {
		return nil, "", fmt.Errorf("instance upload to S3 failed: %w", err)
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

	fileData, err := io.ReadAll(result.Body)
	if err != nil {
		return nil, "", fmt.Errorf("failed to read S3 object: %w", err)
	}

	onProgress(TransferProgress{Progress: 95, Message: "Cleaning up...", Status: "progress"})
	return fileData, filename, nil
}
