import { safeNextPath } from './redirect';

describe('safeNextPath', () => {
  it.each([
    ['/settings', '/settings'],
    ['/activity?q=rent#top', '/activity?q=rent#top'],
    ['/budgets/2026-09', '/budgets/2026-09'],
  ])('keeps the app path %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each([
    [null],
    [''],
    ['https://evil.example/'],
    ['//evil.example/path'],
    ['/\\evil.example'],
    ['\\\\evil.example'],
    ['javascript:alert(1)'],
    ['settings'],
    ['/\t/evil.example'],
    ['/sign-in'],
    ['/reset-password'],
    ['/auth/confirm?token_hash=x&type=email'],
  ])('falls back for %s', (raw) => {
    expect(safeNextPath(raw)).toBe('/');
  });

  it('uses the given fallback', () => {
    expect(safeNextPath('//x', '/settings')).toBe('/settings');
  });
});
