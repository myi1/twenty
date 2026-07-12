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

export default function A2AStudioHero(_props: { host: PropelHeroHost }) {
  return <A2AStudioPage />;
}
