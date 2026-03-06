import { test, expect } from './helpers/fixtures';
import { MODALS } from './helpers/selectors';

test.describe('Upload Modal', () => {
  test('upload modal exists in DOM', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator(MODALS.upload)).toHaveCount(1);
  });

  test('upload modal has drop zone', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator('#uploadDropZone')).toHaveCount(1);
  });

  test('upload modal has remote path input', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator('#uploadRemotePath')).toHaveCount(1);
  });

  test('upload modal has upload button', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator('#uploadBtn')).toHaveCount(1);
  });
});

test.describe('Download Modal', () => {
  test('download modal exists in DOM', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator(MODALS.download)).toHaveCount(1);
  });

  test('download modal has remote path input', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator('#downloadRemotePath')).toHaveCount(1);
  });

  test('download modal has download button', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator('#downloadBtn')).toHaveCount(1);
  });
});

test.describe('Express Upload Modal', () => {
  test('express upload modal exists in DOM', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator(MODALS.expressUpload)).toHaveCount(1);
  });

  test('express upload has drop zone', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator('#expressUploadDropZone')).toHaveCount(1);
  });
});

test.describe('Express Download Modal', () => {
  test('express download modal exists in DOM', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator(MODALS.expressDownload)).toHaveCount(1);
  });

  test('express download has remote path input', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator('#expressDownloadRemotePath')).toHaveCount(1);
  });
});

test.describe('File Browser Modal', () => {
  test('file browser modal exists in DOM', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator(MODALS.fileBrowser)).toHaveCount(1);
  });

  test('file browser has breadcrumb', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator('#fbBreadcrumb')).toHaveCount(1);
  });

  test('file browser has body container', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator('#fbBody')).toHaveCount(1);
  });
});

test.describe('Instance Details Modal', () => {
  test('details modal exists in DOM', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator(MODALS.details)).toHaveCount(1);
  });

  test('details modal has body container', async ({ cloudterm }) => {
    await expect(cloudterm.page.locator('.details-body')).toHaveCount(1);
  });
});
