import { themes, type ThemeSlug, THEME_SLUGS } from '@/lib/themes';
import { useThemeStore } from '@/stores/theme';

export function ThemeSwitcher() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const groups = [
    { label: '✨ System', slugs: ['auto'] as ThemeSlug[] },
    { label: 'Dark — Design', slugs: ['warp', 'linear', 'vscode', 'arc'] as ThemeSlug[] },
    {
      label: 'Dark — Classics',
      slugs: ['github-dark', 'nord', 'atom-one-dark', 'dracula', 'solarized-dark', 'tokyo-night', 'catppuccin-mocha', 'monokai'] as ThemeSlug[],
    },
    {
      label: 'Light',
      slugs: ['github-light', 'solarized-light', 'one-light', 'tokyo-night-day', 'catppuccin-latte', 'rose-pine-dawn'] as ThemeSlug[],
    },
  ];

  return (
    <select
      value={theme}
      onChange={(e) => {
        const slug = e.target.value;
        if (THEME_SLUGS.includes(slug as ThemeSlug)) setTheme(slug as ThemeSlug);
      }}
      className="bg-elev border border-border rounded text-text-pri text-[11px] h-6 px-1.5 cursor-pointer focus:outline-none focus:border-accent"
      aria-label="Select theme"
    >
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.slugs.map((slug) => {
            const meta = themes.find((t) => t.slug === slug);
            return (
              <option key={slug} value={slug}>
                {meta?.label ?? slug}
              </option>
            );
          })}
        </optgroup>
      ))}
    </select>
  );
}
