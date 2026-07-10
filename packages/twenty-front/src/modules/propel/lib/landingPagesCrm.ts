import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { friendlyError } from '@/propel/lib/friendlyError';
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
//       …→ LIVE re-runs the pre-flight gate server-side; any HARD fail →
//          { ok:false, code:'PREFLIGHT_FAILED', checks } (publish blocked).
//     action:'preflight'+ id                     → { ok, passed, checks }
//       (Stage 3C / pinned P1 contract — checks:[{key,level,ok,detail}])
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
  // Stage 3C — the stored pre-flight result (the route projects it once the P1
  // leg lands). Tolerant: routes predating the gate simply omit it → no chip.
  preflightJson?: unknown;
  // Stage 3D — locale siblings (the translator). Both are tolerant: routes
  // predating the translator (or pages created before it) simply omit them →
  // the page renders as a plain top-level EN card, exactly as today.
  // `locale` is the page's language code ('EN' / 'AR' / …; absent ⇒ EN).
  locale?: string | null;
  // Set on a translated sibling: the EN parent's id. Absent/empty ⇒ a parent.
  sourceLandingPageId?: string | null;
  // Stage 3E — the Scout + Refresher queues (pinned SC1 contract). All three are
  // tolerant: routes predating 3E simply omit them → neither queue renders.
  // `source` marks who created the page ('SCOUT' for the cron's proposals).
  source?: string | null;
  // The Scout's one-line rationale ("New listing: Marina 2BR — AED 2.4M").
  scoutReason?: string | null;
  // The Refresher's queued-diffs column (raw JSON string or parsed array) —
  // parse with readRefresherDiffs; absent/unreadable → no Refresher rows.
  refresherJson?: unknown;
  // Maker-checker (Phase 2). An agent's "Set live" submits instead of publishing;
  // the route stamps these so the page shows a "Pending approval" / "Sent back"
  // badge in its own surface. All tolerant: routes predating the gate omit them.
  // (The `list` response is passed through as-is, so a projected value survives.)
  submittedForApprovalAt?: string | null;
  sentBackAt?: string | null;
  sentBackNote?: string | null;
}

// Full page (editor). Adds the section list + the bench audit log (Stage 3B —
// absent from older route builds → normalized to []).
export interface LandingPageFull extends Omit<LandingPageSummary, 'updatedAt'> {
  sections: LandingSection[];
  benchLog: BenchLogEntry[];
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
  // Stage 3D — the workspace's auto-translate switch, read tolerantly off the
  // same `meta` block. ABSENT (older routes) → default ON; only an explicit
  // `false` turns the post-publish loop off. The manual "Translate →" menu is
  // never gated by this flag.
  autoTranslate: boolean;
}

const readSitePublicUrl = (body: Envelope | null): string => {
  const meta = body?.meta;
  if (meta !== null && typeof meta === 'object') {
    const url = (meta as Record<string, unknown>).sitePublicUrl;
    if (typeof url === 'string') return url;
  }
  return '';
};

const readAutoTranslate = (body: Envelope | null): boolean => {
  const meta = body?.meta;
  if (meta !== null && typeof meta === 'object') {
    if ((meta as Record<string, unknown>).autoTranslate === false) return false;
  }
  return true; // absent → default ON
};

const failMessage = (body: Envelope | null): string => {
  if (body === null) {
    return 'Could not reach the landing-page service (sign in as a Manager; the object may not be deployed yet).';
  }
  // Raw/technical server strings → friendly message (+ console.error); an
  // already-human message passes through unchanged.
  return typeof body.error === 'string' && body.error
    ? friendlyError(body.error, 'generic')
    : 'Request failed.';
};

export async function listLandingPages(): Promise<CrmResult<LandingListPayload>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'list' });
  if (body && body.ok === true && Array.isArray(body.pages)) {
    return {
      ok: true,
      data: {
        pages: body.pages as LandingPageSummary[],
        sitePublicUrl: readSitePublicUrl(body),
        autoTranslate: readAutoTranslate(body),
      },
    };
  }
  return { ok: false, error: failMessage(body) };
}

export async function getLandingPage(id: string): Promise<CrmResult<LandingPageFull>> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'get', id });
  if (body && body.ok === true && body.page && typeof body.page === 'object') {
    const page = body.page as LandingPageFull;
    // benchLog is tolerant: routes predating Stage 3B don't project it → [].
    return { ok: true, data: { ...page, benchLog: asBenchLog((body.page as Envelope).benchLog) } };
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

// ── Publish pre-flight gate (Stage 3C — pinned P1 contract) ──────────────────
// `{action:'preflight', id}` runs the hard-check gate (lead form · images ·
// legal footer · meta · sections schema · mobile budget · Trakheesi permit),
// stores `preflightJson`, and returns every check row. HARD fails block publish
// server-side; SOFT rows surface as warnings only.

export type PreflightLevel = 'HARD' | 'SOFT';

export interface PreflightCheck {
  key: string;
  level: PreflightLevel;
  ok: boolean;
  detail: string;
}

// Tolerant row parse — drop anything that isn't {key,…}; default level to SOFT
// so an unknown level can never hard-block a publish client-side (the server
// gate is authoritative anyway). Exported for the Campaign Spine (CS4), whose
// GATES_FAILED response carries the LP channel's failures in this exact shape.
export const asPreflightChecks = (v: unknown): PreflightCheck[] => {
  if (!Array.isArray(v)) return [];
  const out: PreflightCheck[] = [];
  for (const item of v) {
    if (item === null || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.key !== 'string' || r.key === '') continue;
    out.push({
      key: r.key,
      level: r.level === 'HARD' ? 'HARD' : 'SOFT',
      ok: r.ok === true,
      detail: typeof r.detail === 'string' ? r.detail : '',
    });
  }
  return out;
};

// `unavailable` = the gate itself is missing on this workspace (route not
// deployed / older route that answers `unknown action` / FEATURE_OFF). The
// caller then falls back to DIRECT publish — a missing gate must never block
// publishing.
export type PreflightResult =
  | { ok: true; passed: boolean; checks: PreflightCheck[] }
  | { ok: false; error: string; unavailable: boolean };

const isPreflightUnavailable = (body: Envelope | null): boolean => {
  if (body === null) return true; // route unreachable / not deployed / not signed in
  if (body.code === 'FEATURE_OFF') return true;
  // Pre-P1 landing-admin builds answer: { error:'unknown action "preflight"', code:'LANDING_INVALID' }.
  return typeof body.error === 'string' && body.error.toLowerCase().includes('unknown action');
};

export async function preflightPage(id: string): Promise<PreflightResult> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'preflight', id });
  if (body && body.ok === true && Array.isArray(body.checks)) {
    return { ok: true, passed: body.passed === true, checks: asPreflightChecks(body.checks) };
  }
  return { ok: false, error: failMessage(body), unavailable: isPreflightUnavailable(body) };
}

// Summary of a stored `preflightJson` value for the list cards' chip. Accepts
// the raw JSON string (the CRM field's value) or an already-parsed object;
// anything unreadable (or a route that doesn't project it) → null → no chip.
export interface PreflightSummary {
  passed: boolean;
  hardFails: number;
  warnings: number;
}

export const readPreflightSummary = (v: unknown): PreflightSummary | null => {
  let raw: unknown = v;
  if (typeof raw === 'string') {
    if (raw === '') return null;
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (raw === null || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const checks = asPreflightChecks(rec.checks);
  if (checks.length === 0) return null;
  const hardFails = checks.filter((c) => c.level === 'HARD' && !c.ok).length;
  const warnings = checks.filter((c) => c.level === 'SOFT' && !c.ok).length;
  return {
    passed: typeof rec.passed === 'boolean' ? rec.passed : hardFails === 0,
    hardFails,
    warnings,
  };
};

// setStatus → LIVE re-runs the gate SERVER-side (the client modal is UX, not
// enforcement): a HARD fail comes back as { ok:false, code:'PREFLIGHT_FAILED',
// checks } — surfaced so the modal can re-render the server's rows.
export type SetStatusResult =
  | { ok: true; data: { id: string; status: LandingStatus } }
  | { ok: false; error: string; preflightFailed: boolean; checks: PreflightCheck[] };

export async function setLandingStatus(
  id: string,
  status: LandingStatus,
): Promise<SetStatusResult> {
  const body = await callPropelRoute<Envelope>(ROUTE, { action: 'setStatus', id, status });
  if (body && body.ok === true && typeof body.id === 'string') {
    return { ok: true, data: { id: body.id, status } };
  }
  const preflightFailed = body !== null && body.code === 'PREFLIGHT_FAILED';
  return {
    ok: false,
    error: preflightFailed ? 'Publish blocked — pre-flight checks failed.' : failMessage(body),
    preflightFailed,
    checks: preflightFailed ? asPreflightChecks(body?.checks) : [],
  };
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

// ── AI prompt helper (Media Studio M2) ───────────────────────────────────────
// `{action:'improvePrompt', idea, presets?, projectName?}` → the CRM route asks a
// cheap text model to expand the marketer's rough idea (+ selected GENERATE preset
// labels + project name) into ONE vivid, concrete image prompt line. The route
// holds the OpenAI key and applies the no-fake-building guardrail server-side.
//   → { ok, prompt }
//   → { ok:false, code:'FEATURE_OFF' }   (OPENAI_API_KEY unset)
export interface ImprovePromptInput {
  idea: string;
  // Selected GENERATE_PRESETS labels — the model folds these into the prompt.
  presets?: string[];
  projectName?: string;
}

export type ImprovePromptResult =
  | { ok: true; prompt: string }
  | { ok: false; error: string; featureOff: boolean };

export async function improvePrompt(input: ImprovePromptInput): Promise<ImprovePromptResult> {
  const body = await callPropelRoute<Envelope>(IMAGE_ROUTE, {
    action: 'improvePrompt',
    idea: input.idea,
    presets: input.presets ?? [],
    projectName: input.projectName ?? '',
  });
  if (body && body.ok === true && typeof body.prompt === 'string' && body.prompt !== '') {
    return { ok: true, prompt: body.prompt };
  }
  return {
    ok: false,
    error: isFeatureOff(body) ? 'Prompt helper isn’t configured yet.' : failMessage(body),
    featureOff: isFeatureOff(body),
  };
}

// ── AI image-to-image enhance (Media Studio M1/M2) ────────────────────────────
// `{action:'enhance', sourceUrl, enhancements?, instructions?, aspect?, projectName?}`
// → the CRM route builds an edit prompt from the enhancement LABELS + free-text
// instructions (+ the named-project guardrail), calls the image-service
// `/v1/images/enhance` (gpt-image-1 edits over the source bytes), and maps the
// result to a same-domain gateway path.
//   → { ok, gatewayPath:'/img/is/<name>', provenance:'enhanced' }
//   → { ok:false, code:'FEATURE_OFF' }   (OPENAI_API_KEY / IMAGE_SERVICE_URL unset)
//   → { ok:false, code, message }        (bad source / enhance failed)
export interface EnhanceImageInput {
  // Fully-qualified https source (sitePublicUrl + gatewayPath for a library/render
  // pick, or a pasted public URL). The route's SSRF guard rejects private hosts.
  sourceUrl: string;
  // Selected ENHANCE_PRESETS labels — the route assembles the edit prompt from them.
  enhancements?: string[];
  instructions?: string;
  aspect?: ImageAspect;
  projectName?: string;
}

export type EnhanceImageResult =
  | { ok: true; gatewayPath: string }
  | { ok: false; error: string; featureOff: boolean };

export async function enhanceImage(input: EnhanceImageInput): Promise<EnhanceImageResult> {
  const body = await callPropelRoute<Envelope>(IMAGE_ROUTE, {
    action: 'enhance',
    sourceUrl: input.sourceUrl,
    enhancements: input.enhancements ?? [],
    instructions: input.instructions ?? '',
    aspect: input.aspect ?? 'landscape',
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
    error: isFeatureOff(body) ? 'Image enhancement isn’t configured yet.' : failMessage(body),
    featureOff: isFeatureOff(body),
  };
}

// ── AI generate bench (Stage 3A) ──────────────────────────────────────────────
// A FOURTH Manager/Admin-gated route: type a brief → a 4-agent bench
// (Planner → Copywriter → Designer → SEO) drafts a full on-brand landing page
// (sectionsJson + theme + copy + library-asset picks + meta) SYNCHRONOUSLY in
// ~35–45s, and creates a DRAFT landingPage. The route holds the LLM key and runs
// the whole chain server-side (propel-crm-integration,
// src/logic-functions/landing-bench-route.ts). Flat body, per the gotcha.
//
//   POST /website/landing-bench  body { action:'generate', brief, theme?, locale?, templateKey? }
//     → { ok:true, id, benchLog:[{ts,agent,action,summary}] }
//     → { ok:false, code:'FEATURE_OFF' }   (the LLM key getLLMConfig() reads is unset)
//     → { ok:false, code:'BENCH_INVALID', benchLog }   (the AI draft failed schema-validation)
//     → { ok:false, code, ... }            (any other bench failure)

const BENCH_ROUTE = '/website/landing-bench';

// One append-only audit entry the bench writes per stage (mirror of the CRM-side
// benchLog shape). `ts` is an ISO string; `agent` is Planner/Copywriter/… .
export interface BenchLogEntry {
  ts: string;
  agent: string;
  action: string;
  summary: string;
  // Stage 3B — instruct entries record the targeted section (absent/null for a
  // whole-page edit). Older entries simply don't carry the field.
  sectionIndex?: number | null;
}

export interface DraftFromBriefOverrides {
  theme?: LandingTheme;
  locale?: string;
  templateKey?: string;
  // Sources grounding (SRC-1 / plan SM3): ≤8 sourceMaterial ids. The bench io
  // loads each source's extractedText and prepends an authoritative-figures
  // grounding block to the Copywriter context. Absent/empty → unchanged behavior.
  sourceIds?: string[];
}

// Same discriminated shape as the other AI routes: `featureOff` distinguishes
// "AI drafting isn't wired on this workspace" (dim the box) from a draft/transient
// failure (toast, keep the box). On success the caller opens the editor for `id`.
export type DraftFromBriefResult =
  | { ok: true; id: string; benchLog: BenchLogEntry[] }
  | { ok: false; error: string; featureOff: boolean };

const asBenchLog = (v: unknown): BenchLogEntry[] =>
  Array.isArray(v) ? (v as BenchLogEntry[]) : [];

export async function draftFromBrief(
  brief: string,
  overrides?: DraftFromBriefOverrides,
): Promise<DraftFromBriefResult> {
  // FLAT body — spread the optional overrides at the top level alongside the
  // brief so the route reads event.body.theme / .locale / .templateKey /
  // .sourceIds directly.
  const body = await callPropelRoute<Envelope>(BENCH_ROUTE, {
    action: 'generate',
    brief,
    ...(overrides?.theme ? { theme: overrides.theme } : {}),
    ...(overrides?.locale ? { locale: overrides.locale } : {}),
    ...(overrides?.templateKey ? { templateKey: overrides.templateKey } : {}),
    ...(overrides?.sourceIds && overrides.sourceIds.length > 0
      ? { sourceIds: overrides.sourceIds }
      : {}),
  });
  if (body && body.ok === true && typeof body.id === 'string' && body.id !== '') {
    return { ok: true, id: body.id, benchLog: asBenchLog(body.benchLog) };
  }
  return {
    ok: false,
    error: isFeatureOff(body) ? 'AI drafting isn’t configured yet.' : failMessage(body),
    featureOff: isFeatureOff(body),
  };
}

// ── AI instruct edit (Stage 3B — click+tell) ──────────────────────────────────
// `{action:'instruct', id, sectionIndex?, instruction, sourceIds?}` (flat body,
// per the gotcha) → the bench's editor agent rewrites JUST the target (one
// section, or the whole page when sectionIndex is omitted), validates via
// parseSections server-side, saves, and appends an `instruct` benchLog entry.
// Pinned T1 contract:
//   → { ok, sectionsJson, headline?, metaDescription?, benchLog }
//   → { ok:false, code:'FEATURE_OFF' }      (LLM key unset → dim the bar)
//   → { ok:false, code:'BENCH_INVALID' }    (edit failed validation — the page
//                                            was NEVER corrupted; draft untouched)

// `sectionsJson` may arrive as the raw JSON string (the CRM field's value) or an
// already-parsed array — accept both, reject anything that isn't {type,props}[].
const parseSectionsPayload = (v: unknown): LandingSection[] | null => {
  let raw: unknown = v;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw)) return null;
  const out: LandingSection[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') return null;
    const rec = item as Record<string, unknown>;
    if (typeof rec.type !== 'string' || rec.type === '') return null;
    const props =
      rec.props !== null && typeof rec.props === 'object'
        ? (rec.props as Record<string, unknown>)
        : {};
    out.push({ type: rec.type as LandingSection['type'], props });
  }
  return out;
};

// Discriminated result: `featureOff` dims the bar; `benchInvalid` means the AI
// edit failed validation server-side (toast, keep the draft exactly as-is).
export type InstructEditResult =
  | {
      ok: true;
      sections: LandingSection[];
      headline: string | null;
      metaDescription: string | null;
      benchLog: BenchLogEntry[];
    }
  | { ok: false; error: string; featureOff: boolean; benchInvalid: boolean };

export async function instructEdit(
  id: string,
  sectionIndex: number | null,
  instruction: string,
  sourceIds?: string[],
): Promise<InstructEditResult> {
  // FLAT body — sectionIndex only when a section is targeted; sourceIds only
  // when the founder picked grounding sources (mirrors draftFromBrief).
  const body = await callPropelRoute<Envelope>(BENCH_ROUTE, {
    action: 'instruct',
    id,
    instruction,
    ...(sectionIndex !== null ? { sectionIndex } : {}),
    ...(sourceIds && sourceIds.length > 0 ? { sourceIds } : {}),
  });
  if (body && body.ok === true) {
    const sections = parseSectionsPayload(body.sectionsJson);
    if (sections !== null) {
      return {
        ok: true,
        sections,
        headline: typeof body.headline === 'string' ? body.headline : null,
        metaDescription:
          typeof body.metaDescription === 'string' ? body.metaDescription : null,
        benchLog: asBenchLog(body.benchLog),
      };
    }
    // ok:true but an unreadable sections payload — treat as a soft failure so
    // the local draft is never clobbered with garbage.
    return {
      ok: false,
      error: 'The edit saved but returned an unreadable page — reload to see it.',
      featureOff: false,
      benchInvalid: false,
    };
  }
  const benchInvalid = body !== null && body.ok === false && body.code === 'BENCH_INVALID';
  return {
    ok: false,
    error: benchInvalid
      ? 'The AI edit came back invalid — your page was left untouched. Try rephrasing.'
      : isFeatureOff(body)
        ? 'AI editing isn’t configured yet.'
        : failMessage(body),
    featureOff: isFeatureOff(body),
    benchInvalid,
  };
}

// ── AI translate (Stage 3D — pinned TR1 contract) ─────────────────────────────
// `{action:'translate', id, locale}` (flat body, per the gotcha) — ONE locale per
// call (~10s): the bench translates the EN page's copy-bearing props (+ headline/
// metaDescription) into `locale` and creates/updates the sibling — same slug,
// `locale`, `sourceLandingPageId`=EN id, status DRAFT. It NEVER publishes; the
// founder does. Dedup by (slug, locale) is server-side, so re-translate is safe.
//   → { ok:true, id, locale }
//   → { ok:false, code:'FEATURE_OFF' }    (LLM key unset)
//   → { ok:false, code:'BENCH_INVALID' }  (translation failed validation — the
//                                          sibling was never corrupted)
// `unavailable` = the ACTION itself is missing on this workspace (route
// unreachable / FEATURE_OFF / an older bench route answering "unknown action")
// → the caller dims the translate affordances and skips the loop quietly.

export const TRANSLATE_LOCALES = ['AR', 'RU', 'UR', 'HI', 'FR', 'ES', 'IT'] as const;
export type TranslateLocale = (typeof TRANSLATE_LOCALES)[number];

export type TranslatePageResult =
  | { ok: true; id: string; locale: string }
  | { ok: false; error: string; unavailable: boolean };

const isTranslateUnavailable = (body: Envelope | null): boolean => {
  if (body === null) return true; // route unreachable / not deployed / not signed in
  if (body.code === 'FEATURE_OFF') return true;
  // Pre-TR1 bench builds answer: { error:'unknown action "translate"', code:… }.
  return typeof body.error === 'string' && body.error.toLowerCase().includes('unknown action');
};

export async function translatePage(id: string, locale: string): Promise<TranslatePageResult> {
  // FLAT body, per the gotcha — the route reads event.body.id / .locale directly.
  const body = await callPropelRoute<Envelope>(BENCH_ROUTE, { action: 'translate', id, locale });
  if (body && body.ok === true && typeof body.id === 'string' && body.id !== '') {
    return {
      ok: true,
      id: body.id,
      locale: typeof body.locale === 'string' && body.locale !== '' ? body.locale : locale,
    };
  }
  return { ok: false, error: failMessage(body), unavailable: isTranslateUnavailable(body) };
}

// ── Refresher queue (Stage 3E — pinned SC1/SC3 contracts) ─────────────────────
// The `landing-refresher` cron writes staleness findings for LIVE pages into
// `landingPage.refresherJson` as an array of queued diffs — NEVER a silent edit:
//   [{ key, kind:'COUNTDOWN_PAST'|'DATE_PAST'|'PERMIT_EXPIRED'|'LISTING_GONE'|
//      'COPY_STALE', sectionIndex?, detail, proposal? }]
// The founder applies/dismisses them one-click via landing-admin:
//   action:'refresherApply'   + { id, keys? }  → { ok }   (keys absent ⇒ all)
//   action:'refresherDismiss' + { id, keys? }  → { ok }
// `kind` stays an open string client-side so an unknown kind the CRM leg adds
// later renders with a generic badge instead of being dropped.

export const REFRESHER_KINDS = [
  'COUNTDOWN_PAST',
  'DATE_PAST',
  'PERMIT_EXPIRED',
  'LISTING_GONE',
  'COPY_STALE',
] as const;

export interface RefresherDiff {
  key: string;
  kind: string;
  sectionIndex: number | null;
  detail: string;
  proposal: string | null;
}

// Tolerant parse of a stored refresherJson value (the raw JSON string or an
// already-parsed value; also accepts a `{diffs:[…]}` wrapper). Anything that
// isn't a {key,…} row is dropped; absent/unreadable/empty → [] → no queue row.
export const readRefresherDiffs = (v: unknown): RefresherDiff[] => {
  let raw: unknown = v;
  if (typeof raw === 'string') {
    if (raw === '') return [];
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    raw = (raw as Record<string, unknown>).diffs;
  }
  if (!Array.isArray(raw)) return [];
  const out: RefresherDiff[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.key !== 'string' || r.key === '') continue;
    out.push({
      key: r.key,
      kind: typeof r.kind === 'string' && r.kind !== '' ? r.kind : 'COPY_STALE',
      sectionIndex: typeof r.sectionIndex === 'number' ? r.sectionIndex : null,
      detail: typeof r.detail === 'string' ? r.detail : '',
      proposal: typeof r.proposal === 'string' && r.proposal !== '' ? r.proposal : null,
    });
  }
  return out;
};

// `unavailable` = the ACTION itself is missing on this workspace (route
// unreachable / FEATURE_OFF / a pre-3E landing-admin answering "unknown
// action") → the caller dims the queue's buttons and toasts once, no crash.
export type RefresherActionResult =
  | { ok: true }
  | { ok: false; error: string; unavailable: boolean };

const isRefresherUnavailable = (body: Envelope | null): boolean => {
  if (body === null) return true; // route unreachable / not deployed / not signed in
  if (body.code === 'FEATURE_OFF') return true;
  // Pre-SC3 landing-admin builds answer: { error:'unknown action "refresherApply"', … }.
  return typeof body.error === 'string' && body.error.toLowerCase().includes('unknown action');
};

const runRefresherAction = async (
  action: 'refresherApply' | 'refresherDismiss',
  id: string,
  keys?: string[],
): Promise<RefresherActionResult> => {
  // FLAT body, per the gotcha; keys omitted entirely ⇒ the route acts on ALL diffs.
  const body = await callPropelRoute<Envelope>(ROUTE, {
    action,
    id,
    ...(keys && keys.length > 0 ? { keys } : {}),
  });
  if (body && body.ok === true) return { ok: true };
  return { ok: false, error: failMessage(body), unavailable: isRefresherUnavailable(body) };
};

export const refresherApply = (id: string, keys?: string[]): Promise<RefresherActionResult> =>
  runRefresherAction('refresherApply', id, keys);

export const refresherDismiss = (id: string, keys?: string[]): Promise<RefresherActionResult> =>
  runRefresherAction('refresherDismiss', id, keys);
