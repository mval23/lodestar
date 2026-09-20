import { confirmationPhrase, deletionErrorMessage, failureCode, matchesPhrase } from './deletion';

describe('confirmationPhrase', () => {
  it('names how much is at stake', () => {
    expect(confirmationPhrase(318)).toBe('Delete account and its 318 transactions');
  });

  it('counts one transaction as one', () => {
    expect(confirmationPhrase(1)).toBe('Delete account and its 1 transaction');
  });

  it('says nothing about transactions when there are none', () => {
    expect(confirmationPhrase(0)).toBe('Delete account');
  });

  it('writes the number plainly, so it can be typed', () => {
    expect(confirmationPhrase(1688)).toBe('Delete account and its 1688 transactions');
  });
});

describe('matchesPhrase', () => {
  const phrase = confirmationPhrase(318);

  it('accepts the phrase, with stray spaces or capitals', () => {
    expect(matchesPhrase(phrase, phrase)).toBe(true);
    expect(matchesPhrase('  delete account and its 318 TRANSACTIONS ', phrase)).toBe(true);
    expect(matchesPhrase('Delete  account and its 318 transactions', phrase)).toBe(true);
  });

  it('refuses anything else', () => {
    expect(matchesPhrase('', phrase)).toBe(false);
    expect(matchesPhrase('delete account', phrase)).toBe(false);
    expect(matchesPhrase('Delete account and its 317 transactions', phrase)).toBe(false);
    expect(matchesPhrase('Delete account and its 318 transactions!', phrase)).toBe(false);
  });

  it('is never satisfied by an empty phrase', () => {
    expect(matchesPhrase('', '')).toBe(false);
  });
});

describe('failureCode', () => {
  it('reads the code the function sent', async () => {
    const error = { context: new Response(JSON.stringify({ error: 'reauth_required' }), { status: 401 }) };
    expect(await failureCode(error)).toBe('reauth_required');
  });

  it('leaves the response readable for anyone after it', async () => {
    const context = new Response(JSON.stringify({ error: 'delete_failed' }), { status: 500 });
    await failureCode({ context });
    expect(context.bodyUsed).toBe(false);
  });

  it('gives up quietly on anything it cannot read', async () => {
    expect(await failureCode(null)).toBeUndefined();
    expect(await failureCode(new TypeError('Failed to fetch'))).toBeUndefined();
    expect(await failureCode({ context: new Response('<html>502</html>', { status: 502 }) })).toBeUndefined();
    expect(await failureCode({ context: new Response(JSON.stringify({ error: 7 })) })).toBeUndefined();
  });
});

describe('deletionErrorMessage', () => {
  it('asks for the password again when the proof went stale', () => {
    expect(deletionErrorMessage('reauth_required')).toMatch(/Enter your password again/);
  });

  it('otherwise says plainly that nothing was removed', () => {
    for (const code of [undefined, 'delete_failed', 'not_configured', 'something_new']) {
      expect(deletionErrorMessage(code)).toMatch(/nothing was removed/);
    }
  });
});
