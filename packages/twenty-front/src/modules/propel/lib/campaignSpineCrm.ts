import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { friendlyError } from '@/propel/lib/friendlyError';
import {
  asPreflightChecks,
  type PreflightCheck,
} from '@/propel/lib/landingPagesCrm';

// Data layer for the Campaign Spine (CS4 v1 → V2 progressive fan-out) — the
// multi-channel campaign surface. ONE Manager/Admin-gated CRM route drives the
// whole spine (propel-crm-integration, pinned V2-2 contract; the CRM leg builds
// in parallel — degrade gracefully):
//
//   POST /s/marketing/campaign-spine  body { action, ... }   (FLAT body — the gotcha)
//     action:'generate' + { brief, sourceIds?, window?, armsOnly?:true }
//       V2 (armsOnly honored) → { ok, campaignId,
//             strategy:{ channelMix, narrative, slug, utmCampaign,
//                        socialNetworks, window } }        (NO arms generated yet —
//             the client fans out one generateArm call per planned channel)
//       v1 route (armsOnly IGNORED — arms already generated in-request):
//         → { ok, campaignId, landingPageId, socialPlanId, benchLog }
//         → …+ { partial:true, failed:['social'] }   (one arm failed; the other linked)
//       either → { ok:false, code:'FEATURE_OFF' }    (LLM key unset)
//              → { ok:false, code:'BENCH_INVALID', benchLog } (strategy/arms failed)
//     action:'generateArm' + { campaignId, arm:'LP'|'SOCIAL'|'EMAIL'|'BLOG' }
//         → { ok, armId }                             (that arm's bench ran + linked)
//         → { ok, alreadyExists:true, armId }         (idempotent — safe on retry)
//     action:'get' + { campaignId }
//         → { ok, campaign, arms:{ landingPage?:{id,name,status,slug},
//                                  socialPlan?:{id,name,status,postCount},
//                                  email?:{id,name,status},
//                                  blog?:{id,title,status} },
//             rollup:{ visits, leads, sent, opens, replies, attributedRevenue },
//             meta:{ sitePublicUrl } }
//     action:'approve' + { campaignId, arms? }       (arms:['lp'] = partial approve)
//         → { ok }                                    (all requested gates passed)
//         → { ok:false, code:'GATES_FAILED', gates:{ lp?, social?, email?, blog? } }
//           gates.lp    → the LP pre-flight payload ({checks:[…]} or the rows array)
//           gates.social→ the permit payload ({posts:[{id,platform}]} or the array)
//           gates.email / gates.blog → tolerant reason payloads (string or {reason})
//     action:'dismiss' + { campaignId }              → { ok }   (campaign ARCHIVED)
//     action:'list' + { filter?:{ status?, sourceKind? } }      (v3 pin — the
//         Proposed queue; the CRM leg may not carry it yet)
//         → { ok, campaigns:[{ id, name, brief, status, sourceKind, sourceRef,
//                              windowStart, windowEnd }] }
//         → { ok:false, error:'unknown action …' }   (pre-v3 route — the queue
//           degrades to EMPTY, never an error toast)
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

// The four spine arms (V2 added email + blog). The route reports failures/gates
// per arm under these keys (tolerant: 'landingPage'/'landing', 'socialPlan',
// 'EMAIL'/'BLOG' wire-name variants are all normalized to this union).
export type SpineArm = 'lp' | 'social' | 'email' | 'blog';

// The wire names generateArm expects (V2-2 contract).
const ARM_WIRE: Record<SpineArm, 'LP' | 'SOCIAL' | 'EMAIL' | 'BLOG'> = {
  lp: 'LP',
  social: 'SOCIAL',
  email: 'EMAIL',
  blog: 'BLOG',
};

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
  // Maker-checker (Phase 2) — an agent's "Approve campaign" submits instead; the
  // route stamps these so the campaign carries a "Pending approval" / "Sent back"
  // badge. Tolerant: routes predating the gate omit them → no badge.
  submittedForApprovalAt: string | null;
  sentBackAt: string | null;
  sentBackNote: string | null;
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

// The email arm (a DRAFT marketingCampaign) as projected by `get` — the id
// deep-links the campaign builder ("Open in Campaigns").
export interface SpineEmailArm {
  id: string;
  name: string;
  status: string;
}

// The blog arm (a blogPost in the pipeline's earliest human-review stage) — the
// id deep-links the Blog board ("Open in Blog").
export interface SpineBlogArm {
  id: string;
  title: string;
  status: string;
}

// Roll-up metrics aggregated from arm metrics server-side on `get` (V2-2):
// LP visits/leads · email sent/opens/replies/attributed revenue · social
// engagement folded into the same buckets. Every field is null when the route
// (or an older route) didn't report it — the strip renders only non-null stats.
export interface SpineRollup {
  visits: number | null;
  leads: number | null;
  sent: number | null;
  opens: number | null;
  replies: number | null;
  attributedRevenue: number | null;
}

const failMessage = (body: Envelope | null): string => {
  if (body === null) {
    return 'Could not reach the campaign spine (sign in as a Manager; the feature may not be deployed yet).';
  }
  return typeof body.error === 'string' && body.error
    ? friendlyError(body.error, 'generic')
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

// Normalize one route arm name ('lp'/'LP'/'landingPage'/'EMAIL'/…) to the
// SpineArm union; anything unrecognized is dropped rather than guessed.
const asSpineArm = (item: unknown): SpineArm | null => {
  if (typeof item !== 'string') return null;
  const key = item.toLowerCase();
  if (key === 'lp' || key.startsWith('landing')) return 'lp';
  if (key.startsWith('social')) return 'social';
  if (key.startsWith('email')) return 'email';
  if (key.startsWith('blog')) return 'blog';
  return null;
};

const asSpineArms = (v: unknown): SpineArm[] => {
  if (!Array.isArray(v)) return [];
  const out: SpineArm[] = [];
  for (const item of v) {
    const arm = asSpineArm(item);
    if (arm !== null && !out.includes(arm)) out.push(arm);
  }
  return out;
};

// ── generate ─────────────────────────────────────────────────────────────────

export interface CampaignWindow {
  start: string;
  end: string;
}

// `partial:true` → one or more arms failed to generate (listed in `failed`);
// the review opens with those cards marked "generation failed". `plannedArms`
// is every arm the strategist planned (V2) or the v1 pair — the strip renders
// one pill per planned arm. `unavailable` dims the box.
export type GenerateCampaignResult =
  | {
      ok: true;
      campaignId: string;
      landingPageId: string | null;
      socialPlanId: string | null;
      partial: boolean;
      failed: SpineArm[];
      plannedArms: SpineArm[];
      benchLog: BenchLogEntry[];
    }
  | { ok: false; error: string; unavailable: boolean };

// Live per-arm progress for the panel's pill strip: fired 'active' when an
// arm's generateArm call is dispatched, then 'done' | 'failed' as it settles.
export type ArmProgressState = 'active' | 'done' | 'failed';
export type ArmProgressFn = (arm: SpineArm, state: ArmProgressState) => void;

// Read strategy.channelMix off an armsOnly response. A non-object / missing
// strategy → null, which is the "v1 route ignored armsOnly" tell (the arms are
// already generated in-request — skip the fan-out).
const readChannelMix = (body: Envelope): SpineArm[] | null => {
  const strategy = body.strategy;
  if (strategy === null || typeof strategy !== 'object') return null;
  return asSpineArms((strategy as Record<string, unknown>).channelMix);
};

// V2 client-driven fan-out: `generate` runs armsOnly (Strategist only), then
// ONE generateArm call per planned channel fires in PARALLEL
// (Promise.allSettled) — each ≤60s in-process on the route — with `onArm`
// surfacing per-arm completion so the review fills progressively.
//
// Graceful degrade: the v1 route ignores `armsOnly` and answers the full v1
// shape (arms already present) — detected via the missing `strategy` object —
// so we skip the fan-out and report lp/social progress from its result.
export async function generateCampaign(
  brief: string,
  sourceIds?: string[],
  window?: CampaignWindow,
  onArm?: ArmProgressFn,
): Promise<GenerateCampaignResult> {
  // FLAT body — sourceIds/window/armsOnly sit at the top level so the route
  // reads event.body.sourceIds / .window / .armsOnly directly.
  const body = await callPropelRoute<Envelope>(ROUTE, {
    action: 'generate',
    brief,
    armsOnly: true,
    ...(sourceIds && sourceIds.length > 0 ? { sourceIds } : {}),
    ...(window ? { window } : {}),
  });
  if (
    !body ||
    body.ok !== true ||
    typeof body.campaignId !== 'string' ||
    body.campaignId === ''
  ) {
    return {
      ok: false,
      error: isUnavailable(body)
        ? 'Multi-channel campaigns aren’t enabled yet.'
        : failMessage(body),
      unavailable: isUnavailable(body),
    };
  }

  const campaignId = body.campaignId;
  const channelMix = readChannelMix(body);

  if (channelMix === null) {
    // v1 full shape — arms were generated in-request. Settle the strip pills
    // off the result so the caller's UI still ticks per arm.
    const failed = asSpineArms(body.failed);
    const planned: SpineArm[] = ['lp', 'social'];
    for (const arm of planned) {
      onArm?.(arm, failed.includes(arm) ? 'failed' : 'done');
    }
    return {
      ok: true,
      campaignId,
      landingPageId: asStrOrNull(body.landingPageId),
      socialPlanId: asStrOrNull(body.socialPlanId),
      partial: body.partial === true,
      failed,
      plannedArms: planned,
      benchLog: asBenchLog(body.benchLog),
    };
  }

  // Progressive mode. An empty channelMix would strand the campaign in
  // DRAFTING with zero arms — fall back to the v1 pair rather than doing nothing.
  const planned = channelMix.length > 0 ? channelMix : (['lp', 'social'] as SpineArm[]);
  const armIds: Partial<Record<SpineArm, string | null>> = {};
  const failed: SpineArm[] = [];

  await Promise.allSettled(
    planned.map(async (arm) => {
      onArm?.(arm, 'active');
      const res = await generateArm(campaignId, arm);
      if (res.ok) {
        armIds[arm] = res.armId;
        onArm?.(arm, 'done');
      } else {
        failed.push(arm);
        onArm?.(arm, 'failed');
      }
    }),
  );

  return {
    ok: true,
    campaignId,
    landingPageId: armIds.lp ?? null,
    socialPlanId: armIds.social ?? null,
    partial: failed.length > 0,
    failed,
    plannedArms: planned,
    benchLog: asBenchLog(body.benchLog),
  };
}

// ── generateArm ───────────────────────────────────────────────────────────────

// One arm's bench, run in-process on the route (≤60s). Idempotent-safe: the arm
// already existing answers { ok, alreadyExists, armId } — so a retry after a
// timeout / double-click can never mint a duplicate arm.
export type GenerateArmResult =
  | { ok: true; armId: string | null; alreadyExists: boolean }
  | { ok: false; error: string; unavailable: boolean };

export async function generateArm(
  campaignId: string,
  arm: SpineArm,
): Promise<GenerateArmResult> {
  const body = await callPropelRoute<Envelope>(ROUTE, {
    action: 'generateArm',
    campaignId,
    arm: ARM_WIRE[arm],
  });
  if (body && body.ok === true) {
    return {
      ok: true,
      armId: asStrOrNull(body.armId),
      alreadyExists: body.alreadyExists === true,
    };
  }
  return {
    ok: false,
    error: failMessage(body),
    unavailable: isUnavailable(body),
  };
}

// ── get (review) ───────────────────────────────────────────────────────────────

export interface CampaignDetailPayload {
  campaign: SpineCampaign;
  arms: {
    landingPage: SpineLandingArm | null;
    socialPlan: SpineSocialArm | null;
    email: SpineEmailArm | null;
    blog: SpineBlogArm | null;
  };
  // All-null on a v1 route (rollup absent) — the strip stays hidden.
  rollup: SpineRollup;
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
    submittedForApprovalAt: asStrOrNull(r.submittedForApprovalAt),
    sentBackAt: asStrOrNull(r.sentBackAt),
    sentBackNote: asStrOrNull(r.sentBackNote),
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

const parseEmailArm = (raw: unknown): SpineEmailArm | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : '',
    status: typeof r.status === 'string' ? r.status : '',
  };
};

const parseBlogArm = (raw: unknown): SpineBlogArm | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  return {
    id: r.id,
    // Tolerate a name-keyed projection from an intermediate route build.
    title:
      typeof r.title === 'string'
        ? r.title
        : typeof r.name === 'string'
          ? r.name
          : '',
    status: typeof r.status === 'string' ? r.status : '',
  };
};

const asNumOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const parseRollup = (raw: unknown): SpineRollup => {
  const r =
    raw !== null && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};
  return {
    visits: asNumOrNull(r.visits),
    leads: asNumOrNull(r.leads),
    sent: asNumOrNull(r.sent),
    opens: asNumOrNull(r.opens),
    replies: asNumOrNull(r.replies),
    attributedRevenue: asNumOrNull(r.attributedRevenue),
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
            email: parseEmailArm(arms.email),
            blog: parseBlogArm(arms.blog),
          },
          rollup: parseRollup(body.rollup),
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
// (LandingPagesTab's checklist shape), social → the permit-blocked posts, email/
// blog → a human-readable reason (tolerant: a bare string or {reason|error|
// detail|message}). A channel ABSENT from `gates` passed its gate (partial
// approve is offered for it).
export interface SpineGates {
  lp: PreflightCheck[] | null;
  social: SpinePermitPost[] | null;
  email: string | null;
  blog: string | null;
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

// Normalize an email/blog gate payload to one human-readable reason. Tolerant:
// a bare string, or the first string among reason/error/detail/message; any
// other truthy shape collapses to a generic line rather than being dropped
// (the channel IS gated — losing that would offer a partial approve it fails).
const parseGateReason = (v: unknown): string => {
  if (typeof v === 'string' && v !== '') return v;
  if (v !== null && typeof v === 'object') {
    const rec = v as Record<string, unknown>;
    for (const key of ['reason', 'error', 'detail', 'message']) {
      const val = rec[key];
      if (typeof val === 'string' && val !== '') return val;
    }
  }
  return 'This channel is not ready to approve yet.';
};

// Tolerate both `{checks:[…]}` / `{posts:[…]}` wrappers and bare arrays — the
// spine forwards "each channel's own failure payload", so we accept either shape.
const parseGates = (v: unknown): SpineGates => {
  const gates: SpineGates = { lp: null, social: null, email: null, blog: null };
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
  if (rec.email !== undefined && rec.email !== null) {
    gates.email = parseGateReason(rec.email);
  }
  if (rec.blog !== undefined && rec.blog !== null) {
    gates.blog = parseGateReason(rec.blog);
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

// ── list (V3 — the scout Proposed-campaigns queue) ──────────────────────────────
// The campaign sourceKind: MANUAL = founder-authored; LISTING/OFFPLAN_LAUNCH/SCOUT
// = proposed by the landing-scout cron. The queue shows the non-MANUAL ones.
export type CampaignSourceKind = 'MANUAL' | 'LISTING' | 'OFFPLAN_LAUNCH' | 'SCOUT';

export interface CampaignListItem {
  id: string;
  name: string;
  brief: string;
  status: CampaignStatus;
  sourceKind: CampaignSourceKind;
  sourceRef: string | null;
  windowStart: string | null;
  windowEnd: string | null;
}

const SOURCE_KINDS: readonly CampaignSourceKind[] = [
  'MANUAL',
  'LISTING',
  'OFFPLAN_LAUNCH',
  'SCOUT',
];

// Tolerant projection: a row missing an id (or malformed) is skipped, not thrown.
const parseCampaignListItem = (raw: unknown): CampaignListItem | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  const status: CampaignStatus =
    r.status === 'DRAFTING' ||
    r.status === 'REVIEW' ||
    r.status === 'APPROVED' ||
    r.status === 'LIVE' ||
    r.status === 'ARCHIVED'
      ? (r.status as CampaignStatus)
      : 'REVIEW';
  const sourceKind: CampaignSourceKind = SOURCE_KINDS.includes(
    r.sourceKind as CampaignSourceKind,
  )
    ? (r.sourceKind as CampaignSourceKind)
    : 'MANUAL';
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : '',
    brief: typeof r.brief === 'string' ? r.brief : '',
    status,
    sourceKind,
    sourceRef: asStrOrNull(r.sourceRef),
    windowStart: asStrOrNull(r.windowStart),
    windowEnd: asStrOrNull(r.windowEnd),
  };
};

export type ListCampaignsResult =
  | { ok: true; campaigns: CampaignListItem[] }
  | { ok: false; error: string; unavailable: boolean };

/**
 * listCampaigns — the scout Proposed queue's read. Filters are optional (one
 * status and/or one sourceKind). A route that predates the `list` action answers
 * unknown-action → `unavailable:true`, and the queue simply stays hidden.
 */
export async function listCampaigns(filter?: {
  status?: string;
  sourceKind?: string;
}): Promise<ListCampaignsResult> {
  const body = await callPropelRoute<Envelope & { campaigns?: unknown }>(ROUTE, {
    action: 'list',
    ...(filter && (filter.status || filter.sourceKind) ? { filter } : {}),
  });
  if (body && body.ok === true) {
    const rows = Array.isArray(body.campaigns) ? body.campaigns : [];
    return { ok: true, campaigns: rows.map(parseCampaignListItem).filter((c): c is CampaignListItem => c !== null) };
  }
  return { ok: false, error: failMessage(body), unavailable: isUnavailable(body) };
}
