// banding.ts — hero-side mirror of the ONE "needs-you-first" triage logic.
// ─────────────────────────────────────────────────────────────────────────────
// Mirrored VERBATIM (bandOf / sortRows / isGoingCold / GOING_COLD_HOURS + their private
// helpers — logic only; the DeskBand/DeskRow TYPES are already mirrored in
// ./types.ts, so they're imported here rather than redeclared) from:
//   /Users/yahyaismail/dev/_wt/my-desk/src/shared/my-desk-core.ts (CRM repo)
// Keep this in sync BY HAND when that file changes — diff the `bandOf`/
// `sortRows`/`isGoingCold` bodies on any my-desk-core.ts edit. This is the ONE
// implementation of "needs-you-first" on this side of the fork; never fork it
// further (slaState from the source file isn't mirrored here because its ring
// math lands with SlaRing, Task 14).
//
// Used by:
//   - TodayStrip.tsx  — "Needs you now" tile count (rows where bandOf === 'slaAtRisk')
//   - BoardTable.tsx  — the "Going cold" filter chip (isGoingCold) and the
//                       "Needs you now" strip-filter pass-through (bandOf)
// Row-level VISUAL treatments driven by band (red wash, brass "today" tick,
// amber going-cold stamp, faded lane bar) are Task 14 scope, not this file's
// concern — Task 12 only needs the classification, not the paint.

import type { DeskBand, DeskRow } from './types';

const ms = (iso: string | null): number | null => (iso ? Date.parse(iso) : null);

export const bandOf = (r: DeskRow, nowMs: number): DeskBand => {
  const sla = ms(r.slaDeadline);
  if (sla !== null && sla > nowMs) return 'slaAtRisk'; // SLA beats snooze, always
  const snoozed = ms(r.snoozedUntil);
  if (snoozed !== null && snoozed > nowMs) return 'rest';
  if (sla !== null && sla <= nowMs) return 'overdue'; // lapsed window = overdue
  const due = ms(r.nextActionDueAt);
  if (due !== null && due <= nowMs) return 'overdue';
  if (r.taskDueToday || (due !== null && isSameLocalDay(due, nowMs))) return 'dueToday';
  return 'rest';
};

const isSameLocalDay = (a: number, b: number): boolean => {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
};

const BAND_ORDER: Record<DeskBand, number> = {
  slaAtRisk: 0,
  overdue: 1,
  dueToday: 2,
  rest: 3,
};

export const sortRows = (rows: DeskRow[], nowMs: number): DeskRow[] =>
  [...rows].sort((left, right) => {
    const band = BAND_ORDER[bandOf(left, nowMs)] - BAND_ORDER[bandOf(right, nowMs)];
    if (band !== 0) return band;
    return (ms(left.lastTouchAt) ?? 0) - (ms(right.lastTouchAt) ?? 0);
  });

export const GOING_COLD_HOURS = 48;
export const isGoingCold = (r: DeskRow, nowMs: number): boolean => {
  const t = ms(r.lastTouchAt);
  return t !== null && nowMs - t >= GOING_COLD_HOURS * 3_600_000;
};

// "Needs you TODAY" — the predicate behind the top bar's "Today's plan" focus
// mode. Reuses bandOf (the ONE triage classifier above) rather than re-deriving
// SLA/due windows: a row earns focus if it's SLA-at-risk, already overdue, or
// has a task due today (all three fall out of bandOf), OR it has a viewing on
// the calendar for today. Keep this in terms of bandOf so focus mode can never
// drift from the strip tiles / row treatments that read the same bands.
export const needsAttentionToday = (r: DeskRow, nowMs: number): boolean => {
  const band = bandOf(r, nowMs);
  if (band === 'slaAtRisk' || band === 'overdue' || band === 'dueToday') return true;
  return r.viewingTodayAt !== null;
};
