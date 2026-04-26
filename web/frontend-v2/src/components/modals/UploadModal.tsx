import { useState, useCallback, useRef, useEffect, type DragEvent, type ChangeEvent } from 'react';
import { Upload, X, FileIcon } from 'lucide-react';
import { Dialog } from '@/components/primitives/Dialog';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { streamNDJSON } from '@/hooks/useNDJSON';
import { useActivityStore } from '@/stores/activity';
import { useInstancesStore } from '@/stores/instances';

import { useToastStore } from '@/stores/toast';

interface InstanceMeta { platform: string; os: string; awsProfile: string; awsRegion: string; }

function getInstanceMeta(instanceId: string): InstanceMeta {
  const accounts = useInstancesStore.getState().accounts;
  for (const a of accounts) {
    for (const r of a.regions) {
      for (const g of r.groups) {
        for (const i of g.instances) {
          if (i.instance_id === instanceId) {
            return { platform: i.platform ?? 'linux', os: i.os ?? '', awsProfile: i.aws_profile ?? '', awsRegion: i.aws_region ?? '' };
          }
        }
      }
    }
  }
  return { platform: 'linux', os: '', awsProfile: '', awsRegion: '' };
}

function isWindows(meta: InstanceMeta): boolean {
  return meta.platform.toLowerCase() === 'windows' || meta.os.toLowerCase().includes('windows');
}

function defaultRemotePath(instanceId: string): string {
  return isWindows(getInstanceMeta(instanceId)) ? 'C:\\Temp\\' : '/tmp/';
}

export interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  instanceName?: string;
  initialPath?: string;
  express?: boolean;
  s3Bucket?: string;
}

interface ProgressEvent {
  progress: number;
  speed?: number;
  eta?: number;
  total?: number;
  done?: boolean;
  status?: string;
  error?: string;
  message?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadModal({
  open,
  onOpenChange,
  instanceId,
  instanceName = '',
  initialPath,
  express = false,
  s3Bucket = '',
}: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [remotePath, setRemotePath] = useState(() => defaultRemotePath(instanceId));

  // Re-sync default path when modal opens
  useEffect(() => {
    if (open) {
      setRemotePath(initialPath || defaultRemotePath(instanceId));
      setError('');
    }
  }, [open, instanceId, initialPath]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const add = useActivityStore((s) => s.add);
  const finish = useActivityStore((s) => s.finish);
  const update = useActivityStore((s) => s.update);
  const pushToast = useToastStore((s) => s.push);

  const reset = useCallback(() => {
    setFile(null);
    setRemotePath(defaultRemotePath(instanceId));
    setDragging(false);
    setError('');
  }, [instanceId]);

  const handleClose = useCallback(() => {
    reset();
    onOpenChange(false);
  }, [reset, onOpenChange]);

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

    // Capture instance meta before closing modal
    const meta = getInstanceMeta(instanceId);

    // Close modal immediately — progress tracked in Activity panel
    reset();
    onOpenChange(false);

    const ctrl = new AbortController();
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('instance_id', instanceId);
      formData.append('remote_path', remotePath);
      formData.append('platform', meta.platform);
      formData.append('aws_profile', meta.awsProfile);
      formData.append('aws_region', meta.awsRegion);
      if (express && s3Bucket) {
        formData.append('s3_bucket', s3Bucket);
      }

      const endpoint = express ? '/express-upload' : '/upload-file';
      const res = await fetch(endpoint, { method: 'POST', body: formData, signal: ctrl.signal });

      if (!res.ok) {
        const text = await res.text().catch(() => 'Upload failed');
        throw new Error(text);
      }

      for await (const chunk of streamNDJSON<ProgressEvent>(res)) {
        const pct = chunk.progress > 1 ? chunk.progress / 100 : chunk.progress;
        update(activityId, {
          bytesDone: Math.floor(pct * file.size),
          bytesTotal: chunk.total || file.size,
          speedBps: chunk.speed ?? 0,
          etaSec: chunk.eta ?? 0,
        });
        if (chunk.error) throw new Error(chunk.error);
        if (chunk.status === 'error') throw new Error(chunk.message ?? 'Upload failed');
        if (chunk.done || chunk.status === 'complete') break;
      }

      finish(activityId, 'success');
    } catch (err) {
      if ((err as Error).name === 'AbortError') { finish(activityId, 'canceled'); return; }
      const msg = err instanceof Error ? err.message : 'Upload failed';
      finish(activityId, 'error', msg);
    }
  }, [file, instanceId, instanceName, remotePath, express, s3Bucket, add, finish, update, pushToast, reset, onOpenChange]);

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      title={express ? 'Express Upload (S3)' : 'Upload File'}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!file}
            onClick={() => void handleUpload()}
          >
            Upload
          </Button>
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

        {file && (
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

        <div>
          <label htmlFor="upload-remote-path" className="text-[11px] font-medium text-text-mut block mb-1">
            Remote path
          </label>
          <Input
            id="upload-remote-path"
            placeholder={isWindows(getInstanceMeta(instanceId)) ? 'C:\\Temp\\' : '/tmp/'}
            value={remotePath}
            onChange={(e) => setRemotePath(e.target.value)}
          />
          <p className="text-[11px] text-text-dim mt-1">
            Directory path (file will be placed here) or full path including filename
          </p>
        </div>

        {error && <p className="text-[11px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}

UploadModal.displayName = 'UploadModal';
