import { test, expect } from './helpers/fixtures';
import { SIDEBAR, TOPBAR, WELCOME, TABS, MODALS } from './helpers/selectors';

test.describe('App Load & Page Structure', () => {
  test('page loads with correct title', async ({ cloudterm }) => {
    await expect(cloudterm.page).toHaveTitle(/CloudTerm/i);
  });

  test('sidebar is visible with core elements', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await expect(page.locator(SIDEBAR.container)).toBeVisible();
    await expect(page.locator(SIDEBAR.filterInput)).toBeVisible();
    await expect(page.locator(SIDEBAR.scanBtn)).toBeVisible();
    await expect(page.locator(SIDEBAR.tree)).toBeVisible();
  });

  test('welcome panel shows when no tabs are open', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await expect(page.locator(WELCOME.panel)).toBeVisible();
    await expect(page.locator(WELCOME.title)).toContainText('No active sessions');
  });

  test('topbar buttons are all present', async ({ cloudterm }) => {
    const page = cloudterm.page;
    for (const [name, selector] of Object.entries(TOPBAR)) {
      await expect(page.locator(selector), `topbar button: ${name}`).toBeVisible();
    }
  });

  test('tab bar is present and empty initially', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await expect(page.locator(TABS.bar)).toBeVisible();
    const tabCount = await page.locator(TABS.tab).count();
    expect(tabCount).toBe(0);
  });

  test('status bar shows zero session counts', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await expect(page.locator(SIDEBAR.sshCount)).toHaveText('0');
    await expect(page.locator(SIDEBAR.rdpCount)).toHaveText('0');
  });

  test('all modals exist in DOM but are hidden', async ({ cloudterm }) => {
    const page = cloudterm.page;
    for (const [name, selector] of Object.entries(MODALS)) {
      const modal = page.locator(selector);
      await expect(modal, `modal ${name} should exist`).toHaveCount(1);
      const isShown = await modal.evaluate(el => el.classList.contains('show'));
      expect(isShown, `modal ${name} should be hidden`).toBe(false);
    }
  });

  test('WebSocket connection is established', async ({ cloudterm }) => {
    const wsConnected = await cloudterm.page.evaluate(() => {
      const app = (window as any).cloudterm;
      return app && app.ws && app.ws.ws && app.ws.ws.readyState === WebSocket.OPEN;
    });
    expect(wsConnected).toBe(true);
  });

  test('instance tree container renders', async ({ cloudterm }) => {
    // Tree may be empty or populated depending on AWS config
    await expect(cloudterm.page.locator(SIDEBAR.tree)).toBeVisible();
  });
});
