import {
  forwardRef,
  useEffect,
  useRef,
  useImperativeHandle,
  useCallback,
  useState,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SearchAddon } from '@xterm/addon-search';
import { SerializeAddon } from '@xterm/addon-serialize';
import '@xterm/xterm/css/xterm.css';
import { cloudtermThemeForXterm } from '@/lib/xterm-themes';
import { useThemeStore } from '@/stores/theme';
import { useSettingsStore } from '@/stores/settings';
import { useSessionsStore } from '@/stores/sessions';
import { getTerminalWS } from '@/lib/ws';
import type { IncomingWSMessage } from '@/lib/ws-messages';
import { nanoid } from 'nanoid';
import { useToastStore } from '@/stores/toast';
import { GhostText } from './GhostText';

export interface XtermRef {
  focus: () => void;
  write: (data: string) => void;
  fit: () => void;
  paste: (data: string) => void;
  copySelection: () => string;
  getSessionId: () => string;
  search: (query: string) => boolean;
  searchNext: () => boolean;
  searchPrevious: () => boolean;
  clearSearch: () => void;
  serialize: () => string;
  dispose: () => void;
}

export interface XtermProps {
  instanceId: string;
  instanceName: string;
  sessionId?: string;
  awsProfile?: string;
  awsRegion?: string;
  onReady?: () => void;
  className?: string;
}

type GhostData = {
  suggestion: string;
  cursorX: number;
  cursorY: number;
  cellW: number;
  cellH: number;
};

export const Xterm = forwardRef<XtermRef, XtermProps>(function Xterm(
  { instanceId, instanceName, sessionId: sessionIdProp, awsProfile, awsRegion, onReady, className = '' },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const serializeRef = useRef<SerializeAddon | null>(null);
  const sessionId = useRef(sessionIdProp ?? nanoid());
  const theme = useThemeStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const fontFamily = useSettingsStore((s) => s.fontFamily);

  // Line buffer tracking (what the user is currently typing on the prompt)
  const currentLineBuffer = useRef('');
  const sessionStartedRef = useRef(false);

  // Debounce timer for suggest requests
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ghost suggestion state — ref for stable closure access, state for renders
  const ghostRef = useRef<GhostData | null>(null);
  const [ghostState, setGhostState] = useState<GhostData | null>(null);

  const setGhost = useCallback((g: GhostData | null) => {
    ghostRef.current = g;
    setGhostState(g);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const containerEl = containerRef.current;
    const mySessionId = sessionId.current;

    const term = new Terminal({
      fontFamily: `"${fontFamily}", ui-monospace, monospace`,
      fontSize: useSettingsStore.getState().fontSize,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: 'block',
      theme: cloudtermThemeForXterm(),
      allowProposedApi: true,
      scrollback: 10000,
      tabStopWidth: 4,
      letterSpacing: 0,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    const uni = new Unicode11Addon();
    term.loadAddon(uni);
    term.unicode.activeVersion = '11';

    const search = new SearchAddon();
    term.loadAddon(search);
    searchRef.current = search;

    const serialize = new SerializeAddon();
    term.loadAddon(serialize);
    serializeRef.current = serialize;

    term.open(containerRef.current);

    termRef.current = term;
    fitRef.current = fit;

    const ws = getTerminalWS();
    const currentSessionId = sessionId.current;

    const unsub = ws.subscribe((msg: IncomingWSMessage) => {
      const payload = msg.payload as Record<string, unknown> | undefined;
      if (payload && typeof payload === 'object' && 'session_id' in payload && payload.session_id !== mySessionId) return;

      if (msg.type === 'terminal_output' && term) {
        term.write((payload as { output: string }).output);
        sessionStartedRef.current = true;
        onReady?.();
      }

      if (msg.type === 'suggest_response' && term) {
        const { suggestions } = msg.payload as { suggestions: Array<{ text: string; score: number; source: string }> };
        if (suggestions.length > 0) {
          const top = suggestions[0];
          const line = currentLineBuffer.current;
          const text = top.text;
          const suffix = text.startsWith(line) ? text.slice(line.length) : text;
          if (suffix.length > 0) {
            const cursorX = term.buffer.active.cursorX;
            const cursorY = term.buffer.active.cursorY;
            const screenEl = containerRef.current?.querySelector('.xterm-screen') as HTMLElement | null;
            const cellW = screenEl && term.cols > 0 ? screenEl.offsetWidth / term.cols : 8;
            const cellH = screenEl && term.rows > 0 ? screenEl.offsetHeight / term.rows : 16;
            setGhost({ suggestion: suffix, cursorX, cursorY, cellW, cellH });
          } else {
            setGhost(null);
          }
        } else {
          setGhost(null);
        }
      }

      if (msg.type === 'log_insight') {
        const p = msg.payload as { error_summary: string; suggested_fix: string };
        useToastStore.getState().push({
          variant: 'warn',
          title: p.error_summary,
          description: p.suggested_fix,
          duration: 6000,
        });
      }
    });

    fit.fit();
    ws.send({
      type: 'start_session',
      payload: {
        instance_id: instanceId,
        instance_name: instanceName,
        session_id: currentSessionId,
        aws_profile: awsProfile ?? '',
        aws_region: awsRegion ?? '',
        cols: term.cols,
        rows: term.rows,
      },
    });

    const sendInput = (input: string) => {
      if (!sessionStartedRef.current) return;
      if (syncRef.enabled) {
        const sessions = useSessionsStore.getState().sessions.filter((s) => s.type === 'ssh');
        for (const s of sessions) {
          ws.send({ type: 'terminal_input', payload: { session_id: s.id, input } });
        }
      } else {
        ws.send({ type: 'terminal_input', payload: { session_id: sessionId.current, input } });
      }
    };

    const sendPastedText = (text: string) => {
      if (!text) return;
      currentLineBuffer.current = '';
      setGhost(null);
      // Cancel any pending suggest request triggered by the keystroke before paste.
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      // Delegate to xterm's paste() so bracketed-paste markers (\x1b[200~...\x1b[201~)
      // are only added when the remote shell has actually enabled the mode via \x1b[?2004h.
      // Unconditionally wrapping corrupts readline's cursor state on shells that have
      // not enabled bracketed paste mode, causing the cursor to jump mid-line.
      term.paste(text);
    };

    const syncRef = { enabled: false };
    const syncHandler = (e: Event) => {
      syncRef.enabled = (e as CustomEvent<{ enabled: boolean }>).detail.enabled;
    };
    window.addEventListener('ct:sync-typing', syncHandler);

    // Keyboard interception: must be registered before onData
    term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      if (ev.type !== 'keydown') return true;

      const ghost = ghostRef.current;

      // Tab: accept full suggestion
      if (ev.key === 'Tab' && ghost) {
        ws.send({
          type: 'terminal_input',
          payload: { session_id: sessionId.current, input: ghost.suggestion },
        });
        currentLineBuffer.current += ghost.suggestion;
        setGhost(null);
        return false;
      }

      // Right Arrow at end of line: accept word-by-word
      if (ev.key === 'ArrowRight' && ghost) {
        const firstWordMatch = ghost.suggestion.match(/^(\S+\s*)/);
        if (firstWordMatch) {
          const word = firstWordMatch[1];
          ws.send({
            type: 'terminal_input',
            payload: { session_id: sessionId.current, input: word },
          });
          currentLineBuffer.current += word;
          const remaining = ghost.suggestion.slice(word.length);
          if (remaining.length > 0) {
            const t = termRef.current;
            if (t) {
              const screenEl = containerRef.current?.querySelector(
                '.xterm-screen',
              ) as HTMLElement | null;
              const cellW =
                screenEl && t.cols > 0 ? screenEl.offsetWidth / t.cols : 8;
              const cellH =
                screenEl && t.rows > 0 ? screenEl.offsetHeight / t.rows : 16;
              // Cursor position will advance after input lands; estimate new cursorX
              setGhost({
                suggestion: remaining,
                cursorX: t.buffer.active.cursorX + word.length,
                cursorY: t.buffer.active.cursorY,
                cellW,
                cellH,
              });
            }
          } else {
            setGhost(null);
          }
        } else {
          setGhost(null);
        }
        return false;
      }

      // Escape: dismiss suggestion
      if (ev.key === 'Escape' && ghost) {
        setGhost(null);
        return false;
      }

      return true;
    });

    const keyDisp = term.onData((d) => {
      // Update line buffer
      if (d === '\x7f') {
        // Backspace
        currentLineBuffer.current = currentLineBuffer.current.slice(0, -1);
      } else if (d === '\r' || d === '\n') {
        // Enter — clear buffer
        currentLineBuffer.current = '';
      } else if (d === '\x03' || d === '\x15') {
        // Ctrl+C or Ctrl+U — clear buffer
        currentLineBuffer.current = '';
      } else if (d.length === 1 && d.charCodeAt(0) >= 32) {
        // Printable character
        currentLineBuffer.current += d;
      }

      // Clear ghost on any keystroke (debounced request will refresh it)
      setGhost(null);

      // Debounced suggest request
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (currentLineBuffer.current.length >= 1) {
        debounceTimer.current = setTimeout(() => {
          ws.send({
            type: 'suggest_request',
            payload: {
              session_id: sessionId.current,
              line: currentLineBuffer.current,
              env: '',
            },
          });
        }, 50);
      }

      // Forward input to backend
      sendInput(d);
    });

    const resDisp = term.onResize(({ cols, rows }) => {
      if (cols < 1 || rows < 1) return;
      ws.send({
        type: 'terminal_resize',
        payload: { session_id: sessionId.current, cols, rows },
      });
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current && containerRef.current.offsetHeight > 0) {
        fit.fit();
      }
    });
    ro.observe(containerRef.current);

    const typeHandler = (e: Event) => {
      const { sessionId: sid, data } = (e as CustomEvent<{ sessionId: string; data: string }>).detail;
      if (sid === sessionId.current) term.paste(data);
    };
    window.addEventListener('ct:terminal-type', typeHandler);

    // Intercept clipboard paste to avoid chunked/garbled long pastes.
    // xterm uses a hidden textarea; paste events bubble from it.
    const pasteHandler = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text) return;
      e.preventDefault();
      e.stopPropagation();
      void sendPastedText(text);
    };
    containerEl.addEventListener('paste', pasteHandler, true);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      const wasStarted = sessionStartedRef.current;
      sessionStartedRef.current = false;
      try {
        if (wasStarted) {
          ws.send({ type: 'close_session', payload: { session_id: currentSessionId } });
        }
        unsub();
        keyDisp.dispose();
        resDisp.dispose();
        ro.disconnect();
        window.removeEventListener('ct:terminal-type', typeHandler);
        window.removeEventListener('ct:sync-typing', syncHandler);
        containerEl.removeEventListener('paste', pasteHandler, true);
        term.dispose();
      } catch {
        void 0;
      }
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      serializeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = cloudtermThemeForXterm();
    }
  }, [theme]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize;
      fitRef.current?.fit();
    }
  }, [fontSize]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => termRef.current?.focus(),
      write: (d) => termRef.current?.write(d),
      fit: () => fitRef.current?.fit(),
      paste: (d) => termRef.current?.paste(d),
      copySelection: () => termRef.current?.getSelection() ?? '',
      getSessionId: () => sessionId.current,
      search: (q: string) => searchRef.current?.findNext(q) ?? false,
      searchNext: () => searchRef.current?.findNext('') ?? false,
      searchPrevious: () => searchRef.current?.findPrevious('') ?? false,
      clearSearch: () => searchRef.current?.clearDecorations(),
      serialize: () => serializeRef.current?.serialize() ?? '',
      dispose: () => termRef.current?.dispose(),
    }),
    [],
  );

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      onKeyDown={(e) => {
        // Prevent Tab from moving browser focus out of the terminal
        if (e.key === 'Tab') {
          e.preventDefault();
          termRef.current?.focus();
        }
      }}
    >
      <div ref={containerRef} className="h-full w-full" style={{ paddingLeft: 6, paddingTop: 4 }} />
      <GhostText
        suggestion={ghostState?.suggestion ?? null}
        cursorX={ghostState?.cursorX ?? 0}
        cursorY={ghostState?.cursorY ?? 0}
        cellWidth={ghostState?.cellW ?? 8}
        cellHeight={ghostState?.cellH ?? 16}
        visible={ghostState !== null}
      />
    </div>
  );
});

Xterm.displayName = 'Xterm';
