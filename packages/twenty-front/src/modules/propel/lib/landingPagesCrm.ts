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

// C6 — the `list` response carries a hero-only preview origin in `meta`. Read from
// SITE_PUBLIC_URL server-side; absent → '' (the editor then degrades to full-width
// forms with a dimmed note — see LandingPreviewPane). We surface it ALONGSIDE the
// page rows so a single list fetch feeds both the grid and the preview iframe src.
export interface LandingListPayload {
  pages: LandingPageSummary[];
  sitePublicUrl: string;
}

const readSitePublicUrl = (body: Envelope | null): string => {
  const meta = body?.meta;
  if (meta !== null && typeof meta === 'object') {
    const url = (meta as Record<string, unknown>).sitePublicUrl;
    if (typeof url === 'string') return url;
  }
  return '';
};

const failMessage = (body: Envelope | null): string => {
  if (body === null) {
    return 'Could not reach the landing-page service (sign in as a Manager; the object may not be deployed yet).';
  }
  return typeof body.error === 'string' && body.error ? body.error : 'Request failed.';
};

export async function listLandingPages(): Promise<CrmResult<LandingListPayload>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'list' });
  if (body && body.ok === true && Array.isArray(body.pages)) {
    return {
      ok: true,
      data: { pages: body.pages as LandingPageSummary[], sitePublicUrl: readSitePublicUrl(body) },
    };
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

// ── Project-image assets (C4) ────────────────────────────────────────────────
// A SEPARATE Manager/Admin-gated route from landing-admin: the image picker asks
// the off-plan service (via the CRM) for projects + their GenieMap renders, mapped
// to same-domain gateway paths (/img/gm/<cdn-path>). The route fails CLOSED with
// `{ ok:false, code:'FEATURE_OFF' }` when OFFPLAN_SERVICE_URL is unset — the picker
// then HIDES its button (never fabricates a gallery). Flat body, per the gotcha.
//
//   POST /website/landing-assets  body { action, ... }
//     action:'projectSearch' + query               → { ok, projects[] }
//     action:'projectImages' + projectExternalId   → { ok, images[] }

const ASSETS_ROUTE = '/website/landing-assets';

export interface ProjectSearchResult {
  externalId: string;
  name: string;
  developerName: string;
  districtName: string;
}

export interface ProjectImage {
  id: string;
  gatewayPath: string; // e.g. /img/gm/17/97/67/8b/720_….webp — served from OUR domain
}

// Discriminated result: `featureOff` distinguishes "the assets feature isn't wired
// on this workspace" (hide the picker, silently) from a transient error (toast).
export type AssetsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; featureOff: boolean };

const isFeatureOff = (body: Envelope | null): boolean =>
  body !== null && body.ok === false && body.code === 'FEATURE_OFF';

const assetsFail = (body: Envelope | null): AssetsResult<never> => ({
  ok: false,
  error: isFeatureOff(body) ? 'Project images are not configured on this workspace.' : failMessage(body),
  featureOff: isFeatureOff(body),
});

export async function searchProjects(query: string): Promise<AssetsResult<ProjectSearchResult[]>> {
  const body = await callPropelRoute<Envelope>(ASSETS_ROUTE, { action: 'projectSearch', query });
  if (body && body.ok === true && Array.isArray(body.projects)) {
    return { ok: true, data: body.projects as ProjectSearchResult[] };
  }
  return assetsFail(body);
}

export async function projectImages(
  projectExternalId: string,
): Promise<AssetsResult<ProjectImage[]>> {
  const body = await callPropelRoute<Envelope>(ASSETS_ROUTE, {
    action: 'projectImages',
    projectExternalId,
  });
  if (body && body.ok === true && Array.isArray(body.images)) {
    return { ok: true, data: body.images as ProjectImage[] };
  }
  return assetsFail(body);
}

// ── AI image generation (I3 / I5) ────────────────────────────────────────────
// A THIRD Manager/Admin-gated route: type a prompt → an AI image (OpenAI
// gpt-image-1) is generated by the image-service sidecar, stored as a webp, and
// mapped to a same-domain gateway path (/img/is/<name>). The CRM route holds the
// service token and applies the house/no-fake-building guardrail server-side —
// the hero NEVER sees the token or shapes the guardrail. Flat body, per the gotcha.
//
//   POST /website/landing-image  body { action:'generate', prompt, aspect?, projectName? }
//     → { ok:true, gatewayPath:'/img/is/<name>', provenance:'ai' }
//     → { ok:false, code:'FEATURE_OFF' }   (OPENAI_API_KEY / IMAGE_SERVICE_URL unset)
//     → { ok:false, code, message }        (generate failed / safety refusal)

const IMAGE_ROUTE = '/website/landing-image';

export type ImageAspect = 'landscape' | 'portrait' | 'square';

export interface GenerateImageInput {
  prompt: string;
  aspect: ImageAspect;
  // Best-effort context for the server-side guardrail (a page's title/brief).
  // Empty is fine — the route only appends the "no specific real building" clause
  // when this is non-empty.
  projectName?: string;
}

// Same discriminated shape as AssetsResult: `featureOff` distinguishes "AI image
// generation isn't wired on this workspace" (dim the tab) from a transient error
// (toast, keep the popover open).
export type GenerateImageResult =
  | { ok: true; gatewayPath: string }
  | { ok: false; error: string; featureOff: boolean };

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const body = await callPropelRoute<Envelope>(IMAGE_ROUTE, {
    action: 'generate',
    prompt: input.prompt,
    aspect: input.aspect,
    projectName: input.projectName ?? '',
  });
  if (
    body &&
    body.ok === true &&
    typeof body.gatewayPath === 'string' &&
    body.gatewayPath !== ''
  ) {
    return { ok: true, gatewayPath: body.gatewayPath };
  }
  return {
    ok: false,
    error: isFeatureOff(body)
      ? 'AI image generation isn’t configured yet.'
      : failMessage(body),
    featureOff: isFeatureOff(body),
  };
}
