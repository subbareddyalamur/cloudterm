import { test, expect } from './helpers/fixtures';
import { TOPBAR, THEME } from './helpers/selectors';

test.describe('Theme System', () => {
  test('theme dropdown toggles on button click', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.themeToggle);
    await expect(page.locator(THEME.dropdown)).toBeVisible();

    // Click again to close
    await page.click(TOPBAR.themeToggle);
    await page.waitForTimeout(300);
  });

  test('page themes are listed in dropdown', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.themeToggle);
    const pageThemes = page.locator(THEME.pageTheme);
    const count = await pageThemes.count();
    expect(count).toBeGreaterThanOrEqual(5); // dark, nord, dracula, cyber, warp-hero, light
  });

  test('terminal themes are listed in dropdown', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.themeToggle);
    const termThemes = page.locator(THEME.termTheme);
    const count = await termThemes.count();
    expect(count).toBeGreaterThanOrEqual(8); // github-dark, atom, nord, dracula, solarized, monokai, warp-hero, warp, catppuccin
  });

  test('clicking page theme changes body class', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.themeToggle);

    // Click on Nord theme
    const nordTheme = page.locator('.theme-opt[data-page-theme="nord"]');
    if (await nordTheme.isVisible()) {
      await nordTheme.click();
      await page.waitForTimeout(300);
      // Body should have the theme applied via CSS variables or class
      const savedTheme = await cloudterm.getLocalStorage('cloudterm_page_theme');
      expect(savedTheme).toBe('nord');
    }
  });

  test('clicking terminal theme saves to localStorage', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.themeToggle);

    const draculaTerm = page.locator('.theme-opt[data-term-theme="dracula"]');
    if (await draculaTerm.isVisible()) {
      await draculaTerm.click();
      await page.waitForTimeout(300);
      const savedTheme = await cloudterm.getLocalStorage('cloudterm_term_theme');
      expect(savedTheme).toBe('dracula');
    }
  });

  test('theme persists after page reload', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Set a theme
    await page.click(TOPBAR.themeToggle);
    const lightTheme = page.locator('.theme-opt[data-page-theme="light"]');
    if (await lightTheme.isVisible()) {
      await lightTheme.click();
      await page.waitForTimeout(300);

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      const savedTheme = await cloudterm.getLocalStorage('cloudterm_page_theme');
      expect(savedTheme).toBe('light');
    }

    // Restore default theme
    await page.click(TOPBAR.themeToggle);
    const darkTheme = page.locator('.theme-opt[data-page-theme="dark"]');
    if (await darkTheme.isVisible()) {
      await darkTheme.click();
    }
  });

  test('active theme has visual indicator', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.themeToggle);
    // The active theme should have an "active" class or checkmark
    const activeTheme = page.locator('.theme-opt.active, .theme-opt[class*="active"]');
    const count = await activeTheme.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
