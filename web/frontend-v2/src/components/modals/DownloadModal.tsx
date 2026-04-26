import { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog } from '@/components/primitives/Dialog';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { streamNDJSON } from '@/hooks/useNDJSON';
import { useActivityStore } from '@/stores/activity';
import { useToastStore } from '@/stores/toast';
import { useInstancesStore } from '@/stores/instances';

interface InstanceMeta { platform: string; awsProfile: string; awsRegion: string; }

function getInstanceMeta(instanceId: string): InstanceMeta {
  const accounts = useInstancesStore.getState().accounts;
  for (const a of accounts) {
    for (const r of a.regions) {
      for (const g of r.groups) {
        for (const i of g.instances) {
          if (i.instance_id === instanceId) {
            return { platform: i.platform ?? 'linux', awsProfile: i.aws_profile ?? '', awsRegion: i.aws_region ?? '' };
          }
        }
      }
    }
  }
  return { platform: 'linux', awsProfile: '', awsRegion: '' };
}

export interface DownloadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  instanceName?: string;
  initialPath?: string;
  express?: boolean;
  s3Bucket?: string;
}

interface ProgressChunk {
  progress: number;
  speed?: number;
  eta?: number;
  total?: number;
  done?: boolean;
  status?: string;
  error?: string;
  message?: string;
  // final download chunk fields
  data?: string;
  filename?: string;
}

export function DownloadModal({
  open,
  onOpenChange,
  instanceId,
  instanceName = '',
  initialPath = '',
  express = false,
  s3Bucket = '',
}: DownloadModalProps) {
  const [remotePath, setRemotePath] = useState(initialPath);
  const [downloading, setDownloading] = useState(false);

  // Sync remotePath when modal opens with a new initialPath (e.g. from FileBrowser)
  useEffect(() => {
    if (open) {
      if (initialPath) setRemotePath(initialPath);
      setError('');
    }
  }, [open, initialPath]);

  // Update placeholder hint based on instance platform
  const isWin = getInstanceMeta(instanceId).platform.toLowerCase() === 'windows';
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const add = useActivityStore((s) => s.add);
  const finish = useActivityStore((s) => s.finish);
  const update = useActivityStore((s) => s.update);
  const pushToast = useToastStore((s) => s.push);

  const reset = useCallback(() => {
    setRemotePath(initialPath);
    setDownloading(false);
    setError('');
    abortRef.current = null;
  }, [initialPath]);

  const handleClose = useCallback(() => {
    if (downloading) abortRef.current?.abort();
    reset();
    onOpenChange(false);
  }, [downloading, reset, onOpenChange]);

  const handleDownload = useCallback(async () => {
    const path = remotePath.trim();
    if (!path || !instanceId) return;

    setError('');
    setDownloading(true);

    const filename = path.split(/[/\\]/).pop() ?? 'download';
    const meta = getInstanceMeta(instanceId);

    const activityId = add({
      kind: 'transfer',
      direction: 'download',
      filename,
      instanceId,
      instanceName,
      bytesTotal: 0,
      bytesDone: 0,
      speedBps: 0,
    });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Capture meta before closing

    // Close modal immediately so user can continue working
    onOpenChange(false);

    try {
      const endpoint = express ? '/express-download' : '/download-file';
      const body: Record<string, string> = {
        instance_id: instanceId,
        remote_path: path,
        platform: meta.platform,
        aws_profile: meta.awsProfile,
        aws_region: meta.awsRegion,
      };
      if (express && s3Bucket) body['s3_bucket'] = s3Bucket;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => 'Download failed');
        throw new Error(text);
      }

      let fileData: string | null = null;
      let resolvedFilename = filename;

      for await (const chunk of streamNDJSON<ProgressChunk>(res)) {
        if (ctrl.signal.aborted) break;

        // Update activity progress
        const total = chunk.total || 0;
        const pct = chunk.progress > 1 ? chunk.progress / 100 : chunk.progress;
        update(activityId, { 
          speedBps: chunk.speed ?? 0, 
          etaSec: chunk.eta ?? 0, 
          bytesTotal: total,
          bytesDone: total > 0 ? Math.floor(pct * total) : 0 
        });

        if (chunk.error) throw new Error(chunk.error);
        if (chunk.status === 'error') throw new Error(chunk.message ?? 'Download failed');

        // Final message carries the file data as base64
        if (chunk.data) {
          fileData = chunk.data;
          if (chunk.filename) resolvedFilename = chunk.filename;
        }

        if (chunk.done || chunk.status === 'complete') break;
      }

      if (!fileData) throw new Error('No file data received from server');

      // Decode base64 natively to prevent browser crash on large files
      const b64Res = await fetch(`data:application/octet-stream;base64,${fileData}`);
      const blob = await b64Res.blob();
      triggerBrowserDownload(blob, resolvedFilename);

      finish(activityId, 'success');
      reset();
      onOpenChange(false);
    } catch (err) {
      if ((err as Error).name === 'AbortError') { finish(activityId, 'canceled'); setDownloading(false); return; }
      const msg = err instanceof Error ? err.message : 'Download failed';
      setError(msg);
      setDownloading(false);
      finish(activityId, 'error', msg);
    }
  }, [remotePath, instanceId, instanceName, express, s3Bucket, add, finish, update, pushToast, reset, onOpenChange]);

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      title={express ? 'Express Download (S3)' : 'Download File'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            loading={downloading}
            disabled={!remotePath.trim() || downloading}
            onClick={() => void handleDownload()}
          >
            Download
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

        {initialPath ? (
          <div>
            <label className="text-[11px] font-medium text-text-mut block mb-1">File to download</label>
            <p className="text-[13px] text-text-pri break-all font-mono">{initialPath}</p>
          </div>
        ) : (
          <div>
            <label htmlFor="dl-remote-path" className="text-[11px] font-medium text-text-mut block mb-1">
              Remote file path
            </label>
            <Input
              id="dl-remote-path"
              placeholder={isWin ? 'C:\\Users\\Administrator\\file.txt' : '/home/ec2-user/file.txt'}
              value={remotePath}
              onChange={(e) => setRemotePath(e.target.value)}
              disabled={downloading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleDownload();
              }}
              autoFocus
            />
          </div>
        )}

        {error && <p className="text-[11px] text-danger leading-snug">{error}</p>}
      </div>
    </Dialog>
  );
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

DownloadModal.displayName = 'DownloadModal';
