import { useMemo } from 'react';
import { Upload, Download, X, CheckCircle } from 'lucide-react';
import { type TransferActivity, useActivityStore } from '@/stores/activity';

export interface TransferItemProps {
  activity: TransferActivity;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)}GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)}MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)}KB`;
  return `${bytes}B`;
}

export function TransferItem({ activity }: TransferItemProps) {
  const cancel = useActivityStore((s) => s.cancel);

  const pct = useMemo(
    () =>
      activity.bytesTotal > 0
        ? Math.min(100, Math.round((activity.bytesDone / activity.bytesTotal) * 100))
        : 0,
    [activity.bytesDone, activity.bytesTotal],
  );

  const isRunning = activity.status === 'running';
  const isError = activity.status === 'error';
  const isSuccess = activity.status === 'success';
  const Icon = activity.direction === 'upload' ? Upload : Download;

  return (
    <div className="px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isSuccess ? (
            <CheckCircle
              size={13}
              className="shrink-0 text-success"
              aria-hidden="true"
            />
          ) : (
            <Icon
              size={13}
              className={`shrink-0 ${isError ? 'text-danger' : 'text-accent'}`}
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-text-pri truncate">{activity.filename}</p>
            <p className="text-[11px] text-text-dim truncate">{activity.instanceName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isRunning && (
            <button
              type="button"
              onClick={() => cancel(activity.id)}
              className="text-text-dim hover:text-danger transition-colors p-0.5 rounded"
              aria-label={`Cancel ${activity.direction} of ${activity.filename}`}
            >
              <X size={12} />
            </button>
          )}
          {!isRunning && (
            <button
              type="button"
              onClick={() => useActivityStore.getState().dismiss(activity.id)}
              className="text-text-dim hover:text-text-pri transition-colors p-0.5 rounded ml-1"
              aria-label="Dismiss activity"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div
        className="h-1 bg-border rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Transfer progress: ${pct}%`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isError ? 'bg-danger' : isSuccess ? 'bg-success' : 'bg-accent'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-text-dim">
        <span>
          {formatBytes(activity.bytesDone)} / {formatBytes(activity.bytesTotal)}
        </span>
        <div className="flex items-center gap-2">
          {isRunning && activity.speedBps > 0 && (
            <span>{formatBytes(activity.speedBps)}/s</span>
          )}
          {isRunning && activity.etaSec !== undefined && activity.etaSec > 0 && (
            <span>
              ETA {activity.etaSec > 60 
                ? `${Math.floor(activity.etaSec / 60)}m ${activity.etaSec % 60}s` 
                : `${activity.etaSec}s`}
            </span>
          )}
        </div>
      </div>
      {isError && activity.error && (
        <div className="text-[10px] text-danger break-words leading-tight mt-1">
          {activity.error}
        </div>
      )}
    </div>
  );
}

TransferItem.displayName = 'TransferItem';
