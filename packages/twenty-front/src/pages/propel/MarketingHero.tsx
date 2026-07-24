import { Group, Tabs, Text } from '@mantine/core';
import { type ReactNode, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import {
  IconArrowsSplit2,
  IconBroadcast,
  IconCalendarEvent,
  IconFileText,
  IconPhone,
  IconSend,
  IconSettings,
  IconSparkles,
  IconWorld,
} from 'twenty-ui/display';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { CampaignsTab } from '@/propel/components/marketingHero/CampaignsTab';
import { LeadRoutingTab } from '@/propel/components/marketingHero/LeadRoutingTab';
import { MarketingHomeTab } from '@/propel/components/marketingHero/MarketingHomeTab';
import { NumbersTab } from '@/propel/components/marketingHero/NumbersTab';
import { SettingsTab } from '@/propel/components/marketingHero/SettingsTab';
import { SocialTab } from '@/propel/components/marketingHero/SocialTab';
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
//   • Social       — two sub-surfaces via ?social= (SocialTab): the posting
//                    calendar (formerly SocialCalendarPage) + the Competitors
//                    watch (relocated from its old top-level sidebar page)
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
  | 'lead-routing'
  | 'settings';

// Funnel order — the tabs read left-to-right as the lead-gen engine's stages.
// Every existing tab value is kept; none is renamed.
const TAB_VALUES: HeroTab[] = [
  'home',
  // ATTRACT
  'social',
  // CAPTURE
  'website',
  // NURTURE
  'campaigns',
  'templates',
  // CONVERT
  'lead-routing',
  // TOOLS
  'media-studio',
  'numbers',
  // CONFIGURE
  'settings',
];

// The funnel spine as TINTED ZONES (option C, founder-chosen). Home is the
// standalone overview (no band). Every other tab lives inside its stage's band:
// the stage label sits at the START of the band and clearly LEADS the tabs to its
// RIGHT — no "does this label own the tab left or right of it?" ambiguity, and
// the tinted tray makes the grouping obvious at a glance. One row.
type FunnelStage =
  | 'ATTRACT'
  | 'CAPTURE'
  | 'NURTURE'
  | 'CONVERT'
  | 'TOOLS'
  | 'CONFIGURE';

const FUNNEL_BANDS: { stage: FunnelStage; tabs: HeroTab[] }[] = [
  { stage: 'ATTRACT', tabs: ['social'] },
  { stage: 'CAPTURE', tabs: ['website'] },
  { stage: 'NURTURE', tabs: ['campaigns', 'templates'] },
  // CONVERT holds only the manager-gated Lead Routing → the whole band hides for
  // agents (the filter below drops an empty band).
  { stage: 'CONVERT', tabs: ['lead-routing'] },
  { stage: 'TOOLS', tabs: ['media-studio', 'numbers'] },
  // CONFIGURE is the far-right terminus: run the funnel left-to-right, then govern
  // it. The Settings tab is cross-cutting (not a funnel stage), visible to everyone
  // (its sections gate themselves) — so this band never hides.
  { stage: 'CONFIGURE', tabs: ['settings'] },
];

// Restrained, theme-aware tints: each stage gets ONE Mantine color, rendered only
// as its PALE `-light` background + muted `-light-color` label — not five loud
// fills. The active tab (a red "pills" pill) is the only saturated element, so the
// zones read as quiet trays and the selection still pops. Colors track the funnel:
// awareness → capture → nurture → convert (warm) → neutral tools.
const STAGE_COLOR: Record<FunnelStage, string> = {
  ATTRACT: 'grape',
  CAPTURE: 'cyan',
  NURTURE: 'teal',
  CONVERT: 'orange',
  TOOLS: 'gray',
  CONFIGURE: 'gray',
};

const TAB_LABEL: Record<HeroTab, string> = {
  home: 'Home',
  social: 'Social',
  website: 'Website',
  campaigns: 'Campaigns',
  templates: 'Templates',
  'lead-routing': 'Lead Routing',
  'media-studio': 'Media Studio',
  numbers: 'Numbers',
  settings: 'Settings',
};

const TAB_ICON: Record<HeroTab, ReactNode> = {
  home: <IconBroadcast size={15} />,
  social: <IconCalendarEvent size={15} />,
  website: <IconWorld size={15} />,
  campaigns: <IconSend size={15} />,
  templates: <IconFileText size={15} />,
  'lead-routing': <IconArrowsSplit2 size={15} />,
  'media-studio': <IconSparkles size={15} />,
  numbers: <IconPhone size={15} />,
  settings: <IconSettings size={15} />,
};

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

  // Campaigns + Templates read the same fuller hub payload; one fetch, shared
  // reload. (Mounted at hero level so switching between the two tabs doesn't
  // re-fetch, and a mutation in one is reflected after reload.)
  const { payload: hub, isLoading: hubLoading, reload: reloadHub } =
    useMarketingHub();

  // WHICH TABS THIS PERSON MAY OPEN — decided SERVER-SIDE and carried on the hub
  // payload (shared/marketing-access.ts). A manager/admin gets all nine; an agent
  // gets Home, Campaigns and Templates; an agent who runs social media also gets
  // Social and Media Studio. Every tab's own route is independently fail-closed,
  // so this is presentation, not the security boundary — it just stops us showing
  // someone a tab that would only ever answer "blocked".
  //
  // null => "the server hasn't told us yet" (still loading, or an older payload
  // without `tabs`). We deliberately fall back to the previous role-based
  // behaviour there rather than blanking the strip, so a manager never sees their
  // tabs flicker away on a slow fetch.
  const allowedTabs = useMemo(
    () => (hub?.tabs?.length ? new Set(hub.tabs as HeroTab[]) : null),
    [hub],
  );
  const isTabAllowed = useCallback(
    (value: HeroTab) =>
      (allowedTabs === null || allowedTabs.has(value)) &&
      (value !== 'lead-routing' || canSeeLeadRouting),
    [allowedTabs, canSeeLeadRouting],
  );

  // A deep link to a tab this person may not open lands on Home instead of an
  // error or an empty shell — same posture the lead-routing gate had, now applied
  // to every gated tab. Home is always allowed.
  const activeTab: HeroTab = isTabAllowed(requestedTab) ? requestedTab : 'home';


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
          {activeTab === 'home' ? (
            <MarketingHomeTab allowedTabs={hub?.tabs} />
          ) : null}
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
          {activeTab === 'social' ? <SocialTab /> : null}
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
        <Tabs.Panel value="settings">
          {activeTab === 'settings' ? (
            <SettingsTab
              payload={hub}
              isLoading={hubLoading}
              reload={reloadHub}
            />
          ) : null}
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
        {/* The engine invariant — printed above the funnel-framed tab strip so
            the hub reads as a lead-gen engine, not a toolbox. */}
        <Text fz="sm" c="dimmed" px="md" pt="xs" style={{ maxWidth: 720 }}>
          Every visitor is traceable, every lead carries its source, every deal
          credits the marketing that made it — and every capture point is
          editable here and counts its own conversions.
        </Text>
        <Tabs
          value={activeTab}
          onChange={setTab}
          color="red"
          variant="pills"
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
          {/* Funnel zones (option C). Home stands alone; each stage's tabs sit in
              a pale tinted tray led by its label. `border: none` drops the pills
              variant's list baseline so the trays read cleanly.

              WRAPS, never scrolls. This row used to be `nowrap` + `overflowX:auto`,
              which HID tabs: the full strip measures ~1587px, so below a ~1920px
              window the right-hand end fell off — Settings was unreachable on every
              MacBook, and Numbers and Media Studio went with it on a 1440. macOS
              hides scrollbars until you scroll, so there was no hint anything was
              there; the tabs simply did not exist as far as the user could tell.
              Wrapping to a second line costs one row of height and can never hide
              a tab. Each band stays intact on one line (the Group below is
              `nowrap`/`flexShrink:0`), so a break only ever falls BETWEEN stages —
              a stage label is never orphaned from its tabs. */}
          <Tabs.List
            px="md"
            style={{
              border: 'none',
              flexWrap: 'wrap',
              rowGap: 'var(--mantine-spacing-xs)',
              gap: 'var(--mantine-spacing-sm)',
              alignItems: 'center',
            }}
          >
            <Tabs.Tab value="home" leftSection={TAB_ICON.home}>
              {TAB_LABEL.home}
            </Tabs.Tab>
            {FUNNEL_BANDS.map((band) => {
                const bandTabs = band.tabs.filter(isTabAllowed);
              if (bandTabs.length === 0) return null;
              const color = STAGE_COLOR[band.stage];
              return (
                <Group
                  key={band.stage}
                  gap={6}
                  wrap="nowrap"
                  style={{
                    background: `var(--mantine-color-${color}-light)`,
                    borderRadius: 'var(--mantine-radius-md)',
                    padding: '3px 6px 3px 10px',
                    flexShrink: 0,
                  }}
                >
                  <Text
                    fz={9}
                    fw={700}
                    tt="uppercase"
                    style={{
                      letterSpacing: '0.1em',
                      color: `var(--mantine-color-${color}-light-color)`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {band.stage}
                  </Text>
                  {bandTabs.map((value) => (
                    <Tabs.Tab key={value} value={value} leftSection={TAB_ICON[value]}>
                      {TAB_LABEL[value]}
                    </Tabs.Tab>
                  ))}
                </Group>
              );
            })}
          </Tabs.List>

          {tabPanels}
        </Tabs>
      </PageContainer>
    </PropelMantineProvider>
  );
};
