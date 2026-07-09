import { IconInbox } from 'twenty-ui/icon';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { InboxTab } from '@/propel/components/marketingHero/InboxTab';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';

// The unified Inbox, graduated from a tab inside the Marketing hero to its OWN
// top-level page mounted at AppPath.Inbox (/inbox) — founder-directed. Rides
// Twenty's DefaultLayout (the nav sidebar + top bar come from the router
// <Outlet/>); this page owns the page header and the inbox body, wrapped in its
// own Mantine scope (PropelMantineProvider), mirroring MarketingHero's shell.
//
// The body is the UNCHANGED InboxTab — the real-time unified inbox (list +
// conversation + composer + AI insights + media) that previously rendered inside
// MarketingHero's <Tabs.Panel value="inbox">. InboxTab self-serves auth/data via
// the shimmed callPropelRoute (no props), so lifting it out of the tab strip is a
// pure shell change. InboxTab anchors its own scroll region to calc(100vh - 168px)
// (the same chrome offset the tab body had), so the two-pane layout still scrolls
// independently under this page header.
export const InboxPage = () => {
  return (
    <PropelMantineProvider>
      {/* Bound the container to the full available height so InboxTab's
          viewport-anchored fixed frame (its own calc(100vh - 168px) two-pane scroll
          regions) sits correctly under DefaultLayout's overflow:hidden shell. The
          Inbox is a deliberate fixed-frame app (panes scroll internally), so it does
          NOT page-scroll — only the height bound is needed here. */}
      <PageContainer style={{ flex: 1, minHeight: 0 }}>
        <PageHeader title="Inbox" Icon={IconInbox} />
        <InboxTab />
      </PageContainer>
    </PropelMantineProvider>
  );
};
