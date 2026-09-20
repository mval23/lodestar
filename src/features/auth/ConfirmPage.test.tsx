import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ConfirmPage, readLinkParams } from './ConfirmPage';

const verifyOtp = vi.fn();
const getSession = vi.fn();
const onAuthStateChange = vi.fn();

vi.mock('../../lib/supabase', () => ({
  db: () => ({ auth: { verifyOtp, getSession, onAuthStateChange } }),
}));

function renderAt(url: string) {
  // The page reads window.location, as Supabase's links land there.
  const { pathname, search, hash } = new URL(url, 'https://lodestar.test');
  window.history.replaceState({}, '', pathname + search + hash);
  const router = createMemoryRouter(
    [
      { path: '/auth/confirm', element: <ConfirmPage /> },
      { path: '/', element: <p>Overview page</p> },
      { path: '/reset-password', element: <p>Choose a new password</p> },
    ],
    { initialEntries: [pathname + search] },
  );
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  verifyOtp.mockReset().mockResolvedValue({ error: null });
  getSession.mockReset().mockResolvedValue({ data: { session: null } });
  onAuthStateChange.mockReset().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

describe('readLinkParams', () => {
  it('reads Lodestar template links', () => {
    expect(readLinkParams('?token_hash=abc&type=recovery', '')).toMatchObject({ tokenHash: 'abc', type: 'recovery' });
  });

  it('reads the code of a default-template link', () => {
    expect(readLinkParams('?code=xyz', '')).toMatchObject({ code: 'xyz', tokenHash: null });
  });

  it('reads an error from the query string or the fragment', () => {
    expect(readLinkParams('?error=access_denied&error_code=otp_expired', '').errorCode).toBe('otp_expired');
    expect(readLinkParams('', '#error=access_denied&error_description=Email+link+is+invalid').errorCode).toBe(
      'access_denied',
    );
  });
});

describe('ConfirmPage', () => {
  it('confirms a signup link and lands on Overview', async () => {
    renderAt('/auth/confirm?token_hash=abc&type=email');
    expect(await screen.findByText('Overview page')).toBeInTheDocument();
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'email' });
  });

  it('sends a recovery link to the new-password screen', async () => {
    renderAt('/auth/confirm?token_hash=abc&type=recovery');
    expect(await screen.findByText('Choose a new password')).toBeInTheDocument();
  });

  it('explains an expired link without calling the server', async () => {
    renderAt('/auth/confirm?error=access_denied&error_code=otp_expired');
    expect(await screen.findByText(/expired or was already used/)).toBeInTheDocument();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('shows the reason when the token is refused', async () => {
    verifyOtp.mockResolvedValue({ error: { code: 'otp_expired' } });
    renderAt('/auth/confirm?token_hash=stale&type=email');
    expect(await screen.findByText(/expired or was already used/)).toBeInTheDocument();
  });

  it('accepts a default-template link once the client has exchanged the code', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    renderAt('/auth/confirm?code=xyz');
    expect(await screen.findByText('Overview page')).toBeInTheDocument();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('follows a PASSWORD_RECOVERY event to the new-password screen', async () => {
    onAuthStateChange.mockImplementation((cb: (e: string, s: unknown) => void) => {
      queueMicrotask(() => cb('PASSWORD_RECOVERY', { user: { id: 'u1' } }));
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderAt('/auth/confirm?code=xyz');
    expect(await screen.findByText('Choose a new password')).toBeInTheDocument();
  });

  it('asks for a new link when the URL carries nothing usable', async () => {
    renderAt('/auth/confirm');
    expect(await screen.findByText(/link is incomplete/)).toBeInTheDocument();
  });
});
