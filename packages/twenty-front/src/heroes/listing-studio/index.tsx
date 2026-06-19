/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Listing Studio — runtime-loaded HERO ENTRY
// ─────────────────────────────────────────────────────────────────────────────
//
// The build entry for the runtime-loaded Listing Studio bundle (vite.hero.config.ts
// → dist-heroes/listing-studio/index.js). It re-exports the EXISTING, unchanged
// ListingStudioPage as the bundle's default export.
//
// What gets bundled vs externalized:
//   • BUNDLED  — ListingStudioPage and its OWN children (PropelMantineProvider, the
//     Studio* components, useListingStudioDraft, listingStudioConfig/Crm, the local
//     types). These resolve via the app's tsconfig path aliases (@/…, ~/…) at build
//     time (vite-tsconfig-paths), so the hero carries its own UI code.
//   • EXTERNAL — react, @mantine/core, twenty-ui/*, callPropelRoute, getTokenPair,
//     PageContainer/PageHeader, ~/config, … (the SHARED_SPECIFIERS list). Their bare
//     imports stay bare in the output and resolve, in the browser, via the page
//     import map → /propel-shims/* → window.__propelShared (the host's instances).
//
// The `host` prop bag (HeroRoute → PropelHeroHost) is accepted for forward-compat but
// ListingStudioPage takes no props — it self-serves auth/data through the shimmed
// callPropelRoute / getTokenPair, exactly as it did when bundled into the app.

import { ListingStudioPage } from '~/pages/propel/ListingStudioPage';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

export default function ListingStudioHero(_props: { host: PropelHeroHost }) {
  return <ListingStudioPage />;
}
