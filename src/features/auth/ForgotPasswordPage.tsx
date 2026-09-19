import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { db } from '../../lib/supabase';
import { authCallbackUrl } from '../../lib/redirect';
import { Button } from '../../ui/Button';
import { FieldErrors, FormGroup, FormRow } from '../../ui/Form';
import { Notice } from '../../ui/Notice';
import { AuthLayout } from './AuthLayout';
import { authErrorMessage } from './errors';
import { ForgotPasswordSchema, type ForgotPasswordValues } from './schemas';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(ForgotPasswordSchema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    const { error } = await db().auth.resetPasswordForEmail(email, { redirectTo: authCallbackUrl() });
    // Supabase answers the same way whether or not the address has an
    // account, so the next screen never reveals which emails are registered.
    if (error) {
      setServerError(authErrorMessage(error));
      return;
    }
    navigate('/check-email', { replace: true, state: { email, purpose: 'recovery' } });
  });

  return (
    <AuthLayout title="Reset your password" intro="Enter your email and we’ll send you a link to choose a new password.">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div>
          <FormGroup>
            <FormRow label="Email" htmlFor="email" invalid={Boolean(errors.email)}>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="name@example.com"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
            </FormRow>
          </FormGroup>
          <FieldErrors messages={[errors.email?.message]} />
        </div>
        {serverError && <Notice tone="err">{serverError}</Notice>}
        <Button type="submit" block dimmed={!isValid} busy={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>
        <div className="auth-links">
          <Link to="/sign-in">Back to sign in</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
