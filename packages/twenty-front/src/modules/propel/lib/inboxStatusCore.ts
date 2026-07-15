// Fork-local PORT of the founder-locked Inbox status contract
// (propel-crm-integration: src/shared/inbox-status-core.ts). Pure, React-free.
//
// The backend and the hero MUST agree on "what does Snoozed mean", so this mirrors
// the server helpers byte-faithfully. The DB status carries FIVE values
// (NEW / OPEN / WAITING / SNOOZED / RESOLVED); the hero surfaces THREE tabs:
//   Open    = NEW | OPEN | WAITING  (+ an OVERDUE snooze — belt-and-braces)
//   Snoozed = SNOOZED (snoozeUntil still in the future)
//   Done    = RESOLVED
//
// Keep this in lockstep with the server module if the contract ever changes.

import { type ConversationStatusTab } from '@/propel/types/inbox';

// A thread can be snoozed at most this far out (mirrors SNOOZE_MAX_DAYS server-side).
export const SNOOZE_MAX_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// A snooze deadline is expired when it is a valid instant at/before `now`. A
// missing/blank/unparseable deadline is treated as expired (surface as Open, never
// strand it) — same rule as the server.
export const isSnoozeExpired = (
  snoozeUntil: string | null | undefined,
  now: number = Date.now(),
): boolean => {
  if (!snoozeUntil) return true;
  const t = Date.parse(snoozeUntil);
  if (!Number.isFinite(t)) return true;
  return t <= now;
};

// Map a conversation's status (+ snoozeUntil) to its hero tab. An OVERDUE-snoozed
// thread renders under Open even before the ≤5-min wake cron catches it.
export const tabForStatus = (
  status: string | null | undefined,
  snoozeUntil?: string | null,
  now: number = Date.now(),
): ConversationStatusTab => {
  if (status === 'ARCHIVED') return 'ARCHIVED';
  if (status === 'RESOLVED') return 'DONE';
  if (status === 'SNOOZED') {
    return isSnoozeExpired(snoozeUntil, now) ? 'OPEN' : 'SNOOZED';
  }
  return 'OPEN'; // NEW / OPEN / WAITING / anything unknown → Open
};

// ── Snooze presets ───────────────────────────────────────────────────────────
// The composer's Snooze menu offers a few sensible wake times plus "pick a date".
// Each preset resolves to a concrete future instant from `now` (Asia/Dubai is the
// user's tz, but we compute in local time — the server re-validates the ISO).
export type SnoozePresetId = 'later-today' | 'tomorrow' | 'next-week';

export interface SnoozePreset {
  id: SnoozePresetId;
  label: string;
  hint: string; // a short human "wakes …" description
}

export const SNOOZE_PRESETS: readonly SnoozePreset[] = [
  { id: 'later-today', label: 'Later today', hint: 'in 3 hours' },
  { id: 'tomorrow', label: 'Tomorrow', hint: 'tomorrow, 9:00 AM' },
  { id: 'next-week', label: 'Next week', hint: 'Monday, 9:00 AM' },
];

// Resolve a preset to a concrete future ISO instant.
//   later-today → now + 3h
//   tomorrow    → next calendar day at 09:00 local
//   next-week   → next Monday at 09:00 local
export const resolveSnoozePreset = (
  id: SnoozePresetId,
  now: number = Date.now(),
): string => {
  const base = new Date(now);
  if (id === 'later-today') {
    return new Date(now + 3 * 60 * 60 * 1000).toISOString();
  }
  if (id === 'tomorrow') {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }
  // next-week → the coming Monday 09:00 (if today is Monday, jump a full week).
  const d = new Date(base);
  const day = d.getDay(); // 0 = Sun … 1 = Mon
  const daysUntilMonday = ((8 - day) % 7) || 7;
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};

// Clamp/validate a user-picked datetime for the "pick a date" path — must be a
// valid future instant no more than SNOOZE_MAX_DAYS out. Returns the normalized ISO
// or a human reason (mirrors validateSnoozeUntil server-side, minus the throw).
export type SnoozeValidation =
  | { ok: true; iso: string }
  | { ok: false; reason: string };

export const validateSnoozeInstant = (
  value: Date | string | null | undefined,
  now: number = Date.now(),
): SnoozeValidation => {
  if (value == null || value === '') {
    return { ok: false, reason: 'Pick a date and time to snooze until.' };
  }
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(t)) {
    return { ok: false, reason: 'That date and time isn’t valid.' };
  }
  if (t <= now) {
    return { ok: false, reason: 'The snooze time must be in the future.' };
  }
  if (t > now + SNOOZE_MAX_DAYS * DAY_MS) {
    return { ok: false, reason: `You can snooze at most ${SNOOZE_MAX_DAYS} days out.` };
  }
  return { ok: true, iso: new Date(t).toISOString() };
};

// A short human "snoozed until …" label for the thread header / list row.
export const snoozeUntilLabel = (snoozeUntil: string | null | undefined): string => {
  if (!snoozeUntil) return '';
  const t = Date.parse(snoozeUntil);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};
