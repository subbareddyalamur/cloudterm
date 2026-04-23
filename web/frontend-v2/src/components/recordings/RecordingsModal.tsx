import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Maximize2, Minus } from 'lucide-react';
import { Dialog } from '@/components/primitives';
import { RecordingsList } from './RecordingsList';
import { GuacPlayer } from './GuacPlayer';
import type { Recording } from './RecordingRow';
import * as AsciinemaPlayer from 'asciinema-player';
import 'asciinema-player/dist/bundle/asciinema-player.css';

type PlayerSize = 'normal' | 'max';

interface RecordingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecordingsModal({ open, onOpenChange }: RecordingsModalProps) {
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [playerSize, setPlayerSize] = useState<PlayerSize>('normal');
  const playerRef = useRef<HTMLDivElement>(null);
  const playerInstance = useRef<{ dispose: () => void } | null>(null);

  // SSH asciinema player init
  useEffect(() => {
    if (!playing || !playerRef.current) return;
    if (playing.type !== 'ssh' || playing.has_mp4) return;

    while (playerRef.current.firstChild) playerRef.current.removeChild(playerRef.current.firstChild);
    try {
      const instance = AsciinemaPlayer.create(
        `/recordings/${encodeURIComponent(playing.name)}`,
        playerRef.current,
        {
          speed: 1,
          autoPlay: true,
          idleTimeLimit: 2,
          fit: 'both',
          terminalFontSize: 'small',
        },
      );
      playerInstance.current = { dispose: () => instance.dispose() };
    } catch {
      void 0;
    }
    return () => {
      try { playerInstance.current?.dispose(); } catch { void 0; }
      playerInstance.current = null;
    };
  }, [playing]);

  const closePlayer = () => {
    try { playerInstance.current?.dispose(); } catch { void 0; }
    playerInstance.current = null;
    setPlaying(null);
    setPlayerSize('normal');
  };

  const toggleMaximize = () => {
    setPlayerSize((s) => (s === 'max' ? 'normal' : 'max'));
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) closePlayer();
    onOpenChange(o);
  };

  // Derive player content type
  const isGuac = playing?.type === 'rdp' && !playing?.has_mp4 && playing?.name.endsWith('.guac');
  const isMp4  = playing?.has_mp4;
  const isAsc  = playing?.type === 'ssh' && !playing?.has_mp4;

  const playerTitle = playing
    ? playing.name.length > 60
      ? '…' + playing.name.slice(-57)
      : playing.name
    : '';

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange} title="Session Recordings" size="xl">
        <RecordingsList onPlay={(r) => setPlaying(r)} />
      </Dialog>

      {/* Portal the player to document.body so it escapes Dialog stacking context */}
      {playing && createPortal(
        <div
          className={`fixed inset-0 z-[9500] flex items-center justify-center bg-black/60 backdrop-blur-sm ${
            playerSize === 'max' ? 'p-0' : 'p-4'
          }`}
          onClick={(e) => { if (e.target === e.currentTarget) closePlayer(); }}
          role="dialog"
          aria-modal="true"
          aria-label="Recording Player"
        >
          <div
            className={`bg-surface border border-border shadow-2xl flex flex-col overflow-hidden ${
              playerSize === 'max'
                ? 'w-screen h-screen max-w-none rounded-none'
                : 'rounded-xl'
            }`}
            style={
              playerSize === 'max'
                ? undefined
                : { width: '80vw', height: '80vh', maxWidth: 'none' }
            }
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-elev shrink-0">
              <span className="text-[12px] font-mono text-text-pri truncate flex-1 mr-4">{playerTitle}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={toggleMaximize}
                  className="text-text-dim hover:text-text-pri transition-colors"
                  aria-label={playerSize === 'max' ? 'Restore player' : 'Maximize player'}
                  title={playerSize === 'max' ? 'Restore' : 'Maximize'}
                >
                  {playerSize === 'max' ? <Minus size={14} /> : <Maximize2 size={14} />}
                </button>
                <button
                  type="button"
                  onClick={closePlayer}
                  className="text-text-dim hover:text-text-pri transition-colors"
                  aria-label="Close player"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Player body — fills remaining space */}
            <div className="flex-1 overflow-hidden min-h-0">
              {isMp4 ? (
                <video
                  controls
                  autoPlay
                  className="w-full h-full bg-black object-contain"
                  src={`/recordings/${encodeURIComponent(playing.name.replace(/\.[^.]+$/, '.mp4'))}`}
                />
              ) : isGuac ? (
                <GuacPlayer filename={playing.name} />
              ) : isAsc ? (
                <div ref={playerRef} className="w-full h-full bg-black [&_.ap-player]:!h-full" />
              ) : (
                <div className="p-6 text-center text-[12px] text-text-dim">
                  No player available. Convert to MP4 first.
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
