import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { friendlyError } from '@/propel/lib/friendlyError';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

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
const REVISE_ROUTE = '/blog/revise';

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

// Recurrence cadence (founder's scheduling ask). ONE_OFF = a single post (default,
// today's behaviour). The rest auto-seed the NEXT occurrence when this one publishes
// (same topicSeed + cadence, scheduled one interval on) via blog-publish — always
// through the pipeline + maker-checker gate, never auto-published unreviewed. Values
// are UPPER_CASE (app:install rejects lowercase SELECT values).
export type BlogCadence = 'ONE_OFF' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';

export const BLOG_CADENCES: { value: BlogCadence; label: string }[] = [
  { value: 'ONE_OFF', label: 'One-off' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
];

const CADENCE_LABEL: Record<BlogCadence, string> = {
  ONE_OFF: 'One-off',
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
};

export const cadenceLabel = (c: BlogCadence): string => CADENCE_LABEL[c] ?? 'One-off';

export const isRecurring = (c: BlogCadence): boolean => c !== 'ONE_OFF';

const asCadence = (v: unknown): BlogCadence => {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return s === 'DAILY' || s === 'WEEKLY' || s === 'MONTHLY' || s === 'QUARTERLY'
    ? (s as BlogCadence)
    : 'ONE_OFF';
};

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
  // Recurrence (founder's scheduling ask). cadence drives whether publishing this
  // post auto-seeds the next occurrence; recurrenceSpawnedAt on the PARENT marks
  // that its next occurrence was already seeded (guards double fan-out).
  cadence: BlogCadence;
  recurrenceSpawnedAt: string | null;
  lastError: string;
  updatedAt: string | null;
  // Maker-checker (Phase 2) — an agent's "Approve" submits instead; the route
  // stamps these so the card carries a "Pending approval" / "Sent back" badge.
  // Tolerant: routes predating the gate omit them → null → no badge.
  submittedForApprovalAt: string | null;
  sentBackAt: string | null;
  sentBackNote: string | null;
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
  // Route any server-supplied string through the friendly mapper: a raw/technical
  // error (e.g. "LLM response was not parseable JSON…") becomes a human message +
  // is logged to console; an already-human message passes through unchanged.
  return typeof body.error === 'string' && body.error
    ? friendlyError(body.error, 'generic')
    : 'Request failed.';
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
    cadence: asCadence(r.cadence),
    recurrenceSpawnedAt:
      typeof r.recurrenceSpawnedAt === 'string' ? r.recurrenceSpawnedAt : null,
    lastError: typeof r.lastError === 'string' ? r.lastError : '',
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
    submittedForApprovalAt:
      typeof r.submittedForApprovalAt === 'string' ? r.submittedForApprovalAt : null,
    sentBackAt: typeof r.sentBackAt === 'string' ? r.sentBackAt : null,
    sentBackNote: typeof r.sentBackNote === 'string' ? r.sentBackNote : null,
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

// One turn of the review-side authoring thread (reviewer ↔ agent). The backend
// (/blog/revise) appends a { role:'reviewer', text } for the instruction and a
// { role:'agent', text } summary of what it changed; the drawer renders them as a
// conversation. Tolerant: a backend predating the chat field returns [] → no thread.
export interface BlogReviseChatEntry {
  role: 'reviewer' | 'agent';
  text: string;
  at: string | null;
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
  /** Review-side authoring thread (reviewer ↔ agent). Empty on an un-revised post. */
  reviseChat: BlogReviseChatEntry[];
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
// The public home of a post is the SITE (remaxhub.ae/blog/<slug>), not the Ghost
// instance that stores it (blog.remaxhub.ae/<slug>/). Ghost owns slug generation, so
// the slug is taken FROM the URL Ghost returned — that keeps this correct for
// transliterated/encoded (Arabic) slugs too. Mirrors shared/blog-public-url.ts in the
// CRM repo. Returns null rather than guessing, so the caller can fall back.
export const SITE_BLOG_BASE = 'https://remaxhub.ae';

export const siteBlogUrlFromGhostUrl = (
  ghostUrl: string | null | undefined,
  base: string = SITE_BLOG_BASE,
  locale?: string | null,
): string | null => {
  const raw = (ghostUrl ?? '').trim();
  if (raw === '') return null;
  let path: string;
  try {
    path = new URL(raw).pathname;
  } catch {
    path = raw;
  }
  const slug = path.split('/').filter(Boolean).pop() ?? '';
  if (!slug) return null;
  // The site serves English at /blog/<slug> and every other locale at
  // /<locale>/blog/<slug> — a locale-blind link 404s for Arabic posts.
  const loc = (locale ?? 'en').trim().toLowerCase();
  const prefix = loc && loc !== 'en' ? `/${loc}` : '';
  return `${base.replace(/\/+$/, '')}${prefix}/blog/${slug}`;
};

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
    const o = val as Record<string, unknown>;
    // The critic notes blob is an OBJECT whose useful content lives in nested arrays
    // (`issues` from the editor, `revisionNotes` written when a rejection is fed back
    // into a rewrite). Prefer those; flattening the object's string values instead
    // would surface the timestamp and stage name and drop the actual notes.
    for (const key of ['revisionNotes', 'issues', 'ungroundedFigures', 'strengths']) {
      const nested = o[key];
      if (Array.isArray(nested)) {
        const list = nested.map((v) => (typeof v === 'string' ? v.trim() : '')).filter((s) => s.length > 0);
        if (list.length > 0) return list;
      }
    }
    return Object.values(o)
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

// Coerce the reviseChat blob (array, or JSON string on older projections) into a
// clean, role-typed thread. Anything malformed → [] (no thread, never a crash).
const toReviseChat = (raw: unknown): BlogReviseChatEntry[] => {
  let val = raw;
  if (typeof val === 'string') {
    try {
      val = JSON.parse(val);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(val)) return [];
  return val
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      const role = o.role === 'reviewer' || o.role === 'agent' ? o.role : null;
      const text = typeof o.text === 'string' ? o.text : '';
      if (role === null || text === '') return null;
      return { role, text, at: typeof o.at === 'string' ? o.at : null };
    })
    .filter((e): e is BlogReviseChatEntry => e !== null);
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
    reviseChat: toReviseChat(r.reviseChat ?? r.reviseChatJson),
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
  // Retry is a state MUTATION — it lives on the approve route (same
  // Manager/Admin gate + audit path as approve/reject), NOT the read-only
  // queue route. Contract: blog-approve-route { id, action:'retry' }.
  const body = await callPropelRoute<Envelope>(APPROVE_ROUTE, { action: 'retry', id });
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
// cadence + scheduledAt (the founder's brief-bar controls) ride along: cadence sets
// the recurrence, scheduledAt is the target posting date honored at publish. Both are
// additive — an old backend ignores unknown body keys, so the seed still works.
export async function generateBlogDraft(input: {
  topicSeed: string;
  angle?: string;
  title?: string;
  locale?: string;
  cadence?: BlogCadence;
  scheduledAt?: string;
}): Promise<CrmResult<{ id: string }>> {
  const body = await callPropelRoute<Envelope>(GENERATE_ROUTE, {
    topicSeed: input.topicSeed,
    ...(input.angle ? { angle: input.angle } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.locale ? { locale: input.locale } : {}),
    ...(input.cadence ? { cadence: input.cadence } : {}),
    ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
  });
  if (body && body.ok === true && typeof body.id === 'string') {
    return { ok: true, data: { id: body.id } };
  }
  return { ok: false, error: failMessage(body) };
}

// ── inline edit: DRAFT save (title / body / excerpt) ──────────────────────────
// Persist a reviewer's manual edits straight to the blogPost over the core GraphQL
// endpoint with the reviewer's OWN session token — the same thin-fetch bridge
// a2aCrm.ts uses for its one app-object write (updateAgreementDocument). This is a
// DRAFT save: it ONLY touches title/bodyHtml/excerpt, never `status`, so it can
// NEVER publish — the maker-checker gate is untouched (publishing still requires the
// approve route). Returns { ok:false } on any failure (no perms / network) so the
// drawer surfaces "couldn't save" rather than pretending it saved.
export interface BlogDraftEdits {
  title: string;
  bodyHtml: string;
  excerpt: string;
}

export async function saveBlogDraft(
  id: string,
  edits: BlogDraftEdits,
): Promise<CrmResult<{ id: string }>> {
  const token = getTokenPair()?.accessOrWorkspaceAgnosticToken?.token;
  if (token === undefined || token === '') {
    return { ok: false, error: friendlyError('', 'save') };
  }
  try {
    const response = await fetch(`${REACT_APP_SERVER_BASE_URL}/graphql`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: `mutation PropelSaveBlogDraft($id: UUID!, $data: BlogPostUpdateInput!) {
          updateBlogPost(id: $id, data: $data) { id }
        }`,
        variables: {
          id,
          // status is deliberately absent — a draft save never changes lifecycle.
          data: {
            title: edits.title,
            bodyHtml: edits.bodyHtml,
            excerpt: edits.excerpt,
          },
        },
      }),
    });
    if (!response.ok) {
      return { ok: false, error: friendlyError(`save failed (${response.status})`, 'save') };
    }
    const json = (await response.json()) as {
      data?: { updateBlogPost?: { id?: string } };
      errors?: unknown;
    };
    const savedId = json?.data?.updateBlogPost?.id;
    if (typeof savedId === 'string' && savedId) {
      return { ok: true, data: { id: savedId } };
    }
    return { ok: false, error: friendlyError('save returned no record', 'save') };
  } catch {
    return { ok: false, error: friendlyError('', 'save') };
  }
}

// ── talk to the agent: revise the draft in place ──────────────────────────────
// The reviewer types a plain-language instruction; the blog-revise route applies it
// to the current draft (grounded — no fabricated figures), persists the revised
// title/body/excerpt, and returns a one-line summary of what changed. The post stays
// NEEDS_APPROVAL (a revision is not a publish). A gated / not-yet-deployed / bad-input
// case answers with a typed envelope { error } (routed through friendlyError), never a
// fake success — the caller re-fetches the detail to pick up the revised draft + the
// appended chat turn.
export async function reviseBlogPost(
  postId: string,
  instruction: string,
): Promise<CrmResult<{ summary: string }>> {
  const body = await callPropelRoute<Envelope>(REVISE_ROUTE, { postId, instruction });
  if (body && body.ok === true) {
    return {
      ok: true,
      data: { summary: typeof body.summary === 'string' ? body.summary : '' },
    };
  }
  return { ok: false, error: failMessage(body) };
}
