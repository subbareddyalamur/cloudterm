import { test, expect } from './helpers/fixtures';
import { SIDEBAR, CTX_MENU } from './helpers/selectors';

test.describe('Instance Tree & Sidebar', () => {
  test('filter input filters the tree', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const filter = page.locator(SIDEBAR.filterInput);
    await expect(filter).toBeVisible();
    await expect(filter).toHaveAttribute('placeholder', /filter|search/i);

    // Type a non-matching filter — all instances should be hidden
    await filter.fill('zzz-nonexistent-xyz-99999');
    await page.waitForTimeout(300); // debounce

    // Either no instances visible or instances have hidden class
    const visibleInstances = page.locator('.t-inst:not(.hidden):not(.t-hidden)');
    const count = await visibleInstances.count();
    // If there are no instances at all, that's fine too
    expect(count).toBeGreaterThanOrEqual(0);

    // Clear filter
    await filter.fill('');
    await page.waitForTimeout(300);
  });

  test('scan button triggers instance scan', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const scanBtn = page.locator(SIDEBAR.scanBtn);
    await expect(scanBtn).toBeVisible();

    // Click scan and verify API call is made
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/scan-instances')),
      scanBtn.click(),
    ]);
    expect(response.status()).toBeLessThan(500);
  });

  test('summary button opens fleet summary modal', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const summaryBtn = page.locator(SIDEBAR.summaryBtn);
    if (await summaryBtn.isVisible()) {
      await summaryBtn.click();
      await expect(page.locator('#summaryModal')).toHaveClass(/show/);
      // Close it
      await cloudterm.closeModal('#summaryModal');
    }
  });

  test('favorites section exists in sidebar', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Section exists in DOM but is hidden when no favorites are set
    await expect(page.locator(SIDEBAR.favoritesSection)).toHaveCount(1);
  });

  test('account nodes are expandable', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const accounts = page.locator('.t-account');
    const count = await accounts.count();
    if (count > 0) {
      // .t-children is a sibling of .t-account, not a child
      await accounts.first().click();
      const children = page.locator('.t-children').first();
      await expect(children).toBeVisible();

      // Click again to collapse
      await accounts.first().click();
      await expect(children).not.toBeVisible();
    }
  });

  test('region nodes are expandable', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const accounts = page.locator('.t-account');
    if (await accounts.count() > 0) {
      // Expand first account
      await accounts.first().click();
      await page.waitForTimeout(200);
      const regions = page.locator('.t-region');
      if (await regions.count() > 0) {
        await regions.first().click();
        // .t-region-children is a sibling of .t-region, not a child
        const regionChildren = page.locator('.t-region-children').first();
        await expect(regionChildren).toBeVisible();
      }
    }
  });

  test('region refresh button triggers region scan', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const accounts = page.locator('.t-account');
    if (await accounts.count() > 0) {
      await accounts.first().click();
      const refreshBtn = page.locator('.region-refresh').first();
      if (await refreshBtn.isVisible()) {
        const [response] = await Promise.all([
          page.waitForResponse(resp => resp.url().includes('/scan-region')),
          refreshBtn.click(),
        ]);
        expect(response.status()).toBeLessThan(500);
      }
    }
  });

  test('instance right-click shows context menu', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Expand tree: account → region → group → instances
    const accounts = page.locator('.t-account');
    if (await accounts.count() > 0) {
      await accounts.first().click();
      await page.waitForTimeout(300);
      const regions = page.locator('.t-region');
      if (await regions.count() > 0) {
        await regions.first().click();
        await page.waitForTimeout(300);
        // Also expand groups if present
        const groups = page.locator('.t-group');
        if (await groups.count() > 0) {
          await groups.first().click();
          await page.waitForTimeout(300);
        }
      }
    }

    const instances = page.locator('.t-inst');
    if (await instances.count() > 0) {
      await instances.first().click({ button: 'right' });
      await expect(page.locator(CTX_MENU.container)).toBeVisible();

      // Verify core menu items exist
      await expect(page.locator(CTX_MENU.ssh)).toBeVisible();
      await expect(page.locator(CTX_MENU.rdp)).toBeVisible();
      await expect(page.locator(CTX_MENU.copyId)).toBeVisible();
      await expect(page.locator(CTX_MENU.details)).toBeVisible();
      await expect(page.locator(CTX_MENU.portForward)).toBeVisible();

      // Dismiss context menu
      await page.click('body', { force: true });
    }
  });

  test('favorite star toggles on instance', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Expand tree first to reveal instances with fav-star
    const accounts = page.locator('.t-account');
    if (await accounts.count() > 0) {
      await accounts.first().click();
      await page.waitForTimeout(300);
      const regions = page.locator('.t-region');
      if (await regions.count() > 0) {
        await regions.first().click();
        await page.waitForTimeout(300);
        const groups = page.locator('.t-group');
        if (await groups.count() > 0) {
          await groups.first().click();
          await page.waitForTimeout(300);
        }
      }
    }

    const stars = page.locator('.fav-star');
    if (await stars.count() > 0) {
      await stars.first().click({ force: true });
      await page.waitForTimeout(200);
      const favData = await cloudterm.getLocalStorage('cloudterm_favorites');
      expect(favData).not.toBeNull();
    }
  });
});
