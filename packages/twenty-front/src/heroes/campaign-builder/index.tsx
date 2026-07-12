/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Campaign Builder — runtime-loaded HERO ENTRY
// ─────────────────────────────────────────────────────────────────────────────
//
// Build entry for the runtime-loaded Campaign Builder bundle (vite.hero.config.ts →
// dist-heroes/campaign-builder/index.js). Re-exports the EXISTING, unchanged
// MarketingCampaignBuilderPage as the bundle's default export. See
// listing-studio/index.tsx for the bundled-vs-externalized contract.

import { MarketingCampaignBuilderPage } from '~/pages/propel/MarketingCampaignBuilderPage';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

export default function CampaignBuilderHero(_props: { host: PropelHeroHost }) {
  return <MarketingCampaignBuilderPage />;
}
