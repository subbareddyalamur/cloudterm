import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, SkipBack } from 'lucide-react';

interface GuacPlayerProps {
  filename: string;
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function GuacPlayer({ filename }: GuacPlayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<Guacamole.SessionRecording | null>(null);
  const guacDisplayRef = useRef<Guacamole.Display | null>(null);

  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);

  // Scale the Guac display to fit the wrapper (keeps aspect ratio)
  const fitDisplay = useCallback(() => {
    const display = guacDisplayRef.current;
    const wrap = wrapRef.current;
    if (!display || !wrap) return;
    const dw = display.getWidth();
    const dh = display.getHeight();
    if (!dw || !dh) return;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    if (!cw || !ch) return;
    const scale = Math.min(cw / dw, ch / dh);
    display.scale(scale);
  }, []);

  useEffect(() => {
    if (!displayRef.current) return;
    const G = window.Guacamole;
    if (!G?.SessionRecording) {
      setError('Guacamole player not available');
      return;
    }

    let cancelled = false;
    const container = displayRef.current;

    void fetch(`/recordings/${encodeURIComponent(filename)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        if (cancelled || !container) return;
        if (!blob.size) { setError('Recording file is empty'); return; }

        while (container.firstChild) container.removeChild(container.firstChild);

        const rec = new G.SessionRecording(blob);
        recRef.current = rec;

        const display = rec.getDisplay();
        guacDisplayRef.current = display;

        const displayEl = display.getElement();
        displayEl.style.margin = '0 auto';
        displayEl.style.transformOrigin = 'top left';
        container.appendChild(displayEl);

        display.onresize = () => fitDisplay();

        rec.onload = () => {
          if (cancelled) return;
          setLoaded(true);
          // Fit once resources finish loading
          setTimeout(fitDisplay, 50);
          setTimeout(fitDisplay, 250);
        };
        rec.onerror = (msg) => { if (!cancelled) setError(msg); };
        rec.onplay = () => {
          if (!cancelled) {
            setPlaying(true);
            // Redraw may change dimensions; refit
            setTimeout(fitDisplay, 0);
          }
        };
        rec.onpause = () => { if (!cancelled) setPlaying(false); };
        rec.onprogress = (dur) => {
          if (cancelled) return;
          setDuration(dur);
          if (!seeking) setPosition(rec.getPosition());
        };
        rec.onseek = () => {
          if (!cancelled) setPosition(rec.getPosition());
        };
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load recording');
      });

    return () => {
      cancelled = true;
      recRef.current = null;
      guacDisplayRef.current = null;
      while (container.firstChild) container.removeChild(container.firstChild);
    };
  }, [filename, fitDisplay]);  // seeking intentionally omitted — stale ref is fine here

  // Refit on wrapper resize (maximize/restore of parent modal)
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const obs = new ResizeObserver(() => fitDisplay());
    obs.observe(wrap);
    return () => obs.disconnect();
  }, [fitDisplay]);

  const togglePlay = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    if (playing) { rec.pause(); } else { rec.play(); }
  }, [playing]);

  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSeeking(true);
    setPosition(Number(e.target.value));
  }, []);

  const handleSeekCommit = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const target = Number(e.target.value);
    setSeeking(false);
    recRef.current?.seek(target);
  }, []);

  const handleRestart = useCallback(() => {
    recRef.current?.seek(0);
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-40 text-[12px] text-danger">{error}</div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full bg-black">
      <div
        ref={wrapRef}
        className="flex-1 min-h-0 w-full bg-black overflow-hidden flex items-center justify-center"
      >
        <div ref={displayRef} className="relative" />
      </div>
      <div className="flex items-center gap-3 px-4 py-3 bg-[#111] border-t border-white/10 shrink-0">
        <button
          type="button"
          onClick={handleRestart}
          disabled={!loaded}
          className="text-white/60 hover:text-white transition-colors disabled:opacity-30"
          aria-label="Restart"
        >
          <SkipBack size={14} />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          disabled={!loaded}
          className="text-white hover:text-white/80 transition-colors disabled:opacity-30"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className="text-[11px] text-white/50 font-mono shrink-0 w-20">
          {fmtTime(position)} / {fmtTime(duration)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          value={position}
          onChange={handleSeekChange}
          onMouseUp={handleSeekCommit as unknown as React.MouseEventHandler}
          onTouchEnd={handleSeekCommit as unknown as React.TouchEventHandler}
          disabled={!loaded}
          className="flex-1 h-1 accent-accent cursor-pointer disabled:opacity-30"
          aria-label="Seek"
        />
        {!loaded && !error && (
          <span className="text-[11px] text-white/40 animate-pulse">Loading…</span>
        )}
      </div>
    </div>
  );
}
