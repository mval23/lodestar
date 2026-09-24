import { signIn, stubSupabase, test } from '../../e2e/fixtures';
import { readmeTables } from './data';

// The README's screenshots: the production build, driven through a real
// browser against the stubbed Supabase and the synthetic person in data.ts.
// Run with `npm run readme:shots`; the images land in docs/readme/.

const out = (name: string) => `docs/readme/${name}.png`;

const pages = [
  ['overview', '/'],
  ['activity', '/activity'],
  ['accounts', '/accounts'],
  ['budgets', '/budgets'],
  ['bills', '/bills'],
  ['goals', '/goals'],
  ['reports', '/reports'],
] as const;

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });

    for (const [name, path] of pages) {
      test(name, async ({ page }, info) => {
        // Only the overview is shown in both themes and on a phone.
        const phone = info.project.name === 'phone';
        if ((scheme === 'dark' || phone) && name !== 'overview') test.skip();

        await signIn(page);
        await stubSupabase(page, { tables: readmeTables() });
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await page.getByRole('main').getByRole('heading').first().waitFor();
        // Let the entrance motion settle.
        await page.waitForTimeout(600);
        const suffix = `${phone ? '-phone' : ''}${scheme === 'dark' ? '-dark' : ''}`;
        await page.screenshot({ path: out(`${name}${suffix}`) });
      });
    }
  });
}
