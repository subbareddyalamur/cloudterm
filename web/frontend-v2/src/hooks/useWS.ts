import { useEffect, useRef } from 'react';
import { getTerminalWS } from '@/lib/ws';
import type { IncomingWSMessage } from '@/lib/ws-messages';

export function useTerminalWS(onMessage: (msg: IncomingWSMessage) => void) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    const ws = getTerminalWS();
    return ws.subscribe((msg) => handlerRef.current(msg));
  }, []);

  return getTerminalWS();
}
