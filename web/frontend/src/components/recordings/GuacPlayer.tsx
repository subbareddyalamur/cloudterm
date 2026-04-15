import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Guacamole global types (loaded via <script> in index.html)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
interface GuacamoleGlobal {
  SessionRecording: new (blob: Blob) => GuacSessionRecording;
}

interface GuacDisplay {
  getElement(): HTMLElement;
  getWidth(): number;
  getHeight(): number;
  scale(s: number): void;
  onresize: (() => void) | null;
}

interface GuacSessionRecording {
  getDisplay(): GuacDisplay;
  getDuration(): number;
  getPosition(): number;
  isPlaying(): boolean;
  play(): void;
  pause(): void;
  seek(pos: number, cb?: () => void): void;
  onerror: ((msg: string) => void) | null;
  onload: (() => void) | null;
  onprogress: ((duration: number) => void) | null;
  onplay: (() => void) | null;
  onpause: (() => void) | null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

declare const Guacamole: GuacamoleGlobal | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GuacPlayerProps {
  filename: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GuacPlayer({ filename, open, onOpenChange }: GuacPlayerProps) {
  const displayRef = useRef<HTMLDivElement>(null);
  const recordingRef = useRef<GuacSessionRecording | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);

  // -- Load recording ---------------------------------------------------------

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoaded(false);
    setError(null);
    setPlaying(false);
    setPosition(0);
    setDuration(0);

    // .guac file — use Guacamole.SessionRecording
    if (filename.endsWith(".guac") && typeof Guacamole !== "undefined") {
      (async () => {
        try {
          const resp = await fetch(
            `/recordings/${encodeURIComponent(filename)}`,
          );
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const blob = await resp.blob();
          if (cancelled || !blob.size) {
            if (!cancelled) setError("Recording file is empty");
            return;
          }

          const recording = new Guacamole.SessionRecording(blob);
          recordingRef.current = recording;

          recording.onerror = (msg) => {
            if (!cancelled)
              setError(`Playback error: ${msg}`);
          };

          const display = recording.getDisplay();
          const canvas = display.getElement();
          canvas.style.margin = "0 auto";
          canvas.style.transformOrigin = "top left";

          if (displayRef.current) {
            displayRef.current.innerHTML = "";
            displayRef.current.appendChild(canvas);
          }

          // Auto-scale
          const fitDisplay = () => {
            const dw = display.getWidth();
            const dh = display.getHeight();
            if (!dw || !dh || !displayRef.current) return;
            const cw = displayRef.current.clientWidth;
            const ch = displayRef.current.clientHeight || 400;
            const scale = Math.min(cw / dw, ch / dh, 1);
            display.scale(scale);
          };
          display.onresize = fitDisplay;
          setTimeout(fitDisplay, 200);

          recording.onload = () => {
            if (cancelled) return;
            setLoaded(true);
          };

          recording.onprogress = (dur) => {
            if (!cancelled) setDuration(dur);
          };

          recording.onplay = () => {
            if (!cancelled) {
              setPlaying(true);
              pollRef.current = setInterval(() => {
                setPosition(recording.getPosition());
                setDuration(recording.getDuration());
              }, 250);
            }
          };

          recording.onpause = () => {
            if (!cancelled) {
              setPlaying(false);
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
            }
          };
        } catch (e) {
          if (!cancelled)
            setError(
              e instanceof Error ? e.message : "Failed to load recording",
            );
        }
      })();
    } else if (
      filename.endsWith(".mp4") ||
      filename.endsWith(".m4v") ||
      filename.endsWith(".webm")
    ) {
      // Video fallback
      if (displayRef.current) {
        displayRef.current.innerHTML = "";
        const video = document.createElement("video");
        video.controls = true;
        video.style.width = "100%";
        video.style.maxHeight = "60vh";
        video.src = `/recordings/${encodeURIComponent(filename)}`;
        displayRef.current.appendChild(video);
      }
      setLoaded(true);
    } else {
      setError(
        "Unsupported recording format. Guacamole player requires .guac files.",
      );
    }

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
      try {
        recordingRef.current?.pause();
      } catch {
        /* ignore */
      }
      recordingRef.current = null;
      if (displayRef.current) displayRef.current.innerHTML = "";
    };
  }, [open, filename]);

  // -- Controls ---------------------------------------------------------------

  const togglePlay = useCallback(() => {
    const rec = recordingRef.current;
    if (!rec || !loaded) return;
    if (rec.isPlaying()) rec.pause();
    else rec.play();
  }, [loaded]);

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rec = recordingRef.current;
    if (!rec || !loaded || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = pct * duration;
    setSeeking(true);
    rec.seek(target, () => setSeeking(false));
  };

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const rec = recordingRef.current;
      if (!rec || !loaded) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        const target = Math.min(rec.getPosition() + 5000, rec.getDuration());
        setSeeking(true);
        rec.seek(target, () => setSeeking(false));
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        const target = Math.max(rec.getPosition() - 5000, 0);
        setSeeking(true);
        rec.seek(target, () => setSeeking(false));
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, loaded, togglePlay]);

  // -- Render -----------------------------------------------------------------

  const pct = duration > 0 ? (position / duration) * 100 : 0;
  const isGuac = filename.endsWith(".guac");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-sm truncate">
            RDP Replay: {filename}
          </DialogTitle>
        </DialogHeader>

        {/* Display area */}
        <div className="bg-black min-h-[300px] flex items-center justify-center">
          {error ? (
            <div className="text-red-400 text-sm px-4">{error}</div>
          ) : (
            <div ref={displayRef} className="w-full h-[400px]" />
          )}
        </div>

        {/* Controls — only for .guac files (video has native controls) */}
        {isGuac && (
          <div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-[var(--surface)]">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={togglePlay}
              disabled={!loaded || seeking}
            >
              {playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>

            {/* Scrubber */}
            <div
              className="relative flex-1 h-2 bg-muted rounded-full cursor-pointer"
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

            {/* Time */}
            <span className="text-xs tabular-nums text-muted-foreground shrink-0 min-w-[100px] text-center">
              {fmtTime(position)} / {fmtTime(duration)}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
