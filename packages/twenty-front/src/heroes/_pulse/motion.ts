// ═══════════════════════════════════════════════════════════════════════════
// PROPEL MOTION — the ONE source of truth (DESIGN.md §2.6, verbatim)
// ═══════════════════════════════════════════════════════════════════════════
// Mirrored byte-for-byte across BOTH hero forks (marketing-hub fork +
// off-plan fork) — see docs/superpowers/plans/2026-07-11-nocturne-design-
// system-implementation.md Task 1.0/1.1. If you edit this file, edit
// DESIGN.md first, then re-mirror (diff -r must be clean).
//
// Supersedes the copy-pasted EASE_OUT / EASE_DRAWER / MOTION blocks that were
// scattered across hero files. Pure constants, no JSX — sandbox-safe.
//
// Mood: professional CRM → crisp + fast; the Nocturne register is the calm end
// of the scale. UI stays < 300ms. No bounce anywhere. Springs are reserved for
// genuinely gestural bits (drag-to-dismiss / drag-to-reschedule) only.
//
// Rules (animation audit): transform + opacity ONLY — never height/width/
// margin/top. Never enter from scale(0) (start 0.95). prefers-reduced-motion
// REDUCES (keep opacity/color, drop transform) — never kills. No motion on
// keyboard-submit paths (⌘↵ send, Enter to advance).

// Easing — custom curves (built-in CSS easings are too weak)
export const EASE = {
  out:    'cubic-bezier(0.23, 1, 0.32, 1)',   // enter/exit — starts fast, feels responsive. DEFAULT.
  inOut:  'cubic-bezier(0.77, 0, 0.175, 1)',   // on-screen morph (not enter/exit)
  drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',    // iOS-like sheet slide
} as const;
export const EASE_ARR = { // Framer Motion array form
  out: [0.23, 1, 0.32, 1], inOut: [0.77, 0, 0.175, 1], drawer: [0.32, 0.72, 0, 1],
} as const;

// Durations (ms) — never exceed for UI; marketing/explainer may go longer
export const DUR = {
  press:     140,   // button press feedback      (100–160)
  tooltip:   160,   // tooltips, tiny popovers     (125–200)
  dropdown:  200,   // dropdowns, selects, seals   (150–250)
  drawerIn:  320,   // modal/drawer ENTER          (200–500)
  drawerOut: 200,   // modal/drawer EXIT — always faster than enter
} as const;

// List/card entry cascade
export const STAGGER_STEP = 45; // ms
export const staggerDelay = (i: number, cap = 8) => Math.min(i, cap) * STAGGER_STEP;

// CSS var block — drop into any styled root so children read --ease-*
export const MOTION_VARS = `
  --ease-out: ${EASE.out};
  --ease-in-out: ${EASE.inOut};
  --ease-drawer: ${EASE.drawer};
`;

// ── propelPressable — DESIGN.md §4 Buttons ───────────────────────────────────
// Every pressable gets :active scale(0.97). Interpolate into an Emotion styled
// template (or a css`` block). Do NOT apply on keyboard-submit paths.
// For Framer Motion surfaces use `whileTap={{ scale: 0.97 }}` instead.
export const propelPressable = `
  transition: transform ${DUR.press}ms ${EASE.out};
  &:active { transform: scale(0.97); }
  @media (prefers-reduced-motion: reduce) {
    &:active { transform: none; }
  }
`;
