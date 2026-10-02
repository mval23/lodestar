import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { db } from '../../lib/supabase';
import { Button } from '../../ui/Button';
import { FieldErrors, FormGroup, FormRow } from '../../ui/Form';
import { Notice } from '../../ui/Notice';
import { authErrorMessage } from '../auth/errors';
import { ChangePasswordSchema, MIN_PASSWORD_LENGTH, type ChangePasswordValues } from '../auth/schemas';

// Re-authenticates with the current password before changing it, so an
// unattended signed-in browser can't be used to take over the account.
export async function reauthenticate(email: string, password: string) {
  return db().auth.signInWithPassword({ email, password });
}

// Settings shows this in a sheet and closes it once the password is changed.
export function PasswordForm({ email, onChanged }: { email: string; onChanged: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(ChangePasswordSchema),
    defaultValues: { current: '', password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ current, password }) => {
    setServerError(null);
    const check = await reauthenticate(email, current);
    if (check.error) {
      setServerError(
        check.error.code === 'invalid_credentials' ? 'Your current password isn’t right.' : authErrorMessage(check.error),
      );
      return;
    }
    const { error } = await db().auth.updateUser({ password });
    if (error) {
      setServerError(authErrorMessage(error));
      return;
    }
    reset();
    onChanged();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <div>
        <FormGroup>
          <FormRow label="Current" htmlFor="current" invalid={Boolean(errors.current)}>
            <input
              id="current"
              type="password"
              autoComplete="current-password"
              placeholder="Required"
              {...register('current')}
            />
          </FormRow>
          <FormRow label="New" htmlFor="new-password" invalid={Boolean(errors.password)}>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder={`${MIN_PASSWORD_LENGTH}+ characters`}
              {...register('password')}
            />
          </FormRow>
          <FormRow label="Confirm" htmlFor="confirm-password" invalid={Boolean(errors.confirm)}>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Same password again"
              {...register('confirm')}
            />
          </FormRow>
        </FormGroup>
        <FieldErrors messages={[errors.current?.message, errors.password?.message, errors.confirm?.message]} />
      </div>
      {serverError && <Notice tone="err">{serverError}</Notice>}
      <div className="actions">
        <Button type="submit" dimmed={!isValid} busy={isSubmitting}>
          {isSubmitting ? 'Changing…' : 'Change password'}
        </Button>
      </div>
    </form>
  );
}
