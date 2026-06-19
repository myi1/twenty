/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Marketing — runtime-loaded HERO ENTRY
// ─────────────────────────────────────────────────────────────────────────────
//
// Build entry for the runtime-loaded Marketing hero bundle (vite.hero.config.ts →
// dist-heroes/marketing-hub/index.js). Re-exports the EXISTING, unchanged
// MarketingHero page as the bundle's default export. See listing-studio/index.tsx
// for the bundled-vs-externalized contract; the `host` prop bag is accepted for
// forward-compat but the page self-serves auth/data via the shimmed
// callPropelRoute / getTokenPair.

import { MarketingHero as MarketingHubPage } from '~/pages/propel/MarketingHero';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

export default function MarketingHubHero(_props: { host: PropelHeroHost }) {
  return <MarketingHubPage />;
}
