import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { BudgetList } from './BudgetList';
import { totalsOf, type BudgetProgress } from './queries';

const useBudgets = vi.fn();
const setBudget = vi.fn();
const copyBudgets = vi.fn();

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useBudgets: () => useBudgets(),
    useSetBudget: () => ({ mutateAsync: setBudget, isPending: false }),
    useCopyBudgets: () => ({ mutateAsync: copyBudgets, isPending: false }),
  };
});

vi.mock('../categories/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../categories/queries')>();
  return {
    ...actual,
    useCategories: () => ({
      data: [
        { id: 'groceries', name: 'Groceries', kind: 'expense', group_id: 'g1', archived_at: null },
        { id: 'rent', name: 'Rent', kind: 'expense', group_id: 'g1', archived_at: null },
        { id: 'salary', name: 'Salary', kind: 'income', group_id: null, archived_at: null },
        { id: 'old', name: 'Old habit', kind: 'expense', group_id: null, archived_at: '2026-01-01T00:00:00Z' },
      ],
    }),
    useCategoryGroups: () => ({ data: [{ id: 'g1', name: 'Essentials' }] }),
  };
});

vi.mock('../../lib/profile', () => ({ useCurrency: () => 'USD', useProfile: () => ({ data: { timezone: 'UTC' } }) }));

function progress(over: Partial<BudgetProgress> = {}): BudgetProgress {
  const planned = over.planned_minor ?? 20000;
  const spent = over.spent_minor ?? 0;
  return {
    budget_id: 'b1',
    category_id: 'groceries',
    category_name: 'Groceries',
    group_id: 'g1',
    month: '2026-09-01',
    planned_minor: planned,
    spent_minor: spent,
    left_minor: planned - spent,
    ...over,
  };
}

// The month now lives in the address; the page owns it and hands it down.
function Harness() {
  const [month, setMonth] = useState('2026-09-01');
  return <BudgetList month={month} onMonth={setMonth} />;
}

function renderList() {
  return render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setBudget.mockReset().mockResolvedValue(undefined);
  copyBudgets.mockReset().mockResolvedValue(2);
  useBudgets.mockReturnValue({ data: [], isError: false });
});

describe('totalsOf', () => {
  it('adds up the month, and counts overspending separately', () => {
    const totals = totalsOf([
      progress({ planned_minor: 20000, spent_minor: 25550, left_minor: -5550 }),
      progress({ budget_id: 'b2', category_id: 'rent', planned_minor: 100000, spent_minor: 100000, left_minor: 0 }),
    ]);
    expect(totals).toEqual({ planned: 120000, spent: 125550, left: -5550, over: 5550 });
  });

  it('is all zeros when nothing is planned', () => {
    expect(totalsOf([])).toEqual({ planned: 0, spent: 0, left: 0, over: 0 });
  });
});

describe('BudgetList', () => {
  it('lists every expense category, planned or not, and leaves income out', () => {
    renderList();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Rent')).toBeInTheDocument();
    expect(screen.queryByText('Salary')).not.toBeInTheDocument();
    expect(screen.queryByText('Old habit')).not.toBeInTheDocument();
  });

  it('shows an overspent category as "Over plan by", never clamped at zero', () => {
    useBudgets.mockReturnValue({
      data: [progress({ planned_minor: 20000, spent_minor: 25550, left_minor: -5550 })],
      isError: false,
    });
    renderList();
    expect(screen.getByText(/Over plan by/)).toBeInTheDocument();
    expect(screen.getAllByText('$55.50').length).toBeGreaterThan(0);
  });

  it('shows what is left when under plan', () => {
    useBudgets.mockReturnValue({
      data: [progress({ planned_minor: 20000, spent_minor: 5000, left_minor: 15000 })],
      isError: false,
    });
    renderList();
    expect(screen.getByText(/left/)).toBeInTheDocument();
    expect(screen.getAllByText('$150.00').length).toBeGreaterThan(0);
  });

  it('saves a typed plan as integer minor units', async () => {
    renderList();
    const [field] = screen.getAllByPlaceholderText('No plan');
    await userEvent.type(field!, '400');
    await userEvent.tab();
    expect(setBudget).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'groceries', amountMinor: 40000, month: expect.stringMatching(/-01$/) }),
    );
  });

  it('clearing the field removes the plan, rather than planning zero', async () => {
    useBudgets.mockReturnValue({ data: [progress({ planned_minor: 40000 })], isError: false });
    renderList();
    const field = screen.getByDisplayValue('400.00');
    await userEvent.clear(field);
    await userEvent.tab();
    expect(setBudget).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: null, budgetId: 'b1' }));
  });

  it('refuses an amount it would have to round', async () => {
    renderList();
    const [field] = screen.getAllByPlaceholderText('No plan');
    await userEvent.type(field!, '10.005');
    await userEvent.tab();
    expect(setBudget).not.toHaveBeenCalled();
    expect(await screen.findByText(/at most 2 decimal places/)).toBeInTheDocument();
  });

  it('offers last month’s plan only while this month has none', async () => {
    renderList();
    await userEvent.click(screen.getByRole('button', { name: 'Copy last month’s plan' }));
    expect(copyBudgets).toHaveBeenCalled();
    expect(await screen.findByText(/2 plans copied/)).toBeInTheDocument();
  });

  it('hides the copy button once a plan exists', () => {
    useBudgets.mockReturnValue({ data: [progress()], isError: false });
    renderList();
    expect(screen.queryByRole('button', { name: 'Copy last month’s plan' })).not.toBeInTheDocument();
  });

  it('moves between months', async () => {
    renderList();
    const heading = screen.getByRole('heading', { level: 2 }).textContent;
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).not.toBe(heading);
  });
});
