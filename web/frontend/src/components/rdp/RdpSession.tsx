import { useEffect, useRef, useCallback, useState } from "react";
import Guacamole from "guacamole-common-js";
import {
  readRemoteClipboard,
  pushClipboardToRemote,
  writeLocalClipboard,
  readLocalClipboard,
} from "./RdpClipboard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RdpConnectionState =
  | "idle"
  | "connecting"
  | "waiting"
  | "connected"
  | "disconnecting"
  | "disconnected"
  | "error";

export interface RdpSessionProps {
  /** WebSocket URL for the Guacamole tunnel (includes token). */
  wsUrl: string;
  /** Fired when connection state changes. */
  onStateChange?: (state: RdpConnectionState) => void;
  /** Fired on errors. */
  onError?: (message: string) => void;
  /** Fired when session disconnects cleanly (e.g. user sign-out). */
  onDisconnect?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);
const MAX_RECONNECT = 5;

const RESOLUTIONS = [
  { label: "Auto", value: "auto" },
  { label: "1920 × 1080", value: "1920x1080" },
  { label: "1680 × 1050", value: "1680x1050" },
  { label: "1440 × 900", value: "1440x900" },
  { label: "1280 × 1024", value: "1280x1024" },
  { label: "1024 × 768", value: "1024x768" },
] as const;

// Guacamole keysyms
const KEY_CTRL_L = 0xffe3;
const KEY_ALT_L = 0xffe9;
const KEY_DELETE = 0xffff;
const KEY_META_L = 0xffe7;
const KEY_META_R = 0xffe8;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RdpSession({
  wsUrl,
  onStateChange,
  onError,
  onDisconnect,
  className,
}: RdpSessionProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<Guacamole.Client | null>(null);
  const tunnelRef = useRef<Guacamole.WebSocketTunnel | null>(null);
  const keyboardRef = useRef<Guacamole.Keyboard | null>(null);
  const keepaliveRef = useRef<Worker | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCount = useRef(0);
  const wasConnected = useRef(false);
  const cleanDisconnectRef = useRef(false);
  const activeRef = useRef(true);
  const remoteClip = useRef("");

  const [resolution, setResolution] = useState("auto");
  const [connState, setConnState] = useState<RdpConnectionState>("idle");

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const setAndNotifyState = useCallback(
    (s: RdpConnectionState) => {
      setConnState(s);
      onStateChange?.(s);
    },
    [onStateChange],
  );

  // ---------------------------------------------------------------------------
  // Display scaling
  // ---------------------------------------------------------------------------

  const updateDisplay = useCallback(() => {
    const client = clientRef.current;
    const vp = viewportRef.current;
    if (!client || !vp) return;
    const display = client.getDisplay();
    const dw = display.getWidth();
    const dh = display.getHeight();
    if (dw && dh) {
      const scale = Math.min(vp.clientWidth / dw, vp.clientHeight / dh);
      display.scale(scale);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Reconnect
  // ---------------------------------------------------------------------------

  const scheduleReconnect = useCallback(() => {
    if (reconnectCount.current >= MAX_RECONNECT) {
      setAndNotifyState("error");
      onError?.(`Unable to reconnect after ${MAX_RECONNECT} attempts.`);
      reconnectCount.current = 0;
      return;
    }
    reconnectCount.current++;
    const delay = Math.min(2000 * 1.5 ** (reconnectCount.current - 1), 10000);
    setAndNotifyState("connecting");

    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      connect();
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setAndNotifyState, onError]);

  // ---------------------------------------------------------------------------
  // Connect
  // ---------------------------------------------------------------------------

  const connect = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    // Tear down previous client
    cleanup();

    const tunnel = new Guacamole.WebSocketTunnel(wsUrl);
    tunnelRef.current = tunnel;

    const client = new Guacamole.Client(tunnel);
    clientRef.current = client;
    activeRef.current = true;

    // Attach display
    const displayEl = client.getDisplay().getElement();
    displayEl.style.position = "absolute";
    displayEl.style.left = "0";
    displayEl.style.top = "0";
    vp.innerHTML = "";
    vp.appendChild(displayEl);

    // --- Error handler ---
    client.onerror = (error) => {
      if (reconnectCount.current > 0 || reconnectTimer.current) return;
      setAndNotifyState("error");
      onError?.(error.message || "RDP session error");
    };

    // --- State changes ---
    client.onstatechange = (state: number) => {
      switch (state) {
        case 0:
          setAndNotifyState("idle");
          break;
        case 1:
          setAndNotifyState("connecting");
          break;
        case 2:
          setAndNotifyState("waiting");
          break;
        case 3:
          setAndNotifyState("connected");
          wasConnected.current = true;
          cleanDisconnectRef.current = false;
          reconnectCount.current = 0;
          updateDisplay();
          break;
        case 4:
          cleanDisconnectRef.current = true;
          setAndNotifyState("disconnecting");
          break;
        case 5:
          if (wasConnected.current && !cleanDisconnectRef.current) {
            wasConnected.current = false;
            scheduleReconnect();
          } else {
            wasConnected.current = false;
            setAndNotifyState("disconnected");
            onDisconnect?.();
          }
          break;
      }
    };

    // --- Clipboard sync ---
    client.onclipboard = (stream: Guacamole.InputStream, mimetype: string) => {
      if (mimetype !== "text/plain") return;
      readRemoteClipboard(stream, (text) => {
        remoteClip.current = text;
        writeLocalClipboard(text);
      });
    };

    // --- Mouse handling ---
    const mouseState = new Guacamole.Mouse.State(0, 0, false, false, false, false, false);

    function getMousePos(e: MouseEvent) {
      const display = client.getDisplay();
      const rect = displayEl.getBoundingClientRect();
      const scale = display.getScale();
      return {
        x: (e.clientX - rect.left) / scale,
        y: (e.clientY - rect.top) / scale,
      };
    }

    function sendMouse() {
      if (client && activeRef.current) client.sendMouseState(mouseState);
    }

    const onMouseMove = (e: MouseEvent) => {
      const p = getMousePos(e);
      mouseState.x = p.x;
      mouseState.y = p.y;
      sendMouse();
    };
    const onMouseDown = (e: MouseEvent) => {
      const p = getMousePos(e);
      mouseState.x = p.x;
      mouseState.y = p.y;
      if (e.button === 0) mouseState.left = true;
      if (e.button === 1) mouseState.middle = true;
      if (e.button === 2) mouseState.right = true;
      sendMouse();
      e.preventDefault();
    };
    const onMouseUp = (e: MouseEvent) => {
      const p = getMousePos(e);
      mouseState.x = p.x;
      mouseState.y = p.y;
      if (e.button === 0) mouseState.left = false;
      if (e.button === 1) mouseState.middle = false;
      if (e.button === 2) mouseState.right = false;
      sendMouse();
      e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      const p = getMousePos(e);
      mouseState.x = p.x;
      mouseState.y = p.y;
      if (e.deltaY < 0) {
        mouseState.scrollUp = true;
        sendMouse();
        mouseState.scrollUp = false;
      } else if (e.deltaY > 0) {
        mouseState.scrollDown = true;
        sendMouse();
        mouseState.scrollDown = false;
      }
      sendMouse();
      e.preventDefault();
    };
    const onCtxMenu = (e: Event) => e.preventDefault();

    vp.addEventListener("mousemove", onMouseMove);
    vp.addEventListener("mousedown", onMouseDown);
    vp.addEventListener("mouseup", onMouseUp);
    vp.addEventListener("wheel", onWheel, { passive: false });
    vp.addEventListener("contextmenu", onCtxMenu);

    // --- Keyboard (Mac Cmd→Ctrl remapping) ---
    vp.setAttribute("tabindex", "0");
    const kbd = new Guacamole.Keyboard(vp as unknown as HTMLElement);
    keyboardRef.current = kbd;
    let metaHeld = false;

    kbd.onkeydown = (keysym: number) => {
      if (!activeRef.current) return false;

      if (IS_MAC) {
        // Remap Cmd → Ctrl
        if (keysym === KEY_META_L || keysym === KEY_META_R) {
          metaHeld = true;
          client.sendKeyEvent(1, KEY_CTRL_L);
          return true;
        }
        if (metaHeld) {
          const kl = keysym | 0x20; // lowercase
          // Block Cmd+L / Cmd+D (browser shortcuts)
          if (kl === 0x6c || kl === 0x64) return true;
          // Cmd+V → sync clipboard first
          if (kl === 0x76) {
            readLocalClipboard().then((text) => {
              if (text) pushClipboardToRemote(client, text);
            });
            // Send key after a short delay for clipboard sync
            setTimeout(() => client.sendKeyEvent(1, keysym), 100);
            return true;
          }
          // Cmd+C → copy, then sync remote→local
          if (kl === 0x63) {
            client.sendKeyEvent(1, 0x63);
            setTimeout(() => client.sendKeyEvent(0, 0x63), 50);
            setTimeout(() => writeLocalClipboard(remoteClip.current), 500);
            return true;
          }
        }
      }

      client.sendKeyEvent(1, keysym);
      return true;
    };

    kbd.onkeyup = (keysym: number) => {
      if (!activeRef.current) return;
      if (IS_MAC && (keysym === KEY_META_L || keysym === KEY_META_R)) {
        metaHeld = false;
        client.sendKeyEvent(0, KEY_CTRL_L);
        return;
      }
      client.sendKeyEvent(0, keysym);
    };

    // Paste event → push to remote then send Ctrl+V
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text || !activeRef.current) return;
      pushClipboardToRemote(client, text);
      setTimeout(() => {
        client.sendKeyEvent(1, KEY_CTRL_L);
        client.sendKeyEvent(1, 0x76);
        setTimeout(() => {
          client.sendKeyEvent(0, 0x76);
          client.sendKeyEvent(0, KEY_CTRL_L);
        }, 50);
      }, 150);
    };
    vp.addEventListener("paste", onPaste as EventListener, true);

    // Focus → sync clipboard
    const onFocus = () => {
      setTimeout(() => {
        readLocalClipboard().then((text) => {
          if (text) pushClipboardToRemote(client, text);
        });
      }, 100);
    };
    vp.addEventListener("focus", onFocus);
    vp.addEventListener("click", () => vp.focus());

    // --- Display resize ---
    client.getDisplay().onresize = updateDisplay;
    const ro = new ResizeObserver(() => updateDisplay());
    ro.observe(vp);
    resizeObsRef.current = ro;

    // --- Keepalive via Web Worker ---
    try {
      const blob = new Blob(
        [
          'var iv=null;onmessage=function(e){if(e.data==="start"){clearInterval(iv);iv=setInterval(function(){postMessage("ping")},5000);}else if(e.data==="stop"){clearInterval(iv);}};',
        ],
        { type: "application/javascript" },
      );
      const worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = () => {
        if (tunnel && activeRef.current) {
          try {
            tunnel.sendMessage("nop");
          } catch {
            /* ignore */
          }
        }
      };
      worker.postMessage("start");
      keepaliveRef.current = worker;
    } catch {
      // Fallback: plain interval
      const _id = setInterval(() => {
        if (tunnel && activeRef.current) {
          try {
            tunnel.sendMessage("nop");
          } catch {
            /* ignore */
          }
        }
      }, 5000);
      // Store timer id in worker ref slot for cleanup
      keepaliveRef.current = { postMessage: () => {}, terminate: () => clearInterval(_id) } as unknown as Worker;
    }

    // --- Visibility changes ---
    const onVisChange = () => {
      if (document.visibilityState === "hidden") {
        kbd.reset();
        mouseState.left = false;
        mouseState.middle = false;
        mouseState.right = false;
        sendMouse();
      } else {
        kbd.reset();
        const display = client.getDisplay();
        display.flush(() => updateDisplay());
      }
    };
    document.addEventListener("visibilitychange", onVisChange);

    // Connect (short delay for tunnel stabilisation)
    setTimeout(
      () => client.connect(""),
      reconnectCount.current > 0 ? 500 : 1000,
    );

    // --- Cleanup closure ---
    const currentCleanups = {
      onMouseMove,
      onMouseDown,
      onMouseUp,
      onWheel,
      onCtxMenu,
      onPaste: onPaste as EventListener,
      onFocus,
      onVisChange,
    };
    cleanupFns.current = currentCleanups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl, updateDisplay, setAndNotifyState, onError, onDisconnect, scheduleReconnect]);

  // Store cleanup functions so we can detach listeners
  const cleanupFns = useRef<{
    onMouseMove: (e: MouseEvent) => void;
    onMouseDown: (e: MouseEvent) => void;
    onMouseUp: (e: MouseEvent) => void;
    onWheel: (e: WheelEvent) => void;
    onCtxMenu: (e: Event) => void;
    onPaste: EventListener;
    onFocus: () => void;
    onVisChange: () => void;
  } | null>(null);

  const cleanup = useCallback(() => {
    activeRef.current = false;
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    keepaliveRef.current?.postMessage("stop");
    keepaliveRef.current?.terminate();
    keepaliveRef.current = null;
    resizeObsRef.current?.disconnect();
    resizeObsRef.current = null;
    keyboardRef.current?.reset();
    keyboardRef.current = null;

    const vp = viewportRef.current;
    const fns = cleanupFns.current;
    if (vp && fns) {
      vp.removeEventListener("mousemove", fns.onMouseMove);
      vp.removeEventListener("mousedown", fns.onMouseDown);
      vp.removeEventListener("mouseup", fns.onMouseUp);
      vp.removeEventListener("wheel", fns.onWheel);
      vp.removeEventListener("contextmenu", fns.onCtxMenu);
      vp.removeEventListener("paste", fns.onPaste, true);
      vp.removeEventListener("focus", fns.onFocus);
      document.removeEventListener("visibilitychange", fns.onVisChange);
    }
    cleanupFns.current = null;

    try {
      clientRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    clientRef.current = null;
    tunnelRef.current = null;
  }, []);

  // ---------------------------------------------------------------------------
  // Lifecycle: connect on mount, cleanup on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  // ---------------------------------------------------------------------------
  // Public actions (exposed via toolbar buttons)
  // ---------------------------------------------------------------------------

  const sendCtrlAltDel = useCallback(() => {
    const c = clientRef.current;
    if (!c) return;
    c.sendKeyEvent(1, KEY_CTRL_L);
    c.sendKeyEvent(1, KEY_ALT_L);
    c.sendKeyEvent(1, KEY_DELETE);
    c.sendKeyEvent(0, KEY_DELETE);
    c.sendKeyEvent(0, KEY_ALT_L);
    c.sendKeyEvent(0, KEY_CTRL_L);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      viewportRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }, []);

  const handleResolution = useCallback(
    (val: string) => {
      setResolution(val);
      const c = clientRef.current;
      const vp = viewportRef.current;
      if (!c || !vp) return;
      if (val === "auto") {
        c.sendSize(vp.clientWidth, vp.clientHeight);
      } else {
        const [w, h] = val.split("x").map(Number);
        c.sendSize(w, h);
      }
    },
    [],
  );

  const handleDisconnect = useCallback(() => {
    wasConnected.current = false;
    cleanup();
    setAndNotifyState("disconnected");
    onDisconnect?.();
  }, [cleanup, setAndNotifyState, onDisconnect]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      {/* Toolbar */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-[var(--s1)] px-2 text-xs">
        <div className="flex items-center gap-2">
          {/* Connection state */}
          <span className="flex items-center gap-1.5">
            <span
              className={
                connState === "connected"
                  ? "size-1.5 rounded-full bg-emerald-500"
                  : connState === "connecting" || connState === "waiting"
                    ? "size-1.5 rounded-full bg-amber-400 animate-pulse"
                    : connState === "error"
                      ? "size-1.5 rounded-full bg-red-500"
                      : "size-1.5 rounded-full bg-zinc-500"
              }
            />
            <span className="text-muted-foreground capitalize">{connState}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Resolution selector */}
          <select
            value={resolution}
            onChange={(e) => handleResolution(e.target.value)}
            className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
            title="Resolution"
          >
            {RESOLUTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>

          {/* Ctrl+Alt+Del */}
          <button
            onClick={sendCtrlAltDel}
            className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            title="Send Ctrl+Alt+Del"
          >
            CtrlAltDel
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            title="Fullscreen"
          >
            ⛶
          </button>

          {/* Disconnect */}
          <button
            onClick={handleDisconnect}
            className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-300"
            title="Disconnect"
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* RDP viewport */}
      <div
        ref={viewportRef}
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          cursor: "none",
          background: "#000",
          outline: "none",
        }}
      />
    </div>
  );
}
