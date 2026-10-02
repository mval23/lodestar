import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { TourProvider, hasSeenTour, useTour } from './Tour';
import { TOUR_STEPS } from './steps';
import type { TourProgress } from './progress';

const progress = vi.fn<() => TourProgress>();
vi.mock('./progress', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./progress')>();
  return { ...actual, useTourProgress: () => progress() };
});
const createCategory = vi.fn();
vi.mock('../categories/queries', () => ({
  useCreateCategory: () => ({ mutateAsync: createCategory }),
}));

const NOTHING_YET: TourProgress = {
  accounts: 0,
  categories: 0,
  expenseCategories: 0,
  bills: 0,
  budgets: 0,
  goals: 0,
  hasTransactions: false,
  monthLabel: 'October 2026',
  existing: new Set(),
};

function Where() {
  const { pathname } = useLocation();
  const tour = useTour();
  return (
    <>
      <p>At {pathname}</p>
      <button type="button" onClick={tour.start}>
        Start the tour
      </button>
    </>
  );
}

function show(path = '/settings') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <TourProvider>
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </TourProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  progress.mockReturnValue(NOTHING_YET);
  createCategory.mockReset().mockResolvedValue({});
});

describe('the tour', () => {
  it('sets things up in the order they’re needed, then shows the rest', () => {
    expect(TOUR_STEPS.map((step) => [step.id, step.path])).toEqual([
      ['welcome', '/'],
      ['accounts', '/accounts'],
      ['categories', '/categories'],
      ['bills', '/bills'],
      ['budgets', '/budgets'],
      ['goals', '/goals'],
      ['expense', '/activity'],
      ['more', '/'],
      ['done', '/'],
    ]);
  });

  it('opens on the Overview and steps on to each page', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Start the tour' }));

    expect(await screen.findByRole('dialog', { name: 'Welcome to Lodestar' })).toBeInTheDocument();
    expect(screen.getByText('At /')).toBeInTheDocument();
    expect(screen.getByText(`1 of ${TOUR_STEPS.length}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('dialog', { name: 'Add your accounts' })).toBeInTheDocument();
    expect(screen.getByText('At /accounts')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('dialog', { name: 'Welcome to Lodestar' })).toBeInTheDocument();
  });

  it('offers Skip until a step is done, then says what was done and offers Next', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Start the tour' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await screen.findByRole('dialog', { name: 'Add your accounts' });
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();

    progress.mockReturnValue({ ...NOTHING_YET, accounts: 2 });
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByText('2 accounts added. Add another, or go on.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('adds a starter category with one tap, and marks the ones already there', async () => {
    progress.mockReturnValue({ ...NOTHING_YET, accounts: 1, existing: new Set(['expense:groceries']) });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Start the tour' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await screen.findByRole('dialog', { name: 'Name what money is for' });

    expect(screen.getByRole('button', { name: 'Groceries' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Housing' }));
    expect(createCategory).toHaveBeenCalledWith({ kind: 'expense', name: 'Housing' });
  });

  it('remembers it was shown from the moment it starts, and ends with Escape or End tour', async () => {
    show();
    expect(hasSeenTour()).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Start the tour' }));
    await screen.findByRole('dialog', { name: 'Welcome to Lodestar' });
    expect(hasSeenTour()).toBe(true);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Start the tour' }));
    await userEvent.click(await screen.findByRole('button', { name: 'End tour' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
