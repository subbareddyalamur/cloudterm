# S3 Express Transfer Design

## Problem
Current SSM-based file transfers are slow for large files (base64 chunking through SSM commands). Need a faster alternative using S3 as intermediary.

## Solution
Add "Express Upload" and "Express Download" options that route files through an S3 bucket using presigned URLs. EC2 instances use curl (no AWS CLI needed).

## Data Flows

### Express Upload (Local → EC2)
1. Browser uploads file to CloudTerm server
2. Server uploads to S3 (`cloudterm-transfers/{uuid}/{filename}`)
3. Server generates presigned GET URL (15 min expiry)
4. SSM command on EC2: `curl -sS -o /remote/path "presigned-url"` (Linux) or `Invoke-WebRequest` (Windows)
5. Server deletes S3 object after SSM command completes

### Express Download (EC2 → Local)
1. Server generates presigned PUT URL (15 min expiry)
2. SSM command on EC2: `curl -sS -X PUT -T /remote/file "presigned-url"` (Linux) or PowerShell equivalent (Windows)
3. Server downloads file from S3
4. Streams file to browser
5. Server deletes S3 object

## Settings
- S3 bucket name stored in localStorage (`cloudterm_s3_bucket`)
- Settings modal (gear icon) with text input for bucket name
- Express menu items only shown when S3 bucket is configured

## AWS Credentials
- Reuses same aws_profile/aws_region from instance config
- Server needs s3:PutObject, s3:GetObject, s3:DeleteObject permissions
- EC2 instances need no AWS permissions (presigned URLs via curl)

## Files
- **New:** `internal/aws/s3transfer.go` — S3 operations + presigned URLs
- **Modify:** `internal/handlers/handlers.go` — `/express-upload`, `/express-download` endpoints
- **Modify:** `web/templates/index.html` — Settings modal, context menu items, settings button
- **Modify:** `web/static/js/app.js` — Settings manager, express transfer methods
- **Modify:** `go.mod` — Add `s3` and `presign` AWS SDK packages
