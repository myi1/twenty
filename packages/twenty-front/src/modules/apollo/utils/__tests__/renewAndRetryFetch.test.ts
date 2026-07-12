import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { fetchWithRenewal } from '@/apollo/utils/renewAndRetryFetch';
import { renewToken } from '@/auth/services/AuthService';
import { cookieStorage } from '~/utils/cookie-storage';

jest.mock('@/apollo/utils/getTokenPair', () => ({
  getTokenPair: jest.fn(),
}));

jest.mock('@/auth/services/AuthService', () => ({
  renewToken: jest.fn(),
}));

jest.mock('~/utils/cookie-storage', () => ({
  cookieStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockGetTokenPair = getTokenPair as jest.MockedFunction<typeof getTokenPair>;
const mockRenewToken = renewToken as jest.MockedFunction<typeof renewToken>;
const mockCookieStorage = cookieStorage as jest.Mocked<typeof cookieStorage>;

const staleTokenPair = {
  accessOrWorkspaceAgnosticToken: { token: 'stale-access-token', expiresAt: 'x' },
  refreshToken: { token: 'stale-refresh-token', expiresAt: 'x' },
};

const freshTokenPair = {
  accessOrWorkspaceAgnosticToken: { token: 'fresh-access-token', expiresAt: 'x' },
  refreshToken: { token: 'fresh-refresh-token', expiresAt: 'x' },
};

const okResponse = (status = 200): Response => ({ status, ok: status < 400 } as Response);
const unauthorizedResponse = (): Response => ({ status: 401, ok: false } as Response);

describe('fetchWithRenewal', () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks): also drains any queued
    // mockReturnValueOnce/mockRejectedValueOnce values left over from a prior
    // test, so per-test getTokenPair() call sequences never leak across tests.
    jest.resetAllMocks();
  });

  it('returns the first response unchanged when it is not a 401', async () => {
    const first = okResponse(200);
    const attempt = jest.fn().mockResolvedValue(first);
    mockGetTokenPair.mockReturnValue(staleTokenPair);

    const result = await fetchWithRenewal(attempt);

    expect(result).toBe(first);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(mockRenewToken).not.toHaveBeenCalled();
  });

  it('renews once and retries with the fresh token on a 401 (the happy path a real send relies on)', async () => {
    // token() is re-read fresh on every attempt() invocation (the bridge
    // pattern) — before renewal it's stale, after persistRenewedTokenPair it's
    // fresh. This mirrors the real getTokenPair()/cookie relationship.
    mockGetTokenPair
      .mockReturnValueOnce(staleTokenPair) // fetchWithRenewal's own pre-attempt snapshot
      .mockReturnValueOnce(staleTokenPair) // renewSessionOnce's "did someone else already renew?" check
      .mockReturnValueOnce(freshTokenPair); // after persistRenewedTokenPair, for the retry's own token() read

    mockRenewToken.mockResolvedValue(freshTokenPair);

    const attempt = jest
      .fn()
      .mockResolvedValueOnce(unauthorizedResponse())
      .mockResolvedValueOnce(okResponse(200));

    const result = await fetchWithRenewal(attempt);

    expect(attempt).toHaveBeenCalledTimes(2); // exactly one retry, never a loop
    expect(mockRenewToken).toHaveBeenCalledTimes(1);
    expect(mockCookieStorage.setItem).toHaveBeenCalledWith(
      'tokenPair',
      JSON.stringify(freshTokenPair),
    );
    expect(result?.status).toBe(200);
  });

  it('surfaces the original 401 when renewal genuinely fails and no one else renewed either', async () => {
    mockGetTokenPair.mockReturnValue(staleTokenPair); // never moves — no concurrent renewal happened
    mockRenewToken.mockRejectedValue(new Error('refresh token has been revoked'));

    const first = unauthorizedResponse();
    const attempt = jest.fn().mockResolvedValue(first);

    const result = await fetchWithRenewal(attempt);

    expect(result).toBe(first); // the original 401, not a thrown error or null
    expect(attempt).toHaveBeenCalledTimes(1); // no retry when renewal failed
  });

  // Regression test for the root cause: Twenty's main Apollo client and this
  // bridge can both detect the same expired token and race to renew it
  // concurrently (refresh tokens are single-use/rotating). If OUR renewal call
  // loses that race and throws, but the OTHER caller's renewal already landed
  // a fresh token in the cookie, we must ride it rather than declaring the
  // send failed.
  it('treats a failed renewal as recovered if a concurrent renewal already refreshed the cookie', async () => {
    mockGetTokenPair
      .mockReturnValueOnce(staleTokenPair) // fetchWithRenewal's pre-attempt snapshot
      .mockReturnValueOnce(staleTokenPair) // renewSessionOnce's pre-check: still stale, so we do try to renew
      .mockReturnValueOnce(freshTokenPair) // re-check AFTER our renewToken() throws: someone else already won
      .mockReturnValueOnce(freshTokenPair); // the retry's own token() read

    mockRenewToken.mockRejectedValue(new Error('refresh token reuse — already rotated'));

    const attempt = jest
      .fn()
      .mockResolvedValueOnce(unauthorizedResponse())
      .mockResolvedValueOnce(okResponse(200));

    const result = await fetchWithRenewal(attempt);

    expect(result?.status).toBe(200);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  // Regression test for the root cause: if someone ELSE (e.g. the main app's
  // Apollo client) already renewed the session before we even attempted our
  // own renewal, we must not fire a redundant, racy renewToken() call at all —
  // just ride the token that's already there.
  it('skips its own renewal entirely when the cookie already moved on before renewSessionOnce runs', async () => {
    mockGetTokenPair
      .mockReturnValueOnce(staleTokenPair) // fetchWithRenewal's pre-attempt snapshot
      .mockReturnValueOnce(freshTokenPair) // renewSessionOnce's pre-check: already renewed elsewhere
      .mockReturnValueOnce(freshTokenPair); // the retry's own token() read

    const attempt = jest
      .fn()
      .mockResolvedValueOnce(unauthorizedResponse())
      .mockResolvedValueOnce(okResponse(200));

    const result = await fetchWithRenewal(attempt);

    expect(result?.status).toBe(200);
    expect(mockRenewToken).not.toHaveBeenCalled();
  });

  it('returns null when the fetch itself throws (network error), never an unhandled rejection', async () => {
    mockGetTokenPair.mockReturnValue(staleTokenPair);
    const attempt = jest.fn().mockRejectedValue(new Error('Failed to fetch'));

    const result = await fetchWithRenewal(attempt);

    expect(result).toBeNull();
  });
});
