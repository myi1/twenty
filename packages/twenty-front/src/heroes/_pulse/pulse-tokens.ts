// ═══════════════════════════════════════════════════════════════════════════
// PULSE TOKENS — Nocturne scales (DESIGN.md §2.3–2.6)
// ═══════════════════════════════════════════════════════════════════════════
// Mirrored byte-for-byte across BOTH hero forks — see docs/superpowers/plans/
// 2026-07-11-nocturne-design-system-implementation.md Task 1.0/1.1. Edit
// DESIGN.md first, then re-mirror (diff -r must be clean).
//
// Pure constants, no JSX/React — sandbox-safe. Reach for a scale step instead
// of a magic px; this is what stops density/motion/z-index drift across the
// heroes' inline styles.

/** Spacing — 4px base step (DESIGN.md §2.3). Use for padding / gap / margin.
 *  Instrument components lean to steps 4/6/8; bloom surfaces to 6/8/12/16.
 *  Density is *air*, not a different scale. */
export const SPACE = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** Radius (DESIGN.md §2.4) — px numbers for inline styles / Mantine props.
 *  CSS-var twins (--p-radius-sm / --p-radius / --p-radius-lg / --p-radius-pill)
 *  are declared by the Nocturne var ledger in ./pulse. */
export const RADIUS = {
  /** inputs, buttons, nav items, chips */
  sm: 8,
  /** cards, panels, drawers — brass reads better with tighter corners */
  md: 12,
  /** bloom hero tiles, large media */
  lg: 16,
  /** seals, avatars */
  pill: 999,
} as const;

/** Z-index ledger — one source of truth so overlays never fight. */
export const Z = {
  sticky: 10,
  dropdown: 40,
  scrim: 50,
  sheet: 51,
  toast: 70,
  /** Mantine Select/Popover inside hero drawers needs a HIGH zIndex or the
   *  options render behind the drawer (propel-hero-route-and-dropdown gotcha). */
  mantinePopover: 5000,
} as const;

// Motion (DESIGN.md §2.6) — re-exported so `pulse-tokens` is a one-stop import.
// The definitions live in ./motion (the verbatim §2.6 block).
export {
  EASE,
  EASE_ARR,
  DUR,
  STAGGER_STEP,
  staggerDelay,
  MOTION_VARS,
  propelPressable,
} from './motion';
