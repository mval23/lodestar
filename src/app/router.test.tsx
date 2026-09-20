import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './router';
import { AuthProvider } from './AuthProvider';

const verifyOtp = vi.fn();
const getSession = vi.fn();
const onAuthStateChange = vi.fn();

vi.mock('../lib/supabase', () => ({
  db: () => ({ auth: { verifyOtp, getSession, onAuthStateChange, signInWithPassword: vi.fn() } }),
}));

// Exercises the real route tree, which is where a self-redirect loop hides:
// the pages themselves render fine in isolation.
function renderRoute(path: string) {
  window.history.replaceState({}, '', path);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  verifyOtp.mockReset().mockReturnValue(new Promise(() => {})); // stays pending
  getSession.mockReset().mockResolvedValue({ data: { session: null } });
  onAuthStateChange.mockReset().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

describe('routes', () => {
  it('renders the confirm page for an emailed link instead of looping', async () => {
    renderRoute('/auth/confirm?token_hash=pkce_abc&type=email');
    expect(await screen.findByText('Checking your link…')).toBeInTheDocument();
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'pkce_abc', type: 'email' });
  });

  it('forwards a link that landed on the site root', async () => {
    renderRoute('/?token_hash=pkce_abc&type=recovery');
    expect(await screen.findByText('Checking your link…')).toBeInTheDocument();
  });

  it('sends a signed-out visitor from a protected page to sign in', async () => {
    renderRoute('/settings');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows the sign-in page', async () => {
    renderRoute('/sign-in');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
