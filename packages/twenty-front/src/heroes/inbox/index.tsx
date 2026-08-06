/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Inbox — runtime-loaded HERO ENTRY
// ─────────────────────────────────────────────────────────────────────────────
//
// The build entry for the runtime-loaded Inbox bundle (vite.hero.config.ts →
// dist-heroes/inbox/index.js). It re-exports the InboxPage as the bundle's default
// export — the unified Inbox graduated from a tab inside the Marketing hero to its
// own top-level /inbox route (founder-directed).
//
// What gets bundled vs externalized (same contract as every other hero):
//   • BUNDLED  — InboxPage and its OWN children (PropelMantineProvider, InboxTab and
//     its inbox/* components, the inbox lib/types). These resolve via the app's
//     tsconfig path aliases (@/…, ~/…) at build time (vite-tsconfig-paths), so the
//     hero carries its own UI code.
//   • EXTERNAL — react, @mantine/core, twenty-ui/*, callPropelRoute, getTokenPair,
//     PageContainer/PageHeader, … (the SHARED_SPECIFIERS list). Their bare imports
//     stay bare and resolve, in the browser, via the page import map → /propel-shims/*
//     → window.__propelShared (the host's single React/Mantine instance).
//
// The `host` prop bag (HeroRoute → PropelHeroHost) is accepted for forward-compat but
// InboxPage takes no props — InboxTab self-serves auth/data through the shimmed
// callPropelRoute, exactly as it did when it rendered inside the Marketing hero's tab.

import { InboxPage } from '~/pages/propel/InboxPage';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';
import { HeroTypingGuard } from '@/propel/runtime/HeroTypingGuard';

// HeroTypingGuard: the Inbox is the highest-stakes case for this — agents type
// long replies to real clients in the composer, and Twenty's global "g"-sequence
// nav shortcuts fire from inside text fields with a STICKY pending state. A "g"
// anywhere in a reply arms it; the next shortcut letter navigates away and the
// half-written message is gone. See HeroTypingGuard for the mechanism.
export default function InboxHero(_props: { host: PropelHeroHost }) {
  return (
    <HeroTypingGuard>
      <InboxPage />
    </HeroTypingGuard>
  );
}
