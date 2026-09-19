import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { db } from '../../lib/supabase';
import { authCallbackUrl, safeNextPath } from '../../lib/redirect';
import { Button } from '../../ui/Button';
import { FieldErrors, FormGroup, FormRow } from '../../ui/Form';
import { Notice } from '../../ui/Notice';
import { AuthLayout } from './AuthLayout';
import { authErrorMessage } from './errors';
import { SignInSchema, type SignInValues } from './schemas';

type LocationState = { notice?: string } | null;

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const [serverError, setServerError] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const notice = (location.state as LocationState)?.notice;

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(SignInSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setUnconfirmedEmail(null);
    const { error } = await db().auth.signInWithPassword(values);
    if (error) {
      if (error.code === 'email_not_confirmed') setUnconfirmedEmail(values.email);
      setServerError(authErrorMessage(error));
      return;
    }
    navigate(next, { replace: true });
  });

  const resend = async () => {
    if (!unconfirmedEmail) return;
    const { error } = await db().auth.resend({
      type: 'signup',
      email: unconfirmedEmail,
      options: { emailRedirectTo: authCallbackUrl() },
    });
    if (error) setServerError(authErrorMessage(error));
    else setResent(true);
  };

  return (
    <AuthLayout title="Sign in">
      {notice && <Notice tone="ok">{notice}</Notice>}
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
            <FormRow label="Password" htmlFor="password" invalid={Boolean(errors.password)}>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Required"
                aria-invalid={Boolean(errors.password)}
                {...register('password')}
              />
            </FormRow>
          </FormGroup>
          <FieldErrors messages={[errors.email?.message, errors.password?.message]} />
        </div>

        {serverError && (
          <Notice tone="err">
            <p>{serverError}</p>
            {unconfirmedEmail && !resent && (
              <Button variant="plain" className="btn-inline" onClick={resend}>
                Send the confirmation email again
              </Button>
            )}
          </Notice>
        )}
        {resent && <Notice tone="ok">We sent a new confirmation link. It expires in one hour.</Notice>}

        <Button type="submit" block dimmed={!isValid} busy={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
        <div className="auth-links">
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to={next === '/' ? '/sign-up' : `/sign-up?next=${encodeURIComponent(next)}`}>Create an account</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
