import { useCallback, useRef } from 'react';
import { useAIStore } from '@/stores/ai';
import { useSessionsStore } from '@/stores/sessions';

export interface UseAIStreamReturn {
  send: (content: string) => void;
  stop: () => void;
  streaming: boolean;
}

export function useAIStream(): UseAIStreamReturn {
  const sendMessage = useAIStore((s) => s.sendMessage);
  const streaming = useAIStore((s) => s.streaming);
  const setOpen = useAIStore((s) => s.setOpen);
  const activeSessionId = useSessionsStore((s) => s.activeId);
  const abortRef = useRef<(() => void) | null>(null);

  const send = useCallback(
    (content: string) => {
      if (!content.trim()) return;
      setOpen(true);
      abortRef.current = null;
      void sendMessage(content, activeSessionId ?? undefined);
    },
    [sendMessage, setOpen, activeSessionId],
  );

  const stop = useCallback(() => {
    abortRef.current?.();
  }, []);

  return { send, stop, streaming };
}
