import { useSettingsStore } from '@/stores/settings';

export interface GhostTextProps {
  suggestion: string | null;
  cursorX: number;
  cursorY: number;
  cellWidth: number;
  cellHeight: number;
  visible: boolean;
}

export function GhostText({
  suggestion,
  cursorX,
  cursorY,
  cellWidth,
  cellHeight,
  visible,
}: GhostTextProps) {
  const fontSize = useSettingsStore((s) => s.fontSize);
  const fontFamily = useSettingsStore((s) => s.fontFamily ?? 'JetBrains Mono');

  if (!visible || !suggestion) return null;

  // Xterm canvas is shifted by the padding we apply to the container div.
  const PAD_LEFT = 6;
  const PAD_TOP = 4;

  return (
    <div
      style={{
        position: 'absolute',
        top: PAD_TOP + cursorY * cellHeight,
        left: PAD_LEFT + cursorX * cellWidth,
        height: cellHeight,
        pointerEvents: 'none',
        zIndex: 10,
        fontFamily: `"${fontFamily}", ui-monospace, monospace`,
        fontSize: `${fontSize}px`,
        lineHeight: `${cellHeight}px`,
        color: 'var(--text-dim, #888)',
        opacity: 0.55,
        whiteSpace: 'pre',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {suggestion}
    </div>
  );
}

GhostText.displayName = 'GhostText';
