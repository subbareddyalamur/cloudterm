import { useEffect, useRef, useCallback } from "react";
import type { Terminal } from "@xterm/xterm";
import type { SuggestResponsePayload } from "@/types/suggest";

export interface GhostTextHandle {
  /** Show suggestion text, trimming the matching prefix from currentLine. */
  show(fullSuggestion: string, currentLine: string): void;
  /** Hide the overlay and clear state. */
  hide(): void;
  /** Whether the overlay is currently visible. */
  isVisible(): boolean;
  /** Accept the full remaining suggestion. Returns the accepted text. */
  acceptFull(): string;
  /** Accept the next word of the suggestion. Returns the accepted text. */
  acceptWord(): string;
}

/**
 * Creates a GhostText overlay on the terminal's `.xterm-screen` element.
 * Returns a handle for imperative show/hide/accept operations.
 *
 * Mirrors the vanilla GhostText class from app.js but uses
 * requestAnimationFrame for DOM updates.
 */
export function createGhostText(
  term: Terminal,
  containerEl: HTMLElement,
): GhostTextHandle {
  const el = document.createElement("span");
  el.className = "ghost-text-overlay";
  el.style.cssText = [
    "display:none",
    "position:absolute",
    "pointer-events:none",
    "white-space:pre",
    "opacity:0.4",
    "color:currentColor",
    "z-index:1",
  ].join(";");

  const screen = containerEl.querySelector<HTMLElement>(".xterm-screen");
  if (screen) {
    screen.style.position = "relative";
    screen.appendChild(el);
  }

  let suggestion = "";
  let visible = false;
  let rafId = 0;

  function getCellDims() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const core = (term as any)._core;
      return core._renderService.dimensions.css.cell as {
        width: number;
        height: number;
      };
    } catch {
      return { width: 8, height: 17 };
    }
  }

  function reposition() {
    if (!visible) return;
    const dims = getCellDims();
    const buf = term.buffer.active;
    el.style.left = `${buf.cursorX * dims.width}px`;
    el.style.top = `${buf.cursorY * dims.height}px`;
    el.style.lineHeight = `${dims.height}px`;
    el.style.fontSize = `${term.options.fontSize ?? 14}px`;
    el.style.fontFamily =
      term.options.fontFamily ?? "'JetBrains Mono', monospace";
  }

  // Reposition on cursor move
  term.onCursorMove(() => {
    if (visible) {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(reposition);
    }
  });

  const handle: GhostTextHandle = {
    show(fullSuggestion: string, currentLine: string) {
      if (!fullSuggestion || !currentLine) {
        handle.hide();
        return;
      }
      const lower = fullSuggestion.toLowerCase();
      const lowerLine = currentLine.toLowerCase();
      if (!lower.startsWith(lowerLine)) {
        handle.hide();
        return;
      }
      suggestion = fullSuggestion.substring(currentLine.length);
      if (!suggestion) {
        handle.hide();
        return;
      }
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        el.textContent = suggestion;
        el.style.display = "";
        visible = true;
        reposition();
      });
    },

    hide() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        el.textContent = "";
        el.style.display = "none";
      });
      suggestion = "";
      visible = false;
    },

    isVisible() {
      return visible;
    },

    acceptFull() {
      const text = suggestion;
      handle.hide();
      return text;
    },

    acceptWord() {
      if (!suggestion) return "";
      const parts = suggestion.match(/^\S+\s?/);
      if (!parts) return handle.acceptFull();
      const word = parts[0];
      suggestion = suggestion.substring(word.length);
      if (!suggestion) {
        handle.hide();
      } else {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          el.textContent = suggestion;
        });
      }
      return word;
    },
  };

  return handle;
}

// ---------------------------------------------------------------------------
// React hook — wires ghost text + suggest WS into Terminal
// ---------------------------------------------------------------------------

export interface UseGhostTextOptions {
  term: Terminal | null;
  containerEl: HTMLElement | null;
  ws: WebSocket | null;
  sessionId: string;
  enabled: boolean;
}

/**
 * Hook that manages the ghost text lifecycle: debounced suggest requests,
 * WS response handling, and keyboard accept/dismiss.
 *
 * Returns a ref to the GhostTextHandle (for external toggle control)
 * and a `wsSend` helper the parent can share.
 */
export function useGhostText({
  term,
  containerEl,
  ws,
  sessionId,
  enabled,
}: UseGhostTextOptions) {
  const handleRef = useRef<GhostTextHandle | null>(null);
  const lineBufferRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);

  // Keep enabled in sync without re-running the main effect
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) handleRef.current?.hide();
  }, [enabled]);

  const wsSend = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, payload }));
      }
    },
    [ws],
  );

  useEffect(() => {
    if (!term || !containerEl) return;

    const ghost = createGhostText(term, containerEl);
    handleRef.current = ghost;

    // --- Line buffer tracking + suggest debounce ----------------------------
    const dataDisposable = term.onData((data: string) => {
      if (data === "\r" || data === "\n") {
        lineBufferRef.current = "";
        ghost.hide();
      } else if (data === "\x7f" || data === "\x08") {
        lineBufferRef.current = lineBufferRef.current.slice(0, -1);
      } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
        lineBufferRef.current += data;
      } else if (data.length > 200) {
        // Paste — reset
        lineBufferRef.current = "";
        ghost.hide();
      }

      ghost.hide();

      if (
        enabledRef.current &&
        lineBufferRef.current.length >= 2 &&
        data.length <= 200
      ) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          wsSend("suggest_request", {
            session_id: sessionId,
            line: lineBufferRef.current,
            env: "",
          });
        }, 50); // 50ms debounce (reduced from 150ms in legacy)
      }
    });

    // --- Key handler: Tab / Right Arrow / Escape ----------------------------
    term.attachCustomKeyEventHandler((e) => {
      // Pass through Ctrl+F / Cmd+F for search
      if ((e.ctrlKey || e.metaKey) && e.key === "f") return false;
      if (e.type !== "keydown") return true;

      if (e.key === "Tab" && ghost.isVisible()) {
        e.preventDefault();
        const accepted = ghost.acceptFull();
        if (accepted) {
          lineBufferRef.current += accepted;
          wsSend("terminal_input", {
            session_id: sessionId,
            input: accepted,
          });
        }
        return false;
      }

      if (e.key === "ArrowRight" && ghost.isVisible()) {
        const buf = term.buffer.active;
        const line = buf.getLine(buf.cursorY);
        const atEnd =
          !line ||
          !line.getCell(buf.cursorX) ||
          line.getCell(buf.cursorX)!.getChars() === "";
        if (atEnd) {
          e.preventDefault();
          const word = ghost.acceptWord();
          if (word) {
            lineBufferRef.current += word;
            wsSend("terminal_input", {
              session_id: sessionId,
              input: word,
            });
          }
          return false;
        }
      }

      if (e.key === "Escape" && ghost.isVisible()) {
        ghost.hide();
        return true;
      }

      return true;
    });

    // --- WS suggest_response handler ----------------------------------------
    function onWsMessage(event: MessageEvent) {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          payload: SuggestResponsePayload;
        };
        if (
          msg.type === "suggest_response" &&
          msg.payload.session_id === sessionId &&
          msg.payload.suggestions?.length > 0 &&
          enabledRef.current
        ) {
          ghost.show(msg.payload.suggestions[0].text, lineBufferRef.current);
        }
      } catch {
        // ignore non-JSON
      }
    }
    ws?.addEventListener("message", onWsMessage);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      dataDisposable.dispose();
      // Key handler is cleaned up when terminal is disposed (no dispose method)
      ws?.removeEventListener("message", onWsMessage);
      ghost.hide();
      handleRef.current = null;
    };
  }, [term, containerEl, ws, sessionId, wsSend]);

  return { ghostRef: handleRef, lineBufferRef };
}
