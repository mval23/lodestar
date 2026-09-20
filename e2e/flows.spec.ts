import { emptyTables, expect, signIn, stubSupabase, test, withData } from './fixtures';

// The journeys that matter, driven through a real browser against the
// production build, with the production security headers in force.

test.describe('signed out', () => {
  test('a visitor is asked to sign in, and told plainly when it fails', async ({ page }) => {
    await stubSupabase(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.getByLabel('Email').fill('synthetic@example.test');
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('That email and password don’t match an account.')).toBeVisible();
  });

  test('a protected page sends you to sign in, and remembers where you were going', async ({ page }) => {
    await stubSupabase(page);
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('next')).toBe('/settings');
  });

  test('an expired email link says so, instead of a blank page', async ({ page }) => {
    await stubSupabase(page);
    await page.goto('/auth/confirm?error=access_denied&error_code=otp_expired');

    await expect(page.getByRole('heading', { name: 'This link didn’t work' })).toBeVisible();
    await expect(page.getByText(/expired or was already used/)).toBeVisible();
  });
});

test.describe('first run', () => {
  test('asks for a currency, then the first account', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: emptyTables() });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Welcome to Lodestar' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Currency' })).toBeVisible();

    await page.getByRole('button', { name: 'Add your first account' }).click();
    await expect(page.getByRole('dialog', { name: 'Add account' })).toBeVisible();
    await expect(page.getByText('Give the account a name.')).toBeVisible();
  });
});

test.describe('the ledger', () => {
  test('records an expense, in integer minor units', async ({ page }) => {
    const writes: { table: string; body: unknown }[] = [];
    await signIn(page);
    await stubSupabase(page, { tables: withData(), onWrite: (table, body) => writes.push({ table, body }) });
    await page.goto('/activity');

    await page.getByRole('button', { name: 'Add transaction' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add transaction' });
    await expect(sheet).toBeVisible();

    await sheet.getByLabel('Amount').fill('45.50');
    await sheet.getByLabel('Description').fill('Market');
    await sheet.getByRole('button', { name: /^Account,/ }).click();
    await page.getByRole('option', { name: 'Everyday checking' }).click();
    await sheet.getByRole('button', { name: 'Add transaction' }).click();

    const insert = writes.find((write) => write.table === 'transactions');
    expect(insert?.body).toMatchObject({ kind: 'expense', amount_minor: 4550, from_account_id: 'acc-chk' });
  });

  test('a transfer asks for two accounts and carries no category', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/activity');

    await page.getByRole('button', { name: 'Add transaction' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add transaction' });
    await sheet.getByRole('radio', { name: 'Transfer' }).click();

    await expect(sheet.getByRole('button', { name: /^From,/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^To,/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Category,/ })).toHaveCount(0);
    await expect(sheet.getByText(/carries no category/)).toBeVisible();
  });

  test('refuses an amount it would have to round', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/activity');

    await page.getByRole('button', { name: 'Add transaction' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add transaction' });
    await sheet.getByLabel('Amount').fill('10.005');
    await expect(sheet.getByText('Enter at most 2 decimal places.')).toBeVisible();
  });

  test('filters live in the URL, so a view survives a reload', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/activity');

    await page.getByRole('button', { name: /^Kind,/ }).click();
    await page.getByRole('option', { name: 'Expenses' }).click();

    await expect(page).toHaveURL(/kind=expense/);
    await page.reload();
    await expect(page.getByRole('button', { name: /^Kind, Expenses/ })).toBeVisible();
  });
});

test.describe('the money', () => {
  test('shows balances with a true minus sign, never a hyphen', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/accounts');

    await expect(page.getByText('$2,854.50').first()).toBeVisible();
    // 285450 − 31000 = 254450
    await expect(page.getByText('$2,544.50').first()).toBeVisible();

    const card = page.getByText('−$310.00').first();
    await expect(card).toBeVisible();
    await expect(page.getByText('-$310.00')).toHaveCount(0);
  });

  test('shows an overspent budget as "Over plan by"', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/budgets');

    await expect(page.getByText(/Over plan by/)).toBeVisible();
    await expect(page.getByText('$55.50').first()).toBeVisible();
  });

  test('offers every chart as a table', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/reports');

    await expect(page.getByRole('img', { name: /Money in and out/ })).toBeVisible();
    await page.getByRole('button', { name: 'Show as table' }).first().click();
    await expect(page.getByRole('table').first()).toBeVisible();
    await expect(page.getByRole('img', { name: /Money in and out/ })).toHaveCount(0);
  });

  test('marks a bill paid in one step, and says when it is next due', async ({ page }) => {
    const writes: string[] = [];
    await signIn(page);
    await stubSupabase(page, { tables: withData(), onWrite: (table) => writes.push(table) });
    await page.goto('/bills');

    await page.getByRole('button', { name: 'Mark as paid' }).click();
    await expect(page.getByText(/Recorded\. Next due/)).toBeVisible();
    expect(writes).toContain('rpc:mark_bill_paid');
  });
});

test.describe('import and export', () => {
  test('reads a CSV, maps its columns and shows every row before saving', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/import-export');

    await page.getByLabel('Choose a file').setInputFiles({
      name: 'statement.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'Fecha,Concepto,Valor\n19/09/2026,Market,-45.50\n20/09/2026,Salary,2500.00\n31/02/2026,Impossible,-10.00\n',
      ),
    });

    // The header names are matched without help, in Spanish as in English.
    await expect(page.getByText('3 rows read. Nothing is saved yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Date, Fecha/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Amount, Valor/ })).toBeVisible();

    await page.getByRole('button', { name: /^Account, Choose an account/ }).click();
    await page.getByRole('option', { name: 'Everyday checking' }).click();

    // The impossible date is named, not silently dropped.
    await expect(page.getByText(/1 row can’t be read/)).toBeVisible();
    await expect(page.getByText(/Line 4/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import 2 rows' })).toBeVisible();
  });

  test('export asks for the password first', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/import-export');

    const button = page.getByRole('button', { name: 'Export all data' });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await page.getByLabel('Password').fill('synthetic-password');
    await expect(button).not.toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('the shell', () => {
  test('every page in the sidebar loads', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'The phone has a tab bar instead of a sidebar.');

    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/');

    for (const [name, heading] of [
      ['Activity', 'Activity'],
      ['Accounts', 'Accounts'],
      ['Budgets', 'Budgets'],
      ['Bills', 'Bills'],
      ['Goals', 'Goals'],
      ['Reports', 'Reports'],
      ['Import & export', 'Import & export'],
      ['Settings', 'Settings'],
    ] as const) {
      await page.getByRole('link', { name, exact: true }).first().click();
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    }
  });

  test('the phone tab bar reaches the main screens', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The tab bar is the phone layout.');

    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/');

    const tabs = page.getByRole('navigation', { name: 'Tabs' });
    for (const [name, heading] of [
      ['Activity', 'Activity'],
      ['Budgets', 'Budgets'],
      ['Goals', 'Goals'],
      ['Overview', 'Overview'],
    ] as const) {
      await tabs.getByRole('link', { name }).click();
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    }
  });

  test('an unknown address explains itself', async ({ page }) => {
    await signIn(page);
    await stubSupabase(page, { tables: withData() });
    await page.goto('/nowhere');
    await expect(page.getByText('This page doesn’t exist')).toBeVisible();
  });
});
