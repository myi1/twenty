import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

// The result of a status-aware route call: the parsed body (or null) plus the
// HTTP status that produced it. `status` is the real HTTP code on any response
// (incl. non-2xx), 0 on a transport failure (fetch threw / offline), and -1 when
// the call was skipped because there's no session token. Callers that need to
// tell apart "route isn't deployed" (404) from "server unreachable" (0) read
// this; the common case keeps using callPropelRoute and just sees `null`.
export type PropelRouteResult<T> = {
  data: T | null;
  /** HTTP status; 0 = transport error/offline, -1 = no session token */
  status: number;
};

// Build the wire payload from the caller's `body`, normalizing a lone
// `{ body: <object> }` wrapper.
//
// Twenty's HTTP route trigger sets `event.body` to the parsed request JSON AS-IS
// (twenty-server build-logic-function-event.util.ts → extractBody). The
// logic-function routes read `event.body.<field>`, so the request JSON must carry
// the payload fields at the TOP level. Several callers historically wrapped the
// payload one level deep as `{ body: {...} }`, which made `event.body` ===
// `{ body: {...} }` and every `event.body.<field>` read come back undefined — the
// source of "Unknown AI action", silent save no-ops, A2A actions that never fire,
// etc. Normalize a lone `{ body: <object> }` wrapper to its inner object before
// sending. This is unambiguous: the only routes that read `event.body.body` treat
// it as a STRING field (post / reply / wa message text), never an object, so no
// real payload is shaped `{ body: {} }`. PREFERRED convention going forward: pass
// the flat payload directly.
const unwrapPayload = (body: object): object => {
  const wrapped =
    Object.keys(body).length === 1 &&
    'body' in body &&
    typeof (body as { body: unknown }).body === 'object' &&
    (body as { body: unknown }).body !== null &&
    !Array.isArray((body as { body: unknown }).body);
  return wrapped ? (body as { body: object }).body : body;
};

// Status-aware variant of callPropelRoute. Same auth + payload normalization, but
// returns the HTTP status alongside the parsed body so a caller can distinguish a
// 404 (route not deployed on this environment) from a transport failure. Used by
// the social-calendar Retry path, whose server route (`/marketing/social/retry-
// post`) may not be present on every environment yet — a 404 there must read as
// "not available on this server", not "check your connection".
//
// `init.signal` (optional) aborts the underlying fetch — an abort resolves like
// any other transport failure (status 0). Callers with a deadline should pass
// AbortSignal.timeout(...) rather than racing a bare timer: only an abort
// actually FREES the socket, and a stalled request that is merely raced keeps
// holding one of Chrome's 6 per-host connections (observed starving the whole
// staging tab pool on 2026-07-11).
export const callPropelRouteWithStatus = async <T>(
  path: string,
  body: object,
  init: { signal?: AbortSignal } = {},
): Promise<PropelRouteResult<T>> => {
  const token = getTokenPair()?.accessOrWorkspaceAgnosticToken?.token;
  if (token === undefined || token === '') {
    return { data: null, status: -1 };
  }

  const payload = unwrapPayload(body);

  try {
    const response = await fetch(`${REACT_APP_SERVER_BASE_URL}/s${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      ...(init.signal !== undefined ? { signal: init.signal } : {}),
    });

    if (!response.ok) {
      return { data: null, status: response.status };
    }

    return { data: (await response.json()) as T, status: response.status };
  } catch {
    return { data: null, status: 0 };
  }
};

// Thin authenticated POST helper for Propel's serverless logic-function routes,
// which are served under `${base}/s<path>` (e.g. /s/marketing/analytics). Same
// auth mechanism the dialer dock uses (DialerDock.tsx ~L443): the CRM session's
// access token in an `authorization: Bearer` header; the route derives identity
// server-side from it (we never send an identity).
//
// Returns the parsed JSON body on a 2xx response, otherwise `null` — every caller
// treats `null` as "no data" and renders an empty/error state rather than throwing.
// (Delegates to callPropelRouteWithStatus and discards the status, so the
// payload-normalization + auth logic lives in exactly one place.)
export const callPropelRoute = async <T>(
  path: string,
  body: object,
  init: { signal?: AbortSignal } = {},
): Promise<T | null> => {
  const { data } = await callPropelRouteWithStatus<T>(path, body, init);
  return data;
};
