import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { timeZoneLabel, timeZoneOptions } from '../../lib/timezones';
import { Button } from '../../ui/Button';
import { FieldErrors, FormGroup, FormRow } from '../../ui/Form';
import { Notice } from '../../ui/Notice';
import { dataErrorMessage } from '../auth/errors';
import { useHasTransactions, useUpdateProfile, type Profile, type ProfileUpdate } from '../../lib/profile';

const WEEKDAYS = [
  [1, 'Monday'],
  [2, 'Tuesday'],
  [3, 'Wednesday'],
  [4, 'Thursday'],
  [5, 'Friday'],
  [6, 'Saturday'],
  [7, 'Sunday'],
] as const;

export const ProfileSchema = z.object({
  display_name: z.string().trim().max(80, 'Keep your name under 80 characters.'),
  // Undefined while the currency is locked: a disabled field isn't submitted.
  currency: z.enum(['USD', 'COP'], 'Choose US dollars or Colombian pesos.').optional(),
  timezone: z.string().min(1, 'Choose a time zone.'),
  week_start: z.coerce.number<string | number>().int().min(1).max(7),
});
type ProfileInput = z.input<typeof ProfileSchema>;
type ProfileValues = z.output<typeof ProfileSchema>;

function toValues(p: Profile): ProfileInput {
  return {
    display_name: p.display_name ?? '',
    currency: p.currency === 'COP' ? 'COP' : 'USD',
    timezone: p.timezone,
    week_start: p.week_start,
  };
}

// Only the columns that changed, so the update stays within the column grant.
export function profileChanges(profile: Profile, values: ProfileValues, currencyLocked: boolean) {
  const changes: Partial<ProfileUpdate> = {};
  const displayName = values.display_name === '' ? null : values.display_name;
  if (displayName !== profile.display_name) changes.display_name = displayName;
  if (!currencyLocked && values.currency && values.currency !== profile.currency) changes.currency = values.currency;
  if (values.timezone !== profile.timezone) changes.timezone = values.timezone;
  if (values.week_start !== profile.week_start) changes.week_start = values.week_start;
  return changes;
}

export function ProfileForm({ profile, email }: { profile: Profile; email: string }) {
  const update = useUpdateProfile();
  const hasTransactions = useHasTransactions();
  // Locked until we know there are no transactions.
  const currencyLocked = hasTransactions.data !== false;
  const zones = useMemo(() => timeZoneOptions(profile.timezone), [profile.timezone]);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isValid, isSubmitting },
  } = useForm<ProfileInput, unknown, ProfileValues>({
    resolver: zodResolver(ProfileSchema),
    defaultValues: toValues(profile),
  });

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);
    const changes = profileChanges(profile, values, currencyLocked);
    if (Object.keys(changes).length === 0) return;
    const result = await update.mutateAsync({ id: profile.id, changes }).catch(() => null);
    if (result) {
      reset(toValues(result));
      setSaved(true);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      <div>
        <FormGroup title="Profile">
          <FormRow label="Name" htmlFor="display_name" invalid={Boolean(errors.display_name)}>
            <input id="display_name" autoComplete="name" placeholder="Optional" {...register('display_name')} />
          </FormRow>
          <FormRow label="Email" htmlFor="email">
            <input id="email" type="email" value={email} readOnly />
          </FormRow>
        </FormGroup>
        <FieldErrors messages={[errors.display_name?.message]} />
      </div>

      <div>
        <FormGroup title="Money and dates">
          <FormRow label="Currency">
            <div className="segmented" role="radiogroup" aria-label="Currency" aria-describedby="currency-hint">
              <label>
                <input type="radio" value="USD" {...register('currency', { disabled: currencyLocked })} />
                USD
              </label>
              <label>
                <input type="radio" value="COP" {...register('currency', { disabled: currencyLocked })} />
                COP
              </label>
            </div>
          </FormRow>
          <FormRow label="Time zone" htmlFor="timezone" invalid={Boolean(errors.timezone)}>
            <select id="timezone" {...register('timezone')}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {timeZoneLabel(zone)}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Week starts on" htmlFor="week_start">
            <select id="week_start" {...register('week_start')}>
              {WEEKDAYS.map(([n, name]) => (
                <option key={n} value={n}>
                  {name}
                </option>
              ))}
            </select>
          </FormRow>
        </FormGroup>
        <FieldErrors messages={[errors.currency?.message, errors.timezone?.message]} />
        <p id="currency-hint" className="form-hint">
          {hasTransactions.data
            ? 'Currency is fixed once you’ve recorded a transaction. Lodestar never converts amounts.'
            : 'All your accounts use this currency. You can change it until you record your first transaction. Amounts are never converted.'}{' '}
          Your time zone decides what “today” and “this month” mean.
        </p>
      </div>

      {update.isError && <Notice tone="err">{dataErrorMessage(update.error)}</Notice>}
      {saved && !isDirty && <Notice tone="ok">Your profile is saved.</Notice>}

      <div className="actions">
        <Button type="submit" dimmed={!isDirty || !isValid} busy={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save profile'}
        </Button>
        {!isDirty && <span className="footnote">Change a field to save.</span>}
      </div>
    </form>
  );
}
