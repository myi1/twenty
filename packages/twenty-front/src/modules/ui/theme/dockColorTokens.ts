// Shared theme tokens for Propel's floating shell widgets (the Quick Note
// launcher today). Mounted as a sibling of the authenticated app tree, so it
// can't reach emotion's `useTheme()` React context — instead it rides Twenty's
// real `--t-*` CSS custom properties, which cascade through the DOM (a
// `dark`/`light` class on `document.documentElement`) rather than through
// React context, so `var(--t-...)` resolves correctly here with zero extra
// wiring. See packages/twenty-ui/src/theme-constants/{ThemeProvider.tsx,
// theme-dark.css, theme-light.css, themeCssVariables.ts}.

export const dockColor = {
  // Deliberately theme-stable: pure white is the verified contrast-safe icon
  // color on the accent pill background below in both themes.
  iconOnAccent: 'white',

  // Focus ring
  textPrimary: 'var(--t-font-color-primary)',

  // Shadow
  shadowStrong: 'var(--t-box-shadow-strong)',
} as const;

// Quick Note launcher accent (amber, sticky-note association) — kept visually
// distinct so a future floating launcher (dialer/WhatsApp) can pick its own
// accent without colliding.
export const noteAccent = {
  pillBg: 'var(--t-color-orange9)',
  pillBgHover: 'var(--t-color-orange10)',
} as const;
