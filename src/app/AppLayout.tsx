import { NavLink, Outlet, useLocation } from 'react-router';
import { Settings } from 'lucide-react';
import { Wordmark } from '../ui/Logo';
import { SIDEBAR_FOOT, SIDEBAR_MAIN, TAB_BAR, navOwnerOf, tabOwnerOf, type NavItem } from './nav';

function SidebarLink({ item, owned }: { item: NavItem; owned: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <NavLink
        to={item.to}
        end={item.to === '/'}
        className="nav-link"
        aria-current={owned ? 'page' : undefined}
      >
        <Icon strokeWidth={1.75} aria-hidden />
        {item.label}
      </NavLink>
    </li>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  const owner = navOwnerOf(pathname);
  const tabOwner = tabOwnerOf(pathname);

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <Wordmark />
        <ul className="nav-list">
          {SIDEBAR_MAIN.map((item) => (
            <SidebarLink key={item.to} item={item} owned={owner === item.to} />
          ))}
        </ul>
        <div className="sidebar-spacer" />
        <ul className="nav-list">
          {SIDEBAR_FOOT.map((item) => (
            <SidebarLink key={item.to} item={item} owned={owner === item.to} />
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
        {TAB_BAR.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="tab-link"
            aria-current={tabOwner === to ? 'page' : undefined}
          >
            <Icon strokeWidth={1.75} aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
