import { useCallback, useRef } from 'react';
import { useActivityStore } from '@/stores/activity';
import { useToastStore } from '@/stores/toast';
import { apiPost, apiGet } from '@/lib/api';

interface ConvertResponse {
  job_id: string;
}

interface ConvertStatus {
  job_id: string;
  progress: number;
  status: 'running' | 'done' | 'error';
  output_file?: string;
  error?: string;
}

const POLL_INTERVAL_MS = 2000;

export function useMP4Conversion() {
  const add = useActivityStore((s) => s.add);
  const update = useActivityStore((s) => s.update);
  const finish = useActivityStore((s) => s.finish);
  const toast = useToastStore((s) => s.push);

  const pollers = useRef(new Map<string, ReturnType<typeof setInterval>>());

  const startConversion = useCallback(
    async (castFilename: string): Promise<void> => {
      const result = await apiPost<ConvertResponse, { filename: string }>('/convert', {
        filename: castFilename,
      });

      if (!result.ok) {
        toast({ variant: 'danger', title: 'Conversion failed', description: result.error.message });
        return;
      }

      const { job_id: jobId } = result.value;
      const activityId = add({
        kind: 'mp4',
        castFilename,
        jobId,
        progressPct: 0,
      });

      const doPoll = async (): Promise<void> => {
        const statusResult = await apiGet<ConvertStatus>(`/convert-status/${jobId}`);
        if (!statusResult.ok) return;

        const status = statusResult.value;
        update(activityId, { progressPct: status.progress * 100 });

        if (status.status === 'done') {
          clearInterval(pollers.current.get(activityId));
          pollers.current.delete(activityId);
          finish(activityId, 'success');

          const outputFile = status.output_file ?? `${castFilename}.mp4`;
          toast({
            variant: 'success',
            title: 'MP4 conversion complete',
            description: `${castFilename} → ${outputFile}`,
            duration: null,
          });

          const a = document.createElement('a');
          a.href = `/download-recording/${encodeURIComponent(outputFile)}`;
          a.download = outputFile.split('/').pop() ?? outputFile;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else if (status.status === 'error') {
          clearInterval(pollers.current.get(activityId));
          pollers.current.delete(activityId);
          finish(activityId, 'error', status.error ?? 'Conversion failed');
          toast({
            variant: 'danger',
            title: 'MP4 conversion failed',
            description: status.error ?? 'Unknown error',
          });
        }
      };

      const intervalId = setInterval(() => void doPoll(), POLL_INTERVAL_MS);
      pollers.current.set(activityId, intervalId);
    },
    [add, update, finish, toast],
  );

  return { startConversion };
}
