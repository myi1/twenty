// What the agent has typed but not yet sent, and where it is allowed to live.
//
// F4 (2026-09-12). Two separate problems, and they pull in opposite directions.
//
// LOSS. On a phone this hero renders ONE of its two columns at a time
// (`{(!phone || tab === 'story') && <Story …/>}` in index.tsx), so tapping
// Facts UNMOUNTS the composer. The note draft lived in that component's own
// useState, so a half-written note about a call was destroyed by looking at the
// lead's details — the single most likely thing an agent does mid-note. The
// message draft survived, but only because it was being mirrored to
// localStorage, which brings us to the other problem.
//
// LEAK. That mirror was keyed `lead-page-draft:<personId>` — the LEAD, and
// nothing else. On a shared office machine every agent using that browser
// profile reads and writes the same key, so an unsent message about a named
// customer sat in localStorage indefinitely and surfaced for whoever opened
// that lead next. It also outlived the session that wrote it.
//
// So: ownership moves UP to the hero's stable parent, which does not unmount
// when the phone tab changes, and the mirror moves to sessionStorage under a key
// that includes WHO is typing. sessionStorage is per-tab and dies with the tab,
// which is the behaviour CRM content should have had all along; the parent state
// is what actually survives the tab switch, and the mirror is only there so a
// refresh mid-sentence is not punished.
//
// Import-free on purpose: this is the whole draft policy, and it is testable
// with node --test without the fork's toolchain.

export type DraftMode = 'message' | 'note';

/** Everything the composer holds for ONE lead that is not yet saved anywhere. */
export type LeadDrafts = {
  message: string;
  note: string;
  /** Which tab of the composer was open — losing this re-opens Message over a
   *  half-typed note, which reads as if the note was thrown away. */
  mode: DraftMode;
};

export const EMPTY_DRAFTS: LeadDrafts = { message: '', note: '', mode: 'message' };

export const hasDraftContent = (d: LeadDrafts): boolean => d.message !== '' || d.note !== '';

/**
 * The identity of a draft.
 *
 * `workspaceScope` is the workspace the draft belongs to. A runtime-loaded hero
 * has no workspace id in its host contract (heroHost.ts), and the only way to
 * reach one is Recoil state no hero has ever imported — a dependency this repo
 * has white-screened the CRM with before, so it is not worth adding for a
 * cache key. The server origin is passed instead: it separates a staging tab
 * from a production tab in the same browser, which is a real thing on this
 * team, and the member id below already carries the workspace scoping that
 * matters, because it is server-derived (LeadLoad.viewer) and cannot be spoofed
 * by the page.
 *
 * The member id is the part that fixes the leak: two agents on one machine no
 * longer share a draft.
 */
export const draftKey = (workspaceScope: string, memberId: string, personId: string): string =>
  JSON.stringify([workspaceScope, memberId, personId]);

/** Only keys under this prefix are ours to read, write or purge. */
export const DRAFT_PREFIX = 'propel:lead-draft:';

/** The key shape this replaces. Still on real machines, still holding real
 *  customer message text, and not going anywhere unless something deletes it. */
export const LEGACY_DRAFT_PREFIX = 'lead-page-draft:';

/** The slice of Storage this module uses — injected so the policy is testable
 *  and so a caller can choose sessionStorage over localStorage deliberately. */
export type DraftStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
};

const isMode = (v: unknown): v is DraftMode => v === 'message' || v === 'note';
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Read a lead's drafts. Never throws: a disabled, full or partitioned store
 * must degrade to "nothing was saved", never take the page down with it.
 */
export const readDrafts = (store: DraftStore | null, key: string): LeadDrafts => {
  if (!store) return EMPTY_DRAFTS;
  try {
    const raw = store.getItem(DRAFT_PREFIX + key);
    if (!raw) return EMPTY_DRAFTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_DRAFTS;
    const p = parsed as Record<string, unknown>;
    return {
      message: str(p.message),
      note: str(p.note),
      mode: isMode(p.mode) ? p.mode : 'message',
    };
  } catch {
    return EMPTY_DRAFTS;
  }
};

/** Mirror a lead's drafts. Writing nothing REMOVES the entry rather than storing
 *  an empty husk — a sent message should leave no trace behind in the store. */
export const writeDrafts = (store: DraftStore | null, key: string, drafts: LeadDrafts): void => {
  if (!store) return;
  try {
    if (!hasDraftContent(drafts)) {
      store.removeItem(DRAFT_PREFIX + key);
      return;
    }
    store.setItem(DRAFT_PREFIX + key, JSON.stringify(drafts));
  } catch {
    /* best-effort: the parent's own state is what the agent is actually typing into */
  }
};

/** Collect every key in the store carrying one of our prefixes. Read the index
 *  fully BEFORE removing anything: removing during the walk renumbers it and
 *  silently skips entries. */
const ourKeys = (store: DraftStore, prefixes: string[]): string[] => {
  const found: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const k = store.key(i);
    if (k !== null && prefixes.some((p) => k.startsWith(p))) found.push(k);
  }
  return found;
};

/**
 * Remove every draft this module owns. Returns how many went.
 *
 * Called when the session expires: an expired session means the person at the
 * keyboard is no longer known to be the agent who typed, so their unsent words
 * about a named customer must not still be recoverable from the tab.
 */
export const clearAllDrafts = (store: DraftStore | null): number => {
  if (!store) return 0;
  try {
    const keys = ourKeys(store, [DRAFT_PREFIX]);
    for (const k of keys) store.removeItem(k);
    return keys.length;
  } catch {
    return 0;
  }
};

/**
 * Remove every draft belonging to SOMEBODY ELSE.
 *
 * Added 2026-09-12 after running the session-expiry check on staging and watching
 * it half-fail. The lead left the screen correctly — Twenty's shell redirects to
 * sign-in the moment the token is gone — but that redirect happens BEFORE this
 * hero mounts, so the NOT_AUTHENTICATED branch that was supposed to clear the
 * drafts never runs. It is not dead code (the call poll and a visibility refresh
 * still reach it) but the common path, a click or a reload, goes around it. The
 * draft text was still sitting in sessionStorage afterwards.
 *
 * So this is the belt: on mount, once the viewer is known, drop any draft whose
 * key names a DIFFERENT member. It does not depend on catching the expiry at all
 * — the next person to use the tab cleans up after the last one, whether the
 * session lapsed, was handed over, or the tab was simply left open.
 *
 * The member id sits at index 1 of the key (see draftKey). A key that will not
 * parse is ours by prefix but not by shape, so it goes too.
 */
export const purgeForeignDrafts = (store: DraftStore | null, memberId: string): number => {
  if (!store || !memberId) return 0;
  try {
    const doomed = ourKeys(store, [DRAFT_PREFIX]).filter((k) => {
      try {
        const parts: unknown = JSON.parse(k.slice(DRAFT_PREFIX.length));
        return !(Array.isArray(parts) && parts[1] === memberId);
      } catch {
        return true;
      }
    });
    for (const k of doomed) store.removeItem(k);
    return doomed.length;
  } catch {
    return 0;
  }
};

/**
 * Delete the drafts the OLD scheme left behind.
 *
 * Not housekeeping. Those entries are real message text about named leads,
 * sitting in localStorage on shared machines with no member in the key and no
 * expiry — writing to a safer place from now on would leave every one of them
 * exactly where it is. Run once at mount, against localStorage specifically.
 */
export const purgeLegacyDrafts = (store: DraftStore | null): number => {
  if (!store) return 0;
  try {
    const keys = ourKeys(store, [LEGACY_DRAFT_PREFIX]);
    for (const k of keys) store.removeItem(k);
    return keys.length;
  } catch {
    return 0;
  }
};
