/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Settings Hub — runtime-loaded HERO ENTRY
// ─────────────────────────────────────────────────────────────────────────────
//
// The build entry for the runtime-loaded Settings Hub bundle (vite.hero.config.ts
// → dist-heroes/settings-hub/index.js). It re-exports SettingsHubPage as the
// bundle's default export.
//
// What gets bundled vs externalized:
//   • BUNDLED  — SettingsHubPage and its OWN children (PropelMantineProvider, the
//     Settings* tab components, the settings hooks + lib/settingsHubConfig + types).
//     These resolve via the app's tsconfig path aliases (@/…, ~/…) at build time.
//   • EXTERNAL — react, @mantine/core, @mantine/hooks, twenty-ui/*, callPropelRoute,
//     getTokenPair, PageContainer/PageHeader, useSnackBar, ~/config (the
//     SHARED_SPECIFIERS list) → resolved in the browser via the page import map →
//     /propel-shims/* → window.__propelShared (the host's instances).
//
// The `host` prop bag (HeroRoute → PropelHeroHost) is accepted for forward-compat
// but SettingsHubPage takes no props — it self-serves auth/data through the shimmed
// callPropelRoute / getTokenPair, exactly as the other heroes do.

import { SettingsHubPage } from '~/pages/propel/SettingsHubPage';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

export default function SettingsHubHero(_props: { host: PropelHeroHost }) {
  return <SettingsHubPage />;
}
