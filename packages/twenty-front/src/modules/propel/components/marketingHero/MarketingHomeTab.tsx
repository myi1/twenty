import { Center, Loader } from '@mantine/core';
import { MyDeskHome } from '@/propel/components/marketingHero/MyDeskHome';
import { NightDeskHome } from '@/propel/components/marketingHero/NightDeskHome';
import { useCanPublish } from '@/propel/lib/canPublish';

// The Marketing home — role-branched (maker-checker Phase 2).
//
// A publisher (Manager+/anyone granted PROPEL_MARKETING_PUBLISH, or an admin) opens
// "The Night Desk": the sign-off / control-tower home (now carrying the manager
// approval row for what agents submitted). A non-publisher agent opens "My Desk":
// a maker's home built around creating and tracking their OWN work.
//
// The branch is UI convenience only — the publish/approve/sendBack routes are all
// BACKEND-enforced. `useCanPublish` fails CLOSED (an unknown/failed read → the agent
// view), which is the safe default: an agent shown "submit" is harmless; a manager
// mis-shown the agent home still has every backend capability. While the capability
// is loading we show a neutral spinner rather than flashing the wrong home.
export const MarketingHomeTab = ({
  allowedTabs,
}: {
  // Forwarded to MyDeskHome so the agent's "make something" tiles only offer
  // surfaces they can actually open. Publishers (NightDeskHome) see everything, so
  // they don't need it.
  allowedTabs?: string[];
} = {}) => {
  const { canPublish, loading } = useCanPublish();

  if (loading) {
    return (
      <Center h={320}>
        <Loader color="gray" />
      </Center>
    );
  }

  return canPublish ? <NightDeskHome /> : <MyDeskHome allowedTabs={allowedTabs} />;
};
