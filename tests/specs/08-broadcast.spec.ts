import { test, expect } from './helpers/fixtures';
import { TOPBAR, BROADCAST, MODALS } from './helpers/selectors';

test.describe('Broadcast Bar', () => {
  test('broadcast button is visible in topbar', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator(TOPBAR.broadcast)).toBeVisible();
  });

  test('clicking broadcast button shows broadcast bar', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.broadcast);
    await page.waitForTimeout(300);
    const bar = page.locator(BROADCAST.bar);
    // Broadcast bar should become visible
    const display = await bar.evaluate(el => getComputedStyle(el).display);
    expect(display).not.toBe('none');
  });

  test('broadcast bar has input textarea', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.broadcast);
    await page.waitForTimeout(300);
    await expect(page.locator(BROADCAST.input)).toBeVisible();
  });

  test('broadcast bar has send button', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.broadcast);
    await page.waitForTimeout(300);
    await expect(page.locator(BROADCAST.sendBtn)).toBeVisible();
  });

  test('broadcast bar has script mode button', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.broadcast);
    await page.waitForTimeout(300);
    await expect(page.locator(BROADCAST.scriptMode)).toBeVisible();
  });

  test('broadcast bar close button hides bar', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.broadcast);
    await page.waitForTimeout(300);
    await page.click(BROADCAST.closeBtn);
    await page.waitForTimeout(300);
    const display = await page.locator(BROADCAST.bar).evaluate(el => getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('broadcast input accepts text', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.broadcast);
    await page.waitForTimeout(300);
    const input = page.locator(BROADCAST.input);
    await input.fill('echo "hello world"');
    await expect(input).toHaveValue('echo "hello world"');
  });

  test('broadcast session count shows 0 when no sessions', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.broadcast);
    await page.waitForTimeout(300);
    const countText = await page.locator(BROADCAST.sessionCount).textContent();
    expect(countText).toContain('0');
  });

  test('script mode button opens broadcast modal', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.broadcast);
    await page.waitForTimeout(300);
    await page.click(BROADCAST.scriptMode);
    await page.waitForTimeout(300);
    await expect(page.locator(MODALS.broadcast)).toHaveClass(/show/);
    await cloudterm.closeModal(MODALS.broadcast);
  });
});

test.describe('Broadcast Modal (Script Mode)', () => {
  test('broadcast modal has instance list', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.broadcast);
    await page.waitForTimeout(300);
    await page.click(BROADCAST.scriptMode);
    await page.waitForTimeout(300);

    const instanceList = page.locator('#bcInstanceList');
    await expect(instanceList).toBeVisible();
  });

  test('broadcast modal has search filter', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.broadcast);
    await page.waitForTimeout(300);
    await page.click(BROADCAST.scriptMode);
    await page.waitForTimeout(300);

    const searchInput = page.locator('#bcSearch');
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await page.waitForTimeout(200);
    }
    await cloudterm.closeModal(MODALS.broadcast);
  });
});
