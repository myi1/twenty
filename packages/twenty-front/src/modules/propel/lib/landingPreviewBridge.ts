// LP Builder v2 — Stage 2 live-preview bridge (parent side).
//
// The Marketing hero's Landing editor (parent) drives an <iframe> that loads the
// SITE's `/lp/preview` page (child). They speak the C1 postMessage protocol,
// pinned VERBATIM in the plan (docs/superpowers/plans/2026-07-08-lp-builder-v2-
// stage2-preview-editor.md §C1). This module is the framework-free, testable half:
// message types, an origin-checked parser, a render poster, and a pure debounce.
//
// C1 (single source of truth — do NOT drift these strings):
//   All messages: { source: 'propel-lp', type, ...fields }. Both sides ignore any
//   message without source==='propel-lp'.
//   child → parent  { type: 'ready' }
//   parent → child  { type: 'render', theme, sections: Array<{type,props}>, selectedIndex }
//   child → parent  { type: 'sectionClick', index: number }
//   child → parent  { type: 'height', px: number }
//   The parent verifies event.origin === SITE_ORIGIN before trusting child messages.

export const PROPEL_LP_SOURCE = 'propel-lp';

export type LpTheme = 'NOCTURNE' | 'RIVIERA' | 'ATLAS';

export interface LpSection {
  type: string;
  props: Record<string, unknown>;
}

// The draft the parent renders into the child (a subset of the editor Draft).
export interface RenderDraft {
  theme: LpTheme;
  sections: LpSection[];
  selectedIndex: number | null;
}

// ── message shapes ────────────────────────────────────────────────────────────
export interface ReadyMessage {
  source: typeof PROPEL_LP_SOURCE;
  type: 'ready';
}
export interface RenderMessage {
  source: typeof PROPEL_LP_SOURCE;
  type: 'render';
  theme: LpTheme;
  sections: LpSection[];
  selectedIndex: number | null;
}
export interface SectionClickMessage {
  source: typeof PROPEL_LP_SOURCE;
  type: 'sectionClick';
  index: number;
}
export interface HeightMessage {
  source: typeof PROPEL_LP_SOURCE;
  type: 'height';
  px: number;
}

// Messages the parent RECEIVES from the child.
export type ChildMessage = ReadyMessage | SectionClickMessage | HeightMessage;

// ── origin helper ─────────────────────────────────────────────────────────────
// Derive the trusted child origin from the configured sitePublicUrl. Empty /
// malformed → '' (the parser then trusts nothing, so the pane simply never wires
// up — the graceful-degrade path, never a crash).
export const originOf = (siteUrl: string | null | undefined): string => {
  if (siteUrl === null || siteUrl === undefined || siteUrl === '') return '';
  try {
    return new URL(siteUrl).origin;
  } catch {
    return '';
  }
};

// ── inbound parse (origin-checked, hostile-input-safe) ────────────────────────
// Returns a typed ChildMessage ONLY when: the expected origin is known AND the
// event's origin matches it AND the payload carries source==='propel-lp' with a
// well-formed known type. Anything else → null. Never throws on junk.
export const parseChildMessage = (
  event: Pick<MessageEvent, 'origin' | 'data'>,
  expectedOrigin: string,
): ChildMessage | null => {
  // No trusted origin configured → trust nothing.
  if (expectedOrigin === '') return null;
  if (event.origin !== expectedOrigin) return null;

  const data = event.data;
  if (data === null || typeof data !== 'object') return null;
  const msg = data as Record<string, unknown>;
  if (msg.source !== PROPEL_LP_SOURCE) return null;

  switch (msg.type) {
    case 'ready':
      return { source: PROPEL_LP_SOURCE, type: 'ready' };
    case 'sectionClick':
      if (typeof msg.index !== 'number' || !Number.isFinite(msg.index)) return null;
      return { source: PROPEL_LP_SOURCE, type: 'sectionClick', index: msg.index };
    case 'height':
      if (typeof msg.px !== 'number' || !Number.isFinite(msg.px)) return null;
      return { source: PROPEL_LP_SOURCE, type: 'height', px: msg.px };
    default:
      return null;
  }
};

// ── outbound render post ──────────────────────────────────────────────────────
// Post a `render` message to the child window. `target` is the iframe's
// contentWindow (or anything postMessage-shaped). No-ops on a null target so a
// not-yet-mounted / detached iframe never throws. targetOrigin is pinned to the
// site origin (never '*' when known) so the draft is only ever delivered to the
// trusted preview host.
export const postRender = (
  target: Pick<Window, 'postMessage'> | null | undefined,
  targetOrigin: string,
  draft: RenderDraft,
): void => {
  if (target === null || target === undefined) return;
  if (targetOrigin === '') return;
  const message: RenderMessage = {
    source: PROPEL_LP_SOURCE,
    type: 'render',
    theme: draft.theme,
    sections: draft.sections,
    selectedIndex: draft.selectedIndex,
  };
  target.postMessage(message, targetOrigin);
};

// ── pure debounce ─────────────────────────────────────────────────────────────
// Trailing-edge debounce: the wrapped fn fires once, `ms` after the LAST call.
// Exposes `.cancel()` so a React effect cleanup can drop a pending fire on
// unmount. Framework-free and unit-tested with fake timers.
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel: () => void;
}

export const debounce = <A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): Debounced<A> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: A) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  }) as Debounced<A>;
  wrapped.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return wrapped;
};
