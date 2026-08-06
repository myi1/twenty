/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// A2A Studio — runtime-loaded HERO ENTRY
// ─────────────────────────────────────────────────────────────────────────────
//
// Build entry for the runtime-loaded A2A Studio bundle (vite.hero.config.ts →
// dist-heroes/a2a-studio/index.js). Re-exports the EXISTING, unchanged
// A2AStudioPage as the bundle's default export. This hero may bundle
// @documenso/embed-react — see listing-studio/index.tsx for the
// bundled-vs-externalized contract.

import { A2AStudioPage } from '~/pages/propel/A2AStudioPage';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';
import { HeroTypingGuard } from '@/propel/runtime/HeroTypingGuard';

// HeroTypingGuard: agreement fields (price, remarks) are typed here before the
// document is generated, and Twenty's global "g"-sequence nav shortcuts fire from
// inside text fields with a STICKY pending state — so a "g" in a remark arms it
// and the next shortcut letter navigates away mid-form. See HeroTypingGuard.
//
// NB the guard only covers what is in OUR DOM. The embedded Documenso signing
// surface is a cross-origin iframe, so its keystrokes never reach this document's
// listeners and were never at risk either way.
export default function A2AStudioHero(_props: { host: PropelHeroHost }) {
  return (
    <HeroTypingGuard>
      <A2AStudioPage />
    </HeroTypingGuard>
  );
}
