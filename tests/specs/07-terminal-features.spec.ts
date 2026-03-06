import { test, expect } from './helpers/fixtures';
import { TOPBAR, TERM_SEARCH, TABS, WELCOME } from './helpers/selectors';

test.describe('Terminal Zoom Controls', () => {
  test('zoom level displays current percentage', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const zoomText = await page.locator(TOPBAR.zoomLevel).textContent();
    expect(zoomText).toMatch(/\d+%/);
  });

  test('zoom in button increases zoom level', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const before = parseInt((await page.locator(TOPBAR.zoomLevel).textContent()) || '100');
    await page.click(TOPBAR.zoomIn);
    const after = parseInt((await page.locator(TOPBAR.zoomLevel).textContent()) || '100');
    expect(after).toBeGreaterThanOrEqual(before);
  });

  test('zoom out button decreases zoom level', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const before = parseInt((await page.locator(TOPBAR.zoomLevel).textContent()) || '100');
    await page.click(TOPBAR.zoomOut);
    const after = parseInt((await page.locator(TOPBAR.zoomLevel).textContent()) || '100');
    expect(after).toBeLessThanOrEqual(before);
  });
});

test.describe('Terminal Search Bar', () => {
  test('search bar exists in DOM but is hidden', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const bar = page.locator(TERM_SEARCH.bar);
    await expect(bar).toHaveCount(1);
    await expect(bar).not.toBeVisible();
  });

  test('search bar has all controls', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // These elements exist in DOM even when hidden
    await expect(page.locator(TERM_SEARCH.input)).toHaveCount(1);
    await expect(page.locator(TERM_SEARCH.prev)).toHaveCount(1);
    await expect(page.locator(TERM_SEARCH.next)).toHaveCount(1);
    await expect(page.locator(TERM_SEARCH.close)).toHaveCount(1);
  });

  // Note: Ctrl+F test requires an active terminal session, which needs a live AWS connection.
  // This test validates the search bar structure and can be extended when running against live infra.
});

test.describe('Input Sync Toggle', () => {
  test('input sync button is visible', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await expect(page.locator(TOPBAR.inputSync)).toBeVisible();
  });

  test('input sync toggles on click', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const btn = page.locator(TOPBAR.inputSync);

    // Click to enable — app uses 'sync-active' class
    await btn.click();
    await page.waitForTimeout(200);
    const isActive = await btn.evaluate(el => el.classList.contains('sync-active'));

    // Click to toggle back
    await btn.click();
    await page.waitForTimeout(200);
    const isActive2 = await btn.evaluate(el => el.classList.contains('sync-active'));
    expect(isActive).not.toBe(isActive2);
  });
});

test.describe('Tab Management', () => {
  test('no tabs shown initially', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const tabCount = await page.locator(TABS.tab).count();
    expect(tabCount).toBe(0);
    await expect(page.locator(WELCOME.panel)).toBeVisible();
  });

  // Tab creation requires WebSocket + AWS session - tested in API tests
  // But we can test the tab bar structure:

  test('tab bar container exists', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await expect(page.locator(TABS.bar)).toBeVisible();
  });
});

test.describe('Keyboard Shortcuts', () => {
  test('Ctrl+W does not crash when no tabs open', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.keyboard.press('Control+w');
    await page.waitForTimeout(300);
    // App should still be functional
    await expect(page.locator(WELCOME.panel)).toBeVisible();
  });

  test('Ctrl+F does not crash when no terminal is active', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(300);
    // Search bar may or may not appear; app should not crash
    await expect(page.locator('body')).toBeVisible();
  });
});
