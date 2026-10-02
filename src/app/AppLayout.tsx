import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router';
import { Settings } from 'lucide-react';
import { Wordmark } from '../ui/Logo';
import { SIDEBAR_FOOT, SIDEBAR_MAIN, TAB_BAR, navOwnerOf, tabOwnerOf, type NavItem } from './nav';

// Whether a nav item is lit: its own path matches (nested paths included,
// except for the Overview at "/"), or the page belongs to it (nav.ts).
// NavLink can't do the second: it only ever sets aria-current when its own
// path matches, so an owned page such as /categories lit nothing.
function useLit(to: string, owned: boolean): boolean {
  const match = useMatch({ path: to, end: to === '/' });
  return owned || match !== null;
}

function SidebarLink({ item, owned, collapsed }: { item: NavItem; owned: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  const lit = useLit(item.to, owned);
  return (
    <li>
      <Link
        to={item.to}
        className="nav-link"
        aria-current={lit ? 'page' : undefined}
        // Collapsed, the label is hidden from sight but not from a screen
        // reader; the tooltip gives it back to a pointer.
        title={collapsed ? item.label : undefined}
      >
        <Icon strokeWidth={1.75} aria-hidden />
        <span className="nav-label">{item.label}</span>
      </Link>
    </li>
  );
}

// The sidebar's open or closed state is a per-browser convenience, so it
// lives in localStorage, which can be missing or refuse (a private window).
const SIDEBAR_KEY = 'lodestar.sidebar';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'open');
  } catch {
    // Nothing to do: the choice just won't outlive the tab.
  }
}

function TabLink({ item, owned }: { item: NavItem; owned: boolean }) {
  const Icon = item.icon;
  const lit = useLit(item.to, owned);
  return (
    <Link to={item.to} className="tab-link" aria-current={lit ? 'page' : undefined}>
      <Icon strokeWidth={1.75} aria-hidden />
      {item.label}
    </Link>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  const owner = navOwnerOf(pathname);
  const tabOwner = tabOwnerOf(pathname);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = () => {
    setCollapsed((current) => {
      writeCollapsed(!current);
      return !current;
    });
  };

  return (
    <div className={collapsed ? 'shell shell-collapsed' : 'shell'}>
      {/* A click on the sidebar's empty space opens or closes it; a click on
          a link or button keeps its own meaning. Empty space can't be reached
          by keyboard, so the same switch is also a button, shown only when it
          has keyboard focus. */}
      <nav
        className="sidebar"
        aria-label="Main"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a, button')) return;
          toggle();
        }}
      >
        <button type="button" className="sidebar-toggle" aria-expanded={!collapsed} onClick={toggle}>
          {collapsed ? 'Expand the menu' : 'Collapse the menu'}
        </button>
        <Wordmark />
        <ul className="nav-list">
          {SIDEBAR_MAIN.map((item) => (
            <SidebarLink key={item.to} item={item} owned={owner === item.to} collapsed={collapsed} />
          ))}
        </ul>
        <div className="sidebar-spacer" />
        <ul className="nav-list">
          {SIDEBAR_FOOT.map((item) => (
            <SidebarLink key={item.to} item={item} owned={owner === item.to} collapsed={collapsed} />
          ))}
        </ul>
      </nav>

      <header className="mobile-bar">
        <Wordmark />
        <NavLink to="/settings" className="icon-link" aria-label="Settings">
          <Settings strokeWidth={1.75} aria-hidden />
        </NavLink>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <nav className="tab-bar" aria-label="Tabs">
        {TAB_BAR.map((item) => (
          <TabLink key={item.to} item={item} owned={tabOwner === item.to} />
        ))}
      </nav>
    </div>
  );
}
