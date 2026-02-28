package aws

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
	ssmtypes "github.com/aws/aws-sdk-go-v2/service/ssm/types"
)

const (
	uploadChunkSize   = 150000 // base64 chars per SSM command (~112KB raw)
	downloadChunkSize = 17000  // raw bytes per download chunk (~22KB base64)
	ssmPollInterval   = 1500 * time.Millisecond
)

// TransferProgress is emitted as NDJSON during file transfers.
type TransferProgress struct {
	Progress int    `json:"progress"`
	Message  string `json:"message"`
	Status   string `json:"status"` // "progress", "complete", "error"
}

// UploadFile transfers a file to an EC2 instance via SSM.
// platform should be "linux" or "windows" to select the correct SSM document and commands.
func (d *Discovery) UploadFile(profile, region, instanceID, remotePath, platform string, data []byte, onProgress func(TransferProgress)) error {
	// Scale timeout: 10 min base + 2 min per MB.
	timeout := 10*time.Minute + time.Duration(len(data)/(1024*1024))*2*time.Minute
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	client, err := d.newSSMClient(ctx, profile, region)
	if err != nil {
		return err
	}

	isWin := strings.EqualFold(platform, "windows")
	docName := "AWS-RunShellScript"
	if isWin {
		docName = "AWS-RunPowerShellScript"
	}

	encoded := base64.StdEncoding.EncodeToString(data)
	uid := fmt.Sprintf("%d", time.Now().UnixNano())

	tempFile := "/tmp/.ct_up_" + uid
	if isWin {
		tempFile = "C:\\Windows\\Temp\\.ct_up_" + uid
	}

	chunks := splitB64(encoded, uploadChunkSize)
	totalSteps := len(chunks) + 1

	cleanupTemp := func() {
		if isWin {
			_ = ssmExec(ctx, client, instanceID, fmt.Sprintf("Remove-Item %s -Force -ErrorAction SilentlyContinue", psQuote(tempFile)), docName)
		} else {
			_ = ssmExec(ctx, client, instanceID, "rm -f "+tempFile, docName)
		}
	}

	for i, chunk := range chunks {
		pct := (i * 95) / totalSteps
		onProgress(TransferProgress{
			Progress: pct,
			Message:  fmt.Sprintf("Transferring chunk %d/%d", i+1, len(chunks)),
			Status:   "progress",
		})

		var cmd string
		if isWin {
			cmd = fmt.Sprintf("[IO.File]::AppendAllText(%s,'%s')", psQuote(tempFile), chunk)
		} else {
			cmd = fmt.Sprintf("printf '%%s' '%s' >> %s", chunk, tempFile)
		}

		if err := ssmExec(ctx, client, instanceID, cmd, docName); err != nil {
			cleanupTemp()
			return fmt.Errorf("chunk %d/%d failed: %w", i+1, len(chunks), err)
		}
	}

	onProgress(TransferProgress{Progress: 95, Message: "Writing file...", Status: "progress"})

	var finalCmd string
	if isWin {
		finalCmd = fmt.Sprintf(
			"$d=Split-Path %s; if($d -and !(Test-Path $d)){New-Item -ItemType Directory -Path $d -Force|Out-Null}; "+
				"$b=[Convert]::FromBase64String([IO.File]::ReadAllText(%s)); "+
				"[IO.File]::WriteAllBytes(%s,$b); "+
				"Remove-Item %s -Force",
			psQuote(remotePath), psQuote(tempFile), psQuote(remotePath), psQuote(tempFile))
	} else {
		qPath := shellQuote(remotePath)
		finalCmd = fmt.Sprintf("base64 -d %s > %s && rm -f %s", tempFile, qPath, tempFile)
	}

	if err := ssmExec(ctx, client, instanceID, finalCmd, docName); err != nil {
		cleanupTemp()
		return fmt.Errorf("write failed: %w", err)
	}

	return nil
}

// DownloadFile reads a file from an EC2 instance via SSM.
// platform should be "linux" or "windows". Returns raw file bytes and the base filename.
func (d *Discovery) DownloadFile(profile, region, instanceID, remotePath, platform string, onProgress func(TransferProgress)) ([]byte, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)

	client, err := d.newSSMClient(ctx, profile, region)
	if err != nil {
		cancel()
		return nil, "", err
	}

	isWin := strings.EqualFold(platform, "windows")
	docName := "AWS-RunShellScript"
	if isWin {
		docName = "AWS-RunPowerShellScript"
	}

	onProgress(TransferProgress{Progress: 0, Message: "Checking file...", Status: "progress"})

	// Get file size.
	var sizeCmd string
	if isWin {
		sizeCmd = fmt.Sprintf("if(Test-Path %s){(Get-Item %s).Length}else{'FILE_NOT_FOUND'}", psQuote(remotePath), psQuote(remotePath))
	} else {
		qPath := shellQuote(remotePath)
		sizeCmd = fmt.Sprintf("stat -c%%s %s 2>/dev/null || echo FILE_NOT_FOUND", qPath)
	}

	sizeOut, err := ssmExecOutput(ctx, client, instanceID, sizeCmd, docName)
	if err != nil {
		cancel()
		return nil, "", fmt.Errorf("failed to check file: %w", err)
	}
	sizeStr := strings.TrimSpace(sizeOut)
	if sizeStr == "FILE_NOT_FOUND" || sizeStr == "" {
		cancel()
		return nil, "", fmt.Errorf("file not found: %s", remotePath)
	}

	var fileSize int64
	fmt.Sscanf(sizeStr, "%d", &fileSize)

	// Now that we know the size, replace with a scaled timeout.
	cancel()
	timeout := 10*time.Minute + time.Duration(fileSize/(1024*1024))*2*time.Minute
	ctx, cancel = context.WithTimeout(context.Background(), timeout)
	defer cancel()
	// Extract filename — handle both / and \ separators.
	filename := remotePath
	if idx := strings.LastIndexAny(remotePath, "/\\"); idx >= 0 {
		filename = remotePath[idx+1:]
	}

	if fileSize == 0 {
		return []byte{}, filename, nil
	}

	totalChunks := int((fileSize + int64(downloadChunkSize) - 1) / int64(downloadChunkSize))
	var allBase64 strings.Builder

	for i := 0; i < totalChunks; i++ {
		pct := (i * 95) / totalChunks
		onProgress(TransferProgress{
			Progress: pct,
			Message:  fmt.Sprintf("Reading chunk %d/%d", i+1, totalChunks),
			Status:   "progress",
		})

		var cmd string
		if isWin {
			offset := i * downloadChunkSize
			cmd = fmt.Sprintf(
				"$f=[IO.File]::OpenRead(%s);$b=New-Object byte[] %d;"+
					"[void]$f.Seek(%d,'Begin');$n=$f.Read($b,0,%d);$f.Close();"+
					"if($n -lt %d){$b=$b[0..($n-1)]};[Convert]::ToBase64String($b)",
				psQuote(remotePath), downloadChunkSize, offset, downloadChunkSize, downloadChunkSize)
		} else {
			qPath := shellQuote(remotePath)
			cmd = fmt.Sprintf("dd if=%s bs=%d skip=%d count=1 2>/dev/null | base64 -w0", qPath, downloadChunkSize, i)
		}

		out, err := ssmExecOutput(ctx, client, instanceID, cmd, docName)
		if err != nil {
			return nil, "", fmt.Errorf("chunk %d/%d failed: %w", i+1, totalChunks, err)
		}
		allBase64.WriteString(strings.TrimSpace(out))
	}

	onProgress(TransferProgress{Progress: 95, Message: "Decoding...", Status: "progress"})

	decoded, err := base64.StdEncoding.DecodeString(allBase64.String())
	if err != nil {
		return nil, "", fmt.Errorf("base64 decode failed: %w", err)
	}

	// dd (Linux) may pad the last chunk with zeros beyond the real file size.
	if int64(len(decoded)) > fileSize {
		decoded = decoded[:fileSize]
	}

	return decoded, filename, nil
}

// ---------------------------------------------------------------------------
// SSM helpers
// ---------------------------------------------------------------------------

func (d *Discovery) newSSMClient(ctx context.Context, profile, region string) (*ssm.Client, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithSharedConfigProfile(profile),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}
	return ssm.NewFromConfig(awsCfg), nil
}

func ssmExec(ctx context.Context, client *ssm.Client, instanceID, command, docName string) error {
	_, err := ssmExecOutput(ctx, client, instanceID, command, docName)
	return err
}

func ssmExecOutput(ctx context.Context, client *ssm.Client, instanceID, command, docName string) (string, error) {
	resp, err := client.SendCommand(ctx, &ssm.SendCommandInput{
		InstanceIds:  []string{instanceID},
		DocumentName: aws.String(docName),
		Parameters:   map[string][]string{"commands": {command}},
	})
	if err != nil {
		return "", fmt.Errorf("SSM SendCommand: %w", err)
	}

	commandID := aws.ToString(resp.Command.CommandId)

	for {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(ssmPollInterval):
		}

		out, err := client.GetCommandInvocation(ctx, &ssm.GetCommandInvocationInput{
			CommandId:  aws.String(commandID),
			InstanceId: aws.String(instanceID),
		})
		if err != nil {
			continue // invocation may not be registered yet
		}

		switch out.Status {
		case ssmtypes.CommandInvocationStatusSuccess:
			return aws.ToString(out.StandardOutputContent), nil
		case ssmtypes.CommandInvocationStatusFailed,
			ssmtypes.CommandInvocationStatusCancelled,
			ssmtypes.CommandInvocationStatusTimedOut:
			return "", fmt.Errorf("SSM command %s: %s", out.Status, aws.ToString(out.StandardErrorContent))
		}
	}
}

// shellQuote wraps s in single quotes for bash, escaping embedded single quotes.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

// psQuote wraps s in single quotes for PowerShell, escaping embedded single quotes.
func psQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

func splitB64(s string, size int) []string {
	var chunks []string
	for len(s) > 0 {
		end := size
		if end > len(s) {
			end = len(s)
		}
		chunks = append(chunks, s[:end])
		s = s[end:]
	}
	return chunks
}
