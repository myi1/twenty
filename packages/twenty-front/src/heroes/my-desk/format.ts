// format.ts — pure formatting helpers shared across the My Desk hero's surfaces
// (Today Strip / board / rail today; TodayStrip.tsx / BoardTable.tsx /
// RightRail.tsx split out in Task 12). No React, no tokens — plain functions.

/** Plain-language line for a failed load — never a raw error code in the UI. */
export const friendlyError = (raw: string): string =>
  raw === 'NOT_AUTHENTICATED'
    ? 'You need to sign in again to load this.'
    : "Couldn't load this — try refreshing the page.";

/** Local wall-clock time ("2:00 PM") for an ISO timestamp, or null if absent/bad. */
export const formatClock = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

/** Compact relative age ("12m ago" / "3h ago" / "2d ago"), or null if absent/bad. */
export const formatRelative = (iso: string | null): string | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const diff = Date.now() - ms;
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

/** Rounded AED figure ("AED 2.4M" / "AED 850K") — estimates, never fake-exact. */
export const formatAedTotal = (totalAed: number): string => {
  if (totalAed >= 1_000_000) return `AED ${(totalAed / 1_000_000).toFixed(1)}M`;
  if (totalAed >= 1_000) return `AED ${Math.round(totalAed / 1_000)}K`;
  return `AED ${totalAed}`;
};

/** Plain-language phrase for a raw native stage enum ("VIEWING_BOOKED" →
 *  "Viewing Booked") — the Stage column never shows an UPPER_CASE enum or a
 *  pill. Tolerant of any input casing. */
export const formatStageLabel = (stage: string): string =>
  stage
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ') || stage;
