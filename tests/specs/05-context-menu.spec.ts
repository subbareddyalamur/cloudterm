import { test, expect } from './helpers/fixtures';
import { CTX_MENU, MODALS, SIDEBAR } from './helpers/selectors';

test.describe('Context Menu', () => {
  /** Helper to expand tree (account → region → group) and find the first instance */
  async function expandToInstance(page: any) {
    const accounts = page.locator('.t-account');
    if (await accounts.count() > 0) {
      await accounts.first().click();
      await page.waitForTimeout(300);
      const regions = page.locator('.t-region');
      if (await regions.count() > 0) {
        await regions.first().click();
        await page.waitForTimeout(300);
        // Also expand groups if present (instances are inside t-group-children)
        const groups = page.locator('.t-group');
        if (await groups.count() > 0) {
          await groups.first().click();
          await page.waitForTimeout(300);
        }
      }
    }
    return page.locator('.t-inst').first();
  }

  test('context menu appears on instance right-click', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const inst = await expandToInstance(page);
    if (await inst.count() === 0) {
      test.skip();
      return;
    }
    await inst.click({ button: 'right' });
    await expect(page.locator(CTX_MENU.container)).toBeVisible();
  });

  test('context menu has all standard items', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const inst = await expandToInstance(page);
    if (await inst.count() === 0) {
      test.skip();
      return;
    }
    await inst.click({ button: 'right' });

    const items = [
      CTX_MENU.ssh, CTX_MENU.rdp, CTX_MENU.copyId, CTX_MENU.copyIp,
      CTX_MENU.details, CTX_MENU.favorite, CTX_MENU.browse,
      CTX_MENU.broadcast, CTX_MENU.portForward,
      CTX_MENU.upload, CTX_MENU.download, CTX_MENU.closeAll,
    ];
    for (const selector of items) {
      await expect(page.locator(selector)).toBeVisible();
    }
  });

  test('context menu disappears on outside click', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const inst = await expandToInstance(page);
    if (await inst.count() === 0) {
      test.skip();
      return;
    }
    await inst.click({ button: 'right' });
    await expect(page.locator(CTX_MENU.container)).toBeVisible();
    await page.click('body', { force: true });
    await page.waitForTimeout(200);
    await expect(page.locator(CTX_MENU.container)).not.toBeVisible();
  });

  test('copy instance ID copies to clipboard', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Grant clipboard permission
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    const inst = await expandToInstance(page);
    if (await inst.count() === 0) {
      test.skip();
      return;
    }
    await inst.click({ button: 'right' });
    await page.click(CTX_MENU.copyId);

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toMatch(/^i-/); // Instance IDs start with "i-"
  });

  test('instance details opens details modal', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const inst = await expandToInstance(page);
    if (await inst.count() === 0) {
      test.skip();
      return;
    }
    await inst.click({ button: 'right' });
    await page.click(CTX_MENU.details);
    await expect(page.locator(MODALS.details)).toHaveClass(/show/);
    await cloudterm.closeModal(MODALS.details);
  });

  test('port forward opens port forward modal', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const inst = await expandToInstance(page);
    if (await inst.count() === 0) {
      test.skip();
      return;
    }
    await inst.click({ button: 'right' });
    await page.click(CTX_MENU.portForward);
    await expect(page.locator(MODALS.portForward)).toHaveClass(/show/);
    await cloudterm.closeModal(MODALS.portForward);
  });

  test('upload file opens upload modal', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const inst = await expandToInstance(page);
    if (await inst.count() === 0) {
      test.skip();
      return;
    }
    await inst.click({ button: 'right' });
    await page.click(CTX_MENU.upload);
    await expect(page.locator(MODALS.upload)).toHaveClass(/show/);
    await cloudterm.closeModal(MODALS.upload);
  });

  test('download file opens download modal', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const inst = await expandToInstance(page);
    if (await inst.count() === 0) {
      test.skip();
      return;
    }
    await inst.click({ button: 'right' });
    await page.click(CTX_MENU.download);
    await expect(page.locator(MODALS.download)).toHaveClass(/show/);
    await cloudterm.closeModal(MODALS.download);
  });

  test('browse files opens file browser modal', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const inst = await expandToInstance(page);
    if (await inst.count() === 0) {
      test.skip();
      return;
    }
    await inst.click({ button: 'right' });
    await page.click(CTX_MENU.browse);
    await expect(page.locator(MODALS.fileBrowser)).toHaveClass(/show/);
    await cloudterm.closeModal(MODALS.fileBrowser);
  });

  test('favorite toggle works from context menu', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const inst = await expandToInstance(page);
    if (await inst.count() === 0) {
      test.skip();
      return;
    }
    await inst.click({ button: 'right' });
    await page.click(CTX_MENU.favorite);
    await page.waitForTimeout(300);
    const favData = await cloudterm.getLocalStorage('cloudterm_favorites');
    expect(favData).not.toBeNull();
  });

  test('context menu on favorites section instance', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const favRows = page.locator('.fav-row');
    if (await favRows.count() > 0) {
      await favRows.first().click({ button: 'right' });
      await expect(page.locator(CTX_MENU.container)).toBeVisible();
    }
  });
});
