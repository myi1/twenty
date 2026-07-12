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
//
// ROOT-CAUSE NOTE (2026-07-12 investigation of "send silently does nothing"):
// this bridge's renewal is a SEPARATE, uncoordinated mechanism from the main
// app's own Apollo-driven renewal (apollo.factory.ts's handleTokenRenewal —
// see its module-scoped `renewalPromise`, a DIFFERENT variable from this
// file's). An expired access token affects every in-flight request at once,
// so it is common for BOTH systems to detect the 401 within the same instant
// and each independently POST the refresh token to /metadata. Twenty's
// refresh tokens are single-use/rotating — every successful renewal revokes
// the token used and mints a new one (renew-token.service.ts), with only a
// short REUSE_GRACE_PERIOD (default 1m) forgiving a second concurrent use.
// Losing that race throws from renewToken(), which this file used to treat as
// an unconditional failure — even though the OTHER caller's renewal had, in
// fact, just succeeded and the session was perfectly fine. That silent
// "renewal failed" then surfaces as `appRoute`/`graphql`'s generic null return
// (see whatsAppComposeBridge.ts), which is indistinguishable from a genuine
// network outage — and if enough concurrent renewals collide, the MAIN app's
// own renewal can exhaust its retries and log the user out entirely
// (onUnauthenticatedError nulls the tokenPair cookie), at which point this
// bridge's `token() === undefined` guard bails out before ever calling
// `fetch` — explaining reports of a "send" that produced NO network request
// and NO server-log entry at all.
//
// Fix (kept self-contained to this bridge — no apollo.factory.ts changes,
// to avoid widening blast radius on the app's core auth flow): before firing
// a renewal, and again if one fails, check whether the token in the cookie
// has ALREADY moved on from the one that produced our 401. If it has, someone
// else (the main app, or another bridge call) already won the race — ride
// their result instead of firing a redundant, racy renewal of our own.
let renewalPromise: Promise<boolean> | null = null;

const persistRenewedTokenPair = (tokenPair: unknown): void => {
  cookieStorage.setItem('tokenPair', JSON.stringify(tokenPair));
};

// De-duped: if several bridge calls hit a 401 around the same time, only ONE
// renewal round-trip runs; the rest await the same in-flight promise.
// `staleAccessToken` is the token that produced the 401 we're recovering from
// — used to detect a renewal that already happened elsewhere in the interim.
const renewSessionOnce = (
  staleAccessToken: string | undefined,
): Promise<boolean> => {
  if (renewalPromise !== null) {
    return renewalPromise;
  }
  renewalPromise = (async (): Promise<boolean> => {
    // Someone else may have already refreshed the session between the 401 we
    // just saw and now (see the root-cause note above) — if the cookie's
    // access token already differs from the stale one that triggered this
    // attempt, that other renewal won; don't spend our one shot racing an
    // already-rotated refresh token.
    const current = getTokenPair();
    if (
      current?.accessOrWorkspaceAgnosticToken?.token !== undefined &&
      current.accessOrWorkspaceAgnosticToken.token !== staleAccessToken
    ) {
      return true;
    }
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
      // Our renewal call itself can fail because a CONCURRENT renewal (e.g.
      // Twenty's main Apollo client noticing the same expired token) already
      // rotated the refresh token first — re-check once more before reporting
      // failure: if the cookie now holds a fresher access token than the one
      // that triggered this attempt, that concurrent renewal won and we can
      // ride it instead of failing the send outright.
      const afterFailure = getTokenPair();
      if (
        afterFailure?.accessOrWorkspaceAgnosticToken?.token !== undefined &&
        afterFailure.accessOrWorkspaceAgnosticToken.token !== staleAccessToken
      ) {
        return true;
      }
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
    const staleAccessToken = getTokenPair()?.accessOrWorkspaceAgnosticToken?.token;
    const first = await attempt();
    if (first.status !== 401) {
      return first;
    }
    const renewed = await renewSessionOnce(staleAccessToken);
    if (!renewed) {
      return first; // renewal failed too — surface the original 401
    }
    return await attempt(); // exactly one retry, with the fresh token
  } catch {
    return null;
  }
};
