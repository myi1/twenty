export const ANIMATION = {
  duration: {
    instant: 0.075,
    fast: 0.15,
    normal: 0.3,
    slow: 1.5,
  },
  // PROPEL-NOCTURNE PATCH (Tier B) — re-apply on Twenty upgrade.
  // Nocturne motion vocabulary (DESIGN.md §2.6) — native mirror of the
  // heroes' _pulse/motion.ts. Existing duration keys kept for back-compat.
  // Transform + opacity only; never animate height/width/top; never from
  // scale(0); prefers-reduced-motion reduces (keeps fades), never kills.
  easing: {
    out: 'cubic-bezier(0.23, 1, 0.32, 1)',
    inOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
    drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
  },
  durationMs: {
    press: 140,
    tooltip: 160,
    dropdown: 200,
    drawerIn: 320,
    drawerOut: 200,
  },
};

export type AnimationDuration = 'instant' | 'fast' | 'normal';
