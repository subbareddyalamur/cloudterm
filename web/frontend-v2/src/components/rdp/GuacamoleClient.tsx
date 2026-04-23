import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { loadGuacamole, type GuacamoleNamespace } from '@/lib/guacamole';

export interface GuacamoleClientProps {
  sessionId: string;
  token: string;
}

type ConnectionState = 'loading' | 'connecting' | 'connected' | 'disconnected' | 'error';

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/* eslint-disable @typescript-eslint/no-explicit-any */

function updateScale(client: any, container: HTMLElement) {
  const display = client.getDisplay();
  const dw = display.getWidth();
  const dh = display.getHeight();
  if (!dw || !dh) return;
  const scale = Math.min(container.clientWidth / dw, container.clientHeight / dh);
  display.scale(scale);
}

export function GuacamoleClient({ sessionId, token }: GuacamoleClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<any>(null);
  const kbRef = useRef<any>(null);
  const metaHeldRef = useRef(false);
  const [state, setState] = useState<ConnectionState>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const disconnect = useCallback(() => {
    if (kbRef.current) {
      kbRef.current.onkeydown = null;
      kbRef.current.onkeyup = null;
      kbRef.current.reset();
      kbRef.current = null;
    }
    if (clientRef.current) {
      try { clientRef.current.disconnect(); } catch { void 0; }
      clientRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
    let tunnel: any = null;
    let Guac: GuacamoleNamespace;

    async function doConnect() {
      if (cancelled || !containerRef.current) return;

      try {
        Guac = await loadGuacamole();
        if (cancelled || !containerRef.current) return;

        setState('connecting');
        const container = containerRef.current;
        const w = container.clientWidth || 1280;
        const h = container.clientHeight || 720;
        const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProto}//${location.host}/guac-ws/?width=${w}&height=${h}&token=${encodeURIComponent(token)}`;

        tunnel = new Guac.WebSocketTunnel(wsUrl);
        const client = new Guac.Client(tunnel);
        clientRef.current = client;

        client.onerror = (status: any) => {
          if (cancelled) return;
          const msg = status?.message ? String(status.message) : 'Connection error';
          setErrorMsg(msg);
          setState('error');
        };

        client.onstatechange = (s: number) => {
          if (cancelled) return;

          if (s === 3) {
            setState('connected');

            while (container.firstChild) container.removeChild(container.firstChild);

            const display = client.getDisplay();
            const displayElement = display.getElement();
            displayElement.style.margin = '0 auto';
            // Hide host cursor — Guacamole renders its own remote cursor
            displayElement.style.cursor = 'none';
            container.appendChild(displayElement);
            updateScale(client, container);

            display.onresize = () => {
              if (containerRef.current && clientRef.current) {
                updateScale(clientRef.current, containerRef.current);
              }
            };

            const mouse = new Guac.Mouse(displayElement);
            const scaleMouse = (mouseState: any) => {
              const scale = display.getScale() || 1;
              client.sendMouseState({
                x: mouseState.x / scale,
                y: mouseState.y / scale,
                left: mouseState.left,
                middle: mouseState.middle,
                right: mouseState.right,
                up: mouseState.up,
                down: mouseState.down,
              });
            };
            mouse.onmousedown = scaleMouse;
            mouse.onmouseup = scaleMouse;
            mouse.onmousemove = scaleMouse;

            client.onclipboard = (stream: any, mimetype: string) => {
              if (mimetype !== 'text/plain') return;
              let data = '';
              stream.onblob = (blob: string) => { data += atob(blob); };
              stream.onend = () => {
                if (data) navigator.clipboard.writeText(data).catch(() => void 0);
              };
            };

            const kb = new Guac.Keyboard(document);
            kbRef.current = kb;

            kb.onkeydown = (keysym: number) => {
              if (!clientRef.current) return false;
              if (IS_MAC) {
                if (keysym === 0xFFE7 || keysym === 0xFFE8) {
                  metaHeldRef.current = true;
                  clientRef.current.sendKeyEvent(1, 0xFFE3);
                  return true;
                }
                if (metaHeldRef.current) {
                  const kl = keysym | 0x20;
                  if (kl === 0x6c || kl === 0x64) return true;
                  if (kl === 0x76) {
                    navigator.clipboard.readText().then((text) => {
                      if (text && clientRef.current) {
                        try {
                          const s2 = clientRef.current.createClipboardStream('text/plain');
                          const wr = new Guac.StringWriter(s2);
                          wr.sendText(text);
                          wr.sendEnd();
                        } catch { void 0; }
                        setTimeout(() => clientRef.current?.sendKeyEvent(1, keysym), 100);
                      }
                    }).catch(() => clientRef.current?.sendKeyEvent(1, keysym));
                    return true;
                  }
                }
              }
              clientRef.current.sendKeyEvent(1, keysym);
              return true;
            };

            kb.onkeyup = (keysym: number) => {
              if (!clientRef.current) return;
              if (IS_MAC && (keysym === 0xFFE7 || keysym === 0xFFE8)) {
                metaHeldRef.current = false;
                clientRef.current.sendKeyEvent(0, 0xFFE3);
                return;
              }
              clientRef.current.sendKeyEvent(0, keysym);
            };

            try {
              resizeObserver = new ResizeObserver(() => {
                if (containerRef.current && clientRef.current) {
                  updateScale(clientRef.current, containerRef.current);
                }
              });
              resizeObserver.observe(container);
            } catch { void 0; }

            displayElement.focus();

          } else if (s === 5) {
            setState('disconnected');
          }
        };

        client.connect('');

        keepaliveInterval = setInterval(() => {
          if (tunnel) {
            try { tunnel.sendMessage('nop'); } catch { void 0; }
          }
        }, 5000);

      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to initialize RDP');
          setState('error');
        }
      }
    }

    void doConnect();

    return () => {
      cancelled = true;
      if (keepaliveInterval) clearInterval(keepaliveInterval);
      if (resizeObserver) {
        try { resizeObserver.disconnect(); } catch { void 0; }
      }
      disconnect();
    };
  }, [sessionId, token, disconnect]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
        tabIndex={0}
        style={{ cursor: state === 'connected' ? 'none' : 'wait' }}
      />
      {state !== 'connected' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-text-pri gap-3 z-10">
          {state === 'loading' && (
            <>
              <Loader2 size={28} className="animate-spin text-accent" />
              <span className="text-sm">Loading Guacamole…</span>
            </>
          )}
          {state === 'connecting' && (
            <>
              <Loader2 size={28} className="animate-spin text-accent" />
              <span className="text-sm">Connecting to remote desktop…</span>
              <span className="text-xs text-text-dim">Negotiating with Windows server</span>
            </>
          )}
          {state === 'error' && (
            <>
              <span className="text-sm font-semibold text-danger">Connection failed</span>
              {errorMsg && <span className="text-xs text-text-dim max-w-sm text-center">{errorMsg}</span>}
            </>
          )}
          {state === 'disconnected' && (
            <>
              <RotateCw size={20} className="text-text-dim" />
              <span className="text-sm text-text-dim">Session disconnected</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

GuacamoleClient.displayName = 'GuacamoleClient';
