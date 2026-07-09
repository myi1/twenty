import { callPropelRoute } from '@/propel/lib/callPropelRoute';

// Data layer for the agent "My Desk" home (maker-checker Phase 2) — the caller's
// OWN marketing work, bucketed by state.
//
//   POST /s/marketing/my-work  body { action:'get' }   (FLAT body — the gotcha)
//     → { ok, buckets:{ cameBack[], inProgress[], waiting[], live[] },
//         counts:{ cameBack, inProgress, waiting, live, published?, leads? } }
//     item shape: { id, kind, title, status, note?, updatedAt? }
//       kind ∈ LANDING_PAGE | SOCIAL_PLAN | CAMPAIGN | BLOG
//
// The route derives identity server-side (resolveActingMember) and filters to the
// acting member's own items — no client-supplied identity. Graceful degrade: a
// route that isn't deployed / predates the action / errors resolves `unavailable`
// with empty buckets, so "My work" shows an honest empty state, never a toast.

const ROUTE = '/marketing/my-work';

export type MarketingWorkKind =
  | 'LANDING_PAGE'
  | 'SOCIAL_PLAN'
  | 'CAMPAIGN'
  | 'BLOG';

const WORK_KINDS: readonly MarketingWorkKind[] = [
  'LANDING_PAGE',
  'SOCIAL_PLAN',
  'CAMPAIGN',
  'BLOG',
];

export interface MarketingWorkItem {
  id: string;
  kind: MarketingWorkKind;
  title: string;
  status: string;
  /** The manager's send-back note (present on cameBack items). */
  note: string | null;
  updatedAt: string | null;
}

export interface MyWorkBuckets {
  cameBack: MarketingWorkItem[];
  inProgress: MarketingWorkItem[];
  waiting: MarketingWorkItem[];
  live: MarketingWorkItem[];
}

export interface MyWorkCounts {
  cameBack: number;
  inProgress: number;
  waiting: number;
  live: number;
  /** The agent's OWN published count for the "Your month" rail (else null → "—"). */
  published: number | null;
  /** Leads the agent's own work drew (else null → "—"). */
  leads: number | null;
}

export type MyWorkResult =
  | { ok: true; buckets: MyWorkBuckets; counts: MyWorkCounts }
  | { ok: false; unavailable: boolean; error: string };

type Envelope = { ok?: boolean; error?: string; code?: string } & Record<
  string,
  unknown
>;

const isUnavailable = (body: Envelope | null): boolean => {
  if (body === null) return true;
  if (body.ok === false && body.code === 'FEATURE_OFF') return true;
  return (
    typeof body.error === 'string' &&
    body.error.toLowerCase().includes('unknown action')
  );
};

const asStrOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : null;

const asNumOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const asWorkKind = (v: unknown): MarketingWorkKind | null =>
  typeof v === 'string' && (WORK_KINDS as string[]).includes(v)
    ? (v as MarketingWorkKind)
    : null;

// Tolerant projection: a row missing an id or an unrecognized kind is skipped.
const parseItem = (raw: unknown): MarketingWorkItem | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  const kind = asWorkKind(r.kind);
  if (kind === null) return null;
  return {
    id: r.id,
    kind,
    title: typeof r.title === 'string' ? r.title : '',
    status: typeof r.status === 'string' ? r.status : '',
    note: asStrOrNull(r.note),
    updatedAt: asStrOrNull(r.updatedAt),
  };
};

const parseBucket = (raw: unknown): MarketingWorkItem[] =>
  (Array.isArray(raw) ? raw : [])
    .map(parseItem)
    .filter((i): i is MarketingWorkItem => i !== null);

export async function getMyWork(): Promise<MyWorkResult> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'get' });
  if (body && body.ok === true) {
    const b =
      body.buckets !== null && typeof body.buckets === 'object'
        ? (body.buckets as Record<string, unknown>)
        : {};
    const buckets: MyWorkBuckets = {
      cameBack: parseBucket(b.cameBack),
      inProgress: parseBucket(b.inProgress),
      waiting: parseBucket(b.waiting),
      live: parseBucket(b.live),
    };
    const c =
      body.counts !== null && typeof body.counts === 'object'
        ? (body.counts as Record<string, unknown>)
        : {};
    const counts: MyWorkCounts = {
      // Prefer the route's own counts; fall back to the bucket lengths.
      cameBack: asNumOrNull(c.cameBack) ?? buckets.cameBack.length,
      inProgress: asNumOrNull(c.inProgress) ?? buckets.inProgress.length,
      waiting: asNumOrNull(c.waiting) ?? buckets.waiting.length,
      live: asNumOrNull(c.live) ?? buckets.live.length,
      published: asNumOrNull(c.published) ?? asNumOrNull(c.live),
      leads: asNumOrNull(c.leads),
    };
    return { ok: true, buckets, counts };
  }
  return {
    ok: false,
    unavailable: isUnavailable(body),
    error:
      typeof body?.error === 'string' && body.error
        ? body.error
        : 'Could not load your work.',
  };
}
