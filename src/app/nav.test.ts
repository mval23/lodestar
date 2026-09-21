import { navOwnerOf } from './nav';

describe('navOwnerOf', () => {
  it('lights the list a detail page belongs to when the address does not nest', () => {
    // Categories are managed on Budgets, and a month is reached from Reports.
    expect(navOwnerOf('/categories/0a8f7b2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b')).toBe('/budgets');
    expect(navOwnerOf('/months/2026-09')).toBe('/reports');
  });

  it('leaves the rest to the router, which matches nested paths itself', () => {
    // /accounts/:id already lights Accounts, and /budgets/:month lights Budgets.
    expect(navOwnerOf('/accounts/0a8f7b2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b')).toBeNull();
    expect(navOwnerOf('/budgets/2026-09')).toBeNull();
    expect(navOwnerOf('/')).toBeNull();
  });

  it('does not light a list for a page that merely starts with the same letters', () => {
    expect(navOwnerOf('/monthsomething')).toBeNull();
  });
});
