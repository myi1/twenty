/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Sequence Editor — runtime-loaded HERO ENTRY
// ─────────────────────────────────────────────────────────────────────────────
//
// Build entry for the runtime-loaded Sequence Editor bundle (vite.hero.config.ts →
// dist-heroes/sequence-editor/index.js). Re-exports the EXISTING, unchanged
// SequenceEditorPage as the bundle's default export. This hero bundles @xyflow/react
// (+ its CSS) — see vite.hero.config.ts for how hero-specific CSS is injected.

import { SequenceEditorPage } from '~/pages/propel/SequenceEditorPage';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

export default function SequenceEditorHero(_props: { host: PropelHeroHost }) {
  return <SequenceEditorPage />;
}
