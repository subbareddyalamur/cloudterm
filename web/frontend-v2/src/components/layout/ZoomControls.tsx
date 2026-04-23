import { useSettingsStore } from '@/stores/settings';

export function ZoomControls() {
  const fontSize = useSettingsStore((s) => s.fontSize);
  const zoomIn = useSettingsStore((s) => s.zoomIn);
  const zoomOut = useSettingsStore((s) => s.zoomOut);
  const resetZoom = useSettingsStore((s) => s.resetZoom);

  const pct = Math.round((fontSize / 13) * 100);

  return (
    <div className="flex items-center h-6 rounded border border-border bg-elev overflow-hidden shrink-0">
      <button
        type="button"
        onClick={zoomOut}
        className="w-6 h-6 flex items-center justify-center text-text-mut hover:bg-surface hover:text-text-pri transition-colors font-mono text-[13px] leading-none"
        aria-label="Zoom out"
        title="Zoom out (decrease terminal font size)"
      >
        −
      </button>
      <div className="w-px h-4 bg-border" />
      <button
        type="button"
        onClick={resetZoom}
        className="px-1.5 text-[11px] text-text-dim hover:text-text-pri font-mono tabular-nums min-w-[36px] text-center"
        aria-label="Reset zoom"
        title="Click to reset zoom"
      >
        {pct}%
      </button>
      <div className="w-px h-4 bg-border" />
      <button
        type="button"
        onClick={zoomIn}
        className="w-6 h-6 flex items-center justify-center text-text-mut hover:bg-surface hover:text-text-pri transition-colors font-mono text-[13px] leading-none"
        aria-label="Zoom in"
        title="Zoom in (increase terminal font size)"
      >
        +
      </button>
    </div>
  );
}
