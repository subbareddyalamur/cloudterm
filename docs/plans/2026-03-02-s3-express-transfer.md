# S3 Express Transfer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Express Upload/Download that routes files through S3 with presigned URLs, bypassing the slow SSM base64 chunking for large file transfers.

**Architecture:** Browser uploads file to CloudTerm server, server puts it in S3, generates a presigned GET URL, then SSM tells the EC2 instance to `curl` it down. Reverse for download (presigned PUT URL). S3 bucket name is stored in localStorage and sent with each request. No AWS CLI needed on EC2.

**Tech Stack:** Go (AWS SDK v2 S3 + presign), vanilla JavaScript, NDJSON progress streaming

---

### Task 1: Add S3 + presign Go dependencies

**Files:**
- Modify: `go.mod`

**Step 1: Add S3 and presign packages**

Run:
```bash
cd /Users/subbareddyalamuru/work/my-git/cloudterm-go
go get github.com/aws/aws-sdk-go-v2/service/s3
go get github.com/aws/aws-sdk-go-v2/service/s3/presign
go get github.com/google/uuid
```

**Step 2: Verify**

Run: `go mod tidy && go build ./...`
Expected: Clean build, no errors.

**Step 3: Commit**

```bash
git add go.mod go.sum
git commit -m "chore: add S3, presign, and uuid dependencies"
```

---

### Task 2: Create S3 transfer backend (`s3transfer.go`)

**Files:**
- Create: `internal/aws/s3transfer.go`

**Step 1: Create the S3 transfer module**

Create `internal/aws/s3transfer.go` with the following functions:

```go
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
	s3presign "github.com/aws/aws-sdk-go-v2/service/s3/presign"
	"github.com/google/uuid"
)

const (
	presignExpiry    = 15 * time.Minute
	s3TransferPrefix = "cloudterm-transfers"
)

// newS3Client creates an S3 client using the given profile and region.
func (d *Discovery) newS3Client(ctx context.Context, profile, region string) (*s3.Client, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithSharedConfigProfile(profile),
	)
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

	// Always clean up S3 object.
	defer func() {
		cleanCtx, cleanCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cleanCancel()
		s3Client.DeleteObject(cleanCtx, &s3.DeleteObjectInput{
			Bucket: aws.String(bucket),
			Key:    aws.String(key),
		})
	}()

	// 2. Generate presigned GET URL.
	onProgress(TransferProgress{Progress: 40, Message: "Generating download URL...", Status: "progress"})
	presigner := s3presign.NewPresignClient(s3Client)
	presigned, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3presign.WithPresignExpires(presignExpiry))
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

	// Always clean up S3 object.
	defer func() {
		cleanCtx, cleanCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cleanCancel()
		s3Client.DeleteObject(cleanCtx, &s3.DeleteObjectInput{
			Bucket: aws.String(bucket),
			Key:    aws.String(key),
		})
	}()

	// 1. Generate presigned PUT URL.
	onProgress(TransferProgress{Progress: 10, Message: "Generating upload URL...", Status: "progress"})
	presigner := s3presign.NewPresignClient(s3Client)
	presigned, err := presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3presign.WithPresignExpires(presignExpiry))
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
```

**Step 2: Verify**

Run: `go build ./...`
Expected: Clean build.

**Step 3: Commit**

```bash
git add internal/aws/s3transfer.go
git commit -m "feat: add S3 express transfer backend with presigned URLs"
```

---

### Task 3: Add express upload/download HTTP handlers

**Files:**
- Modify: `internal/handlers/handlers.go`

**Step 1: Register new routes**

In the `Router()` method, after line 92 (`POST /broadcast-command`), add:

```go
	mux.HandleFunc("POST /express-upload", h.handleExpressUpload)
	mux.HandleFunc("POST /express-download", h.handleExpressDownload)
```

**Step 2: Add handleExpressUpload handler**

Add after the `handleUploadFile` method. Follows the exact same pattern as `handleUploadFile` but includes `s3_bucket` form field and calls `ExpressUpload`:

```go
func (h *Handler) handleExpressUpload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(500 << 20); err != nil {
		jsonError(w, "failed to parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	instanceID := r.FormValue("instance_id")
	remotePath := r.FormValue("remote_path")
	bucket := r.FormValue("s3_bucket")
	if instanceID == "" || remotePath == "" || bucket == "" {
		jsonError(w, "instance_id, remote_path, and s3_bucket are required", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		jsonError(w, "failed to read file", http.StatusInternalServerError)
		return
	}

	profile := r.FormValue("aws_profile")
	region := r.FormValue("aws_region")
	platform := r.FormValue("platform")
	if profile == "" || region == "" {
		if p, rg, err := h.discovery.GetInstanceConfig(instanceID); err == nil {
			profile = p
			region = rg
		}
	}
	if platform == "" {
		platform = "linux"
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.WriteHeader(http.StatusOK)

	sendProgress := func(p aws.TransferProgress) {
		line, _ := json.Marshal(p)
		w.Write(line)
		w.Write([]byte("\n"))
		flusher.Flush()
	}

	if err := h.discovery.ExpressUpload(profile, region, bucket, instanceID, remotePath, platform, data, sendProgress); err != nil {
		sendProgress(aws.TransferProgress{Progress: 100, Message: err.Error(), Status: "error"})
		return
	}

	h.audit.Log(audit.AuditEvent{
		Action:     "express_upload",
		InstanceID: instanceID,
		Profile:    profile,
		Region:     region,
		Details:    fmt.Sprintf("path=%s bucket=%s", remotePath, bucket),
	})

	sendProgress(aws.TransferProgress{Progress: 100, Message: "Express upload complete", Status: "complete"})
}
```

**Step 3: Add handleExpressDownload handler**

Add after `handleExpressUpload`. Same NDJSON pattern as `handleDownloadFile` but includes `s3_bucket` and calls `ExpressDownload`:

```go
func (h *Handler) handleExpressDownload(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceID string `json:"instance_id"`
		RemotePath string `json:"remote_path"`
		AWSProfile string `json:"aws_profile"`
		AWSRegion  string `json:"aws_region"`
		Platform   string `json:"platform"`
		S3Bucket   string `json:"s3_bucket"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.InstanceID == "" || req.RemotePath == "" || req.S3Bucket == "" {
		jsonError(w, "instance_id, remote_path, and s3_bucket are required", http.StatusBadRequest)
		return
	}

	profile := req.AWSProfile
	region := req.AWSRegion
	platform := req.Platform
	if profile == "" || region == "" {
		if p, rg, err := h.discovery.GetInstanceConfig(req.InstanceID); err == nil {
			profile = p
			region = rg
		}
	}
	if platform == "" {
		platform = "linux"
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.WriteHeader(http.StatusOK)

	sendProgress := func(p aws.TransferProgress) {
		line, _ := json.Marshal(p)
		w.Write(line)
		w.Write([]byte("\n"))
		flusher.Flush()
	}

	fileData, filename, err := h.discovery.ExpressDownload(profile, region, req.S3Bucket, req.InstanceID, req.RemotePath, platform, sendProgress)
	if err != nil {
		sendProgress(aws.TransferProgress{Progress: 100, Message: err.Error(), Status: "error"})
		return
	}

	h.audit.Log(audit.AuditEvent{
		Action:     "express_download",
		InstanceID: req.InstanceID,
		Profile:    profile,
		Region:     region,
		Details:    fmt.Sprintf("path=%s bucket=%s", req.RemotePath, req.S3Bucket),
	})

	finalMsg := struct {
		Progress int    `json:"progress"`
		Message  string `json:"message"`
		Status   string `json:"status"`
		Data     string `json:"data"`
		Filename string `json:"filename"`
	}{
		Progress: 100,
		Message:  "Express download complete",
		Status:   "complete",
		Data:     base64.StdEncoding.EncodeToString(fileData),
		Filename: filename,
	}
	line, _ := json.Marshal(finalMsg)
	w.Write(line)
	w.Write([]byte("\n"))
	flusher.Flush()
}
```

**Step 4: Verify**

Run: `go build ./...`
Expected: Clean build.

**Step 5: Commit**

```bash
git add internal/handlers/handlers.go
git commit -m "feat: add express upload/download HTTP handlers"
```

---

### Task 4: Add Settings modal UI (HTML + CSS + JS)

**Files:**
- Modify: `web/templates/index.html`
- Modify: `web/static/js/app.js`

**Step 1: Add settings button to topbar**

In `index.html`, after the snippets button (line 952), add:

```html
    <button class="topbar-btn" id="settingsBtn" title="Settings">
      <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
```

**Step 2: Add settings modal HTML**

In `index.html`, add before the transfer panel HTML (`<!-- TRANSFER MANAGER PANEL -->`):

```html
<!-- SETTINGS MODAL -->
<div class="modal-bg" id="settingsModal">
  <div class="modal" style="max-width:420px">
    <div class="modal-title">Settings</div>
    <div style="font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Express Transfer (S3)</div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">S3 bucket used as intermediary for fast file transfers via presigned URLs. No AWS CLI needed on instances.</div>
    <input id="settingsS3Bucket" type="text" placeholder="S3 bucket name (e.g. my-transfer-bucket)" style="width:100%;box-sizing:border-box;padding:8px 10px;background:var(--s3);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:12px;outline:none;margin-bottom:12px;">
    <div style="display:flex;gap:8px;">
      <button id="settingsSaveBtn" style="flex:1;padding:8px;background:linear-gradient(135deg,rgba(61,220,132,.2),rgba(108,92,231,.15));border:1px solid rgba(61,220,132,.4);border-radius:7px;color:var(--ssh);font-family:'Lato',sans-serif;font-size:12px;cursor:pointer;">Save</button>
      <button class="modal-cancel" onclick="document.getElementById('settingsModal').classList.remove('show')" style="flex:1;">Cancel</button>
    </div>
  </div>
</div>
```

**Step 3: Add SettingsManager class to app.js**

In `app.js`, insert before the `TransferManager` class (before `// Transfer Manager` comment):

```javascript
// ---------------------------------------------------------------------------
// Settings Manager – persistent app settings via localStorage
// ---------------------------------------------------------------------------

class SettingsManager {
    constructor() {
        this._key = 'cloudterm_settings';
    }

    get(name) {
        const data = this._load();
        return data[name] || '';
    }

    set(name, value) {
        const data = this._load();
        data[name] = value;
        localStorage.setItem(this._key, JSON.stringify(data));
    }

    _load() {
        try {
            return JSON.parse(localStorage.getItem(this._key) || '{}');
        } catch { return {}; }
    }
}
```

**Step 4: Wire settings in CloudTermApp constructor**

In the constructor, after `this.transfers = new TransferManager();`, add:

```javascript
this.settings = new SettingsManager();
```

**Step 5: Wire settings button and save handler**

In the `_wireUI()` method (or wherever event listeners are set up in the constructor), add:

```javascript
// Settings modal
document.getElementById('settingsBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('settingsModal');
    const input = document.getElementById('settingsS3Bucket');
    if (input) input.value = this.settings.get('s3_bucket');
    modal?.classList.add('show');
});
document.getElementById('settingsSaveBtn')?.addEventListener('click', () => {
    const input = document.getElementById('settingsS3Bucket');
    if (input) this.settings.set('s3_bucket', input.value.trim());
    document.getElementById('settingsModal')?.classList.remove('show');
    showToast('Settings saved');
});
```

Look for where other topbar buttons are wired (search for `broadcastBtn` or `snippetsBtn` event listeners) and add the settings wiring nearby.

**Step 6: Verify**

Open the app, click the settings gear icon, enter a bucket name, click Save. Refresh the page, open settings again — bucket name should persist.

**Step 7: Commit**

```bash
git add web/templates/index.html web/static/js/app.js
git commit -m "feat: add settings modal with S3 bucket configuration"
```

---

### Task 5: Add Express Upload/Download context menu items and modals

**Files:**
- Modify: `web/templates/index.html`
- Modify: `web/static/js/app.js`

**Step 1: Add context menu items**

In `index.html`, after the existing download context menu item (line 1086, `data-action="download"`), add:

```html
  <div class="ctx-item" data-action="express-upload"><span class="ico">&#x26A1;</span>Express Upload</div>
  <div class="ctx-item" data-action="express-download"><span class="ico">&#x26A1;</span>Express Download</div>
```

**Step 2: Add Express Upload modal HTML**

In `index.html`, add after the download modal and before the snippets modal:

```html
<!-- EXPRESS UPLOAD MODAL -->
<div class="modal-bg" id="expressUploadModal">
  <div class="modal" style="max-width:420px">
    <div class="modal-title">&#x26A1; Express Upload</div>
    <div id="expressUploadTarget" style="font-size:12px;color:var(--muted);margin-bottom:12px;"></div>
    <div id="expressUploadDropZone" style="border:2px dashed var(--b2);border-radius:10px;padding:30px;text-align:center;color:var(--dim);font-size:12px;cursor:pointer;margin-bottom:12px;">
      Drop file here or click to browse
      <input type="file" id="expressUploadFileInput" style="display:none">
    </div>
    <div id="expressUploadFileName" style="font-size:12px;color:var(--text);margin-bottom:8px;display:none;"></div>
    <input id="expressUploadRemotePath" type="text" placeholder="Remote path (e.g. /tmp/myfile.txt)" style="width:100%;box-sizing:border-box;padding:8px 10px;background:var(--s3);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:12px;outline:none;margin-bottom:12px;">
    <div style="font-size:10px;color:var(--dim);margin-bottom:12px;">Fast transfer via S3 presigned URL — no AWS CLI needed on instance</div>
    <div style="display:flex;gap:8px;">
      <button id="expressUploadBtn" disabled style="flex:1;padding:8px;background:linear-gradient(135deg,rgba(251,146,60,.2),rgba(108,92,231,.15));border:1px solid rgba(251,146,60,.4);border-radius:7px;color:var(--orange);font-family:'Lato',sans-serif;font-size:12px;cursor:pointer;">&#x26A1; Express Upload</button>
      <button class="modal-cancel" onclick="document.getElementById('expressUploadModal').classList.remove('show')" style="flex:1;">Cancel</button>
    </div>
  </div>
</div>
```

**Step 3: Add Express Download modal HTML**

```html
<!-- EXPRESS DOWNLOAD MODAL -->
<div class="modal-bg" id="expressDownloadModal">
  <div class="modal" style="max-width:420px">
    <div class="modal-title">&#x26A1; Express Download</div>
    <div id="expressDownloadTarget" style="font-size:12px;color:var(--muted);margin-bottom:12px;"></div>
    <input id="expressDownloadRemotePath" type="text" placeholder="Remote file path (e.g. /var/log/syslog)" style="width:100%;box-sizing:border-box;padding:8px 10px;background:var(--s3);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:12px;outline:none;margin-bottom:12px;">
    <div style="font-size:10px;color:var(--dim);margin-bottom:12px;">Fast transfer via S3 presigned URL — no AWS CLI needed on instance</div>
    <div style="display:flex;gap:8px;">
      <button id="expressDownloadBtn" style="flex:1;padding:8px;background:linear-gradient(135deg,rgba(251,146,60,.2),rgba(108,92,231,.15));border:1px solid rgba(251,146,60,.4);border-radius:7px;color:var(--orange);font-family:'Lato',sans-serif;font-size:12px;cursor:pointer;">&#x26A1; Express Download</button>
      <button class="modal-cancel" onclick="document.getElementById('expressDownloadModal').classList.remove('show')" style="flex:1;">Cancel</button>
    </div>
  </div>
</div>
```

**Step 4: Add context menu handler logic in app.js**

In the context menu click handler (around line 1842, after the `download file` branch), add:

```javascript
} else if (text.includes('express upload')) {
    if (!this.settings.get('s3_bucket')) {
        showToast('Configure S3 bucket in Settings first', 3000);
        return;
    }
    this._showExpressUploadModal(id, name);
} else if (text.includes('express download')) {
    if (!this.settings.get('s3_bucket')) {
        showToast('Configure S3 bucket in Settings first', 3000);
        return;
    }
    this._showExpressDownloadModal(id, name);
```

**Step 5: Add _showExpressUploadModal method**

Add to CloudTermApp class (after _doUpload). This follows the same pattern as _showUploadModal:

```javascript
    _showExpressUploadModal(instanceID, instanceName) {
        const modal = document.getElementById('expressUploadModal');
        if (!modal) return;

        const target = document.getElementById('expressUploadTarget');
        if (target) target.textContent = instanceName + ' (' + instanceID + ')';

        const fileInput = document.getElementById('expressUploadFileInput');
        const fileNameEl = document.getElementById('expressUploadFileName');
        const remotePathEl = document.getElementById('expressUploadRemotePath');
        const uploadBtn = document.getElementById('expressUploadBtn');
        const dropZone = document.getElementById('expressUploadDropZone');

        if (fileInput) fileInput.value = '';
        if (fileNameEl) { fileNameEl.style.display = 'none'; fileNameEl.textContent = ''; }
        if (remotePathEl) remotePathEl.value = '';
        if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = '\u26A1 Express Upload'; }

        this._expressUploadFile = null;
        this._expressUploadInstanceID = instanceID;
        const inst = this.sidebar.getInstance(instanceID);
        this._expressUploadPlatform = inst ? (inst.platform || 'linux') : 'linux';

        if (remotePathEl) {
            remotePathEl.placeholder = this._expressUploadPlatform === 'windows'
                ? 'Remote path (e.g. C:\\Windows\\Temp\\myfile.txt)'
                : 'Remote path (e.g. /tmp/myfile.txt)';
        }

        if (dropZone) {
            const newDrop = dropZone.cloneNode(true);
            dropZone.parentNode.replaceChild(newDrop, dropZone);
            const newFileInput = newDrop.querySelector('#expressUploadFileInput');

            newDrop.addEventListener('click', () => newFileInput && newFileInput.click());
            newDrop.addEventListener('dragover', (e) => { e.preventDefault(); newDrop.style.borderColor = 'var(--orange)'; });
            newDrop.addEventListener('dragleave', () => { newDrop.style.borderColor = 'var(--b2)'; });
            newDrop.addEventListener('drop', (e) => {
                e.preventDefault();
                newDrop.style.borderColor = 'var(--b2)';
                if (e.dataTransfer.files.length > 0) this._setExpressUploadFile(e.dataTransfer.files[0]);
            });
            if (newFileInput) {
                newFileInput.addEventListener('change', () => {
                    if (newFileInput.files.length > 0) this._setExpressUploadFile(newFileInput.files[0]);
                });
            }
        }

        if (uploadBtn) {
            const newBtn = uploadBtn.cloneNode(true);
            uploadBtn.parentNode.replaceChild(newBtn, uploadBtn);
            newBtn.addEventListener('click', () => this._doExpressUpload());
        }

        modal.classList.add('show');
    }

    _setExpressUploadFile(file) {
        this._expressUploadFile = file;
        const fileNameEl = document.getElementById('expressUploadFileName');
        const remotePathEl = document.getElementById('expressUploadRemotePath');
        const uploadBtn = document.getElementById('expressUploadBtn');

        if (fileNameEl) {
            fileNameEl.textContent = file.name + ' (' + this._formatSize(file.size) + ')';
            fileNameEl.style.display = '';
        }
        if (remotePathEl) {
            const cur = remotePathEl.value;
            if (!cur) {
                remotePathEl.value = this._expressUploadPlatform === 'windows'
                    ? 'C:\\Windows\\Temp\\' + file.name
                    : '/tmp/' + file.name;
            } else if (cur.endsWith('/') || cur.endsWith('\\')) {
                remotePathEl.value = cur + file.name;
            }
        }
        if (uploadBtn) uploadBtn.disabled = false;
    }
```

**Step 6: Add _doExpressUpload method**

```javascript
    async _doExpressUpload() {
        const file = this._expressUploadFile;
        const instanceID = this._expressUploadInstanceID;
        if (!file || !instanceID) return;

        const remotePath = (document.getElementById('expressUploadRemotePath') || {}).value;
        if (!remotePath) { showToast('Remote path is required'); return; }

        const bucket = this.settings.get('s3_bucket');
        if (!bucket) { showToast('Configure S3 bucket in Settings first'); return; }

        const inst = this.sidebar.getInstance(instanceID);

        document.getElementById('expressUploadModal')?.classList.remove('show');
        const tid = this.transfers.add('upload', '\u26A1 ' + file.name);

        const form = new FormData();
        form.append('file', file);
        form.append('instance_id', instanceID);
        form.append('remote_path', remotePath);
        form.append('s3_bucket', bucket);
        form.append('platform', inst ? (inst.platform || 'linux') : 'linux');
        if (inst) {
            form.append('aws_profile', inst.aws_profile || '');
            form.append('aws_region', inst.aws_region || '');
        }

        try {
            const resp = await fetch('/express-upload', { method: 'POST', body: form });
            await this._readNDJSON(resp, (msg) => {
                if (msg.status === 'error') {
                    this.transfers.update(tid, msg.progress || 100, msg.message, 'error');
                    showToast('Express upload failed: ' + msg.message, 5000);
                } else if (msg.status === 'complete') {
                    this.transfers.update(tid, 100, 'Complete', 'complete');
                    showToast('Express upload complete: ' + remotePath);
                } else {
                    this.transfers.update(tid, msg.progress || 0, msg.message || '', 'active');
                }
            });
        } catch (e) {
            this.transfers.update(tid, 0, e.message, 'error');
            showToast('Express upload failed: ' + e.message, 5000);
        }
    }
```

**Step 7: Add _showExpressDownloadModal and _doExpressDownload methods**

```javascript
    _showExpressDownloadModal(instanceID, instanceName) {
        const modal = document.getElementById('expressDownloadModal');
        if (!modal) return;

        const target = document.getElementById('expressDownloadTarget');
        if (target) target.textContent = instanceName + ' (' + instanceID + ')';

        const remotePathEl = document.getElementById('expressDownloadRemotePath');
        const downloadBtn = document.getElementById('expressDownloadBtn');

        if (remotePathEl) remotePathEl.value = '';
        if (downloadBtn) downloadBtn.textContent = '\u26A1 Express Download';

        this._expressDownloadInstanceID = instanceID;
        const inst = this.sidebar.getInstance(instanceID);
        this._expressDownloadPlatform = inst ? (inst.platform || 'linux') : 'linux';

        if (remotePathEl) {
            remotePathEl.placeholder = this._expressDownloadPlatform === 'windows'
                ? 'Remote file path (e.g. C:\\Users\\Administrator\\file.txt)'
                : 'Remote file path (e.g. /var/log/syslog)';
        }

        if (downloadBtn) {
            const newBtn = downloadBtn.cloneNode(true);
            downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);
            newBtn.addEventListener('click', () => this._doExpressDownload());
        }

        modal.classList.add('show');
    }

    async _doExpressDownload() {
        const instanceID = this._expressDownloadInstanceID;
        if (!instanceID) return;

        const remotePath = (document.getElementById('expressDownloadRemotePath') || {}).value;
        if (!remotePath) { showToast('Remote path is required'); return; }

        const bucket = this.settings.get('s3_bucket');
        if (!bucket) { showToast('Configure S3 bucket in Settings first'); return; }

        const inst = this.sidebar.getInstance(instanceID);

        document.getElementById('expressDownloadModal')?.classList.remove('show');
        const filename = remotePath.split('/').pop().split('\\').pop() || 'download';
        const tid = this.transfers.add('download', '\u26A1 ' + filename);

        try {
            const resp = await fetch('/express-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instance_id: instanceID,
                    remote_path: remotePath,
                    s3_bucket: bucket,
                    aws_profile: inst ? (inst.aws_profile || '') : '',
                    aws_region: inst ? (inst.aws_region || '') : '',
                    platform: inst ? (inst.platform || 'linux') : 'linux'
                })
            });

            await this._readNDJSON(resp, (msg) => {
                if (msg.status === 'error') {
                    this.transfers.update(tid, msg.progress || 100, msg.message, 'error');
                    showToast('Express download failed: ' + msg.message, 5000);
                } else if (msg.status === 'complete' && msg.data) {
                    const raw = atob(msg.data);
                    const bytes = new Uint8Array(raw.length);
                    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
                    const blob = new Blob([bytes]);
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = msg.filename || filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(a.href);
                    this.transfers.update(tid, 100, 'Complete', 'complete');
                    showToast('Express downloaded: ' + (msg.filename || remotePath));
                } else {
                    this.transfers.update(tid, msg.progress || 0, msg.message || '', 'active');
                }
            });
        } catch (e) {
            this.transfers.update(tid, 0, e.message, 'error');
            showToast('Express download failed: ' + e.message, 5000);
        }
    }
```

**Step 8: Verify**

1. Open app, click Settings gear, enter an S3 bucket name, save
2. Right-click an instance — "Express Upload" and "Express Download" should appear
3. Try express upload — modal should appear, close on submit, transfer panel shows progress
4. Without S3 bucket configured, clicking Express Upload/Download should show toast warning

**Step 9: Commit**

```bash
git add web/templates/index.html web/static/js/app.js
git commit -m "feat: add express upload/download UI with S3 settings"
```

---

### Task 6: Integration verification

**Files:**
- No new changes. Verification only.

**Step 1: Full backend build**

Run: `go build ./...`
Expected: Clean build.

**Step 2: End-to-end test — Express Upload**

1. Configure S3 bucket in Settings
2. Right-click instance → Express Upload
3. Select a test file, set remote path
4. Click Express Upload
5. Verify: modal closes, transfer panel shows progress (S3 upload → presigned URL → instance download → cleanup)
6. Verify file exists on instance at the specified path

**Step 3: End-to-end test — Express Download**

1. Right-click instance → Express Download
2. Enter path to a known file on the instance
3. Click Express Download
4. Verify: modal closes, transfer panel shows progress (presigned PUT → instance upload → S3 download → browser download → cleanup)
5. Verify downloaded file contents match original

**Step 4: Edge cases**

- No S3 bucket configured → toast warning, no modal
- Invalid bucket name → error shown in transfer panel
- Non-existent remote file (download) → error shown
- Windows instance → PowerShell commands used instead of curl

**Step 5: Commit (only if fixes needed)**

```bash
git add -A
git commit -m "fix: express transfer polish and edge cases"
```
