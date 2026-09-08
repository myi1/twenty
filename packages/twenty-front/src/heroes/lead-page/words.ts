// words.ts: plain-language label maps and small pure helpers for the lead page.
// Labels are copied from the app's option arrays; the hero cannot import from the
// app repo, so this is a hand-maintained mirror. Keep in sync with:
//   /Users/yahyaismail/dev/_wt/lead-page/src/shared/lead-page-core.ts (LEAD_PICKS,
//   OFFPLAN_UNIT_TYPES) and the off-plan opportunity stage SELECT.

// EVERY lane's stages, not just off-plan. A first draft covered off-plan only, so a
// Seller lead showed the pill LISTING_SIGNED and an institutional lead showed a raw
// code every single time. Jargon is expanded on purpose: an agent should not have to
// know that IC means investment committee. stageWords humanises anything unlisted
// rather than printing an enum, so a stage added later degrades to "Listing signed",
// not LISTING_SIGNED. Values verified against the five opportunity objects, 2026-09-08.
export const STAGE_WORDS: Record<string, string> = {
  NEW: 'New', CONTACTED: 'Contacted', QUALIFIED: 'Qualified', ON_HOLD: 'On hold', LOST: 'Lost',
  SHORTLISTED: 'Shortlisted', RESERVED: 'Reserved', SPA_SIGNED: 'SPA signed', BOOKED: 'Booked',
  VIEWING: 'Viewing', OFFER: 'Offer', NEGOTIATION: 'Negotiation', AGREED: 'Agreed',
  VALUATION: 'Valuation', LISTING_SIGNED: 'Listing signed', LIVE: 'Live listing', SOLD: 'Sold',
  COMPLIANCE_CHECK: 'Compliance check', CONSULTATION: 'Consultation', PARTNER_ENGAGED: 'Partner engaged',
  APPLICATION: 'Application', CONVERTED: 'Converted',
  QUALIFY_MANDATE: 'Qualify and mandate', THESIS_SOURCE: 'Thesis and source', LOI: 'Letter of intent',
  DUE_DILIGENCE: 'Due diligence', IC_APPROVAL: 'Board approval', STRUCTURING_SPA: 'Structuring and SPA',
  CLOSE_TRANSFER: 'Close and transfer', PASSED: 'Passed',
};
// Use this everywhere a stage reaches the screen. Never `STAGE_WORDS[s] ?? s`.
export const stageWords = (stage: string | null | undefined): string => {
  if (!stage) return '';
  const known = STAGE_WORDS[stage];
  if (known) return known;
  const spaced = stage.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
export const OFFPLAN_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'SHORTLISTED', 'RESERVED', 'SPA_SIGNED', 'BOOKED'];
export const UNIT_TYPE_WORDS: Record<string, string> = {
  STUDIO: 'Studio',
  ONE_BR: 'One bedroom',
  TWO_BR: 'Two bedrooms',
  THREE_BR: 'Three bedrooms',
  FOUR_PLUS_BR: 'Four or more bedrooms',
  VILLA: 'Villa',
  PENTHOUSE: 'Penthouse',
};
export const PURPOSE_WORDS: Record<string, string> = { LET: 'To let out', LIVE: 'To live in', BOTH: 'A bit of both' };
export const BUY_TIMELINE_WORDS: Record<string, string> = {
  READY_NOW: 'Ready to reserve now',
  NEXT_3_MONTHS: 'In the next 3 months',
  LATER_THIS_YEAR: 'Later this year',
  RESEARCHING: 'Just researching for now',
};
export const MONEY_COMFORT_WORDS: Record<string, string> = {
  STUDIO_OK: 'Studio numbers sit fine',
  ONE_BED_OK: 'One-bed numbers sit fine',
  STRETCH: 'A stretch',
  NOT_DISCUSSED: 'Not discussed yet',
};
// The six labels are shared vocabulary with the Team Scorecard (agreed 2026-09-08).
// Do not reword them here alone: a manager and an agent reading different words for
// the same event is the failure that agreement exists to prevent.
export const OUTCOME_WORDS: Record<string, { label: string; hint: string }> = {
  INTERESTED: { label: 'Interested', hint: 'Lead flagged warm' },
  CALLBACK: { label: 'Callback scheduled', hint: 'Books the callback' },
  NO_ANSWER: { label: 'No answer', hint: 'Retry in 3 hours' },
  CONVERTED: { label: 'Converted', hint: 'No automatic move' },
  NOT_INTERESTED: { label: 'Not interested', hint: 'Marks the lead lost' },
  WRONG_NUMBER: { label: 'Wrong number', hint: 'Do not contact again' },
};
export const LOST_REASONS = ['Not interested', 'Bought elsewhere', 'Budget', 'Timing', 'Wrong number', 'Other'];
export const zoneFor = (country: string | null) => (country === 'UK' ? 'Europe/London' : 'Asia/Dubai');
export const zoneWords = (country: string | null) => (country === 'UK' ? 'UK time' : 'Dubai time');
export const timeThere = (country: string | null, now = new Date()) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: zoneFor(country), hour: '2-digit', minute: '2-digit' }).format(now);
// Converts a <input type="datetime-local"> value (digits with no zone attached)
// into the correct absolute instant for those digits read as wall-clock time in
// `zone`, never the agent's own browser zone, which is what
// `new Date(str).toISOString()` alone would give. The caption right under the
// picker names the LEAD's zone ("UK time" / "Dubai time"), so that is what the
// agent means by what they type. Same technique FactsRail.tsx's tomorrowTenAmIn
// already uses (read the offset fresh, so it is correct across the DST edge
// too), just run in the other direction: that one starts from `now` and wants
// the zone's wall clock; this one starts from a typed wall clock and wants it
// treated as the zone's. Lives here beside zoneFor/zoneWords/timeThere, its two
// callers being OutcomeSheet.tsx and FactsRail.tsx.
export const customTimeInZone = (localDateTime: string, zone: string): string => {
  const asBrowserLocal = new Date(localDateTime);
  const inZone = new Date(asBrowserLocal.toLocaleString('en-US', { timeZone: zone }));
  const offsetMs = asBrowserLocal.getTime() - inZone.getTime();
  return new Date(asBrowserLocal.getTime() + offsetMs).toISOString();
};
export const dueWords = (iso: string | null, now = Date.now()): { text: string; overdue: boolean } => {
  if (!iso) return { text: 'No time set', overdue: false };
  const ms = Date.parse(iso) - now;
  const abs = Math.abs(ms);
  const h = Math.round(abs / 3_600_000);
  const m = Math.round(abs / 60_000);
  const span = m < 60 ? `${m} min` : h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
  return ms < 0 ? { text: `${span} overdue`, overdue: true } : { text: `in ${span}`, overdue: false };
};
export const minutesWords = (seconds: number | null | undefined) =>
  seconds == null ? '' : seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`;
// Relative time, spaced ("2 h ago"), matching dueWords ("in 2 h") so the page never says
// "in 2 h" beside "2h ago". My Desk's format.ts uses the terse style; this page owns its
// own vocabulary and the two should be reconciled in one direction later.
export const relativeWords = (iso: string | null | undefined, now = Date.now()): string | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const diff = now - ms;
  if (diff < 0) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(diff / 3_600_000);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
};
