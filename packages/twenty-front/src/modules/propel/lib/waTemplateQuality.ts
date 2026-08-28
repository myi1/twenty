// ── FORK-LOCAL PORT — SOURCE OF TRUTH LIVES IN THE OTHER REPO ────────────────
// Byte-faithful port of propel-crm-integration:src/shared/wa-template-quality.ts,
// following the same convention as waTemplate.ts beside it (we do NOT import
// across repos). Everything below the imports is copied verbatim from that file;
// only the import line differs, because the two helpers this needs
// (distinctBodyParams, hasOptOutAffordance) are already ported into waTemplate.ts.
//
// WHY A PORT AND NOT A NETWORK CALL: the whole value of this score is that the
// author sees it WHILE TYPING. A round-trip per keystroke would be slow, would
// hammer a Manager-gated route, and would put a network dependency on a purely
// textual judgement. Scoring is pure and synchronous, so it runs on every render
// for free.
//
// DRIFT IS THE RISK, and it is handled two ways:
//   1. this file is a straight copy — change the source file, re-copy this one,
//      never hand-edit one side;
//   2. the SERVER is still the authority at the moment that matters. Both
//      POST /marketing/wa-template-create (on submit) and its dryRun mode return
//      the server's own `quality` object computed from the source module. If this
//      port ever drifts, the submit response is what is true.
//
// The score is ADVISORY EVERYWHERE. It never blocks a submission — only
// validateCreateInput does that.

// WhatsApp template QUALITY SCORE — an ADVISORY, pre-submission read on how
// likely a template is to be reported or ignored once it lands in 1,000+ chats.
//
// WHY THIS EXISTS (2026-08-28): a 1,485-recipient blast on
// `syed_deal_of_decade_aug2026` drew a Meta spam notice and pushed the sending
// number (+971 50 210 4130) to quality_rating RED. Reply rate: 0.47%. All four
// marketing blasts that preceded it share one fingerprint — MARKETING category,
// ZERO {{n}} variables, no opt-out, heavy emoji/hype, 736-1009 characters. The
// 40+ RCBI templates sent over the same window share the opposite fingerprint
// (a {{1}} first-name variable, 130-344 characters, no hype) and drew nothing.
// This module turns that measured contrast into a number the author sees BEFORE
// they submit, instead of discovering it as a RED rating weeks later.
//
// ── THE HONESTY RULE (read this before adding a signal) ──────────────────────
// Meta publishes almost NO content rubric. What Meta actually documents is:
//   • quality rating is derived from real-world behaviour — templates with
//     "negative feedback from multiple customers, or low read-rates" drop to
//     medium/low and can be paused.
//     developers.facebook.com/docs/whatsapp/message-templates/guidelines/
//   • businesses must "Provide clear instructions for how people can opt out of
//     receiving specific categories of messages, and honor these requests", and
//     must "clearly state the business's name".
//     developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in
//   • enforcement follows "sending spam, template misclassifications, or
//     high-risk policy categories" and accounts that "receive excessive negative
//     feedback from users".
//     developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement
// Meta does NOT publish an emoji cap, a length target, or a banned-phrase list.
//
// So every signal carries a `basis` and the UI prints it. NEVER dress our own
// inference up as Meta policy:
//   META_POLICY   — Meta documents this as an obligation (quotable above).
//   META_QUALITY  — Meta documents this as a quality-rating input.
//   OUR_HISTORY   — measured from OUR OWN sends (the 4 flagged vs the 40 quiet).
//   OUR_HEURISTIC — our inference / general spam-filter folklore. A judgement call.
//
// ── ADVISORY, NEVER BLOCKING ─────────────────────────────────────────────────
// Nothing here can stop a submission. Only validateCreateInput
// (wa-template-create.ts — Meta's hard caps, and the mandatory-opt-out rule)
// blocks. A low score warns loudly; a deliberate send still goes out.

// WhatsApp template QUALITY SCORE — an ADVISORY, pre-submission read on how
// likely a template is to be reported or ignored once it lands in 1,000+ chats.
//
// WHY THIS EXISTS (2026-08-28): a 1,485-recipient blast on
// `syed_deal_of_decade_aug2026` drew a Meta spam notice and pushed the sending
// number (+971 50 210 4130) to quality_rating RED. Reply rate: 0.47%. All four
// marketing blasts that preceded it share one fingerprint — MARKETING category,
// ZERO {{n}} variables, no opt-out, heavy emoji/hype, 736-1009 characters. The
// 40+ RCBI templates sent over the same window share the opposite fingerprint
// (a {{1}} first-name variable, 130-344 characters, no hype) and drew nothing.
// This module turns that measured contrast into a number the author sees BEFORE
// they submit, instead of discovering it as a RED rating weeks later.
//
// ── THE HONESTY RULE (read this before adding a signal) ──────────────────────
// Meta publishes almost NO content rubric. What Meta actually documents is:
//   • quality rating is derived from real-world behaviour — templates with
//     "negative feedback from multiple customers, or low read-rates" drop to
//     medium/low and can be paused.
//     developers.facebook.com/docs/whatsapp/message-templates/guidelines/
//   • businesses must "Provide clear instructions for how people can opt out of
//     receiving specific categories of messages, and honor these requests", and
//     must "clearly state the business's name".
//     developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in
//   • enforcement follows "sending spam, template misclassifications, or
//     high-risk policy categories" and accounts that "receive excessive negative
//     feedback from users".
//     developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement
// Meta does NOT publish an emoji cap, a length target, or a banned-phrase list.
//
// So every signal carries a `basis` and the UI prints it. NEVER dress our own
// inference up as Meta policy:
//   META_POLICY   — Meta documents this as an obligation (quotable above).
//   META_QUALITY  — Meta documents this as a quality-rating input.
//   OUR_HISTORY   — measured from OUR OWN sends (the 4 flagged vs the 40 quiet).
//   OUR_HEURISTIC — our inference / general spam-filter folklore. A judgement call.
//
// ── ADVISORY, NEVER BLOCKING ─────────────────────────────────────────────────
// Nothing here can stop a submission. Only validateCreateInput
// (wa-template-create.ts — Meta's hard caps, and the mandatory-opt-out rule)
// blocks. A low score warns loudly; a deliberate send still goes out.

import {
  distinctBodyParams,
  hasOptOutAffordance,
  type WaTemplateCreateInput,
} from '@/propel/lib/waTemplate';

// ── result shape ──────────────────────────────────────────────────────────────

/** Where a signal's authority comes from. Shown in the UI verbatim so nobody
 * mistakes our judgement for Meta's rule. */
export type WaQualityBasis = 'META_POLICY' | 'META_QUALITY' | 'OUR_HISTORY' | 'OUR_HEURISTIC';

export type WaQualityKind = 'RISK' | 'GOOD';

export interface WaQualitySignal {
  /** stable machine key — for tests and UI keys, never shown raw to a human. */
  id: string;
  kind: WaQualityKind;
  /** plain-language headline; what a non-technical reader sees first. */
  label: string;
  /** what we actually saw, and what to do about it. */
  detail: string;
  /** points deducted. RISK signals may be 0 when they are advice, not a fault. */
  penalty: number;
  basis: WaQualityBasis;
}

export type WaQualityGrade = 'A' | 'B' | 'C' | 'D' | 'E';

export interface WaTemplateQualityScore {
  /** 0-100. Starts at 100; every risk signal deducts. */
  score: number;
  grade: WaQualityGrade;
  /** one-line plain-language verdict for the top of the panel. */
  verdict: string;
  /** worst-first, GOOD signals last. */
  signals: WaQualitySignal[];
  riskCount: number;
  /** always true — a reminder at every call site that this never blocks. */
  advisory: true;
}

// ── grade bands ───────────────────────────────────────────────────────────────
// OURS, not Meta's, and CALIBRATED rather than decorative: the tests assert that
// the four templates behind the RED rating land in D/E and the quiet RCBI set
// lands in A/B. Change a weight and those tests tell you if the bands still hold.
export const gradeFor = (score: number): WaQualityGrade =>
  score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'E';

const VERDICTS: Record<WaQualityGrade, string> = {
  A: 'Safe to send. Nothing here reads like a spam blast.',
  B: 'Broadly fine. One or two changes would make it safer.',
  C: 'Risky. Worth fixing the flagged items before a large send.',
  D: 'High risk. This resembles the messages that got our number flagged.',
  E: 'Very high risk. Sending this at volume is likely to damage the number.',
};

// ── weights, in one table so the model is legible at a glance ─────────────────
// Ordering principle: weight by how DIRECTLY the signal drives the two things
// Meta says it measures — negative feedback (reports/blocks) and read rate.
export const WEIGHTS = {
  noPersonalisation: 25, // strongest measured fingerprint we have (4/4 vs 0/40)
  bodyVeryLong: 15, // > 800 chars — inside the flagged cluster
  bodyLong: 8, // > 600 chars — beyond anything that went out quietly
  hypePerPhrase: 5,
  hypeCap: 20,
  emojiHeavy: 12,
  shouting: 10,
  noSenderIdentity: 10,
  noOptOut: 8, // small ON PURPOSE — see the note at the check itself
  boldHeavy: 6,
  pitchFirst: 6,
} as const;

// ── lexicons — ALL of these are ours. None is a Meta list. ───────────────────

// Urgency and hype vocabulary, seeded from the literal wording of our OWN four
// flagged templates and then widened with the promotional-pressure terms those
// messages are built from. Matched on word boundaries, so "stopped" or
// "hurrying" do not trip a bare entry.
const HYPE_PHRASES: readonly string[] = [
  'deal of the decade', 'once in a lifetime', 'best project yet', 'sell-out', 'sold out',
  'only available', 'limited time', 'last chance', 'final chance', 'act now', 'act fast',
  'hurry', 'urgent', "don't wait", 'dont wait', "don't miss", 'dont miss', 'do not miss',
  'before the deadline', 'right now', 'today only', 'ends today', 'ends soon',
  "won't last", 'wont last', 'jump the queue', 'lock in', 'block your unit', 'guaranteed',
  'going crazy', 'wiped out', 'be early', 'left out', 'exclusive offer', 'unbeatable',
  'massive', 'biggest', 'never before', 'no obligation free',
];

// Wording that suggests a genuinely expected, transactional message rather than
// a promotion. Used ONLY to raise the "could this be UTILITY?" note — never to
// deduct points.
const UTILITY_HINTS: readonly string[] = [
  'your appointment', 'your booking', 'your viewing', 'your enquiry', 'your request',
  'your application', 'your document', 'as requested', 'following up on', 'your file',
  'reminder', 'scheduled', 'attached', 'confirm',
];

/** What counts as "the recipient can tell who this is from". */
const SENDER_MARKERS: readonly string[] = ['re/max', 'remax', 're max', 'hub dubai'];

// ── text measurements (exported so tests can pin each one independently) ─────

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

export const countEmoji = (text: string): number => (text.match(EMOJI_RE) ?? []).length;

/** Runs of 4+ consecutive capitals — "URGENT", "AVAILABLE", "DISCOUNT". Four is
 * the floor so ordinary acronyms (AED, ROI, PDF, BR) don't trip it. */
export const capsRuns = (text: string): string[] => text.match(/\b[A-Z]{4,}\b/g) ?? [];

/** WhatsApp bold spans (*text*), ignoring line-leading "* " list bullets — our
 * own templates use those for feature lists and they are not emphasis. */
export const boldSpans = (text: string): number => {
  const withoutBullets = text.replace(/^[ \t]*\*[ \t]+/gm, '');
  return (withoutBullets.match(/\*[^*\n]+\*/g) ?? []).length;
};

/** Emoji are "heavy" at 8+ anywhere, or 5+ packed into a short body (under one
 * per 40 characters). Both thresholds are OURS. Reference points from our own
 * catalogue: the flagged deal/Imtiaz blasts carry 11 and 9; the July distress
 * blast carries 4; every RCBI template carries 0. */
export const isEmojiHeavy = (text: string): boolean => {
  const n = countEmoji(text);
  if (n >= 8) return true;
  return n >= 5 && text.length > 0 && text.length / n < 40;
};

const lower = (s: string): string => s.toLowerCase();

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Word-boundary-aware "does this text contain any of these phrases". Returns the
 * phrases that hit, so the UI can quote them back to the author. */
export const matchPhrases = (haystack: string, needles: readonly string[]): string[] => {
  const hay = lower(haystack);
  return needles.filter((n) => new RegExp(`(?<![a-z])${escapeRe(lower(n))}(?![a-z])`).test(hay));
};

/** Every piece of author-written text in the template. Sender identity and
 * opt-out legitimately live in a FOOTER or a BUTTON, so those checks read this;
 * the "how does it read" checks (length, emoji, caps, bold) read the BODY alone,
 * because that is what fills the recipient's screen. */
export const allTemplateText = (input: WaTemplateCreateInput): string =>
  [
    input.header && input.header.format === 'TEXT' ? input.header.text : '',
    input.bodyText ?? '',
    input.footer ?? '',
    ...(input.buttons ?? []).map((b) => b.text ?? ''),
  ]
    .filter(Boolean)
    .join('\n');

// ── the scorer ────────────────────────────────────────────────────────────────

/**
 * Score a template for spam/quality risk BEFORE it is submitted to Meta.
 *
 * Pure and synchronous — cheap enough to run on every keystroke in the editor.
 * ADVISORY ONLY: nothing here blocks a submission.
 *
 * Callers should score the NORMALIZED input (the one ensureOptOut returned), so
 * the score describes the message that will actually be sent rather than the
 * half-finished draft the author typed.
 */
export const scoreTemplateQuality = (input: WaTemplateCreateInput): WaTemplateQualityScore => {
  const signals: WaQualitySignal[] = [];
  const risk = (id: string, penalty: number, basis: WaQualityBasis, label: string, detail: string) =>
    signals.push({ id, kind: 'RISK', label, detail, penalty, basis });
  const good = (id: string, basis: WaQualityBasis, label: string, detail: string) =>
    signals.push({ id, kind: 'GOOD', label, detail, penalty: 0, basis });

  const body = (input.bodyText ?? '').trim();
  const bodyLen = body.length;
  const everything = allTemplateText(input);
  const isMarketing = input.category === 'MARKETING';

  // ── 1. personalisation — the heaviest weight (−25) ─────────────────────────
  // OUR_HISTORY, not a Meta rule. All four flagged blasts had ZERO {{n}}
  // variables: one byte-identical block of text to 1,485 people. All 40+ RCBI
  // templates personalise with {{1}} and drew nothing. This is the clearest
  // "bulk blast" fingerprint our own data contains, so it carries the most weight.
  const varCount = distinctBodyParams(body).length;
  if (isMarketing && varCount === 0) {
    risk(
      'no_personalisation',
      WEIGHTS.noPersonalisation,
      'OUR_HISTORY',
      'Identical message to every recipient',
      'This body has no {{1}} variables, so everyone on the list receives a byte-identical message. All four of our flagged marketing blasts looked like this; none of our 40+ personalised templates were flagged. Add at least the first name.',
    );
  } else if (varCount > 0) {
    good(
      'personalised',
      'OUR_HISTORY',
      `Personalised — ${varCount} variable${varCount === 1 ? '' : 's'}`,
      'Each recipient gets a message addressed to them rather than a broadcast blob.',
    );
  }

  // ── 2. length (−15 / −8) ───────────────────────────────────────────────────
  // Thresholds measured from OUR data, not Meta's. The four flagged bodies ran
  // 736 / 799 / 937 / 1009 characters; the 40+ quiet ones ran 130-344. 600 sits
  // above the longest quiet template with headroom; 800 sits inside the flagged
  // cluster. Meta publishes nothing below its 1024-character hard cap — but Meta
  // DOES name low read rates as a quality input, and long promotional walls are
  // what people scroll past.
  if (bodyLen > 800) {
    risk(
      'body_very_long',
      WEIGHTS.bodyVeryLong,
      'OUR_HISTORY',
      `Very long — ${bodyLen} characters`,
      'Our flagged blasts ran 736-1009 characters; the templates that caused no trouble ran 130-344. Meta counts low read rates against the number. Aim for under 400.',
    );
  } else if (bodyLen > 600) {
    risk(
      'body_long',
      WEIGHTS.bodyLong,
      'OUR_HISTORY',
      `Long — ${bodyLen} characters`,
      'Longer than any template we have sent without trouble (those ran 130-344 characters). Cut it back to the single thing you want a reply about.',
    );
  }

  // ── 3. urgency / hype language (−5 each, capped at −20) ────────────────────
  const hypeHits = matchPhrases(everything, HYPE_PHRASES);
  if (hypeHits.length > 0) {
    risk(
      'hype_language',
      Math.min(WEIGHTS.hypeCap, hypeHits.length * WEIGHTS.hypePerPhrase),
      'OUR_HEURISTIC',
      `Pressure language — ${hypeHits.length} phrase${hypeHits.length === 1 ? '' : 's'}`,
      `Found: ${hypeHits.slice(0, 6).map((h) => `"${h}"`).join(', ')}${hypeHits.length > 6 ? '…' : ''}. Deadline-and-scarcity wording is what people report as spam. This list is drawn from our own flagged messages — it is not a Meta list.`,
    );
  }

  // ── 4. emoji density (−12) ─────────────────────────────────────────────────
  if (isEmojiHeavy(body)) {
    risk(
      'emoji_heavy',
      WEIGHTS.emojiHeavy,
      'OUR_HEURISTIC',
      `Heavy emoji use — ${countEmoji(body)} in ${bodyLen} characters`,
      'This reads as an advertising flyer rather than a message from a person. Our own judgement, not a published Meta rule. Two or three emoji is plenty.',
    );
  }

  // ── 5. SHOUTING (−10) ──────────────────────────────────────────────────────
  const caps = capsRuns(body);
  if (caps.length >= 3) {
    risk(
      'shouting',
      WEIGHTS.shouting,
      'OUR_HEURISTIC',
      `Shouting — ${caps.length} words in capitals`,
      `Capitalised: ${caps.slice(0, 6).join(', ')}${caps.length > 6 ? '…' : ''}. Blocks of capitals read as a hard sell. Our own judgement, not a Meta rule.`,
    );
  }

  // ── 6. sender identity (−10) ───────────────────────────────────────────────
  // Meta's opt-in guidance requires businesses to "clearly state the business's
  // name". A recipient who cannot tell who is writing is the easiest to report.
  if (matchPhrases(everything, SENDER_MARKERS).length === 0) {
    risk(
      'no_sender_identity',
      WEIGHTS.noSenderIdentity,
      'META_POLICY',
      'Never says who it is from',
      'The message never names RE/MAX Hub. Meta requires businesses to clearly state their name, and an unidentified sender is the easiest kind to report. Name the company once.',
    );
  } else {
    good('names_sender', 'META_POLICY', 'Says who it is from', 'The message identifies RE/MAX Hub.');
  }

  // ── 7. bold spam (−6) ──────────────────────────────────────────────────────
  const bold = boldSpans(body);
  if (bold > 6) {
    risk(
      'bold_heavy',
      WEIGHTS.boldHeavy,
      'OUR_HEURISTIC',
      `Almost everything is bold — ${bold} bold sections`,
      'When every line is emphasised, none of it is. Our own judgement, not a Meta rule.',
    );
  }

  // ── 8. pitch-first opening (−6) ────────────────────────────────────────────
  // If the first 90 characters are already selling — hype vocabulary, a discount,
  // or a price — the reader has been given no reason to keep reading.
  const opener = body.slice(0, 90);
  const openerSells =
    matchPhrases(opener, HYPE_PHRASES).length > 0 ||
    /\b\d{1,3}\s?%\s*(off|discount)/i.test(opener) ||
    /\baed\s?[\d,]+/i.test(opener);
  if (openerSells) {
    risk(
      'pitch_first',
      WEIGHTS.pitchFirst,
      'OUR_HEURISTIC',
      'Opens with the pitch, not the reason',
      'The first line is already selling. Lead with why this person in particular is hearing from you, then make the offer. Our own judgement, not a Meta rule.',
    );
  }

  // ── 9. opt-out affordance (−8, deliberately SMALL) ─────────────────────────
  // Meta's opt-in guidance: "Provide clear instructions for how people can opt
  // out … and honor these requests." All four flagged blasts offered no exit.
  //
  // The weight is small ON PURPOSE, and that is not an oversight: the mandatory
  // opt-out rule in wa-template-create.ts (ensureOptOut / validateCreateInput)
  // already GUARANTEES this structurally — a MARKETING template with no exit is
  // given the standard opt-out (a quick-reply button by default, a footer line
  // when the button slots are full), and is blocked outright in the one case
  // there is nowhere to put it. Scoring it heavily would double-count a problem that is
  // already solved by a hard gate, and would drag every template's score down
  // for a fault the system fixes on the author's behalf. It stays in the list at
  // a low weight for ONE reason: so an author reading the panel can see the exit
  // is there, and so a template scored BEFORE normalisation (a live draft in the
  // editor) still says something honest.
  // Detection reuses hasOptOutAffordance — the same vocabulary the RUNTIME
  // honours (wa-opt-out.ts). Never re-implement it here: an opt-out the scorer
  // recognises but the runtime doesn't is worse than none at all.
  if (isMarketing && !hasOptOutAffordance(input)) {
    risk(
      'no_opt_out',
      WEIGHTS.noOptOut,
      'META_POLICY',
      'No way out for the recipient',
      'Nothing here tells the reader how to stop receiving these. Meta requires clear opt-out instructions, and a reader with no exit reaches for "Report spam" instead. The standard opt-out will be added for you on submit — but writing your own reads better.',
    );
  } else if (isMarketing) {
    good('has_opt_out', 'META_POLICY', 'Gives the reader a way out', 'The template tells the reader how to stop receiving these messages, in wording the system will actually honour.');
  }

  // ── 10. category fit (0 points — advice, never a deduction) ────────────────
  // Meta names "template misclassifications" as an enforcement trigger, so this
  // cuts BOTH ways: MARKETING draws the most scrutiny, but dressing genuine
  // marketing up as UTILITY is itself a violation. Hence a note with no penalty.
  if (isMarketing && varCount > 0 && hypeHits.length === 0 && matchPhrases(everything, UTILITY_HINTS).length >= 2) {
    risk(
      'maybe_utility',
      0,
      'META_POLICY',
      'Could this be a UTILITY template?',
      'This reads like a reply to something the person asked for rather than a promotion. UTILITY templates face less scrutiny and cost less to send. Only re-categorise if it genuinely responds to their request — Meta treats deliberate misclassification as a violation.',
    );
  }

  // ── total ──────────────────────────────────────────────────────────────────
  const deducted = signals.reduce((sum, s) => sum + s.penalty, 0);
  const score = Math.max(0, Math.min(100, 100 - deducted));

  // worst-first; GOOD signals (and zero-penalty notes) after the real risks.
  signals.sort((a, b) => b.penalty - a.penalty || (a.kind === b.kind ? 0 : a.kind === 'RISK' ? -1 : 1));

  return {
    score,
    grade: gradeFor(score),
    verdict: VERDICTS[gradeFor(score)],
    signals,
    riskCount: signals.filter((s) => s.kind === 'RISK').length,
    advisory: true,
  };
};
