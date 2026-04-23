export const THEME_SLUGS = [
  'auto',
  'warp', 'linear', 'vscode', 'arc',
  'github-dark', 'nord', 'atom-one-dark', 'dracula',
  'solarized-dark', 'tokyo-night', 'catppuccin-mocha', 'monokai',
  'github-light', 'solarized-light', 'one-light',
  'tokyo-night-day', 'catppuccin-latte', 'rose-pine-dawn',
] as const;

export type ThemeSlug = (typeof THEME_SLUGS)[number];
export type ThemeGroup = 'system' | 'design' | 'classic-dark' | 'light';
export type ThemeMode = 'dark' | 'light' | 'auto';

export interface ThemeMeta {
  slug: ThemeSlug;
  label: string;
  group: ThemeGroup;
  tagline: string;
  mode: ThemeMode;
  swatches: [string, string, string, string];
}

export const themes: ReadonlyArray<ThemeMeta> = [
  { slug: 'auto', label: '✨ Auto (match system)', group: 'system', tagline: 'Adapts to your OS', mode: 'auto',
    swatches: ['#ffffff', '#f6f8fa', '#0969da', '#1F2328'] },
  { slug: 'warp', label: 'Warp / Raycast', group: 'design', tagline: 'Dense developer-native', mode: 'dark',
    swatches: ['#0D0F12', '#151821', '#7C5CFF', '#E8EAF0'] },
  { slug: 'linear', label: 'Linear / Vercel', group: 'design', tagline: 'Minimalist SaaS', mode: 'dark',
    swatches: ['#000000', '#0A0A0A', '#5E6AD2', '#FAFAFA'] },
  { slug: 'vscode', label: 'VS Code-style', group: 'design', tagline: 'Classic IDE', mode: 'dark',
    swatches: ['#0D1117', '#161B22', '#58A6FF', '#C9D1D9'] },
  { slug: 'arc', label: 'Arc / Notion-soft', group: 'design', tagline: 'Warm & rounded', mode: 'dark',
    swatches: ['#141619', '#1E2025', '#FF7A59', '#F1F0E8'] },
  { slug: 'github-dark', label: 'GitHub Dark', group: 'classic-dark', tagline: 'Official Primer', mode: 'dark',
    swatches: ['#010409', '#0D1117', '#1F6FEB', '#F0F6FC'] },
  { slug: 'nord', label: 'Nord', group: 'classic-dark', tagline: 'Arctic palette', mode: 'dark',
    swatches: ['#2E3440', '#3B4252', '#88C0D0', '#ECEFF4'] },
  { slug: 'atom-one-dark', label: 'Atom One Dark', group: 'classic-dark', tagline: 'Atom classic', mode: 'dark',
    swatches: ['#282C34', '#21252B', '#61AFEF', '#ABB2BF'] },
  { slug: 'dracula', label: 'Dracula', group: 'classic-dark', tagline: 'draculatheme.com', mode: 'dark',
    swatches: ['#282A36', '#21222C', '#BD93F9', '#F8F8F2'] },
  { slug: 'solarized-dark', label: 'Solarized Dark', group: 'classic-dark', tagline: 'Schoonover palette', mode: 'dark',
    swatches: ['#002B36', '#073642', '#268BD2', '#839496'] },
  { slug: 'tokyo-night', label: 'Tokyo Night', group: 'classic-dark', tagline: 'Enkia / neon', mode: 'dark',
    swatches: ['#1A1B26', '#16161E', '#7AA2F7', '#C0CAF5'] },
  { slug: 'catppuccin-mocha', label: 'Catppuccin Mocha', group: 'classic-dark', tagline: 'Soothing pastel', mode: 'dark',
    swatches: ['#1E1E2E', '#181825', '#CBA6F7', '#CDD6F4'] },
  { slug: 'monokai', label: 'Monokai', group: 'classic-dark', tagline: 'Sublime classic', mode: 'dark',
    swatches: ['#272822', '#1E1F1C', '#F92672', '#F8F8F2'] },
  { slug: 'github-light', label: 'GitHub Light', group: 'light', tagline: 'Official Primer light', mode: 'light',
    swatches: ['#ffffff', '#f6f8fa', '#0969da', '#1F2328'] },
  { slug: 'solarized-light', label: 'Solarized Light', group: 'light', tagline: 'Cream + dusk', mode: 'light',
    swatches: ['#fdf6e3', '#eee8d5', '#268bd2', '#657b83'] },
  { slug: 'one-light', label: 'One Light', group: 'light', tagline: 'Atom light', mode: 'light',
    swatches: ['#FAFAFA', '#FFFFFF', '#4078F2', '#383A42'] },
  { slug: 'tokyo-night-day', label: 'Tokyo Night Day', group: 'light', tagline: 'Cool daylight', mode: 'light',
    swatches: ['#e1e2e7', '#d0d5e3', '#2e7de9', '#3760bf'] },
  { slug: 'catppuccin-latte', label: 'Catppuccin Latte', group: 'light', tagline: 'Warm pastel', mode: 'light',
    swatches: ['#eff1f5', '#e6e9ef', '#1e66f5', '#4c4f69'] },
  { slug: 'rose-pine-dawn', label: 'Rosé Pine Dawn', group: 'light', tagline: 'Rosé daybreak', mode: 'light',
    swatches: ['#faf4ed', '#fffaf3', '#286983', '#575279'] },
];

export const themesBySlug = Object.fromEntries(
  themes.map((t) => [t.slug, t]),
) as Record<ThemeSlug, ThemeMeta>;

export function isValidTheme(slug: string): slug is ThemeSlug {
  return (THEME_SLUGS as readonly string[]).includes(slug);
}

export function themesByGroup(group: ThemeGroup): ThemeMeta[] {
  return themes.filter((t) => t.group === group);
}
