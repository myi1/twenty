import { Tabs } from '@mantine/core';
import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import {
  IconArrowsSplit2,
  IconBroadcast,
  IconCalendarEvent,
  IconFileText,
  IconPhone,
  IconSend,
  IconSparkles,
  IconWorld,
} from 'twenty-ui/display';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { CampaignsTab } from '@/propel/components/marketingHero/CampaignsTab';
import { LeadRoutingTab } from '@/propel/components/marketingHero/LeadRoutingTab';
import { MarketingHomeTab } from '@/propel/components/marketingHero/MarketingHomeTab';
import { NumbersTab } from '@/propel/components/marketingHero/NumbersTab';
import { SocialCalendarTab } from '@/propel/components/marketingHero/SocialCalendarTab';
import { TemplatesTab } from '@/propel/components/marketingHero/TemplatesTab';
import { MediaStudioTab } from '@/propel/components/website/MediaStudioTab';
import { WebsiteTab } from '@/propel/components/website/WebsiteTab';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import { useMarketingHub } from '@/propel/hooks/useMarketingHub';
import { isManagerRole, useViewerRole } from '@/propel/hooks/useViewerRole';

// The UNIFIED Marketing hero (task #41): one twenty-front page mounted at
// AppPath.MarketingHub (/marketing) with internal Mantine tabs, so the legacy
// app-sandbox Marketing Cloud can be retired. Rides Twenty's DefaultLayout (the
// nav sidebar + top bar come from the router <Outlet/>); this page owns the page
// header (title + tab strip) and the active tab body, wrapped in its own Mantine
// scope (PropelMantineProvider).
//
// Tab order: Home · Campaigns · Templates · Social · Numbers · Website ·
// Media Studio · Lead Routing. The active tab is URL-synced via ?tab= so a tab is linkable /
// survives reload / back-forward navigates between tabs. (Inbox graduated OUT
// of this hero to its own top-level /inbox route — see InboxPage; ?tab=inbox
// redirects there for old links.)
//
// Tab status:
//   • Home         — full (the graduated dashboard, formerly MarketingHomePage)
//   • Campaigns    — list only (detail drill-in deferred; see CampaignsTab)
//   • Templates    — full catalog + editor modals (merge-tags sub-tab deferred)
//   • Social       — full (the social calendar, formerly SocialCalendarPage)
//   • Numbers      — full (the telephony number hub)
//   • Website      — mock-data UI only this wave (5 sub-tabs: Overview, Blog,
//                    Landing pages, Site leads, SEO and AI — see
//                    components/website/WebsiteTab.tsx + CONVENTIONS.md).
//                    NOT role-gated, same audience as Home/Campaigns/etc.
//   • Media Studio — full (the standalone image workbench: Library · Generate ·
//                    Enhance · Project renders — the same MediaStudioBody panels the
//                    in-editor modal uses, minus the insert action). NOT role-gated,
//                    same audience as Website.
//   • Lead Routing — MANAGER/ADMIN ONLY (gated by useViewerRole). Full-width Mantine
//                    port of the legacy Cmd-K side-drawer lead-source-config panel.
//
// Campaigns + Templates share ONE /marketing/hub fetch via useMarketingHub; the
// Home tab fetches its own subset (useMarketingDashboardData), and Social fetches
// its own (useSocialCalendarData). Heavy tabs are unmounted when inactive
// (keepMounted=false) so they only fetch on first activation.

type HeroTab =
  | 'home'
  | 'campaigns'
  | 'templates'
  | 'social'
  | 'numbers'
  | 'website'
  | 'media-studio'
  | 'lead-routing';

const TAB_VALUES: HeroTab[] = [
  'home',
  'campaigns',
  'templates',
  'social',
  'numbers',
  'website',
  'media-studio',
  'lead-routing',
];

const isHeroTab = (v: string | null): v is HeroTab =>
  v !== null && (TAB_VALUES as string[]).includes(v);

export const MarketingHero = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawTab = searchParams.get('tab');

  // Inbox graduated out of this hero to its own top-level /inbox route. Old links
  // (?tab=inbox, e.g. saved bookmarks or pre-graduation notifications) redirect there
  // so they keep landing on the Inbox rather than silently falling back to Home.
  useEffect(() => {
    if (rawTab === 'inbox') {
      navigate(AppPath.Inbox, { replace: true });
    }
  }, [rawTab, navigate]);

  // Lead Routing is MANAGER/ADMIN only — hidden for agents. The role is the same
  // server-authoritative signal the Inbox triage trusts (viewerRole from
  // /marketing/inbox); the write route is independently fail-closed, so this is a
  // pure UX gate. While the role is unknown the tab stays hidden (fail-closed). An
  // agent who deep-links ?tab=lead-routing is bounced to Home below.
  const { role: viewerRole } = useViewerRole();
  const canSeeLeadRouting = isManagerRole(viewerRole);

  const requestedTab: HeroTab = isHeroTab(rawTab) ? rawTab : 'home';
  const activeTab: HeroTab =
    requestedTab === 'lead-routing' && !canSeeLeadRouting
      ? 'home'
      : requestedTab;

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
        <Tabs.Panel value="website">
          {activeTab === 'website' ? <WebsiteTab /> : null}
        </Tabs.Panel>
        <Tabs.Panel value="media-studio">
          {activeTab === 'media-studio' ? <MediaStudioTab /> : null}
        </Tabs.Panel>
        {canSeeLeadRouting ? (
          <Tabs.Panel value="lead-routing">
            {activeTab === 'lead-routing' ? <LeadRoutingTab /> : null}
          </Tabs.Panel>
        ) : null}
      </>
    ),
    [activeTab, hub, hubLoading, reloadHub, canSeeLeadRouting],
  );

  return (
    <PropelMantineProvider>
      {/* SHARED SCROLL FIX (all marketing tabs): the hero mounts inside Twenty's
          DefaultLayout, where StyledMainContainer is `overflow: hidden` under a
          `height: 100dvh` shell. PageContainer (flex column, NO height bound) just
          grows to content height and is CLIPPED there with no scrollbar — that's
          why Home + Campaigns (and any long tab) couldn't reach their bottom.
          Fix: make PageContainer claim the full available height (flex:1), let the
          fixed-height PageHeader + tab strip sit at natural height, and make the
          Tabs.Panel area the ONE vertical scroll region (flex:1 / minHeight:0 /
          overflowY:auto). Replaces the per-tab `calc(100vh - 168px)` hacks so every
          tab scrolls regardless of content length, with exactly one scrollbar. */}
      <PageContainer style={{ flex: 1, minHeight: 0 }}>
        <PageHeader title="Marketing" Icon={IconBroadcast} />
        <Tabs
          value={activeTab}
          onChange={setTab}
          color="red"
          keepMounted={false}
          styles={{
            root: {
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
            },
            // The active panel is the single scroll region. Inactive panels are
            // display:none (Mantine default), so only the live tab scrolls.
            panel: { flex: 1, minHeight: 0, overflowY: 'auto' },
          }}
        >
          <Tabs.List px="md">
            <Tabs.Tab value="home" leftSection={<IconBroadcast size={15} />}>
              Home
            </Tabs.Tab>
            <Tabs.Tab value="campaigns" leftSection={<IconSend size={15} />}>
              Campaigns
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
            <Tabs.Tab value="website" leftSection={<IconWorld size={15} />}>
              Website
            </Tabs.Tab>
            <Tabs.Tab value="media-studio" leftSection={<IconSparkles size={15} />}>
              Media Studio
            </Tabs.Tab>
            {canSeeLeadRouting ? (
              <Tabs.Tab
                value="lead-routing"
                leftSection={<IconArrowsSplit2 size={15} />}
              >
                Lead Routing
              </Tabs.Tab>
            ) : null}
          </Tabs.List>

          {tabPanels}
        </Tabs>
      </PageContainer>
    </PropelMantineProvider>
  );
};
