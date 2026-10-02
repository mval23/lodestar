import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { SettingsPage } from './SettingsPage';

const signInWithPassword = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    auth: { signInWithPassword, updateUser, signOut },
    from: () => ({ select: () => Promise.resolve({ count: 2, error: null }) }),
  }),
}));
vi.mock('../../app/AuthProvider', () => ({
  useSession: () => ({ user: { email: 'synthetic@example.test' } }),
}));
// The profile form has tests of its own; these are about the page around it.
vi.mock('../../lib/profile', () => ({
  useProfile: () => ({ isPending: true, isError: false, data: undefined }),
}));

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  signInWithPassword.mockReset().mockResolvedValue({ error: null });
  updateUser.mockReset().mockResolvedValue({ error: null });
  signOut.mockReset().mockResolvedValue({ error: null });
});

describe('SettingsPage', () => {
  it('keeps the password and deletion forms closed until asked for', () => {
    show();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Confirmation')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Setup guide/ })).toHaveAttribute('href', '/welcome');
  });

  it('changes the password in a sheet, then closes it and says so', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: /Change password/ }));
    const sheet = within(screen.getByRole('dialog', { name: 'Change password' }));

    await userEvent.type(sheet.getByLabelText('Current'), 'old-synthetic-password');
    await userEvent.type(sheet.getByLabelText('New'), 'new-synthetic-password');
    await userEvent.type(sheet.getByLabelText('Confirm'), 'new-synthetic-password');
    await userEvent.click(sheet.getByRole('button', { name: 'Change password' }));

    expect(updateUser).toHaveBeenCalledWith({ password: 'new-synthetic-password' });
    expect(await screen.findByText('Your password is changed.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens deletion in a sheet of its own, with the count in the words to type', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: /Delete account/ }));
    const sheet = within(screen.getByRole('dialog', { name: 'Delete account' }));
    expect(await sheet.findByText(/To confirm, type/)).toHaveTextContent('Delete account and its 2 transactions');
  });

  it('signs out here, or everywhere', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    await userEvent.click(screen.getByRole('button', { name: /Sign out everywhere/ }));
    expect(signOut).toHaveBeenLastCalledWith({ scope: 'global' });
  });
});
