import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { renewToken } from '@/auth/services/AuthService';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { cookieStorage } from '~/utils/cookie-storage';

// Shell-layer bridges (the WhatsApp dock, the Dialer dock) talk to the server
// with a plain `fetch` + bearer token, outside Apollo entirely — unlike the
// main app's Apollo client, which auto-renews an expired access token via
// AuthService.renewToken + RetryLink (see apollo.factory.ts). These bridges
// had NO such renewal: once the access token expired, every call silently
// returned null forever (the caller just sees "no results"/"can't send"),
// even though the user's session (refresh token) was still perfectly valid —
// only a hard page reload fixed it. Founder-confirmed hardening (WhatsApp dock
// redesign, 2026-07-12): give bridge fetches the SAME one-shot renew-then-retry
// the main app gets.
//
// Mechanics: on a 401, call the SAME renewToken() the Apollo factory uses
// (POSTs the refresh token to /metadata), persist the refreshed pair to the
// SAME cookie key getTokenPair() reads (`tokenPair`), then retry the ORIGINAL
// request exactly once with the fresh token. Only if renewal itself fails do
// we fall back to the caller's existing "unreachable/empty" handling — never a
// silent infinite loop, never a second retry.
let renewalPromise: Promise<boolean> | null = null;

const persistRenewedTokenPair = (tokenPair: unknown): void => {
  cookieStorage.setItem('tokenPair', JSON.stringify(tokenPair));
};

// De-duped: if several bridge calls hit a 401 around the same time, only ONE
// renewal round-trip runs; the rest await the same in-flight promise.
const renewSessionOnce = (): Promise<boolean> => {
  if (renewalPromise !== null) {
    return renewalPromise;
  }
  renewalPromise = (async (): Promise<boolean> => {
    const current = getTokenPair();
    if (!current) {
      return false;
    }
    try {
      const tokens = await renewToken(
        `${REACT_APP_SERVER_BASE_URL}/metadata`,
        current,
      );
      if (!tokens) {
        return false;
      }
      persistRenewedTokenPair(tokens);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    renewalPromise = null;
  });
  return renewalPromise;
};

/**
 * Run `attempt` — a closure that performs ONE fetch using whatever
 * `getTokenPair()` returns AT CALL TIME — with renew-and-retry. `attempt` must
 * re-read the token itself (the existing bridge pattern already does this),
 * so the retry naturally picks up the freshly-renewed token once it's
 * persisted to the cookie. Returns the Response (whatever status), or null if
 * the network call itself threw. A non-401 response (including a non-401
 * error status) is returned as-is on the first try — this only intervenes on
 * an auth failure.
 */
export const fetchWithRenewal = async (
  attempt: () => Promise<Response>,
): Promise<Response | null> => {
  try {
    const first = await attempt();
    if (first.status !== 401) {
      return first;
    }
    const renewed = await renewSessionOnce();
    if (!renewed) {
      return first; // renewal failed too — surface the original 401
    }
    return await attempt(); // exactly one retry, with the fresh token
  } catch {
    return null;
  }
};
