import { errorText } from './leadApi';

jest.mock('~/utils/cookie-storage', () => ({
  cookieStorage: { getItem: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { cookieStorage } = require('~/utils/cookie-storage');

const withExpiry = (expiresAt: string) =>
  (cookieStorage.getItem as jest.Mock).mockReturnValue(
    JSON.stringify({ accessOrWorkspaceAgnosticToken: { token: 'x', expiresAt } }),
  );

// The wiring, not the helper. sessionLapsed.test.ts proves the predicate; this
// proves the sentence an agent actually reads — which is the thing that was wrong.
describe('errorText on a null answer', () => {
  afterEach(() => jest.clearAllMocks());

  it('says sign in again when the session provably lapsed', () => {
    withExpiry(new Date(Date.now() - 60_000).toISOString());
    expect(errorText(null)).toBe('You need to sign in again.');
  });

  it('keeps the connection sentence while the session is good', () => {
    withExpiry(new Date(Date.now() + 10 * 60_000).toISOString());
    expect(errorText(null)).toBe(
      'The CRM did not answer. Check your connection and try again.',
    );
  });

  it('keeps the connection sentence when there is no cookie to ask', () => {
    (cookieStorage.getItem as jest.Mock).mockReturnValue(undefined);
    expect(errorText(null)).toBe(
      'The CRM did not answer. Check your connection and try again.',
    );
  });

  // The handler's own refusal still has its own path and must not be disturbed.
  it('still reads the route NOT_AUTHENTICATED envelope', () => {
    withExpiry(new Date(Date.now() + 10 * 60_000).toISOString());
    expect(errorText({ ok: false, error: 'NOT_AUTHENTICATED' })).toBe(
      'You need to sign in again.',
    );
  });
});
