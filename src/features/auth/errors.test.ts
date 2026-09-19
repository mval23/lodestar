import { authErrorMessage, dataErrorMessage, GENERIC_MESSAGE, NETWORK_MESSAGE } from './errors';

describe('authErrorMessage', () => {
  it('maps known codes to calm copy', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', status: 400 })).toBe(
      'That email and password don’t match an account.',
    );
    expect(authErrorMessage({ code: 'otp_expired' })).toMatch(/expired/);
  });

  it('treats fetch failures as connection problems', () => {
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', status: 0 })).toBe(NETWORK_MESSAGE);
  });

  it('never echoes an unknown server message', () => {
    expect(authErrorMessage({ code: 'something_new', message: 'internal detail' })).toBe(GENERIC_MESSAGE);
  });

  it('maps a bare 429 to the rate-limit copy', () => {
    expect(authErrorMessage({ status: 429 })).toMatch(/Too many attempts/);
  });
});

describe('dataErrorMessage', () => {
  it('passes through messages our triggers wrote for people', () => {
    const message = 'Currency can only be changed before the first transaction is recorded.';
    expect(dataErrorMessage({ code: '23514', message })).toBe(message);
  });

  it('hides raw constraint violations', () => {
    expect(
      dataErrorMessage({ code: '23514', message: 'new row for relation "profiles" violates check constraint "x"' }),
    ).toBe(GENERIC_MESSAGE);
  });

  it('hides other database errors', () => {
    expect(dataErrorMessage({ code: '42501', message: 'permission denied for table profiles' })).toBe(GENERIC_MESSAGE);
  });
});
