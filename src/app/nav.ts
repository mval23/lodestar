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

export const TAB_BAR: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutGrid },
  { to: '/activity', label: 'Activity', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', icon: ChartPie },
  { to: '/goals', label: 'Goals', icon: Flag },
];
