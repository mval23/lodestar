import {
  ArrowDownUp,
  ArrowLeftRight,
  CalendarClock,
  ChartColumn,
  ChartPie,
  Flag,
  LayoutGrid,
  Settings,
  SquareStack,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = { to: string; label: string; icon: LucideIcon };

// Desktop sidebar order and mobile tab bar are fixed by brand/BRAND.md and CLAUDE.md.
export const SIDEBAR_MAIN: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutGrid },
  { to: '/activity', label: 'Activity', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Accounts', icon: SquareStack },
  { to: '/budgets', label: 'Budgets', icon: ChartPie },
  { to: '/bills', label: 'Bills', icon: CalendarClock },
  { to: '/goals', label: 'Goals', icon: Flag },
  { to: '/reports', label: 'Reports', icon: ChartColumn },
];

export const SIDEBAR_FOOT: NavItem[] = [
  { to: '/import-export', label: 'Import & export', icon: ArrowDownUp },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// A detail page is somewhere you arrive from, so it keeps its list's item
// lit. Most nest under their list (/accounts/:id), but categories sit with
// Budgets and a month is reached from Reports.
const OWNED_BY: [prefix: string, owner: string][] = [
  ['/categories', '/budgets'],
  ['/months', '/reports'],
];

export function navOwnerOf(pathname: string): string | null {
  return OWNED_BY.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'))?.[1] ?? null;
}

// The tab bar has four places, so every other screen lives under one of them
// and lights it: Bills and Categories are reached from Budgets, and Accounts,
// Reports, a month and Import & export from the Overview. Settings has its
// own button in the top bar and lights no tab.
const TAB_OWNED_BY: [prefix: string, owner: string][] = [
  ['/bills', '/budgets'],
  ['/categories', '/budgets'],
  ['/accounts', '/'],
  ['/reports', '/'],
  ['/months', '/'],
  ['/import-export', '/'],
];

export function tabOwnerOf(pathname: string): string | null {
  return TAB_OWNED_BY.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'))?.[1] ?? null;
}

export const TAB_BAR: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutGrid },
  { to: '/activity', label: 'Activity', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', icon: ChartPie },
  { to: '/goals', label: 'Goals', icon: Flag },
];
