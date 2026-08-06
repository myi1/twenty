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
import { HeroTypingGuard } from '@/propel/runtime/HeroTypingGuard';

// HeroTypingGuard: the builder is a long form with unsaved state, and Twenty's
// global "g"-sequence nav shortcuts fire from inside text inputs. Typing a
// campaign name containing a "g" armed the sequence and the next shortcut letter
// navigated away, losing the whole draft. See HeroTypingGuard for the mechanism.
export default function CampaignBuilderHero(_props: { host: PropelHeroHost }) {
  return (
    <HeroTypingGuard>
      <MarketingCampaignBuilderPage />
    </HeroTypingGuard>
  );
}
