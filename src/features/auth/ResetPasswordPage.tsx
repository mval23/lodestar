import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../app/AuthProvider';
import { db } from '../../lib/supabase';
import { Button } from '../../ui/Button';
import { FieldErrors, FormGroup, FormRow } from '../../ui/Form';
import { Notice } from '../../ui/Notice';
import { AuthLayout } from './AuthLayout';
import { authErrorMessage } from './errors';
import { MIN_PASSWORD_LENGTH, NewPasswordSchema, type NewPasswordValues } from './schemas';

// Reached from the recovery email via /auth/confirm, which signs the person in
// with a short-lived recovery session before sending them here.
export function ResetPasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<NewPasswordValues>({
    resolver: zodResolver(NewPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  if (auth.status === 'loading') return null;
  if (auth.status === 'signed-out') {
    return (
      <AuthLayout title="Reset your password">
        <div className="auth-form">
          <Notice tone="warn">This reset link has expired. Request a new one to choose a password.</Notice>
          <div className="auth-links">
            <Link to="/forgot-password">Request a new link</Link>
            <Link to="/sign-in">Sign in</Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setServerError(null);
    const { error } = await db().auth.updateUser({ password });
    if (error) {
      setServerError(authErrorMessage(error));
      return;
    }
    navigate('/', { replace: true, state: { notice: 'Your password is changed.' } });
  });

  return (
    <AuthLayout title="Choose a new password" intro={auth.session.user.email}>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {/* Lets password managers pair the new password with the account. */}
        <input type="email" autoComplete="username" value={auth.session.user.email ?? ''} readOnly hidden />
        <div>
          <FormGroup>
            <FormRow label="New password" htmlFor="password" invalid={Boolean(errors.password)}>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder={`${MIN_PASSWORD_LENGTH}+ characters`}
                aria-invalid={Boolean(errors.password)}
                {...register('password')}
              />
            </FormRow>
            <FormRow label="Confirm" htmlFor="confirm" invalid={Boolean(errors.confirm)}>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Same password again"
                aria-invalid={Boolean(errors.confirm)}
                {...register('confirm')}
              />
            </FormRow>
          </FormGroup>
          <FieldErrors messages={[errors.password?.message, errors.confirm?.message]} />
        </div>
        {serverError && <Notice tone="err">{serverError}</Notice>}
        <Button type="submit" block dimmed={!isValid} busy={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
