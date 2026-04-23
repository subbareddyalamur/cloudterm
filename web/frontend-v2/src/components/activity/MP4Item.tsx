import { useMemo } from 'react';
import { Video, X } from 'lucide-react';
import { type MP4Activity, useActivityStore } from '@/stores/activity';

export interface MP4ItemProps {
  activity: MP4Activity;
}

export function MP4Item({ activity }: MP4ItemProps) {
  const cancel = useActivityStore((s) => s.cancel);

  const pct = useMemo(
    () => Math.min(100, Math.round(activity.progressPct)),
    [activity.progressPct],
  );

  const isRunning = activity.status === 'running';
  const isError = activity.status === 'error';
  const isSuccess = activity.status === 'success';

  return (
    <div className="px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Video
            size={13}
            className={`shrink-0 ${isError ? 'text-danger' : 'text-accent'}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-text-pri truncate">
              {activity.castFilename}
            </p>
            <p className="text-[11px] text-text-dim">Converting to MP4</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isRunning && (
            <button
              type="button"
              onClick={() => cancel(activity.id)}
              className="text-text-dim hover:text-danger transition-colors p-0.5 rounded"
              aria-label="Cancel MP4 conversion"
            >
              <X size={12} />
            </button>
          )}
          {isSuccess && (
            <span className="text-[10px] text-success font-medium">Done</span>
          )}
          {isError && (
            <span className="text-[10px] text-danger font-medium">Error</span>
          )}
        </div>
      </div>

      <div
        className="h-1 bg-border rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Conversion progress: ${pct}%`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isError ? 'bg-danger' : isSuccess ? 'bg-success' : 'bg-accent'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex justify-end text-[10px] text-text-dim">
        <span>{pct}%</span>
      </div>
    </div>
  );
}

MP4Item.displayName = 'MP4Item';
