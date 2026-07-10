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
 * - empty / technical → the context's friendly fallback (and the raw is logged
 *   once to console.error for debugging);
 * - already-human → returned unchanged.
 */
export const friendlyError = (
  raw: string | null | undefined,
  context: FriendlyErrorContext = 'generic',
): string => {
  const t = (raw ?? '').trim();
  if (t === '') return CONTEXT_MESSAGE[context];
  if (NETWORK_MARKERS.test(t)) {
    logOnce(context, t);
    return CONTEXT_MESSAGE.network;
  }
  if (looksTechnical(t)) {
    logOnce(context, t);
    return CONTEXT_MESSAGE[context];
  }
  // A clean human sentence (our own data-layer fallbacks) — trust it as-is.
  return t;
};
