import { test, expect } from './helpers/fixtures';
import { TRANSFER, TUNNEL, PORT_FORWARD, TOPBAR, MODALS } from './helpers/selectors';

test.describe('Transfer Manager Panel', () => {
  test('transfer panel exists in DOM', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator(TRANSFER.panel)).toHaveCount(1);
  });

  test('transfer panel has header and body', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await expect(page.locator(TRANSFER.header)).toHaveCount(1);
    await expect(page.locator(TRANSFER.body)).toHaveCount(1);
  });

  test('transfer count starts at 0', async ({ cloudterm }) => {
    const text = await cloudterm.page.locator(TRANSFER.count).textContent();
    expect(text).toContain('0');
  });
});

test.describe('Active Tunnels Panel', () => {
  test('tunnel panel exists in DOM', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator(TUNNEL.panel)).toHaveCount(1);
  });

  test('tunnel panel has header and body', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await expect(page.locator(TUNNEL.header)).toHaveCount(1);
    await expect(page.locator(TUNNEL.body)).toHaveCount(1);
  });

  test('tunnel count shows 0 initially', async ({ cloudterm }) => {
    const text = await cloudterm.page.locator(TUNNEL.count).textContent();
    expect(text).toContain('0');
  });
});

test.describe('Port Forward Modal', () => {
  // Port forward modal requires right-clicking an instance, which needs data.
  // We test the modal structure separately.

  test('port forward modal exists in DOM', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator(PORT_FORWARD.modal)).toHaveCount(1);
  });

  test('port forward modal has remote port input', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator(PORT_FORWARD.remotePort)).toHaveCount(1);
  });

  test('port forward modal has start button', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator(PORT_FORWARD.startBtn)).toHaveCount(1);
  });
});

test.describe('Recordings Modal', () => {
  test('recordings button opens recordings modal', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.recordings);
    await expect(page.locator(MODALS.recordings)).toHaveClass(/show/);
  });

  test('recordings modal fetches from API', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/recordings')),
      page.click(TOPBAR.recordings),
    ]);
    expect(response.status()).toBe(200);
    await cloudterm.closeModal(MODALS.recordings);
  });

  test('recordings modal shows list or empty state', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await page.click(TOPBAR.recordings);
    await page.waitForTimeout(500);
    const recList = page.locator('#recList');
    await expect(recList).toBeVisible();
    await cloudterm.closeModal(MODALS.recordings);
  });

  test('SSH replay modal exists', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator(MODALS.sshReplay)).toHaveCount(1);
  });

  test('RDP replay modal exists with video element', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator(MODALS.rdpReplay)).toHaveCount(1);
    await expect(cloudterm.page.locator('#rdpReplayVideo')).toHaveCount(1);
  });
});

test.describe('Snippets Modal', () => {
  test('snippets modal opens with empty state', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await cloudterm.openModal(TOPBAR.snippets, MODALS.snippets);
    await expect(page.locator('#snippetsBody')).toBeVisible();
    await cloudterm.closeModal(MODALS.snippets);
  });

  test('snippets modal has export button', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await cloudterm.openModal(TOPBAR.snippets, MODALS.snippets);
    await expect(page.locator('#snippetExportBtn')).toBeVisible();
    await cloudterm.closeModal(MODALS.snippets);
  });

  test('snippets modal has import button', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await cloudterm.openModal(TOPBAR.snippets, MODALS.snippets);
    await expect(page.locator('#snippetImportBtn')).toBeVisible();
    await cloudterm.closeModal(MODALS.snippets);
  });
});

test.describe('History Modal', () => {
  test('history modal opens and fetches audit log', async ({ cloudterm }) => {
    const page = cloudterm.page;
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/audit-log')),
      cloudterm.openModal(TOPBAR.history, MODALS.history),
    ]);
    expect(response.status()).toBe(200);
    await cloudterm.closeModal(MODALS.history);
  });

  test('history modal has refresh button', async ({ cloudterm }) => {
    const page = cloudterm.page;
    await cloudterm.openModal(TOPBAR.history, MODALS.history);
    await expect(page.locator('#historyRefreshBtn')).toBeVisible();
    await cloudterm.closeModal(MODALS.history);
  });
});
