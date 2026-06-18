import { Tabs } from '@mantine/core';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  IconBroadcast,
  IconCalendarEvent,
  IconFileText,
  IconInbox,
  IconPhone,
  IconSend,
} from 'twenty-ui/display';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { CampaignsTab } from '@/propel/components/marketingHero/CampaignsTab';
import { InboxTab } from '@/propel/components/marketingHero/InboxTab';
import { MarketingHomeTab } from '@/propel/components/marketingHero/MarketingHomeTab';
import { NumbersTab } from '@/propel/components/marketingHero/NumbersTab';
import { SocialCalendarTab } from '@/propel/components/marketingHero/SocialCalendarTab';
import { TemplatesTab } from '@/propel/components/marketingHero/TemplatesTab';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import { useMarketingHub } from '@/propel/hooks/useMarketingHub';

// The UNIFIED Marketing hero (task #41): one twenty-front page mounted at
// AppPath.MarketingHub (/marketing) with internal Mantine tabs, so the legacy
// app-sandbox Marketing Cloud can be retired. Rides Twenty's DefaultLayout (the
// nav sidebar + top bar come from the router <Outlet/>); this page owns the page
// header (title + tab strip) and the active tab body, wrapped in its own Mantine
// scope (PropelMantineProvider).
//
// Tab order matches the "Pulse" 4-tab + ops design: Home · Campaigns · Inbox ·
// Templates · Social · Numbers. The active tab is URL-synced via ?tab= so a tab is
// linkable / survives reload / back-forward navigates between tabs.
//
// Tab status:
//   • Home      — full (the graduated dashboard, formerly MarketingHomePage)
//   • Campaigns — list only (detail drill-in deferred; see CampaignsTab)
//   • Inbox     — STUB (the 700+ LOC real-time inbox is a follow-up; see InboxTab)
//   • Templates — full catalog + editor modals (merge-tags sub-tab deferred)
//   • Social    — full (the social calendar, formerly SocialCalendarPage)
//   • Numbers   — full (the telephony number hub)
//
// Campaigns + Templates share ONE /marketing/hub fetch via useMarketingHub; the
// Home tab fetches its own subset (useMarketingDashboardData), and Social fetches
// its own (useSocialCalendarData). Heavy tabs are unmounted when inactive
// (keepMounted=false) so they only fetch on first activation.

type HeroTab =
  | 'home'
  | 'campaigns'
  | 'inbox'
  | 'templates'
  | 'social'
  | 'numbers';

const TAB_VALUES: HeroTab[] = [
  'home',
  'campaigns',
  'inbox',
  'templates',
  'social',
  'numbers',
];

const isHeroTab = (v: string | null): v is HeroTab =>
  v !== null && (TAB_VALUES as string[]).includes(v);

export const MarketingHero = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: HeroTab = isHeroTab(rawTab) ? rawTab : 'home';

  // Campaigns + Templates read the same fuller hub payload; one fetch, shared
  // reload. (Mounted at hero level so switching between the two tabs doesn't
  // re-fetch, and a mutation in one is reflected after reload.)
  const { payload: hub, isLoading: hubLoading, reload: reloadHub } =
    useMarketingHub();

  const setTab = useCallback(
    (value: string | null) => {
      if (value === null) return;
      const next = new URLSearchParams(searchParams);
      if (value === 'home') {
        next.delete('tab');
      } else {
        next.set('tab', value);
      }
      // replace: a tab switch shouldn't stack history entries per keystroke; it's
      // still a distinct URL so back/forward moves between tabs.
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const tabPanels = useMemo(
    () => (
      <>
        <Tabs.Panel value="home">
          {activeTab === 'home' ? <MarketingHomeTab /> : null}
        </Tabs.Panel>
        <Tabs.Panel value="campaigns">
          {activeTab === 'campaigns' ? (
            <CampaignsTab
              payload={hub}
              isLoading={hubLoading}
              reload={reloadHub}
            />
          ) : null}
        </Tabs.Panel>
        <Tabs.Panel value="inbox">
          {activeTab === 'inbox' ? <InboxTab /> : null}
        </Tabs.Panel>
        <Tabs.Panel value="templates">
          {activeTab === 'templates' ? (
            <TemplatesTab
              payload={hub}
              isLoading={hubLoading}
              reload={reloadHub}
            />
          ) : null}
        </Tabs.Panel>
        <Tabs.Panel value="social">
          {activeTab === 'social' ? <SocialCalendarTab /> : null}
        </Tabs.Panel>
        <Tabs.Panel value="numbers">
          {activeTab === 'numbers' ? <NumbersTab /> : null}
        </Tabs.Panel>
      </>
    ),
    [activeTab, hub, hubLoading, reloadHub],
  );

  return (
    <PropelMantineProvider>
      <PageContainer>
        <PageHeader title="Marketing" Icon={IconBroadcast} />
        <Tabs
          value={activeTab}
          onChange={setTab}
          color="red"
          keepMounted={false}
          styles={{ root: { display: 'flex', flexDirection: 'column', minHeight: 0 } }}
        >
          <Tabs.List px="md">
            <Tabs.Tab value="home" leftSection={<IconBroadcast size={15} />}>
              Home
            </Tabs.Tab>
            <Tabs.Tab value="campaigns" leftSection={<IconSend size={15} />}>
              Campaigns
            </Tabs.Tab>
            <Tabs.Tab value="inbox" leftSection={<IconInbox size={15} />}>
              Inbox
            </Tabs.Tab>
            <Tabs.Tab value="templates" leftSection={<IconFileText size={15} />}>
              Templates
            </Tabs.Tab>
            <Tabs.Tab value="social" leftSection={<IconCalendarEvent size={15} />}>
              Social
            </Tabs.Tab>
            <Tabs.Tab value="numbers" leftSection={<IconPhone size={15} />}>
              Numbers
            </Tabs.Tab>
          </Tabs.List>

          {tabPanels}
        </Tabs>
      </PageContainer>
    </PropelMantineProvider>
  );
};
