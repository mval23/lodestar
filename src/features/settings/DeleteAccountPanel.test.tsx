import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { DeleteAccountPanel } from './DeleteAccountPanel';

const signInWithPassword = vi.fn();
const signOut = vi.fn();
const invoke = vi.fn();
const count = vi.fn();

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    auth: { signInWithPassword, signOut },
    functions: { invoke },
    from: () => ({ select: () => count() }),
  }),
}));

const EMAIL = 'synthetic@example.test';
const PHRASE = 'Delete account and its 318 transactions';

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/settings', element: <DeleteAccountPanel email={EMAIL} /> },
      { path: '/account-deleted', element: <p>Your account is deleted</p> },
    ],
    { initialEntries: ['/settings'] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function fill(phrase = PHRASE, password = 'synthetic-password') {
  await screen.findByLabelText('Confirmation');
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.type(screen.getByLabelText('Confirmation'), phrase);
}

beforeEach(() => {
  count.mockReset().mockResolvedValue({ count: 318, error: null });
  signInWithPassword.mockReset().mockResolvedValue({ error: null });
  signOut.mockReset().mockResolvedValue({ error: null });
  invoke.mockReset().mockResolvedValue({ data: { ok: true }, error: null });
});

describe('DeleteAccountPanel', () => {
  it('says what will go, and counts it', async () => {
    renderPanel();
    expect(await screen.findByText(/To confirm, type/)).toHaveTextContent(PHRASE);
    expect(screen.getByText(/accounts, transactions, categories, budgets, goals and bills/)).toBeInTheDocument();
    expect(screen.getByText(/Backups age out/)).toBeInTheDocument();
  });

  it('explains what is missing rather than deleting anything', async () => {
    renderPanel();
    await screen.findByText(/To confirm, type/);
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(await screen.findByText('Enter your password and type the confirmation exactly.')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('refuses a phrase that is close but not right', async () => {
    renderPanel();
    await fill('Delete account and its 317 transactions');
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(await screen.findByText('Enter your password and type the confirmation exactly.')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('asks for the password again when it is wrong, and deletes nothing', async () => {
    signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', status: 400 } });
    renderPanel();
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(await screen.findByText('That password isn’t right.')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('re-authenticates, deletes, then leaves the signed-in routes', async () => {
    renderPanel();
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    await waitFor(() => expect(screen.getByText('Your account is deleted')).toBeInTheDocument());
    expect(signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: 'synthetic-password' });
    expect(invoke).toHaveBeenCalledWith('delete-account', { method: 'POST' });
    // Signing out first would send them to sign in for an account that is gone.
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('says plainly that nothing was removed when the call fails', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ error: 'delete_failed' }), { status: 500 }) },
    });
    renderPanel();
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(await screen.findByText(/nothing was removed/)).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('offers nothing to confirm while the count is unknown', async () => {
    count.mockResolvedValue({ count: null, error: { message: 'no', code: '42501' } });
    renderPanel();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByLabelText('Confirmation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument();
  });
});
