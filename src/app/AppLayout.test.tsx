import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppLayout } from './AppLayout';

function show() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<h1>Overview</h1>} />
          <Route path="/activity" element={<h1>Activity</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const shell = (container: HTMLElement) => container.querySelector('.shell')!;
// The phone tab bar has an Activity link too; these are the sidebar's.
const sidebar = () => within(screen.getByRole('navigation', { name: 'Main' }));

beforeEach(() => window.localStorage.clear());

describe('the collapsible sidebar', () => {
  it('opens and closes on a click in its empty space', async () => {
    const { container } = show();
    expect(shell(container)).not.toHaveClass('shell-collapsed');

    await userEvent.click(container.querySelector('.sidebar-spacer')!);
    expect(shell(container)).toHaveClass('shell-collapsed');

    await userEvent.click(container.querySelector('.sidebar-spacer')!);
    expect(shell(container)).not.toHaveClass('shell-collapsed');
  });

  it('leaves a click on a link to the link', async () => {
    const { container } = show();
    await userEvent.click(sidebar().getByRole('link', { name: 'Activity' }));
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    expect(shell(container)).not.toHaveClass('shell-collapsed');
  });

  // Empty space can't be reached by keyboard; a button can.
  it('can be closed and opened from the keyboard too', async () => {
    const { container } = show();
    const toggle = screen.getByRole('button', { name: 'Collapse the menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    toggle.focus();
    await userEvent.keyboard('{Enter}');
    expect(shell(container)).toHaveClass('shell-collapsed');
    expect(screen.getByRole('button', { name: 'Expand the menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  // Closed, the labels leave the screen but not the page, so every link
  // keeps its name.
  it('keeps each link named while closed', async () => {
    const { container } = show();
    await userEvent.click(container.querySelector('.sidebar-spacer')!);
    expect(sidebar().getByRole('link', { name: 'Activity' })).toHaveAttribute('title', 'Activity');
  });

  it('remembers the choice for the next visit', async () => {
    const first = show();
    await userEvent.click(first.container.querySelector('.sidebar-spacer')!);
    first.unmount();

    const { container } = show();
    expect(shell(container)).toHaveClass('shell-collapsed');
  });
});
