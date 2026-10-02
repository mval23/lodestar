import type { TourProgress } from './progress';

// The tour sets things up on the real pages, one at a time, in the order a
// new person needs them: currency, accounts, categories, bills, this month's
// plan, goals, the first expense, and then where everything else is. Each
// step opens its page and lights what to use there: the button that adds, or
// the fields to fill in, and the menu item that leads back to it later.
//
// Targets are data-tour attributes on the real elements; only the ones shown
// on this screen are lit, so the sidebar item lights on a wide screen and the
// tab or in-page link on a phone. What's lit on the page can be used; menu
// items are lit only to show where things live.
export type TourStep = {
  id: string;
  title: string;
  body: string;
  // Said instead of body on a phone, where some pages are reached another way.
  phoneBody?: string;
  // Said instead of body when none of the targets is on the screen.
  emptyBody?: string;
  path: string;
  targets: string[];
  // For a step that asks for something: what has been done so far, in words,
  // or null while there's nothing yet. The card offers Skip until then.
  progress?: (p: TourProgress) => string | null;
  // Common categories to add with one tap.
  starters?: boolean;
};

// "nav-<path>" marks every way to a page: the sidebar link, the tab, and on a
// phone the Overview's More rows and the Settings button in the top bar.
export const navTarget = (to: string) => `nav-${to}`;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Lodestar',
    body: 'Let’s set things up on the real pages, one at a time. Start here: choose your currency. Every account and amount uses it, and nothing is converted.',
    emptyBody: 'Here’s a walk through the pages, with a chance to add anything that’s missing as you go. End it whenever you like.',
    path: '/',
    targets: ['first-run'],
  },
  {
    id: 'accounts',
    title: 'Add your accounts',
    body: 'Add each account you want to keep track of, with what it holds today: checking, savings, cash, cards and loans. For a card or loan, enter what you owe.',
    phoneBody:
      'Add each account you want to keep track of, with what it holds today. For a card or loan, enter what you owe. Later, Accounts opens from the Overview.',
    path: '/accounts',
    targets: [navTarget('/accounts'), 'add-account'],
    progress: (p) =>
      p.accounts > 0 ? `${count(p.accounts, 'account', 'accounts')} added. Add another, or go on.` : null,
  },
  {
    id: 'categories',
    title: 'Name what money is for',
    body: 'A category is what money was spent on or came in from. Tap a few common ones below, or add your own. Later, they’re under Budgets.',
    path: '/categories',
    targets: [navTarget('/budgets'), 'add-category'],
    starters: true,
    progress: (p) => (p.categories > 0 ? `${count(p.categories, 'category', 'categories')} so far.` : null),
  },
  {
    id: 'bills',
    title: 'Add what comes round',
    body: 'Rent, phone, streaming: anything paid on a schedule. Lodestar shows when each is due, and Mark as paid records it for you.',
    phoneBody:
      'Rent, phone, streaming: anything paid on a schedule. Lodestar shows when each is due, and Mark as paid records it. Later, Bills opens from Budgets.',
    path: '/bills',
    targets: [navTarget('/bills'), 'add-bill'],
    progress: (p) => (p.bills > 0 ? `${count(p.bills, 'bill', 'bills')} set up. Add another, or go on.` : null),
  },
  {
    id: 'budgets',
    title: 'Plan this month',
    body: 'Type an amount beside each category you want to keep an eye on, and leave the rest blank. Next month, copy this plan with one tap.',
    emptyBody: 'A plan is made per spending category, and there aren’t any yet. Go back a step to add some, or skip this for now.',
    path: '/budgets',
    targets: [navTarget('/budgets'), 'budget-plan'],
    progress: (p) =>
      p.budgets > 0 ? `${count(p.budgets, 'category', 'categories')} planned for ${p.monthLabel}.` : null,
  },
  {
    id: 'goals',
    title: 'Save towards something',
    body: 'A goal keeps its money in an account of its own, such as a savings account. Whatever you move into that account counts towards it.',
    path: '/goals',
    targets: [navTarget('/goals'), 'add-goal'],
    progress: (p) => (p.goals > 0 ? `${count(p.goals, 'goal', 'goals')} set. Add another, or go on.` : null),
  },
  {
    id: 'expense',
    title: 'Record your first expense',
    body: 'Activity lists every transaction, newest first, with search and filters. Add something you spent recently; from now on, add them as they happen.',
    path: '/activity',
    targets: [navTarget('/activity'), 'add-transaction'],
    progress: (p) => (p.hasTransactions ? 'Your first transaction is in.' : null),
  },
  {
    id: 'more',
    title: 'Everything else',
    body: 'Reports show cash flow and net worth month by month. Import & export brings in a CSV from your bank, or takes all your data out. Settings holds your profile, password and this tour.',
    phoneBody:
      'Reports and Import & export are at the foot of the Overview: cash flow and net worth by month, and CSVs in and out. Settings, top right, holds your profile, password and this tour.',
    path: '/',
    targets: [navTarget('/reports'), navTarget('/import-export'), navTarget('/settings')],
  },
  {
    id: 'done',
    title: 'You’re set up',
    body: 'Your Overview shows where you stand: net worth, this month’s plan and what’s due. Anything you skipped is waiting on its page.',
    path: '/',
    targets: [],
  },
];
