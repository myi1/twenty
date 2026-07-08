import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useMemo } from 'react';
import {
  IconAlertTriangle,
  IconChartBar,
  IconCheck,
  IconChevronRight,
  IconFileText,
  IconFlag,
  IconPencil,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconTrendingDown,
  IconTrendingUp,
  IconWorld,
} from 'twenty-ui/display';
import { getWebsiteOverview } from '@/propel/mocks/websiteMockData';
import { useSiteLeads } from '@/propel/hooks/useSiteLeads';
import { useBlogPipeline } from '@/propel/hooks/useBlogPipeline';
import { useWebsiteSeo } from '@/propel/hooks/useWebsiteSeo';
import { countBy, relativeAge, type CountBucket } from '@/propel/lib/websiteCrm';
import { relativeScanAge, type SeoAuditReport } from '@/propel/lib/websiteSeoCrm';
import type { BlogPost } from '@/propel/lib/blogCrm';

// Overview sub-tab (Website tab, spec §6). Everything on it is now REAL and
// clickable — the founder's "too read-only" note.
//   • KPI strip + breakdowns → real site-lead data (useSiteLeads); each drills
//     into the Site leads sub-tab.
//   • "Agents at work" → a REAL activity feed derived from the blog pipeline
//     (useBlogPipeline) and the SEO crawl (useWebsiteSeo). No more fake
//     "Scheduler publish failed — Ghost API timeout" mock rows. Blog rows drill
//     into Blog; the crawl row drills into SEO and AI.
//   • Search visibility → SEO health + pages reachable are REAL (useWebsiteSeo);
//     AI citations stays a PREVIEW (no GSC/LLM feed yet).

type SubTab = 'blog' | 'site-leads' | 'seo-ai';

const MetricCard = ({
  label,
  value,
  deltaPct,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  deltaPct?: number | null;
  tone?: 'red' | 'teal';
  onClick: () => void;
}) => {
  const isUp = deltaPct !== null && deltaPct !== undefined && deltaPct >= 0;
  return (
    <UnstyledButton onClick={onClick} style={{ display: 'block' }}>
      <Paper
        withBorder
        radius="md"
        p="md"
        style={{ transition: 'border-color 120ms' }}
        className="propel-hoverable"
      >
        <Stack gap={4}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="xs" c="dimmed">
              {label}
            </Text>
            <IconChevronRight size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
          </Group>
          <Text size="xl" fw={700} c={tone}>
            {value}
          </Text>
          {deltaPct !== null && deltaPct !== undefined ? (
            <Group gap={4} align="center">
              {isUp ? (
                <IconTrendingUp size={14} color="var(--mantine-color-teal-6)" />
              ) : (
                <IconTrendingDown size={14} color="var(--mantine-color-red-6)" />
              )}
              <Text size="xs" c={isUp ? 'teal' : 'red'} fw={600}>
                {isUp ? '+' : ''}
                {deltaPct}%
              </Text>
              <Text size="xs" c="dimmed">
                vs prior 7d
              </Text>
            </Group>
          ) : null}
        </Stack>
      </Paper>
    </UnstyledButton>
  );
};

const BreakdownPanel = ({
  title,
  icon,
  buckets,
  total,
  emptyLabel,
  onRowClick,
}: {
  title: string;
  icon: React.ReactNode;
  buckets: CountBucket[];
  total: number;
  emptyLabel: string;
  onRowClick: () => void;
}) => (
  <Paper withBorder radius="md" p="md">
    <Group gap={8} align="center" mb="md">
      {icon}
      <Title order={5}>{title}</Title>
    </Group>
    {buckets.length === 0 ? (
      <Text c="dimmed" size="sm">
        {emptyLabel}
      </Text>
    ) : (
      <Stack gap="sm">
        {buckets.slice(0, 6).map((b) => {
          const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
          return (
            <UnstyledButton key={b.key} onClick={onRowClick} style={{ display: 'block' }}>
              <Box>
                <Group justify="space-between" mb={2} wrap="nowrap">
                  <Text size="sm" truncate>
                    {b.label}
                  </Text>
                  <Text size="sm" fw={600}>
                    {b.count}
                  </Text>
                </Group>
                <Progress value={pct} color="red" size="sm" radius="xl" />
              </Box>
            </UnstyledButton>
          );
        })}
      </Stack>
    )}
  </Paper>
);

// ── real activity feed ────────────────────────────────────────────────────────
type FeedTone = 'running' | 'done' | 'review' | 'failed' | 'info';

interface FeedRow {
  id: string;
  tone: FeedTone;
  title: string;
  detail: string;
  when: string;
  ts: number; // for sorting; 0 = unknown (sorts last)
  target: SubTab;
}

const tsOf = (iso: string | null): number => {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
};

const blogRow = (p: BlogPost): FeedRow => {
  const base = { id: `blog-${p.id}`, ts: tsOf(p.updatedAt), target: 'blog' as const };
  const when = p.updatedAt ? relativeAge(p.updatedAt) : '';
  switch (p.status) {
    case 'FAILED':
      return {
        ...base,
        tone: 'failed',
        title: `Draft failed: ${p.title}`,
        detail: p.lastError || 'The pipeline hit an error on this post.',
        when,
      };
    case 'NEEDS_APPROVAL':
      return {
        ...base,
        tone: 'review',
        title: `Needs your approval: ${p.title}`,
        detail: p.excerpt || 'A finished draft is waiting for the HumanGate.',
        when,
      };
    case 'DRAFTING':
      return {
        ...base,
        tone: 'running',
        title: `Writer drafting "${p.title}"`,
        detail: p.topicSeed || 'The AI writer bench is composing this post.',
        when,
      };
    case 'SEO_REVIEW':
      return {
        ...base,
        tone: 'running',
        title: `SEO reviewer checking "${p.title}"`,
        detail: 'On-page SEO pass before the approval gate.',
        when,
      };
    case 'GROUNDING':
    case 'IDEA':
      return {
        ...base,
        tone: 'running',
        title: `Researching "${p.title}"`,
        detail: p.topicSeed || 'Grounding the idea against market data.',
        when,
      };
    case 'SCHEDULED':
      return {
        ...base,
        tone: 'done',
        title: `Scheduled "${p.title}"`,
        detail: p.scheduledAt
          ? `Publishing ${new Date(p.scheduledAt).toLocaleDateString()}`
          : 'Queued to publish next tick.',
        when,
      };
    case 'PUBLISHED':
      return {
        ...base,
        tone: 'done',
        title: `Published "${p.title}"`,
        detail: 'Live on the blog.',
        when,
      };
    default:
      return { ...base, tone: 'info', title: p.title, detail: '', when };
  }
};

const seoRow = (report: SeoAuditReport): FeedRow => ({
  id: 'seo-crawl',
  tone: report.criticalCount > 0 ? 'review' : 'info',
  title: 'SEO crawl completed',
  detail:
    report.issues.length === 0
      ? `No issues across ${report.pagesReachable} crawled pages.`
      : `${report.criticalCount} critical · ${report.warningCount} warnings across ${report.pagesReachable} pages.`,
  when: report.scannedAt ? relativeScanAge(report.scannedAt) : '',
  ts: tsOf(report.scannedAt),
  target: 'seo-ai',
});

const FEED_ICON: Record<FeedTone, React.ReactNode> = {
  running: <Loader size={14} color="blue" />,
  done: <IconCheck size={16} color="var(--mantine-color-teal-6)" />,
  review: <IconFlag size={16} color="var(--mantine-color-yellow-6)" />,
  failed: <IconAlertTriangle size={16} color="var(--mantine-color-red-6)" />,
  info: <IconSearch size={16} color="var(--mantine-color-blue-6)" />,
};

const FEED_BADGE: Record<FeedTone, { color: string; label: string }> = {
  running: { color: 'blue', label: 'Running' },
  done: { color: 'teal', label: 'Done' },
  review: { color: 'yellow', label: 'Needs review' },
  failed: { color: 'red', label: 'Failed' },
  info: { color: 'blue', label: 'Info' },
};

const ActivityFeed = ({
  rows,
  onRowClick,
}: {
  rows: FeedRow[];
  onRowClick: (target: SubTab) => void;
}) => {
  if (rows.length === 0) {
    return (
      <Paper withBorder p="xl" radius="md" style={{ borderStyle: 'dashed' }}>
        <Text c="dimmed" ta="center" size="sm">
          No agent activity yet — content and SEO runs show up here as the pipeline
          works.
        </Text>
      </Paper>
    );
  }
  return (
    <Stack gap="xs">
      {rows.map((row) => {
        const badge = FEED_BADGE[row.tone];
        return (
          <UnstyledButton
            key={row.id}
            onClick={() => onRowClick(row.target)}
            style={{ display: 'block' }}
          >
            <Paper withBorder radius="md" p="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Group gap="sm" align="flex-start" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Box style={{ marginTop: 2 }}>{FEED_ICON[row.tone]}</Box>
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} lineClamp={1}>
                      {row.title}
                    </Text>
                    {row.detail ? (
                      <Text size="xs" c="dimmed" lineClamp={2}>
                        {row.detail}
                      </Text>
                    ) : null}
                  </Stack>
                </Group>
                <Group gap={8} wrap="nowrap" align="center">
                  <Badge color={badge.color} variant="light" radius="sm">
                    {badge.label}
                  </Badge>
                  {row.when ? (
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {row.when}
                    </Text>
                  ) : null}
                  <IconChevronRight
                    size={14}
                    style={{ color: 'var(--mantine-color-dimmed)' }}
                  />
                </Group>
              </Group>
            </Paper>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
};

// ── search visibility (SEO health + pages real, AI citations preview) ──────────
const SearchVisibilityPanel = ({
  report,
  seoLoading,
  aiCitations,
  onOpen,
}: {
  report: SeoAuditReport | null;
  seoLoading: boolean;
  aiCitations: number;
  onOpen: () => void;
}) => {
  const reachablePct =
    report && report.pagesAudited > 0
      ? Math.round((report.pagesReachable / report.pagesAudited) * 100)
      : 0;

  return (
    <UnstyledButton onClick={onOpen} style={{ display: 'block' }}>
      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" mb="md">
          <Group gap={8} align="center">
            <IconSearch size={18} />
            <Title order={5}>Search visibility</Title>
          </Group>
          <IconChevronRight size={14} style={{ color: 'var(--mantine-color-dimmed)' }} />
        </Group>
        <Stack gap="md">
          {seoLoading ? (
            <Center h={80}>
              <Loader size="sm" color="red" />
            </Center>
          ) : report ? (
            <>
              <Box>
                <Group justify="space-between" mb={4}>
                  <Text size="sm">SEO health</Text>
                  <Text size="sm" fw={600}>
                    {report.seoHealthPct}%
                  </Text>
                </Group>
                <Progress
                  value={report.seoHealthPct}
                  color={report.seoHealthPct >= 70 ? 'teal' : 'yellow'}
                  size="sm"
                  radius="xl"
                />
              </Box>

              <Box>
                <Group justify="space-between" mb={4}>
                  <Text size="sm">Pages reachable</Text>
                  <Text size="sm" fw={600}>
                    {report.pagesReachable} / {report.pagesAudited}
                  </Text>
                </Group>
                <Progress value={reachablePct} color="red" size="sm" radius="xl" />
              </Box>
            </>
          ) : (
            <Text size="sm" c="dimmed">
              Couldn&apos;t load the latest crawl — open SEO and AI to run one.
            </Text>
          )}

          <Group justify="space-between">
            <Group gap={6}>
              <Text size="sm">AI citations</Text>
              <Badge color="gray" variant="light" size="xs">
                Preview
              </Badge>
            </Group>
            <Badge color="teal" variant="light" radius="sm">
              {aiCitations} tracked prompts
            </Badge>
          </Group>
        </Stack>
      </Paper>
    </UnstyledButton>
  );
};

export const OverviewTab = ({
  onNavigateSubTab,
}: {
  onNavigateSubTab: (sub: string) => void;
}) => {
  const mock = getWebsiteOverview();
  const { phase, error, leads, metrics, reload } = useSiteLeads();
  const blog = useBlogPipeline();
  const seo = useWebsiteSeo();

  const goSiteLeads = () => onNavigateSubTab('site-leads');
  const goSubTab = (sub: SubTab) => onNavigateSubTab(sub);

  const byPage = useMemo(
    () =>
      countBy(leads, (l) =>
        l.pageSlug ? { key: l.pageSlug, label: l.pageSlug } : null,
      ),
    [leads],
  );

  const byFormType = useMemo(
    () =>
      countBy(leads, (l) =>
        l.formType ? { key: l.formType, label: l.formTypeLabel } : null,
      ),
    [leads],
  );

  // Real activity feed: every blog post as a stage-appropriate row, plus the SEO
  // crawl. Newest first; capped so the card stays glanceable.
  const feedRows = useMemo(() => {
    const posts: BlogPost[] = [
      ...blog.columns.failed,
      ...blog.columns.needsApproval,
      ...blog.columns.inProgress,
      ...blog.columns.scheduled,
      ...blog.columns.published,
    ];
    const rows: FeedRow[] = posts.map(blogRow);
    if (seo.data) rows.push(seoRow(seo.data));
    return rows.sort((a, b) => b.ts - a.ts).slice(0, 8);
  }, [blog.columns, seo.data]);

  return (
    <Box p="md">
      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        <Box>
          <Group gap={8} align="center">
            <IconChartBar size={18} />
            <Title order={4}>Overview</Title>
          </Group>
          <Text c="dimmed" size="sm" mt={2}>
            How the site is performing — live lead numbers, the content pipeline,
            and the latest SEO crawl. Click anything to drill in.
          </Text>
        </Box>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconRefresh size={14} />}
          onClick={() => {
            reload();
            blog.reload();
            seo.reload();
          }}
        >
          Refresh
        </Button>
      </Group>

      {error !== null ? (
        <Alert
          color="red"
          icon={<IconAlertTriangle size={16} />}
          variant="light"
          mb="md"
        >
          Couldn&apos;t load website metrics: {error}
        </Alert>
      ) : null}

      {phase === 'loading' ? (
        <Center h={140}>
          <Loader color="red" />
        </Center>
      ) : (
        <>
          <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md" mb="lg">
            <MetricCard
              label="Site leads (total)"
              value={String(metrics.total)}
              onClick={goSiteLeads}
            />
            <MetricCard
              label="This week"
              value={String(metrics.thisWeek)}
              deltaPct={metrics.last7dVsPrior7dPct}
              onClick={goSiteLeads}
            />
            <MetricCard
              label="Unassigned"
              value={String(metrics.unassigned)}
              tone={metrics.unassigned > 0 ? 'red' : 'teal'}
              onClick={goSiteLeads}
            />
            <MetricCard
              label="SLA breaches"
              value={String(metrics.slaBreaches)}
              tone={metrics.slaBreaches > 0 ? 'red' : 'teal'}
              onClick={goSiteLeads}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mb="lg">
            <BreakdownPanel
              title="Leads by source page"
              icon={<IconWorld size={18} />}
              buckets={byPage}
              total={metrics.total}
              emptyLabel="No website leads yet — pages appear here as forms are submitted."
              onRowClick={goSiteLeads}
            />
            <BreakdownPanel
              title="Leads by form type"
              icon={<IconFileText size={18} />}
              buckets={byFormType}
              total={metrics.total}
              emptyLabel="No website leads yet — form types appear here as forms are submitted."
              onRowClick={goSiteLeads}
            />
          </SimpleGrid>
        </>
      )}

      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
        <Box style={{ gridColumn: 'span 2' }}>
          <Group gap={8} align="center" mb="md">
            <IconRobot size={18} />
            <Title order={5}>Agents at work</Title>
            {blog.phase === 'loading' ? <Loader size={14} color="red" /> : null}
          </Group>
          {blog.preview && !seo.data ? (
            <Alert
              color="gray"
              variant="light"
              icon={<IconPencil size={16} />}
              mb="sm"
            >
              <Text size="xs" c="dimmed">
                The blog pipeline isn&apos;t deployed to this workspace yet, so there
                are no content-agent rows. The SEO crawl still reports below once it
                finishes.
              </Text>
            </Alert>
          ) : null}
          <ActivityFeed rows={feedRows} onRowClick={goSubTab} />
        </Box>

        <SearchVisibilityPanel
          report={seo.data}
          seoLoading={seo.phase === 'loading'}
          aiCitations={mock.searchVisibility.aiCitations}
          onOpen={() => goSubTab('seo-ai')}
        />
      </SimpleGrid>
    </Box>
  );
};
