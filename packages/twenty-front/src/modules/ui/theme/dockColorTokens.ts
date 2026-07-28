// Shared theme tokens for the fork's floating shell docks (WhatsApp dock,
// Dialer dock chrome) — both mounted in App.tsx as siblings of <AppRouter />,
// OUTSIDE the React subtree <BaseThemeProvider> wraps (see SPIKE-DOCK.md), so
// the emotion `useTheme()` hook (React Context) is genuinely unreachable here.
//
// BUT Twenty's real theme is not ONLY a React context: ThemeProvider
// (twenty-ui/theme-constants/ThemeProvider.tsx) ALSO toggles a `dark`/`light`
// class directly on `document.documentElement` (the <html> tag) on every
// color-scheme change, and twenty-ui's generated stylesheets
// (theme-dark.css / theme-light.css) define real `--t-*` custom properties
// scoped to `.dark` / `.light`. CSS custom properties cascade through the DOM
// tree, not through React's component tree — so as long as BaseThemeProvider
// is mounted ANYWHERE in the page (it is, wrapping the authenticated app), the
// class lands on <html>, and `var(--t-...)` resolves correctly for EVERY
// element in the document, these docks included, with zero extra wiring and
// zero staleness. This is what lets both docks be theme-aware without being
// inside the provider's React tree, and without inventing a parallel
// `--p-*`-style token system (confirmed NOT to exist in this fork — see the
// WhatsApp dock redesign spec's corrected Theming section, 2026-07-12).
//
// Confirmed at packages/twenty-ui/src/theme-constants/{ThemeProvider.tsx,
// theme-dark.css, theme-light.css, themeCssVariables.ts}.

export const dockColor = {
  // Panel / page surfaces
  bgPrimary: 'var(--t-background-primary)',
  bgSecondary: 'var(--t-background-secondary)', // raised rows, incoming bubbles
  bgTertiary: 'var(--t-background-tertiary)', // hover states
  bgTransparentLight: 'var(--t-background-transparent-light)',

  // Borders
  borderMedium: 'var(--t-border-color-medium)',
  borderLight: 'var(--t-border-color-light)',

  // Text
  textPrimary: 'var(--t-font-color-primary)',
  textSecondary: 'var(--t-font-color-secondary)',
  textTertiary: 'var(--t-font-color-tertiary)',
  textInverted: 'var(--t-font-color-inverted)',
  textDanger: 'var(--t-font-color-danger)',

  // Deliberately theme-stable: pure white is the verified contrast-safe icon
  // color on both green9 and blue9; switching polarity fails one channel per
  // theme even though the channel accent backgrounds themselves remain themed.
  iconOnAccent: 'white',

  // WhatsApp-recognizable green accent — deliberately NOT Twenty's own
  // `--t-accent-*` (Twenty's blue brand accent). Radix-style green scale
  // (same mechanism as Twenty's tag/status colors), correct in both themes.
  outboundBubbleBg: 'var(--t-color-transparent-green4)',
  outboundBubbleBgHover: 'var(--t-color-transparent-green5)',
  accentGreen: 'var(--t-color-green9)',
  accentGreenStrong: 'var(--t-color-green11)',
  onGreenText: 'var(--t-tag-text-green)',

  // Danger (rejected sends, errors)
  dangerBg: 'var(--t-background-danger)',
  dangerBorder: 'var(--t-border-color-danger)',

  // Warn (window-closed banner)
  warnBg: 'var(--t-color-transparent-amber3)',
  warnText: 'var(--t-color-amber11)',

  // Shape
  radiusSm: 'var(--t-border-radius-sm)',
  radiusMd: 'var(--t-border-radius-md)',
  radiusPill: 'var(--t-border-radius-pill)',

  // Shadow
  shadowLight: 'var(--t-box-shadow-light)',
  shadowStrong: 'var(--t-box-shadow-strong)',

  // Type
  fontFamily: 'var(--t-font-family)',
} as const;

// A distinct accent for the Dialer chrome (blue, matching its historical
// pill color) so the two docks stay visually distinguishable even though
// both now ride real Twenty tokens instead of hardcoded hex.
export const dialerAccent = {
  pillBg: 'var(--t-color-blue9)',
  pillBgHover: 'var(--t-color-blue10)',
} as const;

// Quick Note launcher — amber, for the sticky-note association, and kept visually
// distinct from the dialer (blue) and WhatsApp (green) launchers so the three
// stacked buttons in the bottom-right corner stay tellable apart at a glance.
export const noteAccent = {
  pillBg: 'var(--t-color-orange9)',
  pillBgHover: 'var(--t-color-orange10)',
} as const;
