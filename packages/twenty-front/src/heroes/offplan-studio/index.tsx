/* eslint-disable @nx/enforce-module-boundaries */
// Off-Plan Studio — runtime-loaded HERO ENTRY. Re-exports OffplanStudioPage as the
// bundle default; the page self-serves auth/data via the shimmed callPropelRoute.
import { OffplanStudioPage } from '~/pages/propel/OffplanStudioPage';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

export default function OffplanStudioHero(_props: { host: PropelHeroHost }) {
  return <OffplanStudioPage />;
}
