import type { ITheme } from '@xterm/xterm';

export function cloudtermThemeForXterm(): ITheme {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim() || undefined;
  return {
    background: v('--bg') ?? '#0D0F12',
    foreground: v('--text-pri') ?? '#E8EAF0',
    cursor: v('--accent') ?? '#7C5CFF',
    cursorAccent: v('--bg') ?? '#0D0F12',
    selectionBackground: v('--accent-dim') ?? 'rgba(124,92,255,0.25)',
    selectionForeground: v('--text-pri') ?? '#E8EAF0',
    black: v('--bg') ?? '#0D0F12',
    brightBlack: v('--text-dim') ?? '#5D6478',
    red: v('--danger') ?? '#F87171',
    brightRed: v('--danger') ?? '#F87171',
    green: v('--success') ?? '#3DD68C',
    brightGreen: v('--success') ?? '#3DD68C',
    yellow: v('--warn') ?? '#F59E0B',
    brightYellow: v('--warn') ?? '#F59E0B',
    blue: v('--info') ?? '#60A5FA',
    brightBlue: v('--info') ?? '#60A5FA',
    magenta: v('--accent-2') ?? '#14B8A6',
    brightMagenta: v('--accent-2') ?? '#14B8A6',
    cyan: '#7DCFFF',
    brightCyan: '#7DCFFF',
    white: v('--text-pri') ?? '#E8EAF0',
    brightWhite: '#FFFFFF',
  };
}
