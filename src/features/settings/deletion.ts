// Deleting an account is the one action in Lodestar that cannot be undone, so
// the parts that decide whether it goes ahead are kept here, where they can be
// read and tested on their own.

// The words the person has to type, naming what they are about to lose. Plain
// digits, no grouping: this has to be typed, not admired.
export function confirmationPhrase(transactions: number): string {
  if (transactions <= 0) return 'Delete account';
  return `Delete account and its ${transactions} ${transactions === 1 ? 'transaction' : 'transactions'}`;
}

// Deliberateness is the point, not spelling precision, so stray spaces and
// capitals are forgiven. Nothing else is.
export function matchesPhrase(typed: string, phrase: string): boolean {
  const tidy = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  return phrase !== '' && tidy(typed) === tidy(phrase);
}

// supabase-js wraps a failed function call, keeping the response on `context`.
export async function failureCode(error: unknown): Promise<string | undefined> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return undefined;
  try {
    const body: unknown = await context.clone().json();
    const code = (body as { error?: unknown } | null)?.error;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

// Every one of these says what is true of the person's data, because that is
// the only question they have at this moment.
export function deletionErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'reauth_required':
      return 'That took a little too long. Enter your password again and confirm.';
    case 'unauthenticated':
      return 'You were signed out. Sign in again to delete your account.';
    default:
      return 'Your account wasn’t deleted, and nothing was removed. Try again in a moment.';
  }
}
