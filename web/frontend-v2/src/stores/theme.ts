import { create } from 'zustand';
import { persist, createJSONStorage, subscribeWithSelector } from 'zustand/middleware';
import { isValidTheme, type ThemeSlug, THEME_SLUGS } from '@/lib/themes';

interface ThemeState {
  theme: ThemeSlug;
  systemIsDark: boolean;
  setTheme: (slug: ThemeSlug) => void;
  cycleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        theme: 'warp' as ThemeSlug,
        systemIsDark:
          typeof window !== 'undefined'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
            : true,
        setTheme: (slug: ThemeSlug) => {
          if (!isValidTheme(slug)) return;
          set({ theme: slug });
          document.documentElement.dataset.theme = slug;
        },
        cycleTheme: () => {
          const idx = THEME_SLUGS.indexOf(get().theme);
          const next = THEME_SLUGS[(idx + 1) % THEME_SLUGS.length] ?? 'warp';
          get().setTheme(next);
        },
      }),
      {
        name: 'ct-theme',
        storage: createJSONStorage(() => localStorage),
        partialize: (s) => ({ theme: s.theme }),
        onRehydrateStorage: () => (state) => {
          if (state) {
            document.documentElement.dataset.theme = state.theme;
          }
        },
      },
    ),
  ),
);

if (typeof window !== 'undefined') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', (e) => {
    useThemeStore.setState({ systemIsDark: e.matches });
  });
}
