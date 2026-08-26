/* eslint-disable @nx/enforce-module-boundaries */
// Off-Plan Studio — runtime-loaded HERO ENTRY. Re-exports OffplanStudioPage as the
// bundle default; the page self-serves auth/data via the shimmed callPropelRoute.
import { OffplanStudioPage, type OffplanStudioTab } from '~/pages/propel/OffplanStudioPage';
import { HeroTypingGuard } from '@/propel/runtime/HeroTypingGuard';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

export default function OffplanStudioHero({ host }: { host: PropelHeroHost }) {
  // "Find off-plan for this client" launcher navigates here with the opaque person
  // id (?client=<uuid>); the page resolves the client server-side and pre-attaches
  // it. Absent → the normal Studio flow (pick a client in the pitch wizard).
  const clientId = host.searchParams?.get('client') ?? undefined;
  // Launch Calendar deep link (?tab=calendar) — the daily digest line lands on a
  // phone; a tappable link must open the calendar directly, not the map browse
  // (which would fire the full catalog pull the calendar doesn't need).
  const initialTab: OffplanStudioTab = host.searchParams?.get('tab') === 'calendar' ? 'calendar' : 'browse';
  return (
    // HeroTypingGuard: the studio now hosts text fields (the add-event form, the
    // pitch wizard) — without the guard, Twenty's sticky g-sequence nav shortcuts
    // can yank a manager mid-entry and lose the draft.
    <HeroTypingGuard>
      <OffplanStudioPage clientId={clientId} initialTab={initialTab} />
    </HeroTypingGuard>
  );
}
