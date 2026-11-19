import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { addMonths, monthStartInZone } from '../../lib/dates';
import { pick } from '../../test/select';
import { AccountsPage } from './AccountsPage';
import { AccountSheet } from './AccountSheet';
import { netWorthOf, type AccountBalance } from './queries';

const useAccounts = vi.fn();
const create = vi.fn();
const update = vi.fn();
const setFavorite = vi.fn();
const closings = vi.fn();
const netWorth = vi.fn();
const goals = vi.fn();

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    useAccounts: () => useAccounts(),
    useCreateAccount: () => ({ mutateAsync: create, isPending: false }),
    useUpdateAccount: () => ({ mutateAsync: update, isPending: false }),
    useArchiveAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useSetFavorite: () => ({ mutate: setFavorite, isPending: false }),
  };
});
vi.mock('../overview/queries', () => ({ useAccountClosings: () => ({ data: closings() }) }));
vi.mock('../reports/queries', () => ({ useNetWorth: () => ({ data: netWorth() }) }));
vi.mock('../goals/queries', () => ({ useGoals: () => ({ data: goals() }) }));

vi.mock('../../lib/profile', () => ({ useCurrency: () => 'USD', useProfile: () => ({ data: { timezone: 'UTC' } }) }));

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
    include_in_net_worth: true,
    is_favorite: false,
    ...over,
  };
}

const MINUS = '−';

beforeEach(() => {
  create.mockReset().mockResolvedValue({ id: 'new' });
  update.mockReset().mockResolvedValue({ id: 'a1' });
  useAccounts.mockReturnValue({ data: [], isPending: false, isError: false, isSuccess: true });
  setFavorite.mockReset();
  closings.mockReturnValue([]);
  netWorth.mockReturnValue([]);
  goals.mockReturnValue([]);
});

// This month and last, as the page works them out from the profile's zone.
const THIS_MONTH = monthStartInZone('UTC');
const LAST_MONTH = addMonths(THIS_MONTH, -1);
const shown = (rows: AccountBalance[]) =>
  useAccounts.mockReturnValue({ data: rows, isPending: false, isError: false, isSuccess: true });

describe('netWorthOf', () => {
  it('sums by account type, so it matches net_worth_by_month', () => {
    const worth = netWorthOf([
      balance({ account_id: 'a', balance_minor: 285450 }),
      balance({ account_id: 'b', balance_minor: 50000 }),
      balance({ account_id: 'c', type: 'credit_card', is_liability: true, balance_minor: -31000 }),
      balance({ account_id: 'd', balance_minor: 999, archived_at: '2026-01-01T00:00:00Z' }),
    ]);
    expect(worth).toEqual({ assets: 335450, liabilities: -31000, owed: 31000, net: 304450 });
  });

  it('leaves out an account the person keeps out of net worth, as net_worth_by_month does', () => {
    const worth = netWorthOf([
      balance({ account_id: 'a', balance_minor: 285450 }),
      balance({ account_id: 'h', balance_minor: 14800, include_in_net_worth: false }),
    ]);
    expect(worth).toEqual({ assets: 285450, liabilities: 0, owed: 0, net: 285450 });
  });

  it('keeps an overpaid card on the liability side', () => {
    const worth = netWorthOf([balance({ type: 'credit_card', is_liability: true, balance_minor: 2500 })]);
    expect(worth).toEqual({ assets: 0, liabilities: 2500, owed: -2500, net: 2500 });
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

  it('lists the accounts by group, each with its subtotal, and skips empty groups', () => {
    useAccounts.mockReturnValue({
      data: [
        balance({ account_id: 'a', name: 'Everyday checking', balance_minor: 285450 }),
        balance({ account_id: 'w', name: 'Wallet', type: 'cash', balance_minor: 4550 }),
        balance({ account_id: 's', name: 'Rainy day', type: 'savings', balance_minor: 100000 }),
        balance({ account_id: 'c', name: 'Blue card', type: 'credit_card', is_liability: true, balance_minor: -31000 }),
      ],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.filter((h) => /^(Cash|Savings|Investments|Owed to you|Cards and loans)/.test(h ?? ''))).toEqual([
      expect.stringMatching(/^Cash.*\$2,900\.00/),
      expect.stringMatching(/^Savings.*\$1,000\.00/),
      expect.stringMatching(/^Cards and loans.*\$310\.00/),
    ]);
    const cash = screen.getByRole('region', { name: /^Cash/ });
    expect(within(cash).getAllByRole('link').map((l) => l.textContent)).toEqual([
      expect.stringContaining('Everyday checking'),
      expect.stringContaining('Wallet'),
    ]);
  });

  // The two screens that show net worth drew it separately, and one of them
  // negated the liabilities while the other did not: "−$310.00 owed".
  it('states what is owed without a minus sign', () => {
    useAccounts.mockReturnValue({
      data: [
        balance({ account_id: 'a', balance_minor: 285450 }),
        balance({ account_id: 'c', type: 'credit_card', is_liability: true, balance_minor: -31000 }),
      ],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);

    const footnote = screen.getByText(/in assets/);
    expect(footnote.textContent).toContain('owed');
    expect(footnote.textContent).not.toContain(`${MINUS}$310.00`);
  });

  it('calls a card paid past zero credit, not a negative debt', () => {
    useAccounts.mockReturnValue({
      data: [balance({ account_id: 'c', type: 'credit_card', is_liability: true, balance_minor: 2500 })],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);

    const footnote = screen.getByText(/in assets/);
    expect(footnote.textContent).toContain('in credit');
    expect(footnote.textContent).not.toContain('owed');
  });

  it('says which accounts are not in net worth', () => {
    useAccounts.mockReturnValue({
      data: [balance({ account_id: 'h', name: 'Held for a friend', type: 'investment', include_in_net_worth: false })],
      isPending: false,
      isError: false,
      isSuccess: true,
    });
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    // Its group already says what it is, so the row only adds what is unusual.
    expect(screen.getByText('Not in net worth')).toBeInTheDocument();
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

describe('AccountsPage, favorites and movement', () => {
  it('stars an account with one tap, without opening it', async () => {
    shown([balance({ account_id: 'w', name: 'Wallet', type: 'cash', balance_minor: 4550 })]);
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    const star = screen.getByRole('button', { name: 'Favorite: Wallet' });
    expect(star).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(star);
    expect(setFavorite).toHaveBeenCalledWith({ id: 'w', favorite: true });
  });

  it('lists favorites first, and keeps them in their own group so its subtotal is whole', () => {
    shown([
      balance({ account_id: 'a', name: 'Everyday checking', balance_minor: 285450 }),
      balance({ account_id: 'w', name: 'Wallet', type: 'cash', balance_minor: 4550 }),
      balance({ account_id: 'c', name: 'Blue card', type: 'credit_card', is_liability: true, balance_minor: -31000, is_favorite: true }),
    ]);
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(1, 2)).toEqual(['Favorites']);
    const favorites = screen.getByRole('region', { name: 'Favorites' });
    expect(within(favorites).getAllByRole('link').map((l) => l.textContent)).toEqual([expect.stringContaining('Blue card')]);
    expect(within(favorites).getByRole('button', { name: 'Favorite: Blue card' })).toHaveAttribute('aria-pressed', 'true');
    const cards = screen.getByRole('region', { name: /^Cards and loans/ });
    expect(within(cards).getByRole('link', { name: /Blue card/ })).toBeInTheDocument();
  });

  it('shows how far each account and its group moved since last month ended, and its line', () => {
    shown([
      balance({ account_id: 'a', name: 'Everyday checking', balance_minor: 285450 }),
      balance({ account_id: 'w', name: 'Wallet', type: 'cash', balance_minor: 4550 }),
      balance({ account_id: 'n', name: 'New cash', type: 'cash', balance_minor: 1000 }),
    ]);
    closings.mockReturnValue([
      { account_id: 'a', month: addMonths(LAST_MONTH, -1), closing_balance_minor: 90000 },
      { account_id: 'a', month: LAST_MONTH, closing_balance_minor: 100000 },
      { account_id: 'a', month: THIS_MONTH, closing_balance_minor: 285450 },
      { account_id: 'w', month: LAST_MONTH, closing_balance_minor: 8050 },
      { account_id: 'w', month: THIS_MONTH, closing_balance_minor: 4550 },
      // Opened this month: there is no end of last month to compare with.
      { account_id: 'n', month: THIS_MONTH, closing_balance_minor: 1000 },
    ]);
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    const row = (name: string) => screen.getByRole('link', { name: new RegExp(name) });
    expect(row('Everyday checking').textContent).toMatch(/\+\$1,854\.50.* since/);
    expect(row('Wallet').textContent).toMatch(new RegExp(`${MINUS}\\$35\\.00.* since`));
    expect(row('New cash').textContent).not.toMatch(/since/);
    // 185450 − 3500, with the new account left out of the sum.
    expect(screen.getByRole('heading', { name: /^Cash/ }).textContent).toMatch(/\+\$1,819\.50.* since/);
    expect(within(row('Everyday checking')).getByRole('img', { name: /from \$900\.00 to \$2,854\.50/ })).toBeInTheDocument();
  });

  it('shows the goal an account funds and how far along it is', () => {
    shown([balance({ account_id: 's', name: 'Rainy day fund', type: 'savings', balance_minor: 500000 })]);
    goals.mockReturnValue([
      { goal_id: 'g', account_id: 's', name: 'Rainy day fund', target_minor: 1000000, archived_at: null, balance_minor: 500000 },
    ]);
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Rainy day fund/ }).textContent).toMatch(/Goal · 50% of \$10,000\.00/);
  });

  it('puts net worth beside its year, how far it moved, and where it sits', () => {
    shown([
      balance({ account_id: 'a', name: 'Everyday checking', balance_minor: 300000 }),
      balance({ account_id: 's', name: 'Rainy day fund', type: 'savings', balance_minor: 100000 }),
      balance({ account_id: 'c', name: 'Blue card', type: 'credit_card', is_liability: true, balance_minor: -50000 }),
    ]);
    netWorth.mockReturnValue([
      { month: LAST_MONTH, assets_minor: 0, liabilities_minor: 0, net_worth_minor: 320000 },
      { month: THIS_MONTH, assets_minor: 0, liabilities_minor: 0, net_worth_minor: 350000 },
    ]);
    const { container } = render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    expect(container.querySelector('.accounts-moved')?.textContent).toMatch(/\+\$300\.00.* since/);
    expect(screen.getByRole('img', { name: /Net worth over the last 2 months/ })).toBeInTheDocument();
    expect(screen.getByText('What you have')).toBeInTheDocument();
    expect(screen.getByText('What you owe')).toBeInTheDocument();
    expect(screen.getByText('Cash 75%')).toBeInTheDocument();
    expect(screen.getByText('Savings 25%')).toBeInTheDocument();
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

  it('counts a new account in net worth unless switched off, and says what switching off means', async () => {
    render(<AccountSheet onClose={vi.fn()} />);
    const toggle = screen.getByRole('switch', { name: 'Count in net worth' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.type(screen.getByLabelText('Name'), 'Held for a friend');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Left out of net worth, including its history/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ include_in_net_worth: false }));
  });

  it('shows an account left out of net worth as switched off, and can bring it back', async () => {
    const account = {
      id: 'a1',
      user_id: 'u1',
      name: 'Astro dollars',
      type: 'investment' as const,
      opening_balance_minor: 14800,
      opening_date: null,
      sort_order: 0,
      archived_at: null,
      source_ref: null,
      include_in_net_worth: false,
      is_favorite: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    render(<AccountSheet account={account} onClose={vi.fn()} />);
    const toggle = screen.getByRole('switch', { name: 'Count in net worth' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name: 'Save account' }));
    expect(update).toHaveBeenCalledWith({ id: 'a1', changes: expect.objectContaining({ include_in_net_worth: true }) });
  });
});
