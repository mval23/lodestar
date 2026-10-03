import { MONTHS, accounts, balanceAt, goalAccounts, monthly, netWorth, recurring, tx } from './data.mjs';

// The mockups are only worth showing if their figures hold together the way
// Lodestar's own would. These are the same rules the database enforces.

describe('the mockup dataset', () => {
  it('stores whole minor units above zero', () => {
    for (const t of tx) {
      expect(Number.isInteger(t.amount)).toBe(true);
      expect(t.amount).toBeGreaterThan(0);
    }
  });

  it('keeps each kind to its direction, and transfers without a category', () => {
    for (const t of tx) {
      if (t.kind === 'expense') expect([t.from !== null, t.to]).toEqual([true, null]);
      if (t.kind === 'income') expect([t.from, t.to !== null]).toEqual([null, true]);
      if (t.kind === 'transfer') {
        expect(t.from).not.toBe(t.to);
        expect(t.category).toBeNull();
      }
    }
  });

  it('gives every goal its own fund account', () => {
    expect(goalAccounts.size).toBe(4);
    for (const id of goalAccounts) expect(accounts.some((a) => a.id === id)).toBe(true);
  });

  it('links bill payments only to bills that exist', () => {
    const ids = new Set(recurring.map((r) => r.id));
    for (const t of tx.filter((t) => t.recurringId)) expect(ids.has(t.recurringId)).toBe(true);
  });

  it('closes each account at opening + money in − money out', () => {
    const last = MONTHS.length - 1;
    for (const a of accounts) {
      const moneyIn = tx.filter((t) => t.to === a.id).reduce((s, t) => s + t.amount, 0);
      const moneyOut = tx.filter((t) => t.from === a.id).reduce((s, t) => s + t.amount, 0);
      expect(balanceAt(a.id, last)).toBe(a.opening + moneyIn - moneyOut);
    }
  });

  it('moves net worth only by net cash flow, since transfers stay inside it', () => {
    for (const { i } of MONTHS.slice(1)) {
      expect(netWorth[i].net - netWorth[i - 1].net).toBe(monthly[i].net);
    }
  });
});
