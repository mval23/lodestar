import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { db } from '../../lib/supabase';
import { authCallbackUrl } from '../../lib/redirect';
import { browserTimeZone } from '../../lib/timezones';
import { Button } from '../../ui/Button';
import { FieldErrors, FormGroup, FormRow } from '../../ui/Form';
import { Notice } from '../../ui/Notice';
import { AuthLayout } from './AuthLayout';
import { authErrorMessage } from './errors';
import { MIN_PASSWORD_LENGTH, SignUpSchema, type SignUpValues } from './schemas';

export function SignUpPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(SignUpSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ displayName, email, password }) => {
    setServerError(null);
    const { data, error } = await db().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: authCallbackUrl(),
        // Read by the handle_new_user trigger. The time zone is validated
        // there and falls back to UTC; it can be changed in Settings.
        data: { display_name: displayName || null, timezone: browserTimeZone() },
      },
    });
    if (error) {
      setServerError(authErrorMessage(error));
      return;
    }
    if (data.session) {
      // Email confirmation is off (local development only).
      navigate('/', { replace: true });
      return;
    }
    // The email travels in router state, never in the URL.
    navigate('/check-email', { replace: true, state: { email, purpose: 'signup' } });
  });

  return (
    <AuthLayout title="Create your account" intro="Your data is private to your account. No one else can see it.">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div>
          <FormGroup>
            <FormRow label="Name" htmlFor="displayName" invalid={Boolean(errors.displayName)}>
              <input id="displayName" autoComplete="name" placeholder="Optional" {...register('displayName')} />
            </FormRow>
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
            <FormRow label="Password" htmlFor="password" invalid={Boolean(errors.password)}>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder={`${MIN_PASSWORD_LENGTH}+ characters`}
                aria-invalid={Boolean(errors.password)}
                aria-describedby="password-hint"
                {...register('password')}
              />
            </FormRow>
          </FormGroup>
          <FieldErrors messages={[errors.displayName?.message, errors.email?.message, errors.password?.message]} />
          {!errors.password && (
            <p id="password-hint" className="form-hint">
              Use at least {MIN_PASSWORD_LENGTH} characters. A short phrase you don’t use anywhere else works well.
            </p>
          )}
        </div>

        {serverError && <Notice tone="err">{serverError}</Notice>}

        <Button type="submit" block dimmed={!isValid} busy={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
        <div className="auth-links">
          <span className="secondary">Already have an account?</span>
          <Link to="/sign-in">Sign in</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
