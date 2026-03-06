import { test as base, expect, Page } from '@playwright/test';

/** Extended test fixture with CloudTerm helpers */
export const test = base.extend<{ cloudterm: CloudTermPage }>({
  cloudterm: async ({ page }, use) => {
    const ct = new CloudTermPage(page);
    await ct.goto();
    await use(ct);
  },
});

export { expect };

export class CloudTermPage {
  constructor(public page: Page) {}

  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  /** Open a modal by clicking its trigger button */
  async openModal(triggerId: string, modalId: string) {
    await this.page.click(triggerId);
    await this.page.waitForSelector(`${modalId}.show`, { timeout: 5000 });
  }

  /** Close a modal via its cancel/close button */
  async closeModal(modalId: string) {
    const modal = this.page.locator(modalId);
    // Find the close/cancel button — prefer the one with onclick that removes 'show',
    // or the last .modal-cancel (typically Close/Cancel is last in footer)
    const closeBtn = modal.locator('.modal-cancel[onclick*="remove"]');
    const cancelBtns = modal.locator('.modal-cancel');
    if (await closeBtn.count() > 0) {
      await closeBtn.first().click();
    } else if (await cancelBtns.count() > 0) {
      await cancelBtns.last().click();
    }
    await expect(modal).not.toHaveClass(/show/, { timeout: 3000 });
  }

  /** Check if a modal is visible */
  async isModalVisible(modalId: string): Promise<boolean> {
    const cls = await this.page.locator(modalId).getAttribute('class');
    return cls?.includes('show') ?? false;
  }

  /** Click a settings tab and wait for the pane to become active */
  async switchSettingsTab(tabName: string) {
    await this.page.click(`.settings-tab[data-tab="${tabName}"]`);
    await this.page.waitForSelector(`#settingsPane-${tabName}.active`, { timeout: 3000 });
  }

  /** Get toast message text */
  async getToastMessage(): Promise<string> {
    await this.page.waitForSelector('#toast.show', { timeout: 3000 });
    return (await this.page.textContent('#toastMsg')) || '';
  }

  /** Clear localStorage for clean test state */
  async clearLocalStorage() {
    await this.page.evaluate(() => localStorage.clear());
  }

  /** Set a localStorage value */
  async setLocalStorage(key: string, value: string) {
    await this.page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
  }

  /** Get a localStorage value */
  async getLocalStorage(key: string): Promise<string | null> {
    return this.page.evaluate((k) => localStorage.getItem(k), key);
  }

  /** Right-click on an element to trigger context menu */
  async rightClick(selector: string) {
    await this.page.click(selector, { button: 'right' });
  }

  /** Wait for an element to be visible */
  async waitVisible(selector: string, timeout = 3000) {
    await this.page.waitForSelector(selector, { state: 'visible', timeout });
  }

  /** Wait for an element to be hidden */
  async waitHidden(selector: string, timeout = 3000) {
    await this.page.waitForSelector(selector, { state: 'hidden', timeout });
  }
}
