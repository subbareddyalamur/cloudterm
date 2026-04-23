import { useCallback, useRef } from 'react';
import { useActivityStore, type ActivityPatch } from '@/stores/activity';
import { streamNDJSON } from './useNDJSON';

interface ProgressChunk {
  progress: number;
  speed: number;
  eta?: number;
  done?: boolean;
  error?: string;
}

export function useFileTransfer() {
  const add = useActivityStore((s) => s.add);
  const update = useActivityStore((s) => s.update);
  const finish = useActivityStore((s) => s.finish);

  const abortControllers = useRef(new Map<string, AbortController>());

  const upload = useCallback(
    async (
      file: File,
      instanceId: string,
      instanceName: string,
      remotePath?: string,
    ): Promise<void> => {
      const ctrl = new AbortController();
      const id = add({
        kind: 'transfer',
        direction: 'upload',
        filename: file.name,
        instanceId,
        instanceName,
        bytesTotal: file.size,
        bytesDone: 0,
        speedBps: 0,
      });
      abortControllers.current.set(id, ctrl);

      try {
        const form = new FormData();
        form.append('file', file);
        form.append('instance_id', instanceId);
        if (remotePath) form.append('remote_path', remotePath);

        const res = await fetch('/upload-file', {
          method: 'POST',
          body: form,
          signal: ctrl.signal,
        });

        if (!res.ok) {
          finish(id, 'error', await res.text());
          return;
        }

        for await (const chunk of streamNDJSON<ProgressChunk>(res)) {
          if (chunk.error) {
            finish(id, 'error', chunk.error);
            return;
          }
          const patch: ActivityPatch = {
            bytesDone: Math.round(chunk.progress * file.size),
            speedBps: chunk.speed,
          };
          if (chunk.eta !== undefined) patch.etaSec = chunk.eta;
          update(id, patch);
          if (chunk.done) {
            finish(id, 'success');
            return;
          }
        }
        finish(id, 'success');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          finish(id, 'error', (e as Error).message);
        }
      } finally {
        abortControllers.current.delete(id);
      }
    },
    [add, update, finish],
  );

  const download = useCallback(
    async (filename: string, instanceId: string, instanceName: string): Promise<void> => {
      const ctrl = new AbortController();
      const id = add({
        kind: 'transfer',
        direction: 'download',
        filename,
        instanceId,
        instanceName,
        bytesTotal: 0,
        bytesDone: 0,
        speedBps: 0,
      });
      abortControllers.current.set(id, ctrl);

      try {
        const res = await fetch('/download-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, instance_id: instanceId }),
          signal: ctrl.signal,
        });

        if (!res.ok) {
          finish(id, 'error', await res.text());
          return;
        }

        const contentLength = Number(res.headers.get('content-length') ?? '0');
        update(id, { bytesTotal: contentLength });

        const blob = await res.blob();
        finish(id, 'success');

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.split('/').pop() ?? filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          finish(id, 'error', (e as Error).message);
        }
      } finally {
        abortControllers.current.delete(id);
      }
    },
    [add, update, finish],
  );

  const cancelTransfer = useCallback((id: string) => {
    abortControllers.current.get(id)?.abort();
  }, []);

  return { upload, download, cancelTransfer };
}
