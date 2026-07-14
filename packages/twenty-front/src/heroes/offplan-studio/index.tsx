/* eslint-disable @nx/enforce-module-boundaries */
// Off-Plan Studio — runtime-loaded HERO ENTRY. Re-exports OffplanStudioPage as the
// bundle default; the page self-serves auth/data via the shimmed callPropelRoute.
import { OffplanStudioPage } from '~/pages/propel/OffplanStudioPage';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

export default function OffplanStudioHero({ host }: { host: PropelHeroHost }) {
  // "Find off-plan for this client" launcher navigates here with the opaque person
  // id (?client=<uuid>); the page resolves the client server-side and pre-attaches
  // it. Absent → the normal Studio flow (pick a client in the pitch wizard).
  const clientId = host.searchParams?.get('client') ?? undefined;
  return <OffplanStudioPage clientId={clientId} />;
}
