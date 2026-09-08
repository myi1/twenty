import { type Keys } from 'react-hotkeys-hook/dist/types';

// ── A SHORTCUT ON A TYPEABLE KEY MUST NOT EAT THAT KEY WHILE SOMEONE IS TYPING ──
//
// 2026-09-08. An agent sent a client "spea soon o". He meant "speak soon ok" — every `k`
// had been swallowed. `k` is bound as vim-style row-up on the record table, and
// useHotkeysOnFocusedElement defaulted BOTH `enableOnFormTags` and `preventDefault` to
// true, so the shortcut fired inside the message box and consumed the letter. `j`
// (row-down) and `x` (select row / select card) do the same. Three letters an agent
// cannot reliably type, in messages that go to clients.
//
// The obvious fix — default `enableOnFormTags` to false — is WRONG. 69 of 76 registrations
// rely on that default and the overwhelming majority are keys that MUST work inside a
// field: Escape ×23 (close the editor), Enter ×12 (submit), Ctrl/Cmd+Enter ×8, Tab ×7,
// arrows ×8. Flipping it blindly would break every field editor in the product to fix
// three letters.
//
// So the default is made CONDITIONAL on the thing that actually matters: is this key one a
// person could be typing? Escape, Enter, Tab and the arrows are not; `j`, `k`, `x` and
// `Shift+X` are. A caller that genuinely wants a printable key to fire inside a field can
// still say so explicitly.

// Related, and deliberately NOT reused: `isNonTextWritingKey` in this same folder answers
// the same question for a RUNTIME key name off a KeyboardEvent ('Enter', 'F7', 'Home').
// This one answers it for a BINDING SPEC, which may be an array, a comma list or a combo
// ('ArrowUp', 'Shift+Enter', 'k'). The two agree on every named key — every entry in that
// list is longer than one character, so the length test below rejects it — and keeping
// them separate avoids a case-sensitivity coupling ('Enter' vs the lowercased token here)
// for no gain. If either is ever extended, check the other.

const MODIFIERS = new Set(['ctrl', 'control', 'meta', 'cmd', 'command', 'alt', 'option', 'mod', 'shift']);
// Shift alone still produces a character you can type ("X"), so it does NOT exempt a
// binding. Ctrl/Meta/Alt do — nobody types Ctrl+K into a sentence.
const EXEMPTING_MODIFIERS = new Set(['ctrl', 'control', 'meta', 'cmd', 'command', 'alt', 'option', 'mod']);

const isTypeableToken = (token: string): boolean => {
  const parts = token
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.some((p) => EXEMPTING_MODIFIERS.has(p))) return false;
  const bare = parts.filter((p) => !MODIFIERS.has(p));
  if (bare.length !== 1) return false;
  const key = bare[0];
  // '*' is react-hotkeys-hook's ANY-KEY wildcard, used deliberately for type-to-search
  // and type-to-edit. Those callers guard themselves and must keep working from a
  // non-input context, so a wildcard is never treated as a typeable binding.
  if (key === '*') return false;
  // A single printable character: a letter, a digit, or punctuation someone might type.
  return key.length === 1 && /[^\s]/.test(key);
};

/**
 * Does this key spec bind a character a person could be typing into a message?
 *
 * Accepts everything react-hotkeys-hook does: a string, a comma-separated string, or an
 * array of either. TRUE if ANY branch is typeable — one dangerous alternative is enough
 * to make the whole binding dangerous.
 */
export const bindsTypeableCharacter = (keys: Keys): boolean => {
  const specs = Array.isArray(keys) ? keys : [keys];
  return specs
    .flatMap((spec) => String(spec).split(','))
    .map((s) => s.trim())
    .filter(Boolean)
    .some(isTypeableToken);
};
