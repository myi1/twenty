import { callPropelRoute } from '@/propel/lib/callPropelRoute';

// Real data layer for the Website hub's Blog tab. All blog-pipeline reads/writes
// run through three Manager/Admin-gated CRM routes (blog-pipeline worktree,
// src/logic-functions/blog-{queue,approve,generate}-route.ts):
//
//   POST /blog/queue    body { statuses?: string[] }              → { ok, statuses, count, posts }
//   POST /blog/approve  body { id, action:'approve'|'reject', scheduledAt?, reason? }
//                                                                  → { ok, id, status, scheduledAt? }
//   POST /blog/generate body { topicSeed, angle?, title?, locale? } → { ok, id, status:'IDEA' }
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
  | 'IDEA'
  | 'GROUNDING'
  | 'DRAFTING'
  | 'SEO_REVIEW'
  | 'NEEDS_APPROVAL'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'FAILED'
  | 'REJECTED';

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
  'IDEA',
  'GROUNDING',
  'DRAFTING',
  'SEO_REVIEW',
  'NEEDS_APPROVAL',
  'SCHEDULED',
  'PUBLISHED',
  'FAILED',
];

const failMessage = (body: Envelope | null): string => {
  if (body === null) {
    return 'Could not reach the blog pipeline (sign in as a Manager; the routes may not be deployed yet).';
  }
  return typeof body.error === 'string' && body.error ? body.error : 'Request failed.';
};

const asBlogStatus = (v: unknown): BlogStatus =>
  (typeof v === 'string' ? (v as BlogStatus) : 'IDEA');

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

// ── full-detail read (drawer) ─────────────────────────────────────────────────
// A NEW action on the SAME /blog/queue route (blog-lane agent is adding it):
//   POST /s/blog/queue  body { action:'get', id }
//     → { ok:true, post:{ ...all list fields, bodyHtml, criticNotesJson,
//                         groundingJson, seoMetaJson, ghostUrl, pipelineLog } }
// Graceful fallback: an OLD backend (no action support) reads event.body.statuses
// (undefined here) and answers WITHOUT a `post` field, so we return { ok:false }
// and the drawer falls back to the list-row fields it already has. Never throws.

export interface BlogPipelineLogEntry {
  stage: string;
  at: string | null;
  note: string;
}

// The richer row the drawer renders — the list BlogPost plus the heavy fields the
// board never loads (body, critic notes, grounding sources, pipeline history).
export interface BlogPostDetail extends BlogPost {
  ghostUrl: string;
  pipelineLog: BlogPipelineLogEntry[];
  /** Flattened critic notes (from criticNotesJson) for plain rendering. */
  criticNotesList: string[];
  /** Flattened grounding sources (title/url) from groundingJson. */
  groundingList: string[];
}

// Strip <script>/<style>, inline event handlers, and javascript: URIs before the
// drawer renders post bodyHtml with dangerouslySetInnerHTML. Conservative (no DOM
// parser / no DOMPurify dep in this bundle) — it removes the executable surface,
// it does not attempt full HTML normalization.
export const sanitizeBlogHtml = (html: string): string =>
  (typeof html === 'string' ? html : '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');

// Coerce an unknown criticNotes/grounding blob (parsed array, object, or JSON
// string) into a flat list of display strings. Never throws.
const toStringList = (raw: unknown): string[] => {
  let val = raw;
  if (typeof val === 'string') {
    const s = val.trim();
    if (s === '') return [];
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        val = JSON.parse(s);
      } catch {
        return [s];
      }
    } else {
      return [s];
    }
  }
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>;
          const label =
            (typeof o.title === 'string' && o.title) ||
            (typeof o.note === 'string' && o.note) ||
            (typeof o.message === 'string' && o.message) ||
            (typeof o.text === 'string' && o.text) ||
            (typeof o.url === 'string' && o.url) ||
            '';
          const url = typeof o.url === 'string' && o.url !== label ? ` (${o.url})` : '';
          return `${label}${url}`.trim();
        }
        return '';
      })
      .filter((s) => s.length > 0);
  }
  if (val && typeof val === 'object') {
    return Object.values(val as Record<string, unknown>)
      .map((v) => (typeof v === 'string' ? v : ''))
      .filter((s) => s.length > 0);
  }
  return [];
};

const toPipelineLog = (raw: unknown): BlogPipelineLogEntry[] => {
  let val = raw;
  if (typeof val === 'string') {
    try {
      val = JSON.parse(val);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(val)) return [];
  return val.map((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const stage =
      (typeof o.stage === 'string' && o.stage) ||
      (typeof o.status === 'string' && o.status) ||
      (typeof o.step === 'string' && o.step) ||
      '';
    const at =
      (typeof o.at === 'string' && o.at) ||
      (typeof o.timestamp === 'string' && o.timestamp) ||
      (typeof o.ts === 'string' && o.ts) ||
      null;
    const note =
      (typeof o.note === 'string' && o.note) ||
      (typeof o.message === 'string' && o.message) ||
      (typeof o.detail === 'string' && o.detail) ||
      '';
    return { stage, at, note };
  });
};

const toPostDetail = (raw: unknown): BlogPostDetail => {
  const base = toPost(raw);
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    ...base,
    ghostUrl: typeof r.ghostUrl === 'string' ? r.ghostUrl : '',
    pipelineLog: toPipelineLog(r.pipelineLog),
    criticNotesList: toStringList(r.criticNotesJson ?? base.criticNotes),
    groundingList: toStringList(r.groundingJson ?? base.grounding),
  };
};

// Fetch the full detail for one post. Returns { ok:false } (graceful) when the
// backend doesn't yet support the `get` action or the row is gated/absent.
export async function fetchBlogPost(id: string): Promise<CrmResult<BlogPostDetail>> {
  const body = await callPropelRoute<Envelope>(QUEUE_ROUTE, { action: 'get', id });
  if (body && body.ok === true && body.post && typeof body.post === 'object') {
    return { ok: true, data: toPostDetail(body.post) };
  }
  return { ok: false, error: failMessage(body) };
}

// Retry a FAILED post — re-enters the pipeline. Same new-backend contract; a
// backend without the action answers without `ok`, so callers hide the button /
// surface the reason rather than pretending it retried.
export async function retryBlogPost(
  id: string,
): Promise<CrmResult<{ id: string; status: BlogStatus }>> {
  const body = await callPropelRoute<Envelope>(QUEUE_ROUTE, { action: 'retry', id });
  if (body && body.ok === true && typeof body.id === 'string') {
    return { ok: true, data: { id: body.id, status: asBlogStatus(body.status) } };
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
