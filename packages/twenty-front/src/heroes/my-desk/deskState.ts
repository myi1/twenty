// deskState.ts — per-agent UI state persistence for the My Desk hero
// (spec §4.3 / §8.3). ONE small localStorage blob under a single key, scoped by
// agent, written debounced.
//
// What persists (all small, all per-agent):
//   - column widths (BoardTable — otherwise lost on reload)
//   - the active filter chips: the board's lane/going-cold chip + the Today-strip tile
//   - the view toggle (only 'table' exists in the hero today — reserved for kanban)
//   - the "Today's plan" focus-mode toggle
//   - the rail panel ORDER, each panel's FOLDED state, and the whole-rail COLLAPSE
//
// v1 follows the Listing Studio precedent (client state in localStorage). Two
// design cautions were inputs (spec §8.3): the localStorage quota incident (this
// blob stays tiny, one key), and that localStorage is per-browser not per-person
// (an agent on a second machine starts from defaults — accepted for v1; the
// server-mirror is the open question, deferred).
//
// HARD RULE: losing this state must NEVER break the screen. Every read runs
// through `sanitize()` — a malformed/stale/partial blob (or storage being
// unavailable) silently falls back to defaults, field by field. Nothing here
// throws.

import type { StripFilter } from './TodayStrip';

// The rail panels, in default (top-to-bottom) order — the four data panels.
// (The REIDIN login helper briefly rode here as a 5th ACTION panel in Batch 3;
// it has since moved to an on-demand top-bar slide-in, so the rail is back to
// four. A blob that still carries a stored 'reidin' id is handled gracefully by
// sanitize() below: 'reidin' is no longer a recognised id, so it's dropped from
// the stored order/folds field-by-field, never crashing the desk.)
export type RailPanelId = 'tasks' | 'viewings' | 'unreadWa' | 'priorityLeads';
export const RAIL_PANEL_IDS: readonly RailPanelId[] = [
  'tasks',
  'viewings',
  'unreadWa',
  'priorityLeads',
];

export type RailArrangement = {
  order: RailPanelId[];
  folds: Record<RailPanelId, boolean>;
  collapsed: boolean;
};

export type DeskPersistedState = {
  /** BoardTable's 6 columns — each a resolved px string, or null = its default. */
  colWidths: (string | null)[];
  /** BoardTable lane chip: 'all' | 'goingCold' | a DeskLane value. */
  laneFilter: string;
  /** The Today-strip tile, or null when none is active. */
  stripFilter: StripFilter | null;
  /** View toggle — only 'table' ships today; reserved so kanban can join later. */
  view: 'table';
  /** Top-bar "Today's plan" focus mode. */
  focusToday: boolean;
} & RailArrangement;

const COL_COUNT = 6;
const STRIP_FILTERS: readonly StripFilter[] = [
  'slaAtRisk',
  'viewingToday',
  'unreadWa',
  'taskDueToday',
];

/** A fresh defaults object (deep — callers may mutate their copy freely). */
export const makeDefaultDeskState = (): DeskPersistedState => ({
  colWidths: Array.from({ length: COL_COUNT }, () => null),
  laneFilter: 'all',
  stripFilter: null,
  view: 'table',
  focusToday: false,
  order: [...RAIL_PANEL_IDS],
  folds: { tasks: false, viewings: false, unreadWa: false, priorityLeads: false },
  collapsed: false,
});

const KEY_PREFIX = 'propel.myDesk.v1.';

/** Per-agent storage key. Falls back to a stable per-browser 'local' slot when
 *  no workspace-member id is available (no clean runtime-hero source exists
 *  yet). When a member id ever reaches the hero, the key upgrades transparently. */
export const deskStateKey = (memberId: string | null): string =>
  `${KEY_PREFIX}${memberId && memberId.trim() ? memberId.trim() : 'local'}`;

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

// Coerce ANY parsed blob into a valid state, field by field. Anything the guard
// doesn't recognise is replaced with its default — a partial or corrupt blob can
// only ever LOSE customisation, never crash the desk.
const sanitize = (raw: unknown): DeskPersistedState => {
  const out = makeDefaultDeskState();
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;

  // colWidths — exactly 6 entries, each a string or null.
  if (
    Array.isArray(o.colWidths) &&
    o.colWidths.length === COL_COUNT &&
    o.colWidths.every((w) => w === null || typeof w === 'string')
  ) {
    out.colWidths = o.colWidths as (string | null)[];
  }

  if (typeof o.laneFilter === 'string') out.laneFilter = o.laneFilter;

  if (
    typeof o.stripFilter === 'string' &&
    (STRIP_FILTERS as readonly string[]).includes(o.stripFilter)
  ) {
    out.stripFilter = o.stripFilter as StripFilter;
  }

  if (isBool(o.focusToday)) out.focusToday = o.focusToday;
  if (isBool(o.collapsed)) out.collapsed = o.collapsed;

  // order — keep recognised ids in the stored order, drop unknown/duplicates
  // (a stale 'reidin' from Batch 3 is unrecognised now, so it falls out here),
  // then append any recognised panel the stored order was missing.
  if (Array.isArray(o.order)) {
    const seen = new Set<RailPanelId>();
    const ordered: RailPanelId[] = [];
    for (const id of o.order) {
      if (
        typeof id === 'string' &&
        (RAIL_PANEL_IDS as readonly string[]).includes(id) &&
        !seen.has(id as RailPanelId)
      ) {
        seen.add(id as RailPanelId);
        ordered.push(id as RailPanelId);
      }
    }
    for (const id of RAIL_PANEL_IDS) if (!seen.has(id)) ordered.push(id);
    out.order = ordered;
  }

  // folds — only copy known-panel booleans.
  if (o.folds && typeof o.folds === 'object') {
    const f = o.folds as Record<string, unknown>;
    for (const id of RAIL_PANEL_IDS) if (isBool(f[id])) out.folds[id] = f[id];
  }

  return out;
};

/** Read + sanitize the blob for `key`. Never throws; missing/bad → defaults. */
export const loadDeskState = (key: string): DeskPersistedState => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return makeDefaultDeskState();
    return sanitize(JSON.parse(raw));
  } catch {
    // storage disabled / JSON.parse threw / anything else — defaults are safe.
    return makeDefaultDeskState();
  }
};

/** Read the RAW stored blob for `key` WITHOUT the defaults fallback — `null`
 *  means "nothing is saved under this key yet" (vs loadDeskState, which can't
 *  distinguish an absent key from a stored-defaults one). Never throws. */
const readRawDeskState = (key: string): DeskPersistedState | null => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return sanitize(JSON.parse(raw));
  } catch {
    return null;
  }
};

/** Re-point persistence from the pre-login 'local' key to the member-scoped key
 *  once the signed-in member id reaches the hero (Batch 3 — the /my-desk board
 *  now returns it). If the member already has saved prefs, those WIN; otherwise
 *  the current (local) state is carried over so a browser's pre-login
 *  customisations aren't lost on first sign-in. Returns the key to write to and
 *  the state to adopt. Never throws — a storage failure just keeps the old key.
 *  Falls back gracefully when `memberId` is absent (returns the current key). */
export const migrateDeskStateKey = (
  currentKey: string,
  memberId: string | null,
  currentState: DeskPersistedState,
): { key: string; state: DeskPersistedState } => {
  const key = deskStateKey(memberId);
  if (key === currentKey) return { key, state: currentState };
  const existing = readRawDeskState(key);
  if (existing) return { key, state: existing };
  saveDeskState(key, currentState); // carry the local prefs over the first time
  return { key, state: currentState };
};

// Debounced writes, one pending timer per key. saveDeskState may be called on
// every mousemove during a column drag; the debounce collapses that to a single
// write ~300ms after the last change.
const DEBOUNCE_MS = 300;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const saveDeskState = (key: string, state: DeskPersistedState): void => {
  const pending = timers.get(key);
  if (pending) clearTimeout(pending);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch {
        // quota exceeded / storage unavailable — persistence is best-effort and
        // must never surface to the agent.
      }
    }, DEBOUNCE_MS),
  );
};
