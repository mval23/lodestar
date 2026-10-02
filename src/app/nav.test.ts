import { navOwnerOf, tabOwnerOf } from './nav';

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

describe('tabOwnerOf', () => {
  it('lights the tab a phone reaches each other screen from', () => {
    expect(tabOwnerOf('/bills')).toBe('/budgets');
    expect(tabOwnerOf('/bills/0a8f7b2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b')).toBe('/budgets');
    expect(tabOwnerOf('/categories')).toBe('/budgets');
    expect(tabOwnerOf('/accounts')).toBe('/');
    expect(tabOwnerOf('/reports')).toBe('/');
    expect(tabOwnerOf('/months/2026-09')).toBe('/');
    expect(tabOwnerOf('/import-export')).toBe('/');
  });

  it('leaves the four tabs and Settings to the router', () => {
    expect(tabOwnerOf('/budgets/2026-09')).toBeNull();
    expect(tabOwnerOf('/goals')).toBeNull();
    expect(tabOwnerOf('/settings')).toBeNull();
    expect(tabOwnerOf('/billsomething')).toBeNull();
  });
});
