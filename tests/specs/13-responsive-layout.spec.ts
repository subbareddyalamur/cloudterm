import { test, expect } from './helpers/fixtures';
import { SIDEBAR, TOPBAR, WELCOME } from './helpers/selectors';

test.describe('Layout & Responsive Behavior', () => {
  test('sidebar has correct structure', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Sidebar top section with scan/filter
    const sidebarTop = page.locator('.sidebar-top');
    const count = await sidebarTop.count();
    expect(count).toBeGreaterThan(0);
  });

  test('main content area fills remaining space', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const mainArea = page.locator('.main');
    if (await mainArea.count() > 0) {
      const box = await mainArea.first().boundingBox();
      expect(box!.width).toBeGreaterThan(200);
    }
  });

  test('app renders without console errors', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Filter out expected errors (like WebSocket reconnects, missing AWS)
    const criticalErrors = errors.filter(e =>
      !e.includes('WebSocket') &&
      !e.includes('net::ERR') &&
      !e.includes('favicon')
    );
    expect(criticalErrors).toEqual([]);
  });

  test('page renders correctly at different viewport sizes', async ({ cloudterm }) => {
    const page = cloudterm.page;

    // Desktop (1920x1080)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(300);
    await expect(page.locator(SIDEBAR.container)).toBeVisible();
    await expect(page.locator(WELCOME.panel)).toBeVisible();

    // Smaller desktop (1280x720)
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(300);
    await expect(page.locator(SIDEBAR.container)).toBeVisible();

    // Restore default
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('all topbar SVG icons render', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const svgIcons = page.locator('.topbar svg');
    const count = await svgIcons.count();
    expect(count).toBeGreaterThan(0);

    // Verify each SVG has non-zero dimensions
    for (let i = 0; i < count; i++) {
      const box = await svgIcons.nth(i).boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    }
  });

  test('CSS variables are defined', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const bgColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg')
    );
    expect(bgColor.trim()).not.toBe('');

    const textColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--text')
    );
    expect(textColor.trim()).not.toBe('');
  });
});

test.describe('Toast Notification System', () => {
  test('toast container exists and is hidden', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const toast = page.locator('#toast');
    await expect(toast).toHaveCount(1);
    const isShown = await toast.evaluate(el => el.classList.contains('show'));
    expect(isShown).toBe(false);
  });

  test('toast appears on settings save', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click('#settingsBtn');
    await page.waitForSelector('#settingsModal.show');
    await page.click('#settingsSaveBtn');

    await expect(page.locator('#toast')).toHaveClass(/show/);
    await expect(page.locator('#toastMsg')).toContainText('saved');
  });

  test('toast auto-hides after timeout', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click('#settingsBtn');
    await page.waitForSelector('#settingsModal.show');
    await page.click('#settingsSaveBtn');

    await expect(page.locator('#toast')).toHaveClass(/show/);
    // Wait for auto-hide (default 3 seconds)
    await page.waitForTimeout(4000);
    const isShown = await page.locator('#toast').evaluate(el => el.classList.contains('show'));
    expect(isShown).toBe(false);
  });
});
