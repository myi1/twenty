/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// 1:1 Runner — runtime-loaded HERO ENTRY
// ─────────────────────────────────────────────────────────────────────────────
//
// Build entry for the runtime-loaded 1:1 Runner bundle (vite.hero.config.ts →
// dist-heroes/one-on-one-runner/index.js). Re-exports the EXISTING, unchanged
// OneOnOneRunnerPage as the bundle's default export. See listing-studio/index.tsx
// for the bundled-vs-externalized contract.

import { OneOnOneRunnerPage } from '~/pages/propel/OneOnOneRunnerPage';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

export default function OneOnOneRunnerHero(_props: { host: PropelHeroHost }) {
  return <OneOnOneRunnerPage />;
}
