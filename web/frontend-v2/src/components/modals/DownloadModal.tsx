import { useState, useCallback, useRef } from 'react';
import { Dialog } from '@/components/primitives/Dialog';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { streamNDJSON } from '@/hooks/useNDJSON';
import { useActivityStore } from '@/stores/activity';
import { useToastStore } from '@/stores/toast';
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

export interface DownloadModalProps {
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
  speed: number;
  eta: number;
  done: boolean;
  error?: string;
}

function formatSpeed(bps: number): string {
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
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
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const add = useActivityStore((s) => s.add);
  const finish = useActivityStore((s) => s.finish);
  const update = useActivityStore((s) => s.update);
  const pushToast = useToastStore((s) => s.push);

  const reset = useCallback(() => {
    setRemotePath(initialPath);
    setProgress(0);
    setSpeed(0);
    setEta(0);
    setDownloading(false);
    setDone(false);
    setError('');
    abortRef.current = null;
  }, [initialPath]);

  const handleClose = useCallback(() => {
    if (downloading) abortRef.current?.abort();
    reset();
    onOpenChange(false);
  }, [downloading, reset, onOpenChange]);

  const handleDownload = useCallback(async () => {
    if (!remotePath.trim() || !instanceId) return;

    setError('');
    setDownloading(true);
    setProgress(0);

    const filename = remotePath.split(/[/\\]/).pop() ?? 'download';

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

    try {
      const endpoint = express ? '/express-download' : '/download-file';
      const body: Record<string, string> = { instance_id: instanceId, remote_path: remotePath };
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

      const contentType = res.headers.get('content-type') ?? '';

      if (contentType.includes('application/x-ndjson') || contentType.includes('text/plain')) {
        for await (const chunk of streamNDJSON<ProgressEvent>(res)) {
          if (ctrl.signal.aborted) break;
          setProgress(chunk.progress);
          setSpeed(chunk.speed);
          setEta(chunk.eta);
          update(activityId, { speedBps: chunk.speed, etaSec: chunk.eta });
          if (chunk.error) throw new Error(chunk.error);
          if (chunk.done) break;
        }

        const dlRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!dlRes.ok) throw new Error('File fetch failed');
        const blob = await dlRes.blob();
        triggerBrowserDownload(blob, filename);
      } else {
        const blob = await res.blob();
        triggerBrowserDownload(blob, filename);
      }

      setProgress(1);
      setDone(true);
      finish(activityId, 'success');
      pushToast({ variant: 'success', title: 'Download complete', description: filename });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        finish(activityId, 'canceled');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Download failed';
      setError(msg);
      finish(activityId, 'error', msg);
    } finally {
      setDownloading(false);
    }
  }, [remotePath, instanceId, instanceName, express, s3Bucket, add, finish, update, pushToast]);

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      title={express ? 'Express Download (S3)' : 'Download File'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          {!done && (
            <Button
              variant="primary"
              size="sm"
              loading={downloading}
              disabled={!remotePath.trim() || downloading}
              onClick={() => void handleDownload()}
            >
              Download
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

        <div>
          <label htmlFor="dl-remote-path" className="text-[11px] font-medium text-text-mut block mb-1">
            Remote file path
          </label>
          <Input
            id="dl-remote-path"
            placeholder="/home/ec2-user/file.txt"
            value={remotePath}
            onChange={(e) => setRemotePath(e.target.value)}
            disabled={downloading}
          />
        </div>

        {(downloading || done) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-pri truncate max-w-[80%]">
                {remotePath.split('/').pop()}
              </span>
              <span className="text-text-dim">{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-1.5 bg-elev rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300 rounded-full"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            {downloading && speed > 0 && (
              <div className="flex gap-3 text-[11px] text-text-dim">
                <span>{formatSpeed(speed)}</span>
                {eta > 0 && <span>ETA: {eta}s</span>}
              </div>
            )}
            {done && <p className="text-[12px] text-success font-medium">✓ Download complete</p>}
          </div>
        )}

        {error && <p className="text-[11px] text-danger">{error}</p>}
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
