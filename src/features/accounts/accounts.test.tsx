import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { pick } from '../../test/select';
import { AccountsPage } from './AccountsPage';
import { AccountSheet } from './AccountSheet';
import { netWorthOf, type AccountBalance } from './queries';

const useAccounts = vi.fn();
const create = vi.fn();
const update = vi.fn();

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useAccounts: () => useAccounts(),
    useCreateAccount: () => ({ mutateAsync: create, isPending: false }),
    useUpdateAccount: () => ({ mutateAsync: update, isPending: false }),
    useArchiveAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock('../../lib/profile', () => ({ useCurrency: () => 'USD' }));

function balance(over: Partial<AccountBalance>): AccountBalance {
  return {
    user_id: 'u1',
    account_id: 'a1',
    name: 'Everyday checking',
    type: 'checking',
    is_liability: false,
    sort_order: 0,
    archived_at: null,
    opening_balance_minor: 0,
    money_in_minor: 0,
    money_out_minor: 0,
    balance_minor: 0,
    ...over,
  };
}

const MINUS = '−';

beforeEach(() => {
  create.mockReset().mockResolvedValue({ id: 'new' });
  update.mockReset().mockResolvedValue({ id: 'a1' });
  useAccounts.mockReturnValue({ data: [], isPending: false, isError: false, isSuccess: true });
});

describe('netWorthOf', () => {
  it('sums by account type, so it matches net_worth_by_month', () => {
    const worth = netWorthOf([
      balance({ account_id: 'a', balance_minor: 285450 }),
      balance({ account_id: 'b', balance_minor: 50000 }),
      balance({ account_id: 'c', type: 'credit_card', is_liability: true, balance_minor: -31000 }),
      balance({ account_id: 'd', balance_minor: 999, archived_at: '2026-01-01T00:00:00Z' }),
    ]);
    expect(worth).toEqual({ assets: 335450, liabilities: -31000, net: 304450 });
  });

  it('keeps an overpaid card on the liability side', () => {
    const worth = netWorthOf([balance({ type: 'credit_card', is_liability: true, balance_minor: 2500 })]);
    expect(worth).toEqual({ assets: 0, liabilities: 2500, net: 2500 });
  });
});

describe('AccountsPage', () => {
  it('invites a first account when there are none', () => {
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    expect(screen.getByText('No accounts yet')).toBeInTheDocument();
  });

  it('shows each balance and the net worth', () => {
    useAccounts.mockReturnValue({
      data: [
        balance({ account_id: 'a', name: 'Everyday checking', balance_minor: 285450 }),
        balance({ account_id: 'c', name: 'Blue card', type: 'credit_card', is_liability: true, balance_minor: -31000 }),
      ],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);

    // Each amount renders twice on purpose: the printed form, and a spoken
    // form for screen readers ("minus $310.00").
    expect(screen.getAllByText('$2,854.50').length).toBeGreaterThan(0);
    expect(screen.getAllByText(`${MINUS}$310.00`).length).toBeGreaterThan(0);
    expect(screen.getAllByText('minus $310.00').length).toBeGreaterThan(0);
    // 285450 − 31000 = 254450
    expect(screen.getAllByText('$2,544.50').length).toBeGreaterThan(0);
    expect(screen.getByText('Credit card')).toBeInTheDocument();
    expect(screen.getByText('Checking')).toBeInTheDocument();
  });

  it('keeps archived accounts out of the main list', () => {
    useAccounts.mockReturnValue({
      data: [balance({ account_id: 'z', name: 'Old savings', archived_at: '2026-01-01T00:00:00Z' })],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    expect(screen.getByText('1 archived')).toBeInTheDocument();
  });
});

describe('AccountSheet', () => {
  it('will not save without a name, and says so', async () => {
    render(<AccountSheet onClose={vi.fn()} />);
    expect(screen.getByText('Give the account a name.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an amount it would have to round', async () => {
    render(<AccountSheet onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Everyday checking');
    await userEvent.type(screen.getByLabelText('Balance today'), '10.005');
    expect(await screen.findByText(/at most 2 decimal places/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(create).not.toHaveBeenCalled();
  });

  it('stores the balance as integer minor units', async () => {
    const onClose = vi.fn();
    render(<AccountSheet onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Everyday checking');
    await userEvent.type(screen.getByLabelText('Balance today'), '1,234.50');
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ opening_balance_minor: 123450, type: 'checking' }));
  });

  it('keeps what you owe on a card as a negative balance', async () => {
    render(<AccountSheet onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Blue card');
    await pick('Account type', 'Credit card');
    await userEvent.type(screen.getByLabelText('Amount owed'), '310');
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ opening_balance_minor: -31000 }));
  });
});
