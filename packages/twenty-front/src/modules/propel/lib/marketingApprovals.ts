import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { type MarketingWorkKind } from '@/propel/lib/marketingMyWork';
import { setLandingStatus } from '@/propel/lib/landingPagesCrm';
import { approvePlan } from '@/propel/lib/socialCrm';
import { approveCampaign } from '@/propel/lib/campaignSpineCrm';
import { decideBlogPost } from '@/propel/lib/blogCrm';

// Data layer for the manager side of maker-checker (Phase 2) — the "Submitted for
// approval" row folded into the Night-desk sign-off queue. Publisher-only.
//
// Two reads/actions:
//   1. getPendingApprovals — the queue of items agents submitted, awaiting sign-off.
//        POST /s/marketing/pending-approvals  body { action:'get' }
//          → { ok, items:[{ id, kind, title, status, submittedByMemberId,
//                           submittedForApprovalAt }], count }
//        Publisher-only server-side (returns empty for a non-publisher). Graceful
//        degrade: an undeployed/older route → `unavailable`, the row hides.
//   2. approveWorkItem — runs the REAL publish for that kind under the publisher's
//        authority (reuses the existing per-kind approve fns, so the permit/consent
//        gates fire correctly). The agent could not have satisfied those alone.
//   3. sendBackWorkItem — the publisher-only sendBack action on the item's own route
//        ({ action:'sendBack', id, note? }); clears the submission and stamps the
//        note so the maker sees it "came back to you".
//
// Every result normalizes to { ok, error? } so the row's buttons stay simple; the
// deep gate-resolution UX lives in the dedicated review panels.

const PENDING_ROUTE = '/marketing/pending-approvals';

// The kinds a go-live control can submit for approval. It is the four review kinds
// PLUS `CAMPAIGN_SEND` — the email/WA campaign *send* (a marketingCampaign on the
// `/marketing/send-request` route), which is a distinct object/route from the
// multi-channel Campaign Spine (`CAMPAIGN`). Both read "campaign" to a human, but
// they submit to different routes, so the send gets its own kind here. (The 4-kind
// `MarketingWorkKind` — used by my-work / pending-approvals — is unchanged.)
export type SubmitKind = MarketingWorkKind | 'CAMPAIGN_SEND';

// The route + native id key per submittable kind (the item's own route). `sendBack`
// and `submitForApproval` are the Phase-2 actions each route gained; we pass the
// route's native id key (planId/campaignId) alongside the generic `id` for
// tolerance (a route may read either).
const ROUTE_BY_KIND: Record<
  SubmitKind,
  { route: string; idKey: 'id' | 'planId' | 'campaignId' }
> = {
  LANDING_PAGE: { route: '/website/landing-admin', idKey: 'id' },
  SOCIAL_PLAN: { route: '/social/plan-approve', idKey: 'planId' },
  CAMPAIGN: { route: '/marketing/campaign-spine', idKey: 'campaignId' },
  BLOG: { route: '/blog/approve', idKey: 'id' },
  CAMPAIGN_SEND: { route: '/marketing/send-request', idKey: 'campaignId' },
};

export interface PendingApprovalItem {
  id: string;
  kind: MarketingWorkKind;
  title: string;
  status: string;
  submittedByMemberId: string | null;
  submittedForApprovalAt: string | null;
}

export type PendingApprovalsResult =
  | { ok: true; items: PendingApprovalItem[]; count: number }
  | { ok: false; unavailable: boolean; error: string };

type Envelope = { ok?: boolean; error?: string; code?: string } & Record<
  string,
  unknown
>;

const KINDS: readonly MarketingWorkKind[] = [
  'LANDING_PAGE',
  'SOCIAL_PLAN',
  'CAMPAIGN',
  'BLOG',
];

const asStrOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : null;

const asKind = (v: unknown): MarketingWorkKind | null =>
  typeof v === 'string' && (KINDS as string[]).includes(v)
    ? (v as MarketingWorkKind)
    : null;

const isUnavailable = (body: Envelope | null): boolean => {
  if (body === null) return true;
  if (body.ok === false && body.code === 'FEATURE_OFF') return true;
  return (
    typeof body.error === 'string' &&
    body.error.toLowerCase().includes('unknown action')
  );
};

const parsePending = (raw: unknown): PendingApprovalItem | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  const kind = asKind(r.kind);
  if (kind === null) return null;
  return {
    id: r.id,
    kind,
    title: typeof r.title === 'string' ? r.title : '',
    status: typeof r.status === 'string' ? r.status : '',
    submittedByMemberId: asStrOrNull(r.submittedByMemberId),
    submittedForApprovalAt: asStrOrNull(r.submittedForApprovalAt),
  };
};

export async function getPendingApprovals(): Promise<PendingApprovalsResult> {
  const body = await callPropelRoute<Envelope>(PENDING_ROUTE, { action: 'get' });
  if (body && body.ok === true) {
    const items = (Array.isArray(body.items) ? body.items : [])
      .map(parsePending)
      .filter((i): i is PendingApprovalItem => i !== null);
    const count =
      typeof body.count === 'number' && Number.isFinite(body.count)
        ? body.count
        : items.length;
    return { ok: true, items, count };
  }
  return {
    ok: false,
    unavailable: isUnavailable(body),
    error:
      typeof body?.error === 'string' && body.error
        ? body.error
        : 'Could not load the approval queue.',
  };
}

export type WorkActionResult = { ok: true } | { ok: false; error: string };

// Run the real publish for one submitted item, dispatched to the kind's existing
// approve fn (so its permit/consent gate runs under the publisher's authority). A
// gate failure surfaces a plain-language "open the item to resolve it" message —
// the full gate UX is in the dedicated review panels.
export async function approveWorkItem(
  kind: MarketingWorkKind,
  id: string,
): Promise<WorkActionResult> {
  switch (kind) {
    case 'LANDING_PAGE': {
      const res = await setLandingStatus(id, 'LIVE');
      if (res.ok) return { ok: true };
      return {
        ok: false,
        error: res.preflightFailed
          ? 'Publish blocked — open the page to resolve its pre-flight checks.'
          : res.error,
      };
    }
    case 'SOCIAL_PLAN': {
      const res = await approvePlan(id);
      if (res.ok) return { ok: true };
      return {
        ok: false,
        error: res.permitRequired
          ? 'Attach a permit to the property posts — open the plan to review.'
          : res.error,
      };
    }
    case 'CAMPAIGN': {
      const res = await approveCampaign(id);
      if (res.ok) return { ok: true };
      return {
        ok: false,
        error: res.gatesFailed
          ? "Some channels aren't ready — open the campaign to review its gates."
          : res.error,
      };
    }
    case 'BLOG': {
      const res = await decideBlogPost(id, 'approve');
      if (res.ok) return { ok: true };
      return { ok: false, error: res.error };
    }
    default:
      return { ok: false, error: 'Unknown item type.' };
  }
}

// The maker-side submit: an agent's "publish / set-live / send" click routes here
// instead of publishing. Posts `{ action:'submitForApproval', id }` (plus the
// route's native id key for tolerance) to the item's own route; the route stamps
// `submittedForApprovalAt` + `submittedByMemberId` (the unspoofable acting member)
// and does NOT publish. Idempotent server-side — a double-submit is a no-op. The
// backend gate is authoritative: even a publisher's route refuses a non-publisher
// publish and would route here, so this is the safe convenience path.
export async function submitForApproval(
  kind: SubmitKind,
  id: string,
): Promise<WorkActionResult> {
  const { route, idKey } = ROUTE_BY_KIND[kind];
  const body = await callPropelRoute<Envelope>(route, {
    action: 'submitForApproval',
    id,
    [idKey]: id,
  });
  if (body && body.ok === true) return { ok: true };
  return {
    ok: false,
    error:
      typeof body?.error === 'string' && body.error
        ? body.error
        : 'Could not submit this for approval.',
  };
}

// Publisher-only sendBack: clears the submission and stamps the note on the item's
// own route. Tolerant — passes both the generic `id` and the route's native id key.
export async function sendBackWorkItem(
  kind: MarketingWorkKind,
  id: string,
  note: string,
): Promise<WorkActionResult> {
  const { route, idKey } = ROUTE_BY_KIND[kind];
  const trimmed = note.trim();
  const body = await callPropelRoute<Envelope>(route, {
    action: 'sendBack',
    id,
    [idKey]: id,
    ...(trimmed !== '' ? { note: trimmed } : {}),
  });
  if (body && body.ok === true) return { ok: true };
  return {
    ok: false,
    error:
      typeof body?.error === 'string' && body.error
        ? body.error
        : 'Could not send this back.',
  };
}
