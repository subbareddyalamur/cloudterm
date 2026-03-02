# Transfer Manager Panel Design

## Problem
Upload/download modals block the entire page during file transfers. Users can't interact with terminals or other features while a transfer is in progress.

## Solution
Keep existing modals for input (file selection, remote path). On transfer start, close the modal and show a non-blocking progress widget in the bottom-right corner (Google Drive style).

## Design

### Transfer Panel
- Fixed position: `bottom: 16px; right: 16px; z-index: 450`
- Width: ~340px
- Header: "Transfers (N)" with collapse/expand toggle and close-all button
- Each transfer row: direction icon, filename, instance hint, progress bar, percentage, dismiss button
- Upload rows: green (`--ssh`), Download rows: blue (`--rdp`)
- Collapsed state: just the header bar with count badge

### Behavior
1. Modal collects input (unchanged), closes on submit
2. Transfer panel appears/updates with new transfer row
3. NDJSON progress streams update the row's progress bar
4. Completed transfers show checkmark, auto-remove after 5s
5. Errors show in red, persist until dismissed
6. Panel auto-hides when empty
7. Supports multiple concurrent transfers (stacked rows)

### Files Modified
- `web/templates/index.html` — panel HTML + CSS
- `web/static/js/app.js` — TransferManager class, modified _doUpload/_doDownload

### No Backend Changes
The NDJSON streaming endpoints remain unchanged.