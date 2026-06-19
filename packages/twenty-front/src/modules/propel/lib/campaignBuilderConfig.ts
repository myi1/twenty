import {
  type MergeField,
  type MergeValues,
} from '@/propel/lib/campaignRenderer';
import {
  type RouteEnvelopeError,
  type SegmentCriteriaV2,
} from '@/propel/types/campaignBuilder';

// Constants + pure helpers shared across the builder steps — ported from the
// Propel in-sandbox builder (marketing-cloud.tsx) so behaviour matches 1:1.

// A single-message SEGMENT email send fills exactly ONE per-recipient field:
// firstName. Saved-snippet custom keys also always fill (fixed workspace value),
// so they widen the allow-set. A LISTING promo widens it further with the
// listing fields (only fillable once a listing is actually attached).
export const BUILDER_MERGE_FIELDS: MergeField[] = ['firstName'];
export const LISTING_MERGE_FIELDS: MergeField[] = [
  'listingTitle',
  'permitNumber',
];

// Live-preview sample values (the body/subject preview substitutes these).
export const PREVIEW_SAMPLES: MergeValues = { firstName: 'Aisha' };

export const listingPreviewSamples = (
  listingName: string | null,
): MergeValues => ({
  listingTitle: listingName ?? 'Marina Gate · 2BR',
  permitNumber: 'P-DLD-00000',
});

// The format toolbar above the email body: wrap selection with before/after.
export interface FormatAction {
  label: string;
  title: string;
  before: string;
  placeholder: string;
  after: string;
}

export const FORMAT_ACTIONS: FormatAction[] = [
  { label: 'H', title: 'Heading', before: '## ', placeholder: 'Heading', after: '' },
  { label: 'B', title: 'Bold', before: '**', placeholder: 'bold text', after: '**' },
  { label: 'I', title: 'Italic', before: '*', placeholder: 'italic text', after: '*' },
  { label: '• List', title: 'Bullet item', before: '- ', placeholder: 'List item', after: '' },
  { label: 'Link', title: 'Link', before: '[', placeholder: 'link text', after: '](https://)' },
  {
    label: 'Button',
    title: 'Call-to-action button',
    before: '[[',
    placeholder: 'Button label',
    after: ']](https://)',
  },
];

// Lead-source choices for the criteria segment builder (the most common axes;
// the resolver accepts any string, this is just the curated picker set).
export const LEAD_SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'META', label: 'Meta (FB / IG)' },
  { value: 'PROPERTY_FINDER', label: 'Property Finder' },
  { value: 'BAYUT', label: 'Bayut' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'OTHER', label: 'Other' },
];

// S5 — the wider criteria axes the SegmentCriteriaV2 resolver supports (design
// decision D-3, founder-locked). The 2 common axes (lead source + cold window)
// are always visible; these ride behind a "More filters" disclosure.
//
// HONESTY (the "never zero-fill" rule): an axis is only offered live where the
// audience source (marketing-audience.fetchAudience, CRM repo) actually feeds
// the resolver the matching field. Today fetchAudience reads the SECONDARY
// pipeline only and supplies stage + budget per opportunity — so OPP STAGE and
// BUDGET resolve truthfully. lane is hard-pinned to 'secondary' and location is
// null at the source, so a lane/location filter would silently match nobody.
// We therefore DO NOT offer lane/location as live pickers here (offering a
// filter that always resolves to 0 IS a zero-fill); they wait on the
// fetchAudience widening (see TODO(S5-backend) in SegmentCreateModal).

// Opportunity stage = the secondaryOpportunity.stage enum (CRM repo,
// secondary-opportunity.object.ts) — the exact lane fetchAudience reads, so
// these match the resolver's oppStages axis 1:1.
export const OPP_STAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'QUALIFY', label: 'Qualify' },
  { value: 'MATCH_VIEW', label: 'Match & View' },
  { value: 'OFFER', label: 'Offer' },
  { value: 'AGREED', label: 'Agreed → Deal' },
  { value: 'PARKED', label: 'Parked (nurture)' },
  { value: 'LOST', label: 'Lost' },
];

// 7 MB transport cap (mirrors marketing-media.MEDIA_MAX_DECODED_BYTES) — the
// route also enforces it; we surface a friendly message before the round-trip.
export const MEDIA_MAX_DECODED_BYTES = 7 * 1024 * 1024;

// Dubai-local "YYYY-MM-DDTHH:mm" (from a datetime-local input) → an absolute UTC
// ISO string anchored to Asia/Dubai (+04:00, no DST). Returns null on a malformed
// value so the caller can show "pick a date & time first".
export const dubaiLocalToIso = (value: string): string | null => {
  const m = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.exec(value);
  if (!m) return null;
  const t = Date.parse(`${value}${m[1] ? '' : ':00'}+04:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

// Read a native File's bytes and base64-encode them for the import-segment
// route's contentBase64 field. In the REAL frontend we have File.arrayBuffer()
// directly (the sandbox had to round-trip through readFrontComponentFile), so
// this is the graduated equivalent of that flow.
export const fileToBase64 = async (file: File): Promise<string> => {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000; // 32k — avoids "max call stack" on String.fromCharCode.apply
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};

// Pull the operator-facing message out of a typed route envelope: prefer the
// plain-language operatorAction, fall back to error, then a generic default.
export const envelopeMessage = (
  res: RouteEnvelopeError | null,
  fallback: string,
): string => res?.operatorAction || res?.error || fallback;

// Build a v2 criteria object from the criteria-builder fields, omitting empty
// axes (the resolver treats an absent axis as "no restriction"). S5 widens this
// to the progressive axes: opp stage, budget range, explicit person list. Each
// is included ONLY when it carries a real value, so an untouched "More filters"
// section adds nothing to the payload (and the segment stays as broad as before).
//
// budgetMin/budgetMax are AED units (the resolver compares against opportunity
// budget in units — currencyUnits in fetchAudience). personIds is a hand-entered
// allow-list, split on commas/whitespace/newlines and de-duped.
export const buildCriteriaV2 = (args: {
  sources: string[];
  coldDays: string;
  oppStages?: string[];
  budgetMin?: string;
  budgetMax?: string;
  personIds?: string;
}): SegmentCriteriaV2 => {
  const criteria: SegmentCriteriaV2 = { version: 2 };
  if (args.sources.length > 0) criteria.sources = args.sources;
  const cold = Number.parseInt(args.coldDays, 10);
  if (Number.isFinite(cold) && cold > 0) criteria.lastTouchOlderThanDays = cold;
  if (args.oppStages && args.oppStages.length > 0) criteria.oppStages = args.oppStages;
  const bMin = Number.parseFloat(args.budgetMin ?? '');
  if (Number.isFinite(bMin) && bMin >= 0) criteria.budgetMin = bMin;
  const bMax = Number.parseFloat(args.budgetMax ?? '');
  if (Number.isFinite(bMax) && bMax >= 0) criteria.budgetMax = bMax;
  const ids = parsePersonIds(args.personIds ?? '');
  if (ids.length > 0) criteria.personIds = ids;
  return criteria;
};

// Split a hand-entered person-id list on commas / whitespace / newlines, trim,
// drop blanks, de-dupe (preserving order). Pure — the route + resolver still
// validate, this just normalizes the textarea before it becomes a payload axis.
export const parsePersonIds = (raw: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of raw.split(/[\s,]+/)) {
    const id = tok.trim();
    if (id !== '' && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
};

// AI text/plan coercion (the ai-build route only JSON-parses/casts the LLM
// output — a non-string field would crash render/.slice/save).
export const aiText = (x: unknown): string =>
  typeof x === 'string' ? x : '';
