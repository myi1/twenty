// words.ts: plain-language label maps and small pure helpers for the lead page.
// Labels are copied from the app's option arrays; the hero cannot import from the
// app repo, so this is a hand-maintained mirror. Keep in sync with:
//   /Users/yahyaismail/dev/_wt/lead-page/src/shared/lead-page-core.ts (LEAD_PICKS,
//   OFFPLAN_UNIT_TYPES) and the off-plan opportunity stage SELECT.

export const STAGE_WORDS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  SHORTLISTED: 'Shortlisted',
  RESERVED: 'Reserved',
  SPA_SIGNED: 'SPA signed',
  BOOKED: 'Booked',
  ON_HOLD: 'On hold',
  LOST: 'Lost',
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
