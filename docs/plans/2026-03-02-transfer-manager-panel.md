# Transfer Manager Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace blocking upload/download progress modals with a non-blocking, bottom-right transfer panel (Google Drive style) that supports multiple concurrent transfers.

**Architecture:** Add a fixed-position TransferManager panel to the DOM. Modals still handle input collection but close on submit. `_doUpload` and `_doDownload` delegate progress tracking to the TransferManager instead of updating in-modal elements. Each transfer gets a unique ID and its own row in the panel.

**Tech Stack:** Vanilla JavaScript, inline CSS (matching existing codebase patterns)

---

### Task 1: Add Transfer Panel HTML and CSS to index.html

**Files:**
- Modify: `web/templates/index.html`

**Step 1: Add CSS for the transfer panel**

Insert after the `.modal-cancel:hover` rule (line 666) in the `<style>` block:

```css
/* ── Transfer Manager Panel ── */
.transfer-panel {
  position:fixed; bottom:16px; right:16px; z-index:450;
  width:340px; background:var(--s2); border:1px solid var(--b2);
  border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,.6);
  font-family:'Lato',sans-serif; overflow:hidden;
  transform:translateY(calc(100% + 20px)); opacity:0;
  transition:transform .3s cubic-bezier(.4,0,.2,1), opacity .3s;
}
.transfer-panel.visible { transform:translateY(0); opacity:1; }
.transfer-panel.collapsed .transfer-body { display:none; }
.transfer-header {
  display:flex; align-items:center; padding:10px 14px;
  background:var(--s3); cursor:pointer; user-select:none;
}
.transfer-header-title {
  font-size:12px; font-weight:700; color:var(--text); flex:1;
}
.transfer-header-count {
  font-size:10px; background:var(--b2); color:var(--muted);
  padding:1px 6px; border-radius:8px; margin-left:6px;
}
.transfer-header-btn {
  width:22px; height:22px; border:none; background:none;
  color:var(--muted); cursor:pointer; font-size:14px;
  display:flex; align-items:center; justify-content:center;
  border-radius:4px; transition:all .15s; margin-left:4px;
}
.transfer-header-btn:hover { color:var(--text); background:var(--b1); }
.transfer-body { max-height:240px; overflow-y:auto; }
.transfer-row {
  display:flex; flex-direction:column; padding:10px 14px;
  border-top:1px solid var(--b1); gap:4px;
}
.transfer-row-top { display:flex; align-items:center; gap:8px; }
.transfer-row-icon { font-size:12px; flex-shrink:0; }
.transfer-row-name {
  font-size:11px; color:var(--text); flex:1;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.transfer-row-pct {
  font-size:10px; font-family:'JetBrains Mono',monospace;
  color:var(--muted); min-width:32px; text-align:right;
}
.transfer-row-dismiss {
  width:18px; height:18px; border:none; background:none;
  color:var(--dim); cursor:pointer; font-size:12px;
  display:flex; align-items:center; justify-content:center;
  border-radius:3px; flex-shrink:0;
}
.transfer-row-dismiss:hover { color:var(--text); background:var(--b1); }
.transfer-row-bar {
  height:4px; background:var(--s3); border-radius:2px; overflow:hidden;
}
.transfer-row-bar-fill {
  height:100%; border-radius:2px; transition:width .3s;
}
.transfer-row-msg {
  font-size:10px; color:var(--dim);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.transfer-row.upload .transfer-row-bar-fill { background:var(--ssh); }
.transfer-row.upload .transfer-row-icon { color:var(--ssh); }
.transfer-row.download .transfer-row-bar-fill { background:var(--rdp); }
.transfer-row.download .transfer-row-icon { color:var(--rdp); }
.transfer-row.error .transfer-row-msg { color:#f87171; }
.transfer-row.done .transfer-row-pct { color:var(--ssh); }
```

**Step 2: Add transfer panel HTML**

Insert just before the `<!-- TOAST -->` comment (line 1157):

```html
<!-- TRANSFER MANAGER PANEL -->
<div class="transfer-panel" id="transferPanel">
  <div class="transfer-header" id="transferHeader">
    <span class="transfer-header-title">Transfers</span>
    <span class="transfer-header-count" id="transferCount">0</span>
    <button class="transfer-header-btn" id="transferCollapseBtn" title="Collapse">&#x2015;</button>
    <button class="transfer-header-btn" id="transferCloseBtn" title="Close all">&times;</button>
  </div>
  <div class="transfer-body" id="transferBody"></div>
</div>
```

**Step 3: Remove in-modal progress bars from both upload and download modals**

Delete lines 1052-1060 (upload modal progress section):
```html
    <div id="uploadProgress" style="display:none;margin-bottom:12px;">
      ...
    </div>
```

Delete lines 1074-1082 (download modal progress section):
```html
    <div id="downloadProgress" style="display:none;margin-bottom:12px;">
      ...
    </div>
```

**Step 4: Verify**

Open the app in a browser. The transfer panel should not be visible (no `.visible` class yet). Inspect the DOM to confirm the element exists. Both modals should still render without their progress bars.

**Step 5: Commit**

```bash
git add web/templates/index.html
git commit -m "feat: add transfer manager panel HTML/CSS, remove in-modal progress bars"
```

---

### Task 2: Add TransferManager JavaScript class to app.js

**Files:**
- Modify: `web/static/js/app.js`

**Step 1: Add the TransferManager class**

Insert before the `CloudTermApp` class (before line 1091, after the existing class definitions).

The class builds transfer row DOM elements using safe DOM methods (createElement, textContent — no innerHTML):

```javascript
// ---------------------------------------------------------------------------
// Transfer Manager – bottom-right progress panel (Google Drive style)
// ---------------------------------------------------------------------------

class TransferManager {
    constructor() {
        this._transfers = new Map();
        this._nextID = 1;
        this._panel = document.getElementById('transferPanel');
        this._body = document.getElementById('transferBody');
        this._countEl = document.getElementById('transferCount');
        this._collapsed = false;

        document.getElementById('transferHeader')?.addEventListener('click', (e) => {
            if (e.target.closest('#transferCloseBtn')) return;
            this._collapsed = !this._collapsed;
            this._panel?.classList.toggle('collapsed', this._collapsed);
            const btn = document.getElementById('transferCollapseBtn');
            if (btn) btn.textContent = this._collapsed ? '\u25B4' : '\u2015';
        });

        document.getElementById('transferCloseBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearAll();
        });
    }

    add(type, name) {
        const id = this._nextID++;

        // Build row using safe DOM methods.
        const row = document.createElement('div');
        row.className = 'transfer-row ' + type;
        row.dataset.transferId = id;

        const top = document.createElement('div');
        top.className = 'transfer-row-top';

        const icon = document.createElement('span');
        icon.className = 'transfer-row-icon';
        icon.textContent = type === 'upload' ? '\u2B06' : '\u2B07';

        const nameEl = document.createElement('span');
        nameEl.className = 'transfer-row-name';
        nameEl.textContent = name;

        const pct = document.createElement('span');
        pct.className = 'transfer-row-pct';
        pct.textContent = '0%';

        const dismiss = document.createElement('button');
        dismiss.className = 'transfer-row-dismiss';
        dismiss.title = 'Dismiss';
        dismiss.textContent = '\u00D7';
        dismiss.addEventListener('click', () => this.remove(id));

        top.append(icon, nameEl, pct, dismiss);

        const barWrap = document.createElement('div');
        barWrap.className = 'transfer-row-bar';
        const barFill = document.createElement('div');
        barFill.className = 'transfer-row-bar-fill';
        barFill.style.width = '0%';
        barWrap.appendChild(barFill);

        const msg = document.createElement('div');
        msg.className = 'transfer-row-msg';
        msg.textContent = 'Starting...';

        row.append(top, barWrap, msg);
        this._body?.appendChild(row);
        this._transfers.set(id, { type, name, progress: 0, message: '', status: 'active', el: row });
        this._updateCount();
        this._show();
        return id;
    }

    update(id, progress, message, status) {
        const t = this._transfers.get(id);
        if (!t) return;
        t.progress = progress;
        t.message = message || '';
        t.status = status || 'active';

        const fill = t.el.querySelector('.transfer-row-bar-fill');
        const pct = t.el.querySelector('.transfer-row-pct');
        const msg = t.el.querySelector('.transfer-row-msg');

        if (fill) fill.style.width = progress + '%';
        if (pct) pct.textContent = progress + '%';
        if (msg) msg.textContent = message || '';

        if (status === 'complete') {
            t.el.classList.add('done');
            if (pct) pct.textContent = '\u2713';
            this._autoRemove(id, 5000);
        } else if (status === 'error') {
            t.el.classList.add('error');
            if (pct) pct.textContent = '\u2717';
        }
    }

    remove(id) {
        const t = this._transfers.get(id);
        if (!t) return;
        t.el.remove();
        this._transfers.delete(id);
        this._updateCount();
        if (this._transfers.size === 0) this._hide();
    }

    clearAll() {
        for (const [id, t] of this._transfers) {
            if (t.status === 'complete' || t.status === 'error') {
                t.el.remove();
                this._transfers.delete(id);
            }
        }
        this._updateCount();
        if (this._transfers.size === 0) this._hide();
    }

    _autoRemove(id, delay) { setTimeout(() => this.remove(id), delay); }
    _updateCount() { if (this._countEl) this._countEl.textContent = this._transfers.size; }
    _show() { this._panel?.classList.add('visible'); }
    _hide() { this._panel?.classList.remove('visible'); }
}
```

**Step 2: Verify**

Open browser console and test:
```javascript
const tm = new TransferManager();
const id = tm.add('upload', 'test.txt');
tm.update(id, 50, 'Halfway...', 'active');
// Panel should appear with 50% progress
tm.update(id, 100, 'Done', 'complete');
// Should show checkmark, auto-remove after 5s
```

**Step 3: Commit**

```bash
git add web/static/js/app.js
git commit -m "feat: add TransferManager class with safe DOM construction"
```

---

### Task 3: Wire TransferManager into CloudTermApp and modify _doUpload

**Files:**
- Modify: `web/static/js/app.js`

**Step 1: Initialize TransferManager in CloudTermApp constructor**

In the constructor (around line 1110, after `this.snippets = new SnippetsManager();`), add:

```javascript
this.transfers = new TransferManager();
```

**Step 2: Modify _doUpload to use TransferManager**

Replace the `_doUpload` method (lines 1889-1935) with:

```javascript
async _doUpload() {
    const file = this._uploadFile;
    const instanceID = this._uploadInstanceID;
    if (!file || !instanceID) return;

    const remotePath = (document.getElementById('uploadRemotePath') || {}).value;
    if (!remotePath) { showToast('Remote path is required'); return; }

    const inst = this.sidebar.getInstance(instanceID);

    // Close modal immediately and add to transfer panel.
    document.getElementById('uploadModal')?.classList.remove('show');
    const tid = this.transfers.add('upload', file.name);

    const form = new FormData();
    form.append('file', file);
    form.append('instance_id', instanceID);
    form.append('remote_path', remotePath);
    form.append('platform', inst ? (inst.platform || 'linux') : 'linux');
    if (inst) {
        form.append('aws_profile', inst.aws_profile || '');
        form.append('aws_region', inst.aws_region || '');
    }

    try {
        const resp = await fetch('/upload-file', { method: 'POST', body: form });
        await this._readNDJSON(resp, (msg) => {
            if (msg.status === 'error') {
                this.transfers.update(tid, msg.progress || 100, msg.message, 'error');
                showToast('Upload failed: ' + msg.message, 5000);
            } else if (msg.status === 'complete') {
                this.transfers.update(tid, 100, 'Complete', 'complete');
                showToast('Upload complete: ' + remotePath);
            } else {
                this.transfers.update(tid, msg.progress || 0, msg.message || '', 'active');
            }
        });
    } catch (e) {
        this.transfers.update(tid, 0, e.message, 'error');
        showToast('Upload failed: ' + e.message, 5000);
    }
}
```

**Step 3: Clean up _showUploadModal**

Remove references to progress elements that no longer exist:
- Remove `const progressEl = document.getElementById('uploadProgress');` (line 1811)
- Remove `const progressBar = document.getElementById('uploadProgressBar');` (line 1812)
- Remove `if (progressEl) progressEl.style.display = 'none';` (line 1819)
- Remove `if (progressBar) progressBar.style.width = '0%';` (line 1820)

**Step 4: Verify**

1. Right-click an instance → Upload File
2. Select a file, enter remote path, click Upload
3. Modal should close immediately
4. Transfer panel should appear bottom-right with upload progress
5. While upload runs, you should be able to interact with terminals

**Step 5: Commit**

```bash
git add web/static/js/app.js
git commit -m "feat: wire upload to transfer panel instead of in-modal progress"
```

---

### Task 4: Modify _doDownload to use TransferManager

**Files:**
- Modify: `web/static/js/app.js`

**Step 1: Replace the _doDownload method**

Replace `_doDownload` (lines 1975-2033) with:

```javascript
async _doDownload() {
    const instanceID = this._downloadInstanceID;
    if (!instanceID) return;

    const remotePath = (document.getElementById('downloadRemotePath') || {}).value;
    if (!remotePath) { showToast('Remote path is required'); return; }

    const inst = this.sidebar.getInstance(instanceID);

    // Close modal immediately and add to transfer panel.
    document.getElementById('downloadModal')?.classList.remove('show');
    const filename = remotePath.split('/').pop().split('\\').pop() || 'download';
    const tid = this.transfers.add('download', filename);

    try {
        const resp = await fetch('/download-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instance_id: instanceID,
                remote_path: remotePath,
                aws_profile: inst ? (inst.aws_profile || '') : '',
                aws_region: inst ? (inst.aws_region || '') : '',
                platform: inst ? (inst.platform || 'linux') : 'linux'
            })
        });

        await this._readNDJSON(resp, (msg) => {
            if (msg.status === 'error') {
                this.transfers.update(tid, msg.progress || 100, msg.message, 'error');
                showToast('Download failed: ' + msg.message, 5000);
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
                showToast('Downloaded: ' + (msg.filename || remotePath));
            } else {
                this.transfers.update(tid, msg.progress || 0, msg.message || '', 'active');
            }
        });
    } catch (e) {
        this.transfers.update(tid, 0, e.message, 'error');
        showToast('Download failed: ' + e.message, 5000);
    }
}
```

**Step 2: Clean up _showDownloadModal**

Remove references to progress elements that no longer exist:
- Remove `const progressEl = document.getElementById('downloadProgress');` (line 1945)
- Remove `const progressBar = document.getElementById('downloadProgressBar');` (line 1946)
- Remove `if (progressEl) progressEl.style.display = 'none';` (line 1950)
- Remove `if (progressBar) progressBar.style.width = '0%';` (line 1951)

**Step 3: Verify**

1. Right-click an instance → Download File
2. Enter remote path, click Download
3. Modal should close immediately
4. Transfer panel should appear with download progress (blue bar)
5. On completion, browser download should trigger and row shows checkmark
6. Test concurrent: start an upload, then start a download — both rows should appear stacked

**Step 4: Commit**

```bash
git add web/static/js/app.js
git commit -m "feat: wire download to transfer panel instead of in-modal progress"
```

---

### Task 5: Final integration verification

**Files:**
- No new changes. This is verification only.

**Step 1: Full flow test**

1. Start an upload — panel shows green progress bar, modal closes
2. While upload runs, start a download — both rows stacked, independent progress
3. Both should complete with checkmarks
4. Completed rows auto-remove after 5s
5. Click header to collapse/expand the panel
6. Click close-all button to dismiss completed transfers
7. Panel slides away when all transfers are gone
8. Error case: try downloading a non-existent file — row should show error in red

**Step 2: Theme test**

Switch between themes (dark, nord, dracula, etc.) and verify the transfer panel looks correct in each — it uses CSS variables so it should inherit theme colors automatically.

**Step 3: Commit (only if any fixups needed)**

```bash
git add web/templates/index.html web/static/js/app.js
git commit -m "fix: transfer panel polish and edge cases"
```