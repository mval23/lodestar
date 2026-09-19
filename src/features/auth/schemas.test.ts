import { ChangePasswordSchema, MIN_PASSWORD_LENGTH, NewPasswordSchema, SignInSchema, SignUpSchema } from './schemas';

const good = 'a'.repeat(MIN_PASSWORD_LENGTH);

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

describe('auth schemas', () => {
  it('trims the email and asks for it in words', () => {
    expect(SignInSchema.parse({ email: '  a@example.com ', password: 'x' }).email).toBe('a@example.com');
    expect(firstMessage(SignInSchema.safeParse({ email: '', password: 'x' }))).toBe('Enter your email address.');
    expect(firstMessage(SignInSchema.safeParse({ email: 'nope', password: 'x' }))).toMatch(/valid email/);
  });

  it('requires a long enough password at sign-up', () => {
    const short = SignUpSchema.safeParse({ displayName: '', email: 'a@example.com', password: 'short' });
    expect(firstMessage(short)).toBe(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
    expect(SignUpSchema.safeParse({ displayName: '', email: 'a@example.com', password: good }).success).toBe(true);
  });

  it('rejects passwords longer than bcrypt reads', () => {
    const long = SignUpSchema.safeParse({ displayName: '', email: 'a@example.com', password: 'a'.repeat(73) });
    expect(long.success).toBe(false);
  });

  it('requires the confirmation to match', () => {
    const result = NewPasswordSchema.safeParse({ password: good, confirm: good + 'x' });
    expect(firstMessage(result)).toBe('The two passwords don’t match.');
  });

  it('refuses reusing the current password', () => {
    const result = ChangePasswordSchema.safeParse({ current: good, password: good, confirm: good });
    expect(firstMessage(result)).toMatch(/different/);
  });
});
