/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Social Calendar — runtime-loaded HERO ENTRY
// ─────────────────────────────────────────────────────────────────────────────
//
// Build entry for the runtime-loaded Social Calendar bundle (vite.hero.config.ts →
// dist-heroes/social-calendar/index.js). Re-exports the EXISTING, unchanged
// SocialCalendarPage as the bundle's default export. This hero bundles
// react-big-calendar (+ its CSS + the drag-and-drop addon CSS) — see
// vite.hero.config.ts for how hero-specific CSS is injected at runtime.

import { SocialCalendarPage } from '~/pages/propel/SocialCalendarPage';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

export default function SocialCalendarHero(_props: { host: PropelHeroHost }) {
  return <SocialCalendarPage />;
}
