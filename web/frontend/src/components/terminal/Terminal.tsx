import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import { UnicodeGraphemesAddon } from "@xterm/addon-unicode-graphemes";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { ImageAddon } from "@xterm/addon-image";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebFontsAddon } from "@xterm/addon-web-fonts";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { ProgressAddon } from "@xterm/addon-progress";
import "@xterm/xterm/css/xterm.css";

import { useSettingsStore } from "@/stores/useSettingsStore";
import { TERMINAL_THEMES } from "./themes";
import { useGhostText } from "./GhostText";

export interface TerminalProps {
  sessionId: string;
  /** WebSocket instance for terminal I/O. */
  ws: WebSocket | null;
  /** Whether AI ghost text suggestions are enabled. */
  suggestEnabled?: boolean;
  className?: string;
}

/**
 * Core terminal component wrapping xterm.js with WebGL renderer and all
 * 11 addons. Connects to the backend WebSocket for terminal I/O.
 */
export function Terminal({ sessionId, ws, suggestEnabled = true, className }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [termReady, setTermReady] = useState<XTerm | null>(null);

  const termTheme = useSettingsStore((s) => s.termTheme);

  // --- Send WS helper -------------------------------------------------------
  const wsSend = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, payload }));
      }
    },
    [ws],
  );

  // --- Lifecycle: create → open → addons → WS → cleanup --------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const currentTheme = useSettingsStore.getState().termTheme;
    const themeObj =
      TERMINAL_THEMES[currentTheme] ?? TERMINAL_THEMES["github-dark"];

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12.5,
      theme: themeObj,
      cursorBlink: true,
      cursorStyle: "block",
      allowProposedApi: true,
      scrollback: 10000,
      convertEol: true,
    });
    termRef.current = term;

    // 1. FitAddon
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    // 2. WebLinksAddon
    term.loadAddon(new WebLinksAddon());

    // 3. SearchAddon
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;

    // Open terminal into DOM before loading GPU-dependent addons
    term.open(el);

    // 4. WebglAddon (with canvas fallback)
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // WebGL unavailable — falls back to canvas renderer automatically
      console.warn("WebGL addon failed to load, using canvas renderer");
    }

    // 5. UnicodeGraphemesAddon
    const unicodeAddon = new UnicodeGraphemesAddon();
    term.loadAddon(unicodeAddon);
    term.unicode.activeVersion = "15.1.0";

    // 6. ClipboardAddon
    term.loadAddon(new ClipboardAddon());

    // 7. ImageAddon
    term.loadAddon(new ImageAddon());

    // 8. SerializeAddon
    term.loadAddon(new SerializeAddon());

    // 9. WebFontsAddon
    term.loadAddon(new WebFontsAddon());

    // 10. LigaturesAddon
    term.loadAddon(new LigaturesAddon());

    // 11. ProgressAddon
    term.loadAddon(new ProgressAddon());

    // --- Resize handling ---
    term.onResize(({ cols, rows }) => {
      wsSend("terminal_resize", {
        session_id: sessionId,
        rows,
        cols,
      });
    });

    // --- Terminal input → WS --------------------------------------------------
    term.onData((data) => {
      wsSend("terminal_input", {
        session_id: sessionId,
        input: data,
      });
    });

    // --- Ctrl+F passthrough handled by ghost text key handler ---

    // Initial fit after one frame
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        /* container not yet visible */
      }
    });

    // Signal that the terminal is ready for ghost text
    setTermReady(term);

    // --- WS messages → terminal output ----------------------------------------
    function onWsMessage(event: MessageEvent) {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          payload: { session_id?: string; output?: string };
        };
        if (
          msg.type === "terminal_output" &&
          msg.payload.session_id === sessionId &&
          msg.payload.output
        ) {
          term.write(msg.payload.output);
        }
      } catch {
        // ignore non-JSON or malformed messages
      }
    }

    ws?.addEventListener("message", onWsMessage);

    // --- ResizeObserver for container size changes ---
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        /* ignore */
      }
    });
    resizeObserver.observe(el);

    // --- Cleanup --------------------------------------------------------------
    return () => {
      resizeObserver.disconnect();
      ws?.removeEventListener("message", onWsMessage);
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      setTermReady(null);
    };
  }, [sessionId, ws, wsSend]);

  // --- Ghost text suggestions -----------------------------------------------
  useGhostText({
    term: termReady,
    containerEl: containerRef.current,
    ws,
    sessionId,
    enabled: suggestEnabled,
  });

  // --- Theme changes (without full re-mount) ---------------------------------
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const themeObj =
      TERMINAL_THEMES[termTheme] ?? TERMINAL_THEMES["github-dark"];
    term.options.theme = themeObj;
  }, [termTheme]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
