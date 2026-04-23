import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from 'react';
import { Upload, X, FileIcon } from 'lucide-react';
import { Dialog } from '@/components/primitives/Dialog';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { streamNDJSON } from '@/hooks/useNDJSON';
import { useActivityStore } from '@/stores/activity';
import { useInstancesStore } from '@/stores/instances';

function isWindowsInstance(instanceId: string): boolean {
  const accounts = useInstancesStore.getState().accounts;
  for (const a of accounts) {
    for (const r of a.regions) {
      for (const g of r.groups) {
        for (const i of g.instances) {
          if (i.instance_id === instanceId) {
            return (i.platform ?? '').toLowerCase() === 'windows' || (i.os ?? '').toLowerCase().includes('windows');
          }
        }
      }
    }
  }
  return false;
}

function defaultRemotePath(instanceId: string): string {
  return isWindowsInstance(instanceId) ? 'C:\\Temp\\' : '/tmp/';
}
import { useToastStore } from '@/stores/toast';

export interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  instanceName?: string;
  express?: boolean;
  s3Bucket?: string;
}

interface ProgressEvent {
  progress: number;
  speed: number;
  eta: number;
  done: boolean;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bps: number): string {
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function UploadModal({
  open,
  onOpenChange,
  instanceId,
  instanceName = '',
  express = false,
  s3Bucket = '',
}: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [remotePath, setRemotePath] = useState(() => defaultRemotePath(instanceId));
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const add = useActivityStore((s) => s.add);
  const finish = useActivityStore((s) => s.finish);
  const update = useActivityStore((s) => s.update);
  const pushToast = useToastStore((s) => s.push);

  const reset = useCallback(() => {
    setFile(null);
      setRemotePath(defaultRemotePath(instanceId));
    setDragging(false);
    setProgress(0);
    setSpeed(0);
    setEta(0);
    setUploading(false);
    setDone(false);
    setError('');
    abortRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    if (uploading) {
      abortRef.current?.abort();
    }
    reset();
    onOpenChange(false);
  }, [uploading, reset, onOpenChange]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    if (selected) setFile(selected);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file || !instanceId) return;

    setError('');
    setUploading(true);
    setProgress(0);

    const effectiveRemotePath = (remotePath.endsWith('/') || remotePath.endsWith('\\'))
      ? `${remotePath}${file.name}`
      : remotePath;

    const activityId = add({
      kind: 'transfer',
      direction: 'upload',
      filename: file.name,
      instanceId,
      instanceName,
      bytesTotal: file.size,
      bytesDone: 0,
      speedBps: 0,
    });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('instance_id', instanceId);
      formData.append('remote_path', effectiveRemotePath);
      if (express && s3Bucket) {
        formData.append('s3_bucket', s3Bucket);
      }

      const endpoint = express ? '/express-upload' : '/upload-file';
      const res = await fetch(endpoint, { method: 'POST', body: formData, signal: ctrl.signal });

      if (!res.ok) {
        const text = await res.text().catch(() => 'Upload failed');
        throw new Error(text);
      }

      onOpenChange(false);
      pushToast({ variant: 'info', title: 'Uploading…', description: `${file.name} → ${instanceName || instanceId}` });

      for await (const chunk of streamNDJSON<ProgressEvent>(res)) {
        if (ctrl.signal.aborted) break;
        const pct = chunk.progress > 1 ? chunk.progress / 100 : chunk.progress;
        setProgress(pct);
        setSpeed(chunk.speed);
        setEta(chunk.eta);
        update(activityId, {
          bytesDone: Math.floor(pct * file.size),
          speedBps: chunk.speed,
          etaSec: chunk.eta,
        });
        if (chunk.error) {
          throw new Error(chunk.error);
        }
        if (chunk.done) break;
      }

      setDone(true);
      finish(activityId, 'success');
      pushToast({ variant: 'success', title: 'Upload complete', description: file.name });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        finish(activityId, 'canceled');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      finish(activityId, 'error', msg);
    } finally {
      setUploading(false);
    }
  }, [file, instanceId, instanceName, remotePath, express, s3Bucket, add, finish, update, pushToast]);

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      title={express ? 'Express Upload (S3)' : 'Upload File'}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={uploading && !done}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          {!done && (
            <Button
              variant="primary"
              size="sm"
              loading={uploading}
              disabled={!file || uploading}
              onClick={() => void handleUpload()}
            >
              Upload
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {instanceName && (
          <div>
            <label className="text-[11px] font-medium text-text-mut block mb-1">Instance</label>
            <p className="text-[13px] text-text-pri">{instanceName}</p>
          </div>
        )}

        {!file && (
          <div
            role="button"
            tabIndex={0}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragging
                ? 'border-accent bg-accent/10'
                : 'border-border hover:border-accent/50 hover:bg-elev'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
          >
            <Upload size={24} className="mx-auto mb-2 text-text-dim" />
            <p className="text-[13px] text-text-pri mb-1">Drop a file here or click to browse</p>
            <p className="text-[11px] text-text-dim">No size limit</p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              aria-label="Select file to upload"
            />
          </div>
        )}

        {file && !uploading && !done && (
          <div className="flex items-center gap-2 p-2.5 bg-elev rounded border border-border">
            <FileIcon size={16} className="text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-text-pri truncate">{file.name}</p>
              <p className="text-[11px] text-text-dim">{formatBytes(file.size)}</p>
            </div>
            <button
              type="button"
              className="text-text-dim hover:text-danger transition-colors"
              onClick={() => setFile(null)}
              aria-label="Remove file"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {!done && (
          <div>
            <label htmlFor="upload-remote-path" className="text-[11px] font-medium text-text-mut block mb-1">
              Remote path
            </label>
            <Input
              id="upload-remote-path"
              placeholder={isWindowsInstance(instanceId) ? 'C:\\Temp\\' : '/tmp/'}
              value={remotePath}
              onChange={(e) => setRemotePath(e.target.value)}
              disabled={uploading}
            />
            <p className="text-[11px] text-text-dim mt-1">
              Directory path (file will be placed here) or full path including filename
            </p>
          </div>
        )}

        {(uploading || done) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-pri">{file?.name}</span>
              <span className="text-text-dim">{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-1.5 bg-elev rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300 rounded-full"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            {uploading && speed > 0 && (
              <div className="flex gap-3 text-[11px] text-text-dim">
                <span>{formatSpeed(speed)}</span>
                {eta > 0 && <span>ETA: {eta}s</span>}
              </div>
            )}
            {done && (
              <p className="text-[12px] text-success font-medium">✓ Upload complete</p>
            )}
          </div>
        )}

        {error && <p className="text-[11px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}

UploadModal.displayName = 'UploadModal';
