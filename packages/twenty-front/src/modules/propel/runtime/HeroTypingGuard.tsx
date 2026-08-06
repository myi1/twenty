// ─────────────────────────────────────────────────────────────────────────────
// HeroTypingGuard — keep typed characters inside hero text fields
// ─────────────────────────────────────────────────────────────────────────────
//
// Twenty binds its global "g"-sequence nav shortcuts (g→p People, g→c Companies…)
// via useGoToHotkeys with `enableOnFormTags: true`, on a document-level listener.
// So a plain keystroke typed into ANY hero text field also reaches that listener.
//
// Worse, the sequence state is STICKY: useGlobalHotkeysSequence stores `pending =
// 'g'` and never times out or resets on a non-matching key. Typing a word with a
// "g" in it (e.g. a campaign named "syed_aug_06") arms the trap silently; the next
// registered shortcut letter typed ANYWHERE then navigates and the unsaved draft
// is gone. That is a data-loss bug, not a cosmetic one.
//
// Guard: on the BUBBLE phase (after the field has already received the key), stop
// a plain-character keydown that originated in a text-entry element from reaching
// the document listener. Modifier combos (⌘K, ⌘S, …) are let through so global
// shortcuts keep working, and non-text targets are untouched.
//
// Real DOM + one shared React here (the twenty-front hero, not the Pulse sandbox),
// so stopPropagation is reliable — the sandbox caveat does not apply.
//
// This started life inline in heroes/marketing-hub/index.tsx; it lives here so
// every hero entry that hosts a text field shares ONE copy instead of drifting.

import { type ReactNode } from 'react';

const isTextEntry = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement &&
  (el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable);

export const stopTypedKeysFromNav = (e: React.KeyboardEvent) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return; // keep ⌘K et al. working
  if (isTextEntry(e.target)) e.stopPropagation();
};

/**
 * Wraps a hero so characters typed into its inputs cannot trigger Twenty's
 * global navigation shortcuts. `display: contents` keeps the hero's own layout
 * untouched — this element adds no box of its own.
 */
export const HeroTypingGuard = ({ children }: { children: ReactNode }) => (
  <div
    style={{ display: 'contents' }}
    onKeyDown={stopTypedKeysFromNav}
    onKeyUp={stopTypedKeysFromNav}
  >
    {children}
  </div>
);
