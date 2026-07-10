// Per-agent Marketing display preferences — CLIENT-ONLY (localStorage).
//
// The Settings tab's "My preferences" section (TM#70) needs a place to persist
// each agent's own lightweight display choices. There is NO per-member prefs
// backend field yet (the design ledger flags it as a deferred Small–Medium
// backend change), so these live in localStorage: they are purely cosmetic UI
// state (which Templates view/channel to open on), never account data. When a
// real `marketingMemberPref` field lands, this module is the single seam to swap
// for a server read/write without touching either consumer.
//
// Read defensively: a missing/corrupt/oversized value collapses to the default
// (never throws in a render body). Writes swallow quota errors — a preference
// that can't persist is a no-op, not a crash.

export type TemplatesView = 'TABLE' | 'CARDS' | 'BOARD';
export type TemplatesChannel = 'ALL' | 'EMAIL' | 'WHATSAPP';

const VIEW_KEY = 'propel:mktg:tplView';
const CHANNEL_KEY = 'propel:mktg:tplChannel';

const VIEW_VALUES: TemplatesView[] = ['TABLE', 'CARDS', 'BOARD'];
const CHANNEL_VALUES: TemplatesChannel[] = ['ALL', 'EMAIL', 'WHATSAPP'];

const readEnum = <T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw !== null && (allowed as readonly string[]).includes(raw)
      ? (raw as T)
      : fallback;
  } catch {
    return fallback;
  }
};

const writeString = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage full / unavailable — a lost preference is harmless.
  }
};

// Table is the new default catalog view (TM#50); All channels by default.
export const getTemplatesView = (): TemplatesView =>
  readEnum(VIEW_KEY, VIEW_VALUES, 'TABLE');
export const setTemplatesView = (v: TemplatesView): void =>
  writeString(VIEW_KEY, v);

export const getTemplatesChannel = (): TemplatesChannel =>
  readEnum(CHANNEL_KEY, CHANNEL_VALUES, 'ALL');
export const setTemplatesChannel = (v: TemplatesChannel): void =>
  writeString(CHANNEL_KEY, v);
