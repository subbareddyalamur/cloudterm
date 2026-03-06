import { test, expect } from './helpers/fixtures';
import { TOPBAR, MODALS, SETTINGS } from './helpers/selectors';

test.describe('Settings Modal', () => {
  test.beforeEach(async ({ cloudterm }) => {
    await cloudterm.openModal(TOPBAR.settings, MODALS.settings);
  });

  test('has three tabs: General, Appearance, AWS Accounts', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const tabs = page.locator(SETTINGS.tabs);
    await expect(tabs).toHaveCount(3);
    await expect(tabs.nth(0)).toHaveText('General');
    await expect(tabs.nth(1)).toHaveText('Appearance');
    await expect(tabs.nth(2)).toHaveText('AWS Accounts');
  });

  test('General tab is active by default', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await expect(page.locator(SETTINGS.tabGeneral)).toHaveClass(/active/);
    await expect(page.locator(SETTINGS.paneGeneral)).toHaveClass(/active/);
  });

  test('switching tabs shows correct pane', async ({ cloudterm }) => {
    const page = cloudterm.page;

    // Switch to Appearance
    await page.click(SETTINGS.tabAppearance);
    await expect(page.locator(SETTINGS.tabAppearance)).toHaveClass(/active/);
    await expect(page.locator(SETTINGS.paneAppearance)).toHaveClass(/active/);
    await expect(page.locator(SETTINGS.paneGeneral)).not.toHaveClass(/active/);

    // Switch to AWS Accounts
    await page.click(SETTINGS.tabAWSAccounts);
    await expect(page.locator(SETTINGS.tabAWSAccounts)).toHaveClass(/active/);
    await expect(page.locator(SETTINGS.paneAWSAccounts)).toHaveClass(/active/);
    await expect(page.locator(SETTINGS.paneAppearance)).not.toHaveClass(/active/);

    // Switch back to General
    await page.click(SETTINGS.tabGeneral);
    await expect(page.locator(SETTINGS.tabGeneral)).toHaveClass(/active/);
    await expect(page.locator(SETTINGS.paneGeneral)).toHaveClass(/active/);
  });
});

test.describe('Settings - General Tab', () => {
  test.beforeEach(async ({ cloudterm }) => {
    await cloudterm.openModal(TOPBAR.settings, MODALS.settings);
  });

  test('S3 bucket input is visible and editable', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const input = page.locator(SETTINGS.s3Bucket);
    await expect(input).toBeVisible();
    await input.fill('test-bucket-123');
    await expect(input).toHaveValue('test-bucket-123');
  });

  test('auto-record checkbox is present', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await expect(page.locator(SETTINGS.autoRecord)).toBeVisible();
  });

  test('save button persists S3 bucket to localStorage', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.locator(SETTINGS.s3Bucket).fill('my-test-bucket');
    await page.click(SETTINGS.saveBtn);

    // Modal should close
    await expect(page.locator(MODALS.settings)).not.toHaveClass(/show/);

    // Verify localStorage
    const settings = await cloudterm.getLocalStorage('cloudterm_settings');
    expect(settings).toContain('my-test-bucket');
  });

  test('save button persists auto-record setting', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const checkbox = page.locator(SETTINGS.autoRecord);
    await checkbox.uncheck();
    await page.click(SETTINGS.saveBtn);

    const settings = await cloudterm.getLocalStorage('cloudterm_settings');
    expect(settings).toContain('"auto_record"');
  });

  test('settings persist across modal reopens', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.locator(SETTINGS.s3Bucket).fill('persist-test');
    await page.click(SETTINGS.saveBtn);

    // Reopen
    await cloudterm.openModal(TOPBAR.settings, MODALS.settings);
    await expect(page.locator(SETTINGS.s3Bucket)).toHaveValue('persist-test');
  });
});

test.describe('Settings - Appearance Tab', () => {
  test.beforeEach(async ({ cloudterm }) => {
    await cloudterm.openModal(TOPBAR.settings, MODALS.settings);
    await cloudterm.switchSettingsTab('appearance');
  });

  test('font size controls are visible', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await expect(page.locator(SETTINGS.fontDec)).toBeVisible();
    await expect(page.locator(SETTINGS.fontInc)).toBeVisible();
    await expect(page.locator(SETTINGS.fontValue)).toBeVisible();
  });

  test('font size displays current zoom percentage', async ({ cloudterm }) => {
    const text = await cloudterm.page.locator(SETTINGS.fontValue).textContent();
    expect(text).toMatch(/\d+%/);
  });

  test('increment button increases font size', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const label = page.locator(SETTINGS.fontValue);
    const before = parseInt((await label.textContent()) || '100');
    await page.click(SETTINGS.fontInc);
    const after = parseInt((await label.textContent()) || '100');
    expect(after).toBe(Math.min(before + 10, 150));
  });

  test('decrement button decreases font size', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const label = page.locator(SETTINGS.fontValue);
    const before = parseInt((await label.textContent()) || '100');
    await page.click(SETTINGS.fontDec);
    const after = parseInt((await label.textContent()) || '100');
    expect(after).toBe(Math.max(before - 10, 70));
  });

  test('font size does not exceed bounds (70-150)', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Click decrease many times
    for (let i = 0; i < 20; i++) await page.click(SETTINGS.fontDec);
    const min = parseInt((await page.locator(SETTINGS.fontValue).textContent()) || '70');
    expect(min).toBeGreaterThanOrEqual(70);

    // Click increase many times
    for (let i = 0; i < 20; i++) await page.click(SETTINGS.fontInc);
    const max = parseInt((await page.locator(SETTINGS.fontValue).textContent()) || '150');
    expect(max).toBeLessThanOrEqual(150);
  });
});

test.describe('Settings - AWS Accounts Tab', () => {
  test.beforeEach(async ({ cloudterm }) => {
    await cloudterm.openModal(TOPBAR.settings, MODALS.settings);
    await cloudterm.switchSettingsTab('aws-accounts');
  });

  test('add account form has all fields', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await expect(page.locator(SETTINGS.awsAcctName)).toBeVisible();
    await expect(page.locator(SETTINGS.awsAcctAccessKey)).toBeVisible();
    await expect(page.locator(SETTINGS.awsAcctSecretKey)).toBeVisible();
    await expect(page.locator(SETTINGS.awsAcctSessionToken)).toBeVisible();
    await expect(page.locator(SETTINGS.awsAcctAddBtn)).toBeVisible();
  });

  test('add account requires access key and secret key', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Try adding without credentials
    await page.click(SETTINGS.awsAcctAddBtn);
    // Should show a toast with error
    const toast = await cloudterm.getToastMessage();
    expect(toast).toContain('required');
  });

  test('add account with valid credentials', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.locator(SETTINGS.awsAcctName).fill('Test Account');
    await page.locator(SETTINGS.awsAcctAccessKey).fill('AKIAIOSFODNN7EXAMPLE');
    await page.locator(SETTINGS.awsAcctSecretKey).fill('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');

    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/aws-accounts') && resp.request().method() === 'POST'),
      page.click(SETTINGS.awsAcctAddBtn),
    ]);
    expect(response.status()).toBe(200);

    // Account should appear in list
    await page.waitForTimeout(500);
    await expect(page.locator(SETTINGS.awsAcctRow)).toHaveCount(1);
    await expect(page.locator('.aws-acct-name')).toContainText('Test Account');
  });

  test('added account shows masked secret key', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Add an account first
    await page.locator(SETTINGS.awsAcctName).fill('Masked Test');
    await page.locator(SETTINGS.awsAcctAccessKey).fill('AKIAIOSFODNN7EXAMPLE');
    await page.locator(SETTINGS.awsAcctSecretKey).fill('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    await page.click(SETTINGS.awsAcctAddBtn);
    await page.waitForTimeout(500);

    const keyText = await page.locator('.aws-acct-key').first().textContent();
    expect(keyText).toContain('****');
  });

  test('remove account button deletes account', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Add an account
    await page.locator(SETTINGS.awsAcctName).fill('Delete Me');
    await page.locator(SETTINGS.awsAcctAccessKey).fill('AKIAIOSFODNN7EXAMPLE');
    await page.locator(SETTINGS.awsAcctSecretKey).fill('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    await page.click(SETTINGS.awsAcctAddBtn);
    await page.waitForTimeout(500);

    const countBefore = await page.locator(SETTINGS.awsAcctRow).count();

    // Click remove
    const [delResponse] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/aws-accounts/') && resp.request().method() === 'DELETE'),
      page.locator(SETTINGS.awsAcctDelBtn).first().click(),
    ]);
    expect(delResponse.status()).toBe(200);

    await page.waitForTimeout(500);
    const countAfter = await page.locator(SETTINGS.awsAcctRow).count();
    expect(countAfter).toBeLessThan(countBefore);
  });

  test('scan button triggers account scan', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Add an account
    await page.locator(SETTINGS.awsAcctName).fill('Scan Test');
    await page.locator(SETTINGS.awsAcctAccessKey).fill('AKIAIOSFODNN7EXAMPLE');
    await page.locator(SETTINGS.awsAcctSecretKey).fill('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    await page.click(SETTINGS.awsAcctAddBtn);
    await page.waitForTimeout(500);

    const scanBtn = page.locator(SETTINGS.awsAcctScanBtn).first();
    await expect(scanBtn).toHaveText('Scan');

    // Click scan — button should change text
    await scanBtn.click();
    await expect(scanBtn).toHaveText('Scanning...');
  });

  test('add multiple accounts', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Add first account
    await page.locator(SETTINGS.awsAcctName).fill('Account 1');
    await page.locator(SETTINGS.awsAcctAccessKey).fill('AKIAIOSFODNN7EXAMPLE');
    await page.locator(SETTINGS.awsAcctSecretKey).fill('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    await page.click(SETTINGS.awsAcctAddBtn);
    await page.waitForTimeout(500);

    // Add second account
    await page.locator(SETTINGS.awsAcctName).fill('Account 2');
    await page.locator(SETTINGS.awsAcctAccessKey).fill('AKIAI44QH8DHBEXAMPLE');
    await page.locator(SETTINGS.awsAcctSecretKey).fill('je7MtGbClwBF/2Zp9Utk/h3yCo8nvbEXAMPLEKEY');
    await page.click(SETTINGS.awsAcctAddBtn);
    await page.waitForTimeout(500);

    const count = await page.locator(SETTINGS.awsAcctRow).count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('session token field is optional', async ({ cloudterm }) => {
    const page = cloudterm.page;
    // Add without session token
    await page.locator(SETTINGS.awsAcctName).fill('No Token Account');
    await page.locator(SETTINGS.awsAcctAccessKey).fill('AKIAIOSFODNN7EXAMPLE');
    await page.locator(SETTINGS.awsAcctSecretKey).fill('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');

    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/aws-accounts') && resp.request().method() === 'POST'),
      page.click(SETTINGS.awsAcctAddBtn),
    ]);
    expect(response.status()).toBe(200);
  });

  test('form clears after adding account', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.locator(SETTINGS.awsAcctName).fill('Clear Test');
    await page.locator(SETTINGS.awsAcctAccessKey).fill('AKIAIOSFODNN7EXAMPLE');
    await page.locator(SETTINGS.awsAcctSecretKey).fill('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    await page.click(SETTINGS.awsAcctAddBtn);
    await page.waitForTimeout(500);

    await expect(page.locator(SETTINGS.awsAcctName)).toHaveValue('');
    await expect(page.locator(SETTINGS.awsAcctAccessKey)).toHaveValue('');
    await expect(page.locator(SETTINGS.awsAcctSecretKey)).toHaveValue('');
  });
});
