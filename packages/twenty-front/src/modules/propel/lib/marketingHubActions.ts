import { callPropelRoute } from '@/propel/lib/callPropelRoute';

// Authed action → typed-envelope helper for the Campaigns + Templates tabs,
// mirroring the legacy Marketing Cloud `runRoute` (marketing-cloud-core.ts). POSTs
// to a /marketing/* route and resolves a discriminated outcome the caller turns
// into a toast: { ok:true } on success, or { ok:false, message } carrying the
// route's operatorAction (preferred — plain-language) or raw error. A null route
// response (non-2xx / unreachable) resolves a generic connection message.
export type RouteOutcome =
  | { ok: true }
  | { ok: false; message: string };

type RouteEnvelope = {
  ok?: boolean;
  error?: string;
  operatorAction?: string;
} | null;

export const runMarketingRoute = async (
  path: string,
  body: object,
): Promise<RouteOutcome> => {
  const res = await callPropelRoute<RouteEnvelope>(path, body);
  if (res === null) {
    return {
      ok: false,
      message: 'Request failed — check your connection and try again.',
    };
  }
  if (res.error !== undefined && res.error !== '') {
    return { ok: false, message: res.operatorAction || res.error };
  }
  return { ok: true };
};
