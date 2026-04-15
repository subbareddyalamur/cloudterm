import type {
  WSMessage,
  WSMessageType,
  StartSessionPayload,
  TerminalInputPayload,
  TerminalResizePayload,
  SuggestRequestPayload,
  SuggestTogglePayload,
} from "@/types";

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

export type ConnectionState = "connected" | "disconnected" | "reconnecting";

export type ConnectionStateListener = (state: ConnectionState) => void;

// ---------------------------------------------------------------------------
// Typed message map: message type → payload shape
// ---------------------------------------------------------------------------

/** Client → Server message payloads. */
export interface ClientMessages {
  start_session: StartSessionPayload;
  terminal_input: TerminalInputPayload;
  resize: TerminalResizePayload;
  suggest_request: SuggestRequestPayload;
  suggest_toggle: SuggestTogglePayload;
  keepalive: Record<string, never>;
}

/** Wildcard handler signature for server messages. */
export type MessageHandler<T = unknown> = (payload: T) => void;

// ---------------------------------------------------------------------------
// WebSocket manager
// ---------------------------------------------------------------------------

/**
 * Typed WebSocket manager with auto-reconnect and keepalive.
 *
 * Mirrors the vanilla WSManager from app.js with exponential backoff,
 * Web Worker–based keepalive, and typed send/on/off helpers.
 */
export class WSManager {
  private url: string;
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private stateListeners = new Set<ConnectionStateListener>();
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private keepaliveWorker: Worker | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private _state: ConnectionState = "disconnected";

  constructor(url: string) {
    this.url = url;
  }

  /** Current connection state. */
  get state(): ConnectionState {
    return this._state;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Open the WebSocket and begin auto-reconnect loop. */
  connect(): void {
    this.intentionalClose = false;
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.setState("connected");
      this.dispatch("_ws_open", {});
      this.startKeepalive();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      // Binary frames are dispatched as-is under a special type.
      if (event.data instanceof ArrayBuffer) {
        this.dispatch("_binary", event.data);
        return;
      }
      try {
        const msg: WSMessage = JSON.parse(event.data as string);
        if (msg.type && msg.payload !== undefined) {
          this.dispatch(msg.type, msg.payload);
        }
      } catch {
        // Skip malformed JSON.
      }
    };

    this.ws.onclose = () => {
      this.stopKeepalive();
      this.dispatch("_ws_close", {});
      if (!this.intentionalClose) {
        this.setState("reconnecting");
        this.scheduleReconnect();
      } else {
        this.setState("disconnected");
      }
    };

    this.ws.onerror = () => {
      // Error details are not exposed by the spec. onclose fires next.
    };
  }

  /** Send a typed message to the server. */
  send<T extends keyof ClientMessages>(
    type: T,
    payload: ClientMessages[T],
  ): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  /** Send raw binary data (e.g. terminal I/O). */
  sendBinary(data: ArrayBuffer | Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  /** Register a handler for a server message type. */
  on<T = unknown>(type: WSMessageType | string, handler: MessageHandler<T>): void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as MessageHandler);
  }

  /** Remove a previously registered handler. */
  off<T = unknown>(type: WSMessageType | string, handler: MessageHandler<T>): void {
    this.handlers.get(type)?.delete(handler as MessageHandler);
  }

  /** Subscribe to connection state changes. Returns an unsubscribe function. */
  onStateChange(listener: ConnectionStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Cleanly close the connection and stop reconnection. */
  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopKeepalive();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState("disconnected");
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private setState(s: ConnectionState): void {
    if (this._state === s) return;
    this._state = s;
    for (const fn of this.stateListeners) {
      try {
        fn(s);
      } catch {
        // Swallow listener errors.
      }
    }
  }

  private dispatch(type: string, payload: unknown): void {
    const fns = this.handlers.get(type);
    if (!fns) return;
    for (const fn of fns) {
      try {
        fn(payload);
      } catch {
        // Swallow handler errors.
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  /**
   * Start a keepalive ping every 25 s.
   * Uses a Web Worker so pings survive browser tab throttling (browsers
   * throttle setInterval to ≥1 min in background tabs which would trip
   * the server's 90 s read-deadline).
   */
  private startKeepalive(): void {
    this.stopKeepalive();
    try {
      const blob = new Blob(
        [
          "var iv;",
          'onmessage=function(e){',
          '  if(e.data==="start"){clearInterval(iv);iv=setInterval(function(){postMessage("ping")},25000);}',
          '  if(e.data==="stop"){clearInterval(iv);}',
          "};",
        ],
        { type: "application/javascript" },
      );
      this.keepaliveWorker = new Worker(URL.createObjectURL(blob));
      this.keepaliveWorker.onmessage = () => {
        this.send("keepalive", {} as Record<string, never>);
      };
      this.keepaliveWorker.postMessage("start");
    } catch {
      // Fallback for environments without Worker support.
      this.keepaliveTimer = setInterval(() => {
        this.send("keepalive", {} as Record<string, never>);
      }, 25_000);
    }
  }

  private stopKeepalive(): void {
    if (this.keepaliveWorker) {
      this.keepaliveWorker.postMessage("stop");
      this.keepaliveWorker.terminate();
      this.keepaliveWorker = null;
    }
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: WSManager | null = null;

/**
 * Get or create the global WSManager instance.
 * URL defaults to `ws://<host>/ws`.
 */
export function getWSManager(url?: string): WSManager {
  if (!_instance) {
    const wsUrl =
      url ?? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;
    _instance = new WSManager(wsUrl);
  }
  return _instance;
}
