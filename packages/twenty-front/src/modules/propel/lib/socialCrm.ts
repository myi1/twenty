import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { type SocialNetwork } from '@/propel/types/socialCalendar';

// Data layer for the Social Bench (4S-A · Campaign mode). Two Manager/Admin-gated
// CRM routes drive the campaign box + plan review (propel-crm-integration):
//
//   POST /s/social/plan-bench   body { action, ... }   (FLAT body — the gotcha)
//     action:'generate' + { brief, networks?, window? }
//                                → { ok, planId, postCount, propertyPostCount, benchLog }
//                                → { ok:false, code:'FEATURE_OFF' }        (LLM key unset)
//                                → { ok:false, code:'BENCH_INVALID', benchLog }
//     action:'get'      + { planId }
//                                → { ok, plan, posts[], meta:{ sitePublicUrl } }
//
//   POST /s/social/plan-approve body { action, ... }
//     action:'approve' + { planId, postIds? }
//                                → { ok, scheduled }
//                                → { ok:false, code:'PERMIT_REQUIRED', posts:[{id,platform}] }
//     action:'dismiss' + { planId } → { ok }
//
// callPropelRoute sends the CRM session token; identity + role are derived
// server-side and the routes fail CLOSED (NOT_FOUND) for a non-Manager. It returns
// the parsed 2xx body, or null (non-2xx / network / not signed in / route not
// deployed). A gated/bad-input envelope answers 200 with { ok:false, code, ... },
// so we narrow on body shape and hand callers a discriminated result.
//
// ⚠️ `getPlan` targets the SAME plan-bench route with `{action:'get'}` — the FORK
// builds against the two pinned routes (plan-bench / plan-approve) only; the read
// projection (plan + its per-platform children + the sitePublicUrl for the Media
// Studio) rides the bench route rather than a third endpoint. If CRM agent A shapes
// the read path differently, this is the one seam to reconcile.

const BENCH_ROUTE = '/social/plan-bench';
const APPROVE_ROUTE = '/social/plan-approve';

type Envelope = { ok?: boolean; error?: string; code?: string } & Record<
  string,
  unknown
>;

// One append-only audit entry the bench writes per stage (mirror of the CRM-side
// benchLog shape). `ts` is an ISO string; `agent` is Strategist/Copywriter/… .
export interface BenchLogEntry {
  ts: string;
  agent: string;
  action: string;
  summary: string;
}

export type PlanStatus =
  | 'GENERATING'
  | 'PROPOSED'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'ARCHIVED';

// The parent socialContentPlan summary (review header).
export interface SocialPlanSummary {
  id: string;
  name: string;
  brief: string;
  status: PlanStatus;
  windowStart: string | null;
  windowEnd: string | null;
  // Stage 3E — Scout-drafted plans (SC4). Both tolerant: routes/plans predating
  // the landing-scout cron simply omit them → no badge. `mode` is 'SCOUT' on a
  // plan the cron proposed; `scoutReason` is its one-line rationale.
  mode: string | null;
  scoutReason: string | null;
}

// One per-platform child socialPost as projected for review. `ideaKey` groups the
// cards by campaign idea/day; `hasPermit` is a best-effort hint for the permit chip
// (the plan-approve gate stays authoritative). `mediaRefs` is the raw column value
// (JSON string or parsed) — reuse parseMediaRefs to render/round-trip it.
export interface PlanPost {
  id: string;
  platform: SocialNetwork | null;
  body: string;
  mediaRefs: unknown;
  scheduledAt: string | null;
  status: string;
  attestedNoProperty: boolean | null;
  listingId: string | null;
  hasPermit: boolean | null;
  ideaKey: string | null;
  ideaTheme: string | null;
}

const failMessage = (body: Envelope | null): string => {
  if (body === null) {
    return 'Could not reach the social bench (sign in as a Manager; the campaign feature may not be deployed yet).';
  }
  return typeof body.error === 'string' && body.error
    ? body.error
    : 'Request failed.';
};

const isFeatureOff = (body: Envelope | null): boolean =>
  body !== null && body.ok === false && body.code === 'FEATURE_OFF';

const asBenchLog = (v: unknown): BenchLogEntry[] =>
  Array.isArray(v) ? (v as BenchLogEntry[]) : [];

// ── generate ─────────────────────────────────────────────────────────────────

export interface GeneratePlanWindow {
  start: string;
  end: string;
}

// Same discriminated shape as the LP bench: `featureOff` distinguishes "the bench
// isn't wired on this workspace" (dim the box) from a transient/BENCH_INVALID
// failure (toast, keep the box). On success the caller opens the plan review.
export type GeneratePlanResult =
  | { ok: true; planId: string; benchLog: BenchLogEntry[] }
  | { ok: false; error: string; featureOff: boolean };

export async function generatePlan(
  brief: string,
  networks: SocialNetwork[],
  window?: GeneratePlanWindow,
  // Sources grounding (SRC-1 / plan SM3): ≤8 sourceMaterial ids. The bench io
  // loads each source's extractedText and prepends an authoritative-figures
  // grounding block to the Strategist context. Absent/empty → unchanged behavior.
  sourceIds?: string[],
): Promise<GeneratePlanResult> {
  // FLAT body — networks + optional window + optional sourceIds sit at the top
  // level so the route reads event.body.networks / .window / .sourceIds directly.
  const body = await callPropelRoute<Envelope>(BENCH_ROUTE, {
    action: 'generate',
    brief,
    networks,
    ...(window ? { window } : {}),
    ...(sourceIds && sourceIds.length > 0 ? { sourceIds } : {}),
  });
  if (body && body.ok === true && typeof body.planId === 'string' && body.planId !== '') {
    return { ok: true, planId: body.planId, benchLog: asBenchLog(body.benchLog) };
  }
  return {
    ok: false,
    error: isFeatureOff(body)
      ? 'AI campaign drafting isn’t configured yet.'
      : failMessage(body),
    featureOff: isFeatureOff(body),
  };
}

// ── get (review) ───────────────────────────────────────────────────────────────

export interface PlanDetail {
  plan: SocialPlanSummary;
  posts: PlanPost[];
  // Gateway origin for the Media Studio (sitePublicUrl + gatewayPath). '' when the
  // workspace has no SITE_PUBLIC_URL — the studio degrades (Library/Generate dim).
  sitePublicUrl: string;
}

export type GetPlanResult =
  | { ok: true; data: PlanDetail }
  | { ok: false; error: string };

const asBool = (v: unknown): boolean | null =>
  typeof v === 'boolean' ? v : null;

const asStrOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : null;

const parsePlanPost = (raw: unknown): PlanPost | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  const platform =
    r.platform === 'FACEBOOK' ||
    r.platform === 'INSTAGRAM' ||
    r.platform === 'LINKEDIN' ||
    r.platform === 'TIKTOK'
      ? (r.platform as SocialNetwork)
      : null;
  return {
    id: r.id,
    platform,
    body: typeof r.body === 'string' ? r.body : '',
    mediaRefs: r.mediaRefs ?? null,
    scheduledAt: asStrOrNull(r.scheduledAt),
    status: typeof r.status === 'string' ? r.status : 'DRAFT',
    attestedNoProperty: asBool(r.attestedNoProperty),
    listingId: asStrOrNull(r.listingId),
    hasPermit: asBool(r.hasPermit),
    ideaKey: asStrOrNull(r.ideaKey),
    ideaTheme: asStrOrNull(r.ideaTheme),
  };
};

const parsePlanSummary = (raw: unknown): SocialPlanSummary | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  const status =
    r.status === 'GENERATING' ||
    r.status === 'PROPOSED' ||
    r.status === 'APPROVED' ||
    r.status === 'SCHEDULED' ||
    r.status === 'ARCHIVED'
      ? (r.status as PlanStatus)
      : 'PROPOSED';
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : '',
    brief: typeof r.brief === 'string' ? r.brief : '',
    status,
    windowStart: asStrOrNull(r.windowStart),
    windowEnd: asStrOrNull(r.windowEnd),
    mode: asStrOrNull(r.mode),
    scoutReason: asStrOrNull(r.scoutReason),
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

export async function getPlan(planId: string): Promise<GetPlanResult> {
  const body = await callPropelRoute<Envelope>(BENCH_ROUTE, {
    action: 'get',
    planId,
  });
  if (body && body.ok === true) {
    const plan = parsePlanSummary(body.plan);
    if (plan !== null) {
      const posts = (Array.isArray(body.posts) ? body.posts : [])
        .map(parsePlanPost)
        .filter((p): p is PlanPost => p !== null);
      return {
        ok: true,
        data: { plan, posts, sitePublicUrl: readSitePublicUrl(body) },
      };
    }
  }
  return { ok: false, error: failMessage(body) };
}

// ── approve ────────────────────────────────────────────────────────────────────

// The offending posts a PERMIT_REQUIRED response carries — enough to highlight the
// blocked cards (id) and word the block (platform).
export interface PermitBlockedPost {
  id: string;
  platform: SocialNetwork | null;
}

// Three outcomes: approved (scheduled n), permit-blocked (highlight + block), or a
// transient/error. `permitRequired` is the discriminator the review panel branches
// on to highlight the offending cards without a toast.
export type ApprovePlanResult =
  | { ok: true; scheduled: number }
  | { ok: false; permitRequired: true; posts: PermitBlockedPost[] }
  | { ok: false; permitRequired: false; error: string };

const parseBlockedPosts = (v: unknown): PermitBlockedPost[] =>
  (Array.isArray(v) ? v : [])
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map((p) => ({
      id: typeof p.id === 'string' ? p.id : '',
      platform:
        p.platform === 'FACEBOOK' ||
        p.platform === 'INSTAGRAM' ||
        p.platform === 'LINKEDIN' ||
        p.platform === 'TIKTOK'
          ? (p.platform as SocialNetwork)
          : null,
    }))
    .filter((p) => p.id !== '');

export async function approvePlan(
  planId: string,
  postIds?: string[],
): Promise<ApprovePlanResult> {
  const body = await callPropelRoute<Envelope>(APPROVE_ROUTE, {
    action: 'approve',
    planId,
    ...(postIds && postIds.length > 0 ? { postIds } : {}),
  });
  if (body && body.ok === true) {
    const scheduled = typeof body.scheduled === 'number' ? body.scheduled : 0;
    return { ok: true, scheduled };
  }
  if (body && body.ok === false && body.code === 'PERMIT_REQUIRED') {
    return { ok: false, permitRequired: true, posts: parseBlockedPosts(body.posts) };
  }
  return { ok: false, permitRequired: false, error: failMessage(body) };
}

// ── dismiss ────────────────────────────────────────────────────────────────────

export type DismissPlanResult = { ok: true } | { ok: false; error: string };

export async function dismissPlan(planId: string): Promise<DismissPlanResult> {
  const body = await callPropelRoute<Envelope>(APPROVE_ROUTE, {
    action: 'dismiss',
    planId,
  });
  if (body && body.ok === true) return { ok: true };
  return { ok: false, error: failMessage(body) };
}

// ── review helpers (pure) ──────────────────────────────────────────────────────

// A property post that lacks a permit cannot be approved (the RERA checkpoint —
// SP4). This is the client-side pre-hint for the red "Permit required" chip; the
// plan-approve route stays authoritative and may still return PERMIT_REQUIRED.
export const needsPermit = (post: PlanPost): boolean =>
  post.attestedNoProperty === false && post.hasPermit !== true;

// Group review cards by campaign idea (ideaKey), falling back to the scheduled day
// so posts always land in a sensible section. Preserves first-seen order.
export interface PlanGroup {
  key: string;
  title: string;
  posts: PlanPost[];
}

const dayKey = (iso: string | null): string => {
  if (iso === null) return 'unscheduled';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unscheduled';
  return d.toISOString().slice(0, 10);
};

export const groupPlanPosts = (posts: PlanPost[]): PlanGroup[] => {
  const order: string[] = [];
  const map = new Map<string, PlanGroup>();
  for (const post of posts) {
    const key = post.ideaKey ?? dayKey(post.scheduledAt);
    let group = map.get(key);
    if (group === undefined) {
      const title =
        post.ideaTheme ??
        (post.ideaKey !== null
          ? post.ideaKey
          : post.scheduledAt !== null
            ? new Date(post.scheduledAt).toLocaleDateString([], {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })
            : 'Unscheduled');
      group = { key, title, posts: [] };
      map.set(key, group);
      order.push(key);
    }
    group.posts.push(post);
  }
  return order.map((k) => map.get(k)!);
};
