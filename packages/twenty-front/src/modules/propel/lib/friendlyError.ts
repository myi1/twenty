// Human-friendly error mapper for the Marketing hero.
//
// The founder's quality bar: a user must NEVER see a raw/technical error string
// in the UI (the live offender was a blog card rendering
// `translate: LLM response was not parseable JSON afte…`). Every place a failure
// could reach a card / badge / toast / alert routes its string through here:
//   • if the string looks technical (JSON-parse noise, an LLM blob, a stack
//     trace, a 5xx, a socket error, `[object Object]`, a raw JSON dump, …) it is
//     REPLACED with a short human message + a "try again" next step, and the raw
//     detail is preserved in `console.error` (deduped, so no per-render spam);
//   • if the string is already a clean human sentence (the data layer's own
//     fallbacks — "Could not reach the blog pipeline (sign in as a Manager)…")
//     it passes through untouched.
//
// Pure enough to call from a render body: the only side effect is a one-time
// deduped console.error for genuinely-technical strings, which is exactly the
// "console keeps the ugly detail" contract.

export type FriendlyErrorContext =
  | 'generic'
  | 'network'
  | 'pipeline' // a stored lastError on a failed content item (blog/landing)
  | 'translate'
  | 'draft' // AI draft / generate
  | 'publish'
  | 'preflight'
  | 'approve'
  | 'reject'
  | 'retry'
  | 'save'
  | 'image'
  | 'load';

// The blog pipeline stores its failures as `<stage>: <technical reason>` in
// lastError / pipelineLog notes (stages: ideate · ground · write/drafting · seo ·
// critic · translate — e.g. "critic: verdict=fail score=0<70", "ground: Exceeded
// 4 tool rounds without final answer"). We map on the STAGE PREFIX, not the reason
// content, so ANY reason a stage emits (now or later) becomes a friendly per-stage
// message instead of leaking raw. The raw string still goes to console.error.
const STAGE_PREFIX =
  /^(ideate|ground|grounding|write|writing|draft|drafting|seo|critic|review|translate|translating)\s*:/i;

const STAGE_MESSAGE: Record<string, string> = {
  ideate: 'Couldn’t land an angle for this one — retry it.',
  ground: 'Couldn’t gather enough live data for this one — retry it.',
  grounding: 'Couldn’t gather enough live data for this one — retry it.',
  write: 'The draft didn’t come together — retry it.',
  writing: 'The draft didn’t come together — retry it.',
  draft: 'The draft didn’t come together — retry it.',
  drafting: 'The draft didn’t come together — retry it.',
  seo: 'The SEO pass failed — retry it.',
  critic: 'This draft didn’t pass review — retry it.',
  review: 'This draft didn’t pass review — retry it.',
  translate: 'Couldn’t translate this post — retry it.',
  translating: 'Couldn’t translate this post — retry it.',
};

// Bare pipeline-failure smells that can appear WITHOUT a stage prefix — map to the
// generic pipeline "snag" message rather than leak the raw internal reason.
const BARE_PIPELINE_MARKERS: RegExp[] = [
  /verdict\s*=\s*fail/i,
  /score\s*=\s*\d+\s*<\s*\d+/i, // "score=0<70"
  /exceeded\s+\d+\s+tool\s+rounds/i,
  /without\s+final\s+answer/i,
  /ungrounded\s+figures?/i,
  /no\s+verifiable\s+facts?/i,
];

// The friendly fallback used when the raw string is technical or empty. Each ends
// with a concrete next step so the user is never stranded.
const CONTEXT_MESSAGE: Record<FriendlyErrorContext, string> = {
  generic: 'Something went wrong — please try again.',
  network: 'Couldn’t reach the service — check your connection and try again.',
  pipeline: 'This item hit a snag while being generated — retry it.',
  translate: 'Couldn’t translate this — try again.',
  draft: 'The draft didn’t generate — try again.',
  publish: 'Couldn’t publish this — try again.',
  preflight: 'Couldn’t run the pre-flight checks — try again.',
  approve: 'Couldn’t approve this — try again.',
  reject: 'Couldn’t reject this — try again.',
  retry: 'Couldn’t retry this — try again.',
  save: 'Couldn’t save your changes — try again.',
  image: 'Couldn’t generate the image — try again.',
  load: 'Couldn’t load this — refresh and try again.',
};

// Substrings/patterns that mark a string as raw/technical — it must never render.
const TECHNICAL_MARKERS: RegExp[] = [
  /not\s+parseable/i,
  /unexpected\s+token/i,
  /json(\.parse|\s+parse)?/i,
  /\bLLM\b/,
  /parse(d)?\s+(as\s+)?json/i,
  /\bundefined\b/,
  /\bNaN\b/,
  /\[object\s+object\]/i,
  /\b(TypeError|ReferenceError|SyntaxError|RangeError|Error:)\b/,
  /\bat\s+.+:\d+:\d+/, // stack frame "at fn (file:line:col)"
  /\b5\d{2}\b/, // 5xx status
  /\b4\d{2}\b/, // 4xx status
  /econnrefused|etimedout|enotfound|econnreset|socket\s+hang\s+up|fetch\s+failed/i,
  /\b(graphql|resolver|prisma|postgres|psql|sequelize|ECONN)\b/i,
  /timeout\s+of\s+\d+\s*ms/i,
  /request\s+failed\s+with\s+status/i,
  /cannot\s+read\s+propert/i,
  /is\s+not\s+a\s+function/i,
];

// Network/connectivity smells get the network message regardless of context.
const NETWORK_MARKERS =
  /econnrefused|etimedout|enotfound|econnreset|socket\s+hang\s+up|fetch\s+failed|network\s+error|failed\s+to\s+fetch/i;

const looksTechnical = (raw: string): boolean => {
  // A JSON blob / object dump.
  const t = raw.trim();
  if (
    (t.startsWith('{') && t.endsWith('}')) ||
    (t.startsWith('[') && t.endsWith(']'))
  ) {
    return true;
  }
  // Absurdly long strings are always a raw dump, never a human message.
  if (t.length > 240) return true;
  return TECHNICAL_MARKERS.some((re) => re.test(t));
};

// One-time console.error per unique raw string so the technical detail is always
// available in the console for debugging without spamming it on every re-render.
const loggedRaws = new Set<string>();
const logOnce = (context: FriendlyErrorContext, raw: string): void => {
  const key = `${context}::${raw}`;
  if (loggedRaws.has(key)) return;
  loggedRaws.add(key);
  // eslint-disable-next-line no-console
  console.error(`[propel:${context}] technical error (shown to user as a friendly message):`, raw);
};

/**
 * Map a raw error string to a human-friendly one.
 *
 * - `<stage>: …` blog-pipeline failure → the per-stage friendly message;
 * - empty / bare-pipeline / network / technical → a friendly fallback;
 * - already-human → returned unchanged.
 *
 * In every non-passthrough case the raw string is logged once to console.error so
 * the technical detail is always available for debugging.
 */
export const friendlyError = (
  raw: string | null | undefined,
  context: FriendlyErrorContext = 'generic',
): string => {
  const t = (raw ?? '').trim();
  if (t === '') return CONTEXT_MESSAGE[context];

  // 1. `<stage>: <reason>` — map on the STAGE PREFIX (not the reason content) so
  //    any reason the blog pipeline emits becomes a friendly per-stage message.
  const stageMatch = STAGE_PREFIX.exec(t);
  if (stageMatch) {
    logOnce(context, t);
    return STAGE_MESSAGE[stageMatch[1].toLowerCase()] ?? CONTEXT_MESSAGE.pipeline;
  }

  // 2. Bare pipeline-failure smells (no stage prefix) → the generic "snag".
  if (BARE_PIPELINE_MARKERS.some((re) => re.test(t))) {
    logOnce(context, t);
    return CONTEXT_MESSAGE.pipeline;
  }

  // 3. Network/connectivity → the network message regardless of context.
  if (NETWORK_MARKERS.test(t)) {
    logOnce(context, t);
    return CONTEXT_MESSAGE.network;
  }

  // 4. Anything else that looks technical → the context's friendly fallback.
  if (looksTechnical(t)) {
    logOnce(context, t);
    return CONTEXT_MESSAGE[context];
  }

  // 5. A clean human sentence (our own data-layer fallbacks) — trust it as-is.
  return t;
};
