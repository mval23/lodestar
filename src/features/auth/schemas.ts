import { z } from 'zod';

// Keep in sync with auth.minimum_password_length in supabase/config.toml and
// the hosted projects' Auth settings.
export const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 72; // bcrypt ignores bytes after 72

const email = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .pipe(z.email('Enter a valid email address, like name@example.com.'));

const newPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`)
  .max(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters for your password.`);

export const SignInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
});

export const SignUpSchema = z.object({
  displayName: z.string().trim().max(80, 'Keep your name under 80 characters.'),
  email,
  password: newPassword,
});

export const ForgotPasswordSchema = z.object({ email });

export const NewPasswordSchema = z
  .object({
    password: newPassword,
    confirm: z.string().min(1, 'Enter the new password again.'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The two passwords don’t match.' });

export const ChangePasswordSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password.'),
    password: newPassword,
    confirm: z.string().min(1, 'Enter the new password again.'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The two passwords don’t match.' })
  .refine((v) => v.password !== v.current, {
    path: ['password'],
    message: 'Choose a password that’s different from your current one.',
  });

export type SignInValues = z.infer<typeof SignInSchema>;
export type SignUpValues = z.infer<typeof SignUpSchema>;
export type ForgotPasswordValues = z.infer<typeof ForgotPasswordSchema>;
export type NewPasswordValues = z.infer<typeof NewPasswordSchema>;
export type ChangePasswordValues = z.infer<typeof ChangePasswordSchema>;
