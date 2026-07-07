import { callPropelRoute } from '@/propel/lib/callPropelRoute';

// Real data layer for the Website hub's Blog tab. All blog-pipeline reads/writes
// run through three Manager/Admin-gated CRM routes (blog-pipeline worktree,
// src/logic-functions/blog-{queue,approve,generate}-route.ts):
//
//   POST /blog/queue    body { statuses?: string[] }              → { ok, statuses, count, posts }
//   POST /blog/approve  body { id, action:'approve'|'reject', scheduledAt?, reason? }
//                                                                  → { ok, id, status, scheduledAt? }
//   POST /blog/generate body { topicSeed, angle?, title?, locale? } → { ok, id, status:'idea' }
//
// Bodies are FLAT (Twenty sets event.body = parsed JSON as-is — the callPropelRoute
// gotcha). callPropelRoute sends the agent's own session token; identity + role are
// derived server-side and every route fails CLOSED (NOT_FOUND envelope) for a
// non-Manager. It returns the parsed 2xx body, or null (non-2xx / network / not
// signed in / route not deployed yet — the blog routes ship behind the gated CRM
// deploy). A gated/bad-input case answers 200 with a typed envelope { error, code }
// and no `ok`, so we narrow on `body.ok === true` and hand callers a discriminated
// result — never a fake-empty success.

const QUEUE_ROUTE = '/blog/queue';
const APPROVE_ROUTE = '/blog/approve';
const GENERATE_ROUTE = '/blog/generate';

export type BlogStatus =
  | 'idea'
  | 'grounding'
  | 'drafting'
  | 'seo_review'
  | 'needs_approval'
  | 'scheduled'
  | 'published'
  | 'failed'
  | 'rejected';

// One row of the pipeline, as projected by blog-queue-route's posts[].
export interface BlogPost {
  id: string;
  status: BlogStatus;
  locale: string;
  title: string;
  angle: string;
  topicSeed: string;
  excerpt: string;
  bodyHtml: string;
  seoMeta: unknown;
  tags: unknown;
  grounding: unknown;
  criticScore: number | null;
  criticNotes: unknown;
  scheduledAt: string | null;
  lastError: string;
  updatedAt: string | null;
}

export type CrmResult<T> = { ok: true; data: T } | { ok: false; error: string };

type Envelope = { ok?: boolean; error?: string; code?: string } & Record<string, unknown>;

// The statuses the board reads in one shot: everything the pipeline can be at
// EXCEPT the terminal rejected (kept off the board — it's noise, not work).
export const BOARD_STATUSES: BlogStatus[] = [
  'idea',
  'grounding',
  'drafting',
  'seo_review',
  'needs_approval',
  'scheduled',
  'published',
  'failed',
];

const failMessage = (body: Envelope | null): string => {
  if (body === null) {
    return 'Could not reach the blog pipeline (sign in as a Manager; the routes may not be deployed yet).';
  }
  return typeof body.error === 'string' && body.error ? body.error : 'Request failed.';
};

const asBlogStatus = (v: unknown): BlogStatus =>
  (typeof v === 'string' ? (v as BlogStatus) : 'idea');

const toPost = (raw: unknown): BlogPost => {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof r.id === 'string' ? r.id : '',
    status: asBlogStatus(r.status),
    locale: typeof r.locale === 'string' ? r.locale : '',
    title: typeof r.title === 'string' ? r.title : '(untitled)',
    angle: typeof r.angle === 'string' ? r.angle : '',
    topicSeed: typeof r.topicSeed === 'string' ? r.topicSeed : '',
    excerpt: typeof r.excerpt === 'string' ? r.excerpt : '',
    bodyHtml: typeof r.bodyHtml === 'string' ? r.bodyHtml : '',
    seoMeta: r.seoMeta ?? null,
    tags: r.tags ?? [],
    grounding: r.grounding ?? null,
    criticScore: typeof r.criticScore === 'number' ? r.criticScore : null,
    criticNotes: r.criticNotes ?? null,
    scheduledAt: typeof r.scheduledAt === 'string' ? r.scheduledAt : null,
    lastError: typeof r.lastError === 'string' ? r.lastError : '',
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
  };
};

// Read the approval queue + the rest of the board in one call. Defaults to the
// full BOARD_STATUSES set so the four columns populate from a single request.
export async function fetchBlogQueue(
  statuses: BlogStatus[] = BOARD_STATUSES,
): Promise<CrmResult<BlogPost[]>> {
  const body = await callPropelRoute<Envelope>(QUEUE_ROUTE, { statuses });
  if (body && body.ok === true && Array.isArray(body.posts)) {
    return { ok: true, data: (body.posts as unknown[]).map(toPost) };
  }
  return { ok: false, error: failMessage(body) };
}

// The HumanGate. Approve a needs_approval post (→ scheduled) or reject it
// (→ rejected). scheduledAt defaults server-side to now (publish next tick).
export async function decideBlogPost(
  id: string,
  action: 'approve' | 'reject',
  opts?: { scheduledAt?: string; reason?: string },
): Promise<CrmResult<{ id: string; status: BlogStatus }>> {
  const payload: Record<string, unknown> = { id, action };
  if (opts?.scheduledAt) payload.scheduledAt = opts.scheduledAt;
  if (opts?.reason) payload.reason = opts.reason;
  const body = await callPropelRoute<Envelope>(APPROVE_ROUTE, payload);
  if (body && body.ok === true && typeof body.id === 'string') {
    return { ok: true, data: { id: body.id, status: asBlogStatus(body.status) } };
  }
  return { ok: false, error: failMessage(body) };
}

// Seed a topic on demand → creates an `idea` row the pipeline runs to needs_approval.
export async function generateBlogDraft(input: {
  topicSeed: string;
  angle?: string;
  title?: string;
  locale?: string;
}): Promise<CrmResult<{ id: string }>> {
  const body = await callPropelRoute<Envelope>(GENERATE_ROUTE, {
    topicSeed: input.topicSeed,
    ...(input.angle ? { angle: input.angle } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.locale ? { locale: input.locale } : {}),
  });
  if (body && body.ok === true && typeof body.id === 'string') {
    return { ok: true, data: { id: body.id } };
  }
  return { ok: false, error: failMessage(body) };
}
