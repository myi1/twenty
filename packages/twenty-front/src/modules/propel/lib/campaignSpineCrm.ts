import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  asPreflightChecks,
  type PreflightCheck,
} from '@/propel/lib/landingPagesCrm';

// Data layer for Campaign Spine v1 (CS4) — the multi-channel campaign surface.
// ONE Manager/Admin-gated CRM route drives the whole spine (propel-crm-integration,
// pinned CS3 contract; the CRM leg builds in parallel — degrade gracefully):
//
//   POST /s/marketing/campaign-spine  body { action, ... }   (FLAT body — the gotcha)
//     action:'generate' + { brief, sourceIds?, window? }
//         → { ok, campaignId, landingPageId, socialPlanId, benchLog }
//         → …+ { partial:true, failed:['social'] }   (one arm failed; the other linked)
//         → { ok:false, code:'FEATURE_OFF' }         (LLM key unset)
//         → { ok:false, code:'BENCH_INVALID', benchLog }  (both arms failed — no row)
//     action:'get' + { campaignId }
//         → { ok, campaign, arms:{ landingPage?:{id,name,status,slug},
//                                  socialPlan?:{id,name,status,postCount} },
//             meta:{ sitePublicUrl } }
//     action:'approve' + { campaignId, arms? }       (arms:['lp'] = partial approve)
//         → { ok }                                    (all requested gates passed)
//         → { ok:false, code:'GATES_FAILED', gates:{ lp?, social? } }
//           gates.lp    → the LP pre-flight payload ({checks:[…]} or the rows array)
//           gates.social→ the permit payload ({posts:[{id,platform}]} or the array)
//     action:'dismiss' + { campaignId }              → { ok }   (campaign ARCHIVED)
//
// callPropelRoute sends the CRM session token; identity + role are derived
// server-side and the route fails CLOSED for a non-Manager. It returns the parsed
// 2xx body, or null (non-2xx / network / not signed in / route not deployed). A
// gated/bad-input envelope answers 200 with { ok:false, code }, so we narrow on
// body shape and hand callers a discriminated result — never a fake-empty success.
//
// Graceful degrade (CS4): `unavailable` = the spine isn't live on this workspace
// (route missing → null body, FEATURE_OFF, or an older route answering "unknown
// action") — the panel dims with "multi-channel campaigns aren't enabled yet"
// instead of toasting a transient error.

const ROUTE = '/marketing/campaign-spine';

type Envelope = { ok?: boolean; error?: string; code?: string } & Record<
  string,
  unknown
>;

// One append-only audit entry the meta-bench writes per stage (strategist + one
// entry per arm delegation). Mirror of the CRM-side benchLog shape.
export interface BenchLogEntry {
  ts: string;
  agent: string;
  action: string;
  summary: string;
}

// The two v1 arms. The route reports failures/gates per arm under these keys
// (tolerant: 'landingPage'/'landing' and 'socialPlan' variants are normalized).
export type SpineArm = 'lp' | 'social';

export type CampaignStatus =
  | 'DRAFTING'
  | 'REVIEW'
  | 'APPROVED'
  | 'LIVE'
  | 'ARCHIVED';

export interface SpineCampaign {
  id: string;
  name: string;
  brief: string;
  narrative: string;
  status: CampaignStatus;
  utmCampaign: string;
  destinationLandingPageId: string | null;
  windowStart: string | null;
  windowEnd: string | null;
}

// The LP arm as projected by `get` — enough for the review card + the editor
// deep-link (id) + the destination URL (slug).
export interface SpineLandingArm {
  id: string;
  name: string;
  status: string;
  slug: string;
}

// The social arm as projected by `get` — postCount feeds the card; the id opens
// the existing PlanReviewPanel.
export interface SpineSocialArm {
  id: string;
  name: string;
  status: string;
  postCount: number;
}

const failMessage = (body: Envelope | null): string => {
  if (body === null) {
    return 'Could not reach the campaign spine (sign in as a Manager; the feature may not be deployed yet).';
  }
  return typeof body.error === 'string' && body.error
    ? body.error
    : 'Request failed.';
};

// Route missing (null), FEATURE_OFF, or a pre-spine route answering "unknown
// action" — all mean "the spine isn't live here", so the surface dims.
const isUnavailable = (body: Envelope | null): boolean => {
  if (body === null) return true;
  if (body.ok === false && body.code === 'FEATURE_OFF') return true;
  return (
    typeof body.error === 'string' &&
    body.error.toLowerCase().includes('unknown action')
  );
};

const asBenchLog = (v: unknown): BenchLogEntry[] =>
  Array.isArray(v) ? (v as BenchLogEntry[]) : [];

const asStrOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : null;

// Normalize the route's arm names ('lp'/'landingPage'/… ) to the SpineArm union;
// anything unrecognized is dropped rather than guessed.
const asSpineArms = (v: unknown): SpineArm[] => {
  if (!Array.isArray(v)) return [];
  const out: SpineArm[] = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const key = item.toLowerCase();
    if ((key === 'lp' || key.startsWith('landing')) && !out.includes('lp')) {
      out.push('lp');
    } else if (key.startsWith('social') && !out.includes('social')) {
      out.push('social');
    }
  }
  return out;
};

// ── generate ─────────────────────────────────────────────────────────────────

export interface CampaignWindow {
  start: string;
  end: string;
}

// `partial:true` → one arm failed to generate (listed in `failed`); the review
// opens with that arm marked "generation failed". `unavailable` dims the box.
export type GenerateCampaignResult =
  | {
      ok: true;
      campaignId: string;
      landingPageId: string | null;
      socialPlanId: string | null;
      partial: boolean;
      failed: SpineArm[];
      benchLog: BenchLogEntry[];
    }
  | { ok: false; error: string; unavailable: boolean };

export async function generateCampaign(
  brief: string,
  sourceIds?: string[],
  window?: CampaignWindow,
): Promise<GenerateCampaignResult> {
  // FLAT body — sourceIds/window sit at the top level so the route reads
  // event.body.sourceIds / .window directly.
  const body = await callPropelRoute<Envelope>(ROUTE, {
    action: 'generate',
    brief,
    ...(sourceIds && sourceIds.length > 0 ? { sourceIds } : {}),
    ...(window ? { window } : {}),
  });
  if (
    body &&
    body.ok === true &&
    typeof body.campaignId === 'string' &&
    body.campaignId !== ''
  ) {
    return {
      ok: true,
      campaignId: body.campaignId,
      landingPageId: asStrOrNull(body.landingPageId),
      socialPlanId: asStrOrNull(body.socialPlanId),
      partial: body.partial === true,
      failed: asSpineArms(body.failed),
      benchLog: asBenchLog(body.benchLog),
    };
  }
  return {
    ok: false,
    error: isUnavailable(body)
      ? 'Multi-channel campaigns aren’t enabled yet.'
      : failMessage(body),
    unavailable: isUnavailable(body),
  };
}

// ── get (review) ───────────────────────────────────────────────────────────────

export interface CampaignDetailPayload {
  campaign: SpineCampaign;
  arms: {
    landingPage: SpineLandingArm | null;
    socialPlan: SpineSocialArm | null;
  };
  // Gateway/site origin from meta — '' when SITE_PUBLIC_URL is unset server-side.
  sitePublicUrl: string;
}

export type GetCampaignResult =
  | { ok: true; data: CampaignDetailPayload }
  | { ok: false; error: string; unavailable: boolean };

const parseCampaign = (raw: unknown): SpineCampaign | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  const status =
    r.status === 'DRAFTING' ||
    r.status === 'REVIEW' ||
    r.status === 'APPROVED' ||
    r.status === 'LIVE' ||
    r.status === 'ARCHIVED'
      ? (r.status as CampaignStatus)
      : 'REVIEW';
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : '',
    brief: typeof r.brief === 'string' ? r.brief : '',
    narrative: typeof r.narrative === 'string' ? r.narrative : '',
    status,
    utmCampaign: typeof r.utmCampaign === 'string' ? r.utmCampaign : '',
    destinationLandingPageId: asStrOrNull(r.destinationLandingPageId),
    windowStart: asStrOrNull(r.windowStart),
    windowEnd: asStrOrNull(r.windowEnd),
  };
};

const parseLandingArm = (raw: unknown): SpineLandingArm | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : '',
    status: typeof r.status === 'string' ? r.status : '',
    slug: typeof r.slug === 'string' ? r.slug : '',
  };
};

const parseSocialArm = (raw: unknown): SpineSocialArm | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : '',
    status: typeof r.status === 'string' ? r.status : '',
    postCount: typeof r.postCount === 'number' ? r.postCount : 0,
  };
};

const readSitePublicUrl = (body: Envelope | null): string => {
  const meta = body?.meta;
  if (meta !== null && typeof meta === 'object') {
    const url = (meta as Record<string, unknown>).sitePublicUrl;
    if (typeof url === 'string') return url;
  }
  const top = body?.sitePublicUrl;
  return typeof top === 'string' ? top : '';
};

export async function getCampaign(
  campaignId: string,
): Promise<GetCampaignResult> {
  const body = await callPropelRoute<Envelope>(ROUTE, {
    action: 'get',
    campaignId,
  });
  if (body && body.ok === true) {
    const campaign = parseCampaign(body.campaign);
    if (campaign !== null) {
      const arms =
        body.arms !== null && typeof body.arms === 'object'
          ? (body.arms as Record<string, unknown>)
          : {};
      return {
        ok: true,
        data: {
          campaign,
          arms: {
            landingPage: parseLandingArm(arms.landingPage),
            socialPlan: parseSocialArm(arms.socialPlan),
          },
          sitePublicUrl: readSitePublicUrl(body),
        },
      };
    }
  }
  return {
    ok: false,
    error: failMessage(body),
    unavailable: isUnavailable(body),
  };
}

// ── approve ────────────────────────────────────────────────────────────────────

// A permit-blocked social post inside a GATES_FAILED payload — enough to word the
// row (platform) and count the blockers. Same shape the plan-approve gate emits.
export interface SpinePermitPost {
  id: string;
  platform: string | null;
}

// Each channel's own failure payload, normalized: lp → the pre-flight check rows
// (LandingPagesTab's checklist shape), social → the permit-blocked posts. A
// channel ABSENT from `gates` passed its gate (partial approve is offered for it).
export interface SpineGates {
  lp: PreflightCheck[] | null;
  social: SpinePermitPost[] | null;
}

const parsePermitPosts = (v: unknown): SpinePermitPost[] =>
  (Array.isArray(v) ? v : [])
    .filter(
      (p): p is Record<string, unknown> => typeof p === 'object' && p !== null,
    )
    .map((p) => ({
      id: typeof p.id === 'string' ? p.id : '',
      platform: typeof p.platform === 'string' ? p.platform : null,
    }))
    .filter((p) => p.id !== '');

// Tolerate both `{checks:[…]}` / `{posts:[…]}` wrappers and bare arrays — the
// spine forwards "each channel's own failure payload", so we accept either shape.
const parseGates = (v: unknown): SpineGates => {
  const gates: SpineGates = { lp: null, social: null };
  if (v === null || typeof v !== 'object') return gates;
  const rec = v as Record<string, unknown>;
  const lpRaw = rec.lp ?? rec.landingPage;
  if (lpRaw !== undefined && lpRaw !== null) {
    const rows = Array.isArray(lpRaw)
      ? lpRaw
      : (lpRaw as Record<string, unknown>).checks;
    gates.lp = asPreflightChecks(rows);
  }
  const socialRaw = rec.social ?? rec.socialPlan;
  if (socialRaw !== undefined && socialRaw !== null) {
    const rows = Array.isArray(socialRaw)
      ? socialRaw
      : (socialRaw as Record<string, unknown>).posts;
    gates.social = parsePermitPosts(rows);
  }
  return gates;
};

// Three outcomes: approved (arms shipped), gates failed (per-channel payloads to
// render inline + partial-approve affordances), or a transient/unavailable error.
export type ApproveCampaignResult =
  | { ok: true }
  | { ok: false; gatesFailed: true; gates: SpineGates }
  | { ok: false; gatesFailed: false; error: string; unavailable: boolean };

export async function approveCampaign(
  campaignId: string,
  arms?: SpineArm[],
): Promise<ApproveCampaignResult> {
  const body = await callPropelRoute<Envelope>(ROUTE, {
    action: 'approve',
    campaignId,
    ...(arms && arms.length > 0 ? { arms } : {}),
  });
  if (body && body.ok === true) return { ok: true };
  if (body && body.ok === false && body.code === 'GATES_FAILED') {
    return { ok: false, gatesFailed: true, gates: parseGates(body.gates) };
  }
  return {
    ok: false,
    gatesFailed: false,
    error: failMessage(body),
    unavailable: isUnavailable(body),
  };
}

// ── dismiss ────────────────────────────────────────────────────────────────────

export type DismissCampaignResult =
  | { ok: true }
  | { ok: false; error: string };

export async function dismissCampaign(
  campaignId: string,
): Promise<DismissCampaignResult> {
  const body = await callPropelRoute<Envelope>(ROUTE, {
    action: 'dismiss',
    campaignId,
  });
  if (body && body.ok === true) return { ok: true };
  return { ok: false, error: failMessage(body) };
}
