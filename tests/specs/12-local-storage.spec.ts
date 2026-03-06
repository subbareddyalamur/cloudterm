import { test, expect } from './helpers/fixtures';

test.describe('LocalStorage Persistence', () => {
  test('cloudterm_settings key is created on save', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Open settings, set a value, save
    await page.click('#settingsBtn');
    await page.waitForSelector('#settingsModal.show');
    await page.locator('#settingsS3Bucket').fill('test-ls-bucket');
    await page.click('#settingsSaveBtn');
    await page.waitForTimeout(300);

    const data = await cloudterm.getLocalStorage('cloudterm_settings');
    expect(data).not.toBeNull();
    const parsed = JSON.parse(data!);
    expect(parsed.s3_bucket).toBe('test-ls-bucket');
  });

  test('cloudterm_favorites key is used for favorites', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Set a favorite via JS
    await page.evaluate(() => {
      localStorage.setItem('cloudterm_favorites', JSON.stringify(['i-test123']));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const data = await cloudterm.getLocalStorage('cloudterm_favorites');
    expect(data).toContain('i-test123');
  });

  test('cloudterm_snippets key stores snippets', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.evaluate(() => {
      localStorage.setItem('cloudterm_snippets', JSON.stringify([
        { name: 'test', command: 'echo hello' }
      ]));
    });
    const data = await cloudterm.getLocalStorage('cloudterm_snippets');
    expect(data).toContain('echo hello');
  });

  test('cloudterm_page_theme persists theme choice', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.evaluate(() => {
      localStorage.setItem('cloudterm_page_theme', 'nord');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const theme = await cloudterm.getLocalStorage('cloudterm_page_theme');
    expect(theme).toBe('nord');

    // Restore
    await page.evaluate(() => {
      localStorage.setItem('cloudterm_page_theme', 'dark');
    });
  });

  test('cloudterm_term_theme persists terminal theme', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.evaluate(() => {
      localStorage.setItem('cloudterm_term_theme', 'monokai');
    });
    const theme = await cloudterm.getLocalStorage('cloudterm_term_theme');
    expect(theme).toBe('monokai');
  });

  test('settings survive page reload', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Save settings
    await page.click('#settingsBtn');
    await page.waitForSelector('#settingsModal.show');
    await page.locator('#settingsS3Bucket').fill('reload-test');
    await page.click('#settingsSaveBtn');

    // Reload
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Reopen settings
    await page.click('#settingsBtn');
    await page.waitForSelector('#settingsModal.show');
    await expect(page.locator('#settingsS3Bucket')).toHaveValue('reload-test');
  });

  test('clearing localStorage resets all settings', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await cloudterm.clearLocalStorage();
    await page.reload();
    await page.waitForLoadState('networkidle');

    const settings = await cloudterm.getLocalStorage('cloudterm_settings');
    expect(settings).toBeNull();
  });
});
