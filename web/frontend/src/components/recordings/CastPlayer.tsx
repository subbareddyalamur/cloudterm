import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CastEvent {
  time: number;
  data: string;
}

interface CastPlayerProps {
  filename: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IDLE_CAP = 2.0;
const SPEEDS = ["0.5", "1", "2", "5", "10"];

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? "0" : ""}${sec}`;
}

function parseCast(text: string): { cols: number; rows: number; events: CastEvent[] } {
  const lines = text.trim().split("\n");
  const header = JSON.parse(lines[0]);
  const events: CastEvent[] = [];
  let adjustedTime = 0;
  let lastRawTime = 0;

  for (let i = 1; i < lines.length; i++) {
    try {
      const ev = JSON.parse(lines[i]);
      if (Array.isArray(ev) && ev[1] === "o") {
        const rawTime = ev[0] as number;
        const delta = rawTime - lastRawTime;
        adjustedTime += Math.min(delta, IDLE_CAP);
        lastRawTime = rawTime;
        events.push({ time: adjustedTime, data: ev[2] as string });
      }
    } catch {
      /* skip malformed */
    }
  }

  return { cols: header.width || 80, rows: header.height || 24, events };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CastPlayer({ filename, open, onOpenChange }: CastPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const eventsRef = useRef<CastEvent[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idxRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("1");
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -- Load recording ---------------------------------------------------------

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoaded(false);
    setError(null);
    setPlaying(false);
    setElapsed(0);
    idxRef.current = 0;

    (async () => {
      try {
        const resp = await fetch(
          `/recordings/${encodeURIComponent(filename)}`,
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        if (cancelled) return;

        const { cols, rows, events } = parseCast(text);
        eventsRef.current = events;
        const totalDuration =
          events.length > 0 ? events[events.length - 1].time : 0;
        setDuration(totalDuration);

        // Dynamic import for xterm
        const { Terminal } = await import("@xterm/xterm");
        const { FitAddon } = await import("@xterm/addon-fit");
        if (cancelled) return;

        const term = new Terminal({
          cols,
          rows,
          disableStdin: true,
          fontFamily: "'Fira Code', 'Cascadia Code', monospace",
          fontSize: 13,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);

        if (containerRef.current) {
          containerRef.current.innerHTML = "";
          term.open(containerRef.current);
          fit.fit();
        }

        termRef.current = term;
        setLoaded(true);

        // Auto-play
        setPlaying(true);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load recording");
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      termRef.current?.dispose();
      termRef.current = null;
    };
  }, [open, filename]);

  // -- Playback loop ----------------------------------------------------------

  const playNext = useCallback(() => {
    const events = eventsRef.current;
    const idx = idxRef.current;
    const term = termRef.current;
    if (!term || idx >= events.length) {
      setPlaying(false);
      return;
    }

    const ev = events[idx];
    term.write(ev.data);
    setElapsed(ev.time);
    idxRef.current = idx + 1;

    if (idx + 1 < events.length) {
      const delay =
        ((events[idx + 1].time - ev.time) * 1000) / parseFloat(speed);
      timerRef.current = setTimeout(playNext, Math.max(delay, 1));
    } else {
      setPlaying(false);
    }
  }, [speed]);

  useEffect(() => {
    if (playing && loaded) {
      if (timerRef.current) clearTimeout(timerRef.current);
      playNext();
    } else if (!playing) {
      if (timerRef.current) clearTimeout(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playing, loaded, playNext]);

  // -- Controls ---------------------------------------------------------------

  const togglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false);
    } else {
      if (idxRef.current >= eventsRef.current.length) {
        idxRef.current = 0;
        termRef.current?.reset();
      }
      setPlaying(true);
    }
  }, [playing]);

  const seekTo = useCallback(
    (targetTime: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const term = termRef.current;
      const events = eventsRef.current;
      if (!term) return;

      term.reset();
      let newIdx = 0;
      for (let i = 0; i < events.length; i++) {
        if (events[i].time <= targetTime) {
          term.write(events[i].data);
          newIdx = i + 1;
        } else break;
      }
      idxRef.current = newIdx;
      setElapsed(targetTime);
      if (playing) {
        timerRef.current = setTimeout(playNext, 0);
      }
    },
    [playing, playNext],
  );

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pct * duration);
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        seekTo(Math.min(elapsed + 5, duration));
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seekTo(Math.max(elapsed - 5, 0));
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, togglePlay, seekTo, elapsed, duration]);

  // -- Render -----------------------------------------------------------------

  const pct = duration > 0 ? (elapsed / duration) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-sm truncate">
            SSH Replay: {filename}
          </DialogTitle>
        </DialogHeader>

        {/* Terminal container */}
        <div className="bg-black px-2 min-h-[300px]">
          {error ? (
            <div className="flex items-center justify-center h-[300px] text-red-400 text-sm">
              {error}
            </div>
          ) : (
            <div ref={containerRef} className="w-full" />
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-[var(--surface)]">
          {/* Play/Pause */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={togglePlay}
            disabled={!loaded}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          {/* Seek back */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Back 5s"
            onClick={() => seekTo(Math.max(elapsed - 5, 0))}
            disabled={!loaded}
          >
            <SkipBack className="h-3.5 w-3.5" />
          </Button>

          {/* Scrubber */}
          <div
            className="relative flex-1 h-2 bg-muted rounded-full cursor-pointer group"
            onClick={handleScrub}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-100"
              style={{ width: `${pct}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-primary border-2 border-background shadow transition-[left] duration-100"
              style={{ left: `${pct}%` }}
            />
          </div>

          {/* Seek forward */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Forward 5s"
            onClick={() => seekTo(Math.min(elapsed + 5, duration))}
            disabled={!loaded}
          >
            <SkipForward className="h-3.5 w-3.5" />
          </Button>

          {/* Time display */}
          <span className="text-xs tabular-nums text-muted-foreground shrink-0 min-w-[80px] text-center">
            {fmtTime(elapsed)} / {fmtTime(duration)}
          </span>

          {/* Speed selector */}
          <Select value={speed} onValueChange={setSpeed}>
            <SelectTrigger className="h-7 w-[70px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPEEDS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}×
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DialogContent>
    </Dialog>
  );
}
