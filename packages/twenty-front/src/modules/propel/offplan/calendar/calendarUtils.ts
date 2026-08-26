// Display-only helpers for the Launch Calendar tab. All BUCKETING happens
// server-side; these format what the server already decided. Month-cell Dates are
// constructed as BROWSER-LOCAL dates from the server's Dubai day keys — never
// parsed as ISO midnight-UTC (react-big-calendar plots in browser-local time; an
// ISO parse would shift the pill a day west of Dubai).

import type { CalendarEventItem, CalendarItem, MarketEventType } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 3600_000;
const DUBAI_OFFSET_MS = 4 * 3600_000;

/** 'YYYY-MM-DD' → a browser-LOCAL Date at local midnight of that calendar day. */
export const dayKeyToLocalDate = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export const dayLabel = (key: string): string => {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
};

/** The Dubai day an instant falls on (mirrors the server rule for display only). */
export const msDubaiDayKey = (ms: number): string => {
  const d = new Date(ms + DUBAI_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

export const eventDayKey = (e: CalendarEventItem, nowMs: number): string =>
  e.startsAtMs > nowMs ? msDubaiDayKey(e.startsAtMs) : msDubaiDayKey(e.endsAtMs ?? e.startsAtMs);

export const itemDayKey = (i: CalendarItem, nowMs: number): string =>
  i.kind === 'launch' ? i.dayKey : eventDayKey(i, nowMs);

/** Whole Dubai DAYS between two instants' calendar days (0 = same day). */
const dubaiDaysBetween = (fromMs: number, toMs: number): number =>
  Math.round((Date.parse(`${msDubaiDayKey(toMs)}T00:00:00Z`) - Date.parse(`${msDubaiDayKey(fromMs)}T00:00:00Z`)) / DAY_MS);

/** "closes today" / "closes tomorrow" / "5 days left" — a Dubai DAY-KEY difference,
 *  never an ms ceil (review fix: stored end bounds sit at 23:59:59.999, so the ceil
 *  said "closes tomorrow" on the deadline day itself — wrong on exactly the day
 *  agents act). Accessible text, not color. */
export const countdownLabel = (e: CalendarEventItem, nowMs: number): string => {
  const endMs = e.endsAtMs ?? e.startsAtMs;
  const days = Math.max(0, dubaiDaysBetween(nowMs, endMs));
  if (days === 0) return e.eventType === 'DEVELOPER_EVENT' ? 'ends today' : 'closes today';
  const noun = e.eventType === 'DEVELOPER_EVENT' ? 'ends' : 'closes';
  return days === 1 ? `${noun} tomorrow` : `${days} days left`;
};

/** Does an event's inclusive day span cover the given Dubai day? (Month "+N" day
 *  filtering — a multi-day offer occupies every spanned cell, so the day view must
 *  include it on any spanned day, not only its bucket key.) */
export const eventSpansDay = (e: CalendarEventItem, dayKey: string): boolean => {
  const startKey = msDubaiDayKey(e.startsAtMs);
  const endKey = msDubaiDayKey(e.endsAtMs ?? e.startsAtMs);
  return dayKey >= startKey && dayKey <= endKey;
};

export const eventTypeLabel: Record<MarketEventType, string> = {
  DEVELOPER_EVENT: 'Developer event',
  OFFER: 'Offer',
  EOI_DEADLINE: 'EOI deadline',
  OTHER: 'Other',
};

export const eventTypeIcon: Record<MarketEventType, string> = {
  DEVELOPER_EVENT: '📅',
  OFFER: '⏳',
  EOI_DEADLINE: '⏳',
  OTHER: '📌',
};

export const aedShort = (n: number): string =>
  n >= 1_000_000 ? `AED ${(n / 1_000_000).toFixed(1)}m` : `AED ${Math.round(n / 1000)}k`;

export type TypeFilter = 'LAUNCHES' | 'EVENTS' | 'OFFERS' | 'OTHER';

export const matchesTypeFilter = (item: CalendarItem, active: Set<TypeFilter>): boolean => {
  if (active.size === 0) return true;
  if (item.kind === 'launch') return active.has('LAUNCHES');
  if (item.eventType === 'DEVELOPER_EVENT') return active.has('EVENTS');
  if (item.eventType === 'OFFER' || item.eventType === 'EOI_DEADLINE') return active.has('OFFERS');
  return active.has('OTHER');
};
