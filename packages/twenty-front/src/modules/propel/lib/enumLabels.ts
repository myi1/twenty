// Shared enum → human-label map for the Marketing hero.
//
// The founder's quality bar ([[ui-plain-language-low-cognitive-load]]): a user
// must NEVER see a raw UPPER_CASE / SNAKE_CASE enum value in a badge, dropdown,
// or status chip. Every surface that renders a stored enum routes it through
// `enumLabel(value)` (or `enumSelectData(values)` for a Mantine `<Select>`).
//
// Two layers:
//   1. `ENUM_LABEL_OVERRIDES` — curated labels for values that don't humanize
//      cleanly ("OFF_PLAN" → "Off-plan", "PARTLY" → "Partly furnished",
//      "NON_LEAD" → "Not a lead"). Keyed by the raw value, case-insensitive.
//   2. `humanizeEnum` — the generic fallback: SNAKE_CASE / UPPER_CASE → Title
//      case ("PROPERTY_TYPE" → "Property type", "READY" → "Ready"). Any value
//      not in the overrides falls through here, so a NEW enum the backend adds
//      later still reads cleanly instead of leaking raw.
//
// Pure — safe to call from a render body.

// Curated labels. Keys are compared UPPER-cased, so the source casing is
// irrelevant. Only list values whose generic humanization would be wrong or
// ambiguous; everything else is handled by humanizeEnum.
const ENUM_LABEL_OVERRIDES: Record<string, string> = {
  // ── Listing studio — furnishing / completion / property ──
  OFF_PLAN: 'Off-plan',
  PARTLY: 'Partly furnished',
  READY: 'Ready to move in',
  UNFURNISHED: 'Unfurnished',
  FURNISHED: 'Furnished',

  // ── Landing pages — status ──
  DRAFT: 'Draft',
  LIVE: 'Live',
  ARCHIVED: 'Archived',

  // ── Site leads — lead intent (SiteLeadDrawer / SiteLeadsTab) ──
  GENUINE: 'Genuine lead',
  NON_LEAD: 'Not a lead',
  UNCLASSIFIED: 'Not yet reviewed',
  SPAM: 'Spam',

  // ── Campaign / sequence / send status ──
  IN_REVIEW: 'In review',
  PENDING_APPROVAL: 'Pending approval',
  SENT_BACK: 'Sent back',
  SCHEDULED: 'Scheduled',
  SENDING: 'Sending',
  SENT: 'Sent',
  PARTIALLY_SENT: 'Partially sent',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  CANCELED: 'Cancelled',
  FAILED: 'Failed',
  DELIVERED: 'Delivered',
  BOUNCED: 'Bounced',
  OPENED: 'Opened',
  CLICKED: 'Clicked',
  REPLIED: 'Replied',
  QUEUED: 'Queued',

  // ── Off-plan / mandate misc that show up in snapshots ──
  ON_HOLD: 'On hold',
};

// Generic humanizer: "PROPERTY_TYPE" / "property-type" → "Property type".
export const humanizeEnum = (raw: string): string => {
  const cleaned = raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (cleaned === '') return raw;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

/**
 * Map a raw enum value to a human label. Curated override first, then the
 * generic humanizer. `null` / `undefined` / '' → ''.
 */
export const enumLabel = (value: string | null | undefined): string => {
  const v = (value ?? '').trim();
  if (v === '') return '';
  const override = ENUM_LABEL_OVERRIDES[v.toUpperCase()];
  return override ?? humanizeEnum(v);
};

/**
 * Build Mantine `<Select>` `data` from raw enum values — `{ value, label }[]`
 * so the dropdown stores the enum but shows the human label.
 */
export const enumSelectData = (
  values: readonly string[],
): { value: string; label: string }[] =>
  values.map((value) => ({ value, label: enumLabel(value) }));
