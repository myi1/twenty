/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Team Scorecard — runtime-loaded HERO ENTRY (the manager dashboard for lead care)
// ─────────────────────────────────────────────────────────────────────────────
//
// Build entry for dist-heroes/team-scorecard/index.js (npm run build:hero
// team-scorecard). Reached at /h/team-scorecard via the HeroCatchAll route and the
// mounted nav.config.json entry — no engine rebuild. Everything it shows comes from
// POST /team-scorecard (propel-crm-integration team-scorecard-route); the route
// decides whether the caller sees the team or only their own row.
//
// No HeroTypingGuard: the page has no free-text fields (the date picker is a native
// input; Twenty's "g" shortcuts do not fire from it).

import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import { TeamScorecardPage } from '~/pages/propel/TeamScorecardPage';

export default function TeamScorecardHero({ host }: { host: PropelHeroHost }) {
  return <TeamScorecardPage host={host} />;
}
