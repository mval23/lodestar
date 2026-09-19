import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { SignInPage } from './SignInPage';

const signInWithPassword = vi.fn();

vi.mock('../../lib/supabase', () => ({
  db: () => ({ auth: { signInWithPassword, resend: vi.fn() } }),
}));

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/settings', element: <p>Settings page</p> },
      { path: '/', element: <p>Overview page</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

beforeEach(() => signInWithPassword.mockReset());

describe('SignInPage', () => {
  it('explains what is missing instead of calling the server', async () => {
    renderAt('/sign-in');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('shows calm copy for wrong credentials', async () => {
    signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', status: 400 } });
    renderAt('/sign-in');
    await userEvent.type(screen.getByLabelText('Email'), 'sam@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'not-it');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('That email and password don’t match an account.')).toBeInTheDocument();
  });

  it('returns to a safe next path after signing in', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    renderAt('/sign-in?next=%2Fsettings');
    await userEvent.type(screen.getByLabelText('Email'), 'sam@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Settings page')).toBeInTheDocument();
  });

  it('ignores an off-site next path', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    renderAt('/sign-in?next=https%3A%2F%2Fevil.example');
    await userEvent.type(screen.getByLabelText('Email'), 'sam@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Overview page')).toBeInTheDocument();
  });
});
