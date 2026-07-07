import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import type { LandingSectionType, LandingStatus, LandingTheme } from '@/propel/lib/landingSectionDefs';

// Real data layer for the Marketing hub's Landing tab. All landing-page CRUD
// runs through ONE Manager/Admin-gated CRM route (propel-crm-integration,
// src/logic-functions/landing-admin-route.ts):
//
//   POST /website/landing-admin  body { action, ... }   (flat body — the gotcha)
//     action:'list'                              → { ok, pages }
//     action:'get'      + id                     → { ok, page }
//     action:'save'     + {id?, title, slug?, theme, status, sections, …}
//                                                → { ok, id, slug }
//     action:'setStatus'+ {id, status}           → { ok, id, status }
//
// callPropelRoute sends the agent's own session token; identity + role are
// derived server-side and the route fails CLOSED (NOT_FOUND) for a non-Manager.
// It returns the parsed 2xx body, or null (non-2xx / network / not signed in /
// route not deployed). The route also answers 200 with { error, code } for a
// gated/bad-input envelope, so we narrow on body shape and hand callers a
// discriminated result — never a fake-empty success.

const ROUTE = '/website/landing-admin';

export interface LandingSection {
  type: LandingSectionType;
  props: Record<string, unknown>;
}

// Summary row (list view). Matches the route's `pages[]` projection.
export interface LandingPageSummary {
  id: string;
  title: string;
  slug: string;
  status: LandingStatus;
  theme: LandingTheme;
  headline: string;
  metaDescription: string;
  ogImageUrl: string;
  visits: number;
  leads: number;
  publishedAt: string | null;
  updatedAt: string | null;
}

// Full page (editor). Adds the section list.
export interface LandingPageFull extends Omit<LandingPageSummary, 'updatedAt'> {
  sections: LandingSection[];
}

export interface SaveLandingInput {
  id?: string;
  title: string;
  slug?: string;
  theme: LandingTheme;
  status: LandingStatus;
  headline?: string;
  metaDescription?: string;
  ogImageUrl?: string;
  sections: LandingSection[];
}

export type CrmResult<T> = { ok: true; data: T } | { ok: false; error: string };

type Envelope = { ok?: boolean; error?: string; code?: string } & Record<string, unknown>;

const failMessage = (body: Envelope | null): string => {
  if (body === null) {
    return 'Could not reach the landing-page service (sign in as a Manager; the object may not be deployed yet).';
  }
  return typeof body.error === 'string' && body.error ? body.error : 'Request failed.';
};

export async function listLandingPages(): Promise<CrmResult<LandingPageSummary[]>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'list' });
  if (body && body.ok === true && Array.isArray(body.pages)) {
    return { ok: true, data: body.pages as LandingPageSummary[] };
  }
  return { ok: false, error: failMessage(body) };
}

export async function getLandingPage(id: string): Promise<CrmResult<LandingPageFull>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'get', id });
  if (body && body.ok === true && body.page && typeof body.page === 'object') {
    return { ok: true, data: body.page as LandingPageFull };
  }
  return { ok: false, error: failMessage(body) };
}

export async function saveLandingPage(
  input: SaveLandingInput,
): Promise<CrmResult<{ id: string; slug: string }>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'save', ...input });
  if (body && body.ok === true && typeof body.id === 'string') {
    return { ok: true, data: { id: body.id, slug: String(body.slug ?? '') } };
  }
  return { ok: false, error: failMessage(body) };
}

export async function setLandingStatus(
  id: string,
  status: LandingStatus,
): Promise<CrmResult<{ id: string; status: LandingStatus }>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'setStatus', id, status });
  if (body && body.ok === true && typeof body.id === 'string') {
    return { ok: true, data: { id: body.id, status } };
  }
  return { ok: false, error: failMessage(body) };
}
