// Telling "you are signed out" apart from "the server is unreachable".
//
// The engine rejects a lapsed session on a /s/* route with an opaque HTTP 500 —
// not a 401, and NOT the route's own NOT_AUTHENTICATED envelope, because the
// guard sits ABOVE the handler and the handler never runs. callPropelRoute maps
// every non-2xx to `null`, so by the time this hero picks a sentence it cannot
// tell the two apart — and it was choosing the wrong one, telling agents to
// check an internet connection that was working perfectly.
//
// Measured against PROD on 2026-09-20: a bad token to POST /s/lead-page answers
//   HTTP 500  "Invalid token type"
// and writes no log line at all. Twelve hours of server logs carry no auth
// rejection of any kind, and coolify-proxy keeps no access log. So the client is
// not merely the convenient place to draw this distinction — it is the only
// place the evidence still exists at all.
//
// It reaches agents and not managers because ACCESS_TOKEN_EXPIRES_IN is 30
// minutes and this hero is a raw fetch that never passes through Apollo, so
// nothing renews the token while someone sits on one lead reading it. Touching
// anything Apollo-backed renews it, which is why the symptom "fixes itself"
// after a few minutes and why it never reproduces for whoever is investigating.
//
// Reads the cookie; never writes or clears it. getTokenPair() owns that.

import { cookieStorage } from '~/utils/cookie-storage';

/**
 * Pure: has this expiry already passed?
 *
 * Unknown, empty and unparseable all answer FALSE on purpose. This predicate
 * only ever ADDS a claim, and a wrong claim sends an agent off to re-authenticate
 * over what was really a dropped connection — the mirror image of the bug it
 * exists to fix. Staying quiet is the safe default: the existing sentence
 * already covers everything this does not positively prove.
 */
export const hasExpired = (
  expiresAt: string | null | undefined,
  now: number,
): boolean => {
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') {
    return false;
  }
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) && at <= now;
};

/** True only when the session cookie itself proves the login lapsed. Never throws. */
export const sessionHasLapsed = (now: number = Date.now()): boolean => {
  try {
    const raw = cookieStorage.getItem('tokenPair');
    if (raw === undefined || raw === '') {
      return false;
    }
    const pair = JSON.parse(raw) as {
      accessOrWorkspaceAgnosticToken?: { expiresAt?: string };
    };
    return hasExpired(pair?.accessOrWorkspaceAgnosticToken?.expiresAt, now);
  } catch {
    return false;
  }
};
