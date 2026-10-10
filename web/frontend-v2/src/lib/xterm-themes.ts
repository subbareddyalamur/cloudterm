import type { ITheme } from '@xterm/xterm';

export interface TerminalPalette {
  id: string;
  name: string;
  group: 'Dark' | 'Light' | 'High contrast';
  background: string;
  foreground: string;
  cursor: string;
  black: string;
  brightBlack: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
}

function palette(p: TerminalPalette): ITheme {
  return {
    background: p.background,
    foreground: p.foreground,
    cursor: p.cursor,
    cursorAccent: p.background,
    selectionBackground: p.brightBlack,
    selectionForeground: p.foreground,
    black: p.black,
    brightBlack: p.brightBlack,
    red: p.red,
    brightRed: p.red,
    green: p.green,
    brightGreen: p.green,
    yellow: p.yellow,
    brightYellow: p.yellow,
    blue: p.blue,
    brightBlue: p.blue,
    magenta: p.magenta,
    brightMagenta: p.magenta,
    cyan: p.cyan,
    brightCyan: p.cyan,
    white: p.white,
    brightWhite: '#ffffff',
  };
}

/** Twelve xterm palettes. They do not follow the desk chrome theme. */
export const TERMINAL_PALETTES: TerminalPalette[] = [
  { id: 'tokyo-night', name: 'Tokyo Night', group: 'Dark', background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', black: '#15161e', brightBlack: '#565f89', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#c0caf5' },
  { id: 'dracula', name: 'Dracula', group: 'Dark', background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', black: '#21222c', brightBlack: '#6272a4', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2' },
  { id: 'nord', name: 'Nord', group: 'Dark', background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', black: '#3b4252', brightBlack: '#616e88', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b', blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0' },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', group: 'Dark', background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', black: '#181825', brightBlack: '#6c7086', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af', blue: '#89b4fa', magenta: '#cba6f7', cyan: '#94e2d5', white: '#cdd6f4' },
  { id: 'monokai', name: 'Monokai', group: 'Dark', background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f0', black: '#272822', brightBlack: '#75715e', red: '#f92672', green: '#a6e22e', yellow: '#e6db74', blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2' },
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', group: 'Dark', background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', black: '#282828', brightBlack: '#928374', red: '#fb4934', green: '#b8bb26', yellow: '#fabd2f', blue: '#83a598', magenta: '#d3869b', cyan: '#8ec07c', white: '#ebdbb2' },
  { id: 'solarized-dark', name: 'Solarized Dark', group: 'Dark', background: '#002b36', foreground: '#839496', cursor: '#93a1a1', black: '#073642', brightBlack: '#586e75', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5' },
  { id: 'solarized-light', name: 'Solarized Light', group: 'Light', background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75', black: '#eee8d5', brightBlack: '#93a1a1', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#073642' },
  { id: 'github-light', name: 'GitHub Light', group: 'Light', background: '#ffffff', foreground: '#1f2328', cursor: '#0969da', black: '#24292f', brightBlack: '#656d76', red: '#cf222e', green: '#116329', yellow: '#9a6700', blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#1f2328' },
  { id: 'gruvbox-light', name: 'Gruvbox Light', group: 'Light', background: '#fbf1c7', foreground: '#3c3836', cursor: '#3c3836', black: '#fbf1c7', brightBlack: '#928374', red: '#9d0006', green: '#79740e', yellow: '#b57614', blue: '#076678', magenta: '#8f3f71', cyan: '#427b58', white: '#3c3836' },
  { id: 'one-light', name: 'One Light', group: 'Light', background: '#fafafa', foreground: '#383a42', cursor: '#4078f2', black: '#383a42', brightBlack: '#a0a1a7', red: '#e45649', green: '#50a14f', yellow: '#c18401', blue: '#4078f2', magenta: '#a626a4', cyan: '#0184bc', white: '#fafafa' },
  { id: 'paper', name: 'Paper', group: 'High contrast', background: '#ffffff', foreground: '#000000', cursor: '#000000', black: '#000000', brightBlack: '#333333', red: '#9b0000', green: '#006600', yellow: '#6b4f00', blue: '#0033cc', magenta: '#5c00a3', cyan: '#006666', white: '#000000' },
];

export function terminalThemeById(id: string): ITheme {
  const found = TERMINAL_PALETTES.find((p) => p.id === id) ?? TERMINAL_PALETTES[0];
  return palette(found);
}

export function cloudtermThemeForXterm(): ITheme {
  return terminalThemeById('tokyo-night');
}
