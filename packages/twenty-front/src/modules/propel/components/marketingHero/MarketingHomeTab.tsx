import {
  Box,
  Button,
  Center,
  Collapse,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Layouts } from 'react-grid-layout';
import { AppPath } from 'twenty-shared/types';
import {
  type IconComponent,
  IconCalendarEvent,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconLayoutDashboard,
  IconMail,
  IconMessage,
  IconPencil,
  IconPhoto,
  IconRefresh,
  IconSparkles,
  IconUserPlus,
  IconWorld,
} from 'twenty-ui/display';
import { MarketingDashboardGrid } from '@/propel/components/MarketingDashboardGrid';
import { CampaignReviewPanel } from '@/propel/components/marketingHero/CampaignReviewPanel';
import { CampaignSpinePanel } from '@/propel/components/marketingHero/CampaignSpinePanel';
import { useMarketingDashboardData } from '@/propel/hooks/useMarketingDashboardData';
import { useSiteLeads } from '@/propel/hooks/useSiteLeads';
import { type SpineArm, listCampaigns } from '@/propel/lib/campaignSpineCrm';
import {
  listLandingPages,
  readRefresherDiffs,
} from '@/propel/lib/landingPagesCrm';
import { type AnalyticsRange } from '@/propel/types/marketingHome';

// Home tab body of the unified Marketing hero — an ACTION-AND-REVIEW home (not a
// passive analytics dashboard). Three zones:
//   1. Start a campaign — the AI campaign-spine brief box (CampaignSpinePanel,
//      same generateCampaign path the Campaigns tab uses) opening the shared
//      CampaignReviewPanel right here, plus subtle per-surface quick-starts.
//   2. Needs you — clickable stat cards, each jumping to its queue/tab. A card is
//      HIDDEN when its data source isn't available (never a fake number); accented
//      when it has items, neutral at zero. The whole section hides if no card has a
//      source.
//   3. How it's going — a condensed 4-metric strip off the existing analytics
//      payload, with a "Full dashboard" toggle that reveals the original
//      customizable MarketingDashboardGrid (Customize/edit-mode intact). The
//      7d/30d/90d range control feeds both the strip and the grid.
//
// The hero shell (MarketingHero) owns the page chrome + tab strip; this component
// owns only the Home body. Tab jumps ride the URL (?tab=…) exactly like
// CampaignReviewPanel's deep-links, so the shell's ?tab= sync picks them up.

// A number the route reported, formatted; a non-number (missing slice) → an
// honest em-dash, never a fake zero.
const fmtNum = (v: number | undefined): string =>
  typeof v === 'number' ? v.toLocaleString('en-US') : '—';

interface NeedsCard {
  key: string;
  label: string;
  Icon: IconComponent;
  count: number;
  onClick: () => void;
}

export const MarketingHomeTab = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [editMode, setEditMode] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  // Campaign spine review — hosted at the home level (mirrors CampaignsTab) so a
  // Build-campaign here opens the same drawer without a tab hop. `failed` carries
  // any arm the generate reported as partial-failed.
  const [spineReview, setSpineReview] = useState<{
    id: string;
    failed: SpineArm[];
  } | null>(null);
  // Bumped to re-fetch the "Needs you" counts (after a review changes a proposal).
  const [needsRefresh, setNeedsRefresh] = useState(0);

  const {
    analytics,
    hub,
    layouts,
    setLayouts,
    enabledWidgetIds,
    isLoading,
    layoutLoaded,
    persistLayout,
  } = useMarketingDashboardData(range);

  // ── Needs-you data sources (each independent + fail-soft) ────────────────────
  // Campaign spine: feeds Proposed-by-Scout (non-MANUAL, DRAFTING/REVIEW) and
  // Awaiting-approval (status REVIEW). `available:false` when the route is missing.
  const [campaigns, setCampaigns] = useState<{
    available: boolean;
    scout: number;
    review: number;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void listCampaigns().then((res) => {
      if (!live) return;
      if (res.ok) {
        const scout = res.campaigns.filter(
          (c) =>
            c.sourceKind !== 'MANUAL' &&
            (c.status === 'DRAFTING' || c.status === 'REVIEW'),
        ).length;
        const review = res.campaigns.filter((c) => c.status === 'REVIEW').length;
        setCampaigns({ available: true, scout, review });
      } else {
        setCampaigns({ available: false, scout: 0, review: 0 });
      }
    });
    return () => {
      live = false;
    };
  }, [needsRefresh]);

  // Landing pages: feeds Refresher-flags (pages carrying queued refresher diffs).
  const [refresher, setRefresher] = useState<{
    available: boolean;
    count: number;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void listLandingPages().then((res) => {
      if (!live) return;
      if (res.ok) {
        const count = res.data.pages.filter(
          (p) => readRefresherDiffs(p.refresherJson).length > 0,
        ).length;
        setRefresher({ available: true, count });
      } else {
        setRefresher({ available: false, count: 0 });
      }
    });
    return () => {
      live = false;
    };
  }, [needsRefresh]);

  // Website site-leads: feeds Unassigned-leads (own-token, propel-rls applies).
  const {
    metrics: siteLeadMetrics,
    phase: siteLeadsPhase,
    reload: reloadSiteLeads,
  } = useSiteLeads();

  // Campaign replies awaiting a reply-back ride the hub payload's attention list
  // (kind HOT_REPLY). The hub is null while loading / when the route failed → the
  // card is simply absent until the hub resolves.
  const repliesAvailable = hub !== null;
  const repliesCount = useMemo(
    () =>
      (hub?.needsAttention ?? []).filter((a) => a.kind === 'HOT_REPLY').length,
    [hub],
  );
  const draftsCount = hub?.drafts?.length ?? 0;

  // Assemble only the cards whose source is ready — the rest stay hidden (never a
  // fabricated zero). Awaiting-approval folds the hub's draft count into the
  // spine's REVIEW count.
  const needsCards = useMemo<NeedsCard[]>(() => {
    const cards: NeedsCard[] = [];
    const goCampaigns = () =>
      navigate(`${AppPath.MarketingHub}?tab=campaigns`);
    if (campaigns?.available === true) {
      cards.push({
        key: 'scout',
        label: 'Proposed by Scout',
        Icon: IconSparkles,
        count: campaigns.scout,
        onClick: goCampaigns,
      });
      cards.push({
        key: 'approval',
        label: 'Awaiting approval',
        Icon: IconCheck,
        count: campaigns.review + draftsCount,
        onClick: goCampaigns,
      });
    }
    if (refresher?.available === true) {
      cards.push({
        key: 'refresher',
        label: 'Refresher flags',
        Icon: IconRefresh,
        count: refresher.count,
        onClick: () =>
          navigate(`${AppPath.MarketingHub}?tab=website&sub=landing-pages`),
      });
    }
    if (repliesAvailable) {
      cards.push({
        key: 'replies',
        label: 'Campaign replies',
        Icon: IconMessage,
        count: repliesCount,
        onClick: () => navigate(AppPath.Inbox),
      });
    }
    if (siteLeadsPhase === 'ready') {
      cards.push({
        key: 'unassigned',
        label: 'Unassigned leads',
        Icon: IconUserPlus,
        count: siteLeadMetrics.unassigned,
        onClick: () =>
          navigate(`${AppPath.MarketingHub}?tab=website&sub=site-leads`),
      });
    }
    return cards;
  }, [
    campaigns,
    refresher,
    repliesAvailable,
    repliesCount,
    draftsCount,
    siteLeadsPhase,
    siteLeadMetrics.unassigned,
    navigate,
  ]);

  // ── Zone 3 condensed strip (existing analytics payload) ──────────────────────
  const revenue = analytics?.kpis?.revenue;
  const strip: { label: string; value: string }[] = [
    { label: 'Leads', value: fmtNum(analytics?.kpis?.replies?.value) },
    { label: 'Sent', value: fmtNum(analytics?.kpis?.sent?.value) },
    {
      label: 'Open rate',
      value: analytics?.kpis?.openRate
        ? `${analytics.kpis.openRate.value}%`
        : '—',
    },
    {
      // Attributed revenue rides a Presence wrapper — em-dash when the route has
      // nothing to attribute (never AED 0 as a fake).
      label: 'Attributed',
      value:
        revenue && revenue.present === true
          ? `AED ${revenue.value.total.toLocaleString('en-US')}`
          : '—',
    },
  ];

  const handleLayoutChange = useCallback(
    (allLayouts: Layouts) => {
      if (layoutLoaded) {
        setLayouts(allLayouts);
      }
    },
    [layoutLoaded, setLayouts],
  );

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      const next = !prev;
      if (prev && !next) {
        persistLayout(layouts, enabledWidgetIds);
      }
      return next;
    });
  }, [layouts, enabledWidgetIds, persistLayout]);

  const reloadNeeds = useCallback(() => {
    setNeedsRefresh((n) => n + 1);
    reloadSiteLeads();
  }, [reloadSiteLeads]);

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: '16px',
        gap: 28,
      }}
    >
      {/* ── Zone 1 — Start a campaign ──────────────────────────────────────── */}
      <Stack gap="sm">
        <Title order={5}>Start a campaign</Title>
        <CampaignSpinePanel
          onCampaignCreated={(id, failed) => setSpineReview({ id, failed })}
        />
        <Group gap="xs" wrap="wrap">
          <Button
            variant="default"
            size="sm"
            leftSection={<IconWorld size={15} />}
            onClick={() =>
              navigate(`${AppPath.MarketingHub}?tab=website&sub=landing-pages`)
            }
          >
            Landing page
          </Button>
          <Button
            variant="default"
            size="sm"
            leftSection={<IconCalendarEvent size={15} />}
            onClick={() => navigate(`${AppPath.MarketingHub}?tab=social`)}
          >
            Social post
          </Button>
          <Button
            variant="default"
            size="sm"
            leftSection={<IconPhoto size={15} />}
            onClick={() => navigate(`${AppPath.MarketingHub}?tab=media-studio`)}
          >
            Media Studio
          </Button>
          <Button
            variant="default"
            size="sm"
            leftSection={<IconMail size={15} />}
            onClick={() => navigate(AppPath.MarketingCampaignBuilder)}
          >
            Email
          </Button>
        </Group>
      </Stack>

      {/* The shared campaign review drawer, hosted here (mirrors CampaignsTab). */}
      <CampaignReviewPanel
        campaignId={spineReview?.id ?? null}
        failedArms={spineReview?.failed ?? []}
        onClose={() => setSpineReview(null)}
        onChanged={reloadNeeds}
        onRegenerated={(id, failed) => setSpineReview({ id, failed })}
      />

      {/* ── Zone 2 — Needs you ─────────────────────────────────────────────── */}
      {needsCards.length > 0 ? (
        <Stack gap="sm">
          <Title order={5}>Needs you</Title>
          <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 5 }} spacing="sm">
            {needsCards.map((card) => {
              const active = card.count > 0;
              return (
                <UnstyledButton key={card.key} onClick={card.onClick}>
                  <Paper
                    withBorder
                    radius="md"
                    p="md"
                    style={
                      active
                        ? {
                            borderColor: 'var(--mantine-color-red-4)',
                            backgroundColor: 'var(--mantine-color-red-light)',
                          }
                        : undefined
                    }
                  >
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                        <ThemeIcon
                          variant="light"
                          color={active ? 'red' : 'gray'}
                          size="lg"
                          radius="md"
                        >
                          <card.Icon size={18} />
                        </ThemeIcon>
                        <Box style={{ minWidth: 0 }}>
                          <Text
                            fw={700}
                            fz={24}
                            lh={1.1}
                            c={
                              active
                                ? 'var(--mantine-color-red-7)'
                                : 'var(--mantine-color-text)'
                            }
                          >
                            {card.count.toLocaleString('en-US')}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {card.label}
                          </Text>
                        </Box>
                      </Group>
                      <IconChevronRight
                        size={16}
                        color="var(--mantine-color-dimmed)"
                      />
                    </Group>
                  </Paper>
                </UnstyledButton>
              );
            })}
          </SimpleGrid>
        </Stack>
      ) : null}

      {/* ── Zone 3 — How it's going ────────────────────────────────────────── */}
      <Stack gap="sm">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Title order={5}>How it’s going</Title>
          <Group gap="sm" wrap="nowrap">
            <SegmentedControl
              size="xs"
              value={range}
              onChange={(value) => setRange(value as AnalyticsRange)}
              data={[
                { label: '7d', value: '7d' },
                { label: '30d', value: '30d' },
                { label: '90d', value: '90d' },
              ]}
            />
            <Button
              size="xs"
              variant={showDashboard ? 'light' : 'default'}
              color={showDashboard ? 'red' : undefined}
              leftSection={<IconLayoutDashboard size={14} />}
              rightSection={
                <IconChevronDown
                  size={14}
                  style={{
                    transform: showDashboard ? 'rotate(180deg)' : undefined,
                    transition: 'transform 150ms ease',
                  }}
                />
              }
              onClick={() => setShowDashboard((v) => !v)}
            >
              Full dashboard
            </Button>
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          {strip.map((tile) => (
            <Paper key={tile.label} withBorder radius="md" p="md">
              <Text size="xs" c="dimmed">
                {tile.label}
              </Text>
              <Text fw={700} fz={26} lh={1.15} c="var(--mantine-color-text)">
                {tile.value}
              </Text>
            </Paper>
          ))}
        </SimpleGrid>

        <Collapse in={showDashboard}>
          <Stack gap="sm" pt="xs">
            <Group justify="flex-end">
              <Button
                size="xs"
                variant={editMode ? 'filled' : 'default'}
                color={editMode ? 'red' : undefined}
                leftSection={
                  editMode ? (
                    <IconCheck size={14} />
                  ) : (
                    <IconPencil size={14} />
                  )
                }
                onClick={toggleEditMode}
              >
                {editMode ? 'Done' : 'Customize'}
              </Button>
            </Group>
            {isLoading && analytics === null ? (
              <Center h={320}>
                <Loader color="red" />
              </Center>
            ) : (
              <MarketingDashboardGrid
                analytics={analytics}
                hub={hub}
                layouts={layouts}
                enabledWidgetIds={enabledWidgetIds}
                editMode={editMode}
                onLayoutChange={handleLayoutChange}
              />
            )}
          </Stack>
        </Collapse>
      </Stack>
    </Box>
  );
};
