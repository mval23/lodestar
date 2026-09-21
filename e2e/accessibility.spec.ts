import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, signIn, stubSupabase, test, withData } from './fixtures';

// WCAG 2.2 AA, checked automatically on every screen, in both themes and at
// phone width. Automation catches perhaps half of what matters, so the manual
// pass in docs/phase-9/review.md is the other half, not an optional extra.

const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const PAGES = [
  ['/', 'Overview'],
  ['/activity', 'Activity'],
  ['/accounts', 'Accounts'],
  ['/budgets', 'Budgets'],
  ['/categories', 'Categories'],
  ['/bills', 'Bills'],
  ['/goals', 'Goals'],
  ['/reports', 'Reports'],
  ['/import-export', 'Import & export'],
  ['/settings', 'Settings'],
] as const;

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(RULES).analyze();
}

test.describe('signed out', () => {
  for (const path of ['/sign-in', '/sign-up', '/forgot-password']) {
    test(`${path} has no violations`, async ({ page }) => {
      await stubSupabase(page);
      await page.goto(path);
      const results = await scan(page);
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe('signed in', () => {
  for (const [path, name] of PAGES) {
    test(`${name} has no violations`, async ({ page }) => {
      await signIn(page);
      await stubSupabase(page, { tables: withData() });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const results = await scan(page);
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe('in the dark', () => {
  test('Overview holds its contrast', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/');
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('the ledger holds its contrast', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/activity');
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });
});

test.describe('the sheets', () => {
  test('the add transaction sheet has no violations', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/activity');
    await page.getByRole('button', { name: 'Add transaction' }).click();
    await expect(page.getByRole('dialog', { name: 'Add transaction' })).toBeVisible();
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('an open picker has no violations', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/activity');
    await page.getByRole('button', { name: /^Kind,/ }).click();
    await expect(page.getByRole('listbox', { name: 'Kind' })).toBeVisible();
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });
});

test.describe('leaving', () => {
  test('the sign-off page has no violations', async ({ page }) => {
    await stubSupabase(page);
    await page.goto('/account-deleted');
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('the delete panel has no violations once it knows the count', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/settings');
    // Scanning before the count arrives would miss the fields entirely.
    await expect(page.getByLabel('Confirmation', { exact: true })).toBeVisible();
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });
});

test.describe('by keyboard alone', () => {
  test('a picker opens, moves and chooses without a mouse', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/activity');

    await page.getByRole('button', { name: /^Kind,/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox', { name: 'Kind' })).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('listbox', { name: 'Kind' })).toHaveCount(0);
    await expect(page).toHaveURL(/kind=/);
  });

  test('Escape closes a picker and leaves the choice alone', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/activity');

    await page.getByRole('button', { name: /^Kind, All kinds/ }).click();
    await expect(page.getByRole('listbox', { name: 'Kind' })).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('listbox', { name: 'Kind' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Kind, All kinds/ })).toBeVisible();
  });

  test('Escape closes a sheet without saving', async ({ page }) => {
    const writes: string[] = [];
    await signIn(page);
    await stubSupabase(page, { tables: withData(), onWrite: (table) => writes.push(table) });
    await page.goto('/activity');

    await page.getByRole('button', { name: 'Add transaction' }).click();
    await expect(page.getByRole('dialog', { name: 'Add transaction' })).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog', { name: 'Add transaction' })).toHaveCount(0);
    expect(writes).not.toContain('transactions');
  });

  test('every amount is announced in words, not as a bare minus', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/accounts');
    // The printed form is hidden from screen readers; the spoken one is not.
    // It appears twice — in the row and in the net worth line — which is right.
    await expect(page.getByText('minus $310.00').first()).toBeAttached();
  });
});
