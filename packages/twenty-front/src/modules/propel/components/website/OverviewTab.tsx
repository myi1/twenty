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
} from '@mantine/core';
import { useMemo } from 'react';
import {
  IconAlertTriangle,
  IconChartBar,
  IconFileText,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconTrendingDown,
  IconTrendingUp,
  IconWorld,
} from 'twenty-ui/display';
import { getWebsiteOverview } from '@/propel/mocks/websiteMockData';
import { AgentActivityFeed } from '@/propel/components/website/AgentActivityFeed';
import { useSiteLeads } from '@/propel/hooks/useSiteLeads';
import { countBy, type CountBucket } from '@/propel/lib/websiteCrm';

// Overview sub-tab (Website tab, spec §6). The top-line strip + the two
// breakdowns are REAL — derived from the same website-lead data as the Site leads
// queue (useSiteLeads → People where leadSource = WEBSITE). The "Agents at work"
// feed and the search-visibility panel stay mock this wave: they preview the Blog
// (Ghost) and SEO/AI agent backends that don't exist yet (see
// WEBSITE-MARKETING-TAB-PLAN.md) and are visibly labelled as previews.

const MetricCard = ({
  label,
  value,
  deltaPct,
  tone,
}: {
  label: string;
  value: string;
  deltaPct?: number | null;
  tone?: 'red' | 'teal';
}) => {
  const isUp = deltaPct !== null && deltaPct !== undefined && deltaPct >= 0;
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap={4}>
        <Text size="xs" c="dimmed">
          {label}
        </Text>
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
  );
};

const BreakdownPanel = ({
  title,
  icon,
  buckets,
  total,
  emptyLabel,
}: {
  title: string;
  icon: React.ReactNode;
  buckets: CountBucket[];
  total: number;
  emptyLabel: string;
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
            <Box key={b.key}>
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
          );
        })}
      </Stack>
    )}
  </Paper>
);

const SearchVisibilityPanel = ({
  indexedPages,
  totalPages,
  aiCitations,
  seoHealthPct,
  sitemapFreshnessLabel,
}: {
  indexedPages: number;
  totalPages: number;
  aiCitations: number;
  seoHealthPct: number;
  sitemapFreshnessLabel: string;
}) => {
  const indexedPct =
    totalPages > 0 ? Math.round((indexedPages / totalPages) * 100) : 0;

  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" mb="md">
        <Group gap={8} align="center">
          <IconSearch size={18} />
          <Title order={5}>Search visibility</Title>
        </Group>
        <Badge color="gray" variant="light" size="xs">
          Preview
        </Badge>
      </Group>
      <Stack gap="md">
        <Box>
          <Group justify="space-between" mb={4}>
            <Text size="sm">Indexed pages</Text>
            <Text size="sm" fw={600}>
              {indexedPages} / {totalPages}
            </Text>
          </Group>
          <Progress value={indexedPct} color="red" size="sm" radius="xl" />
        </Box>

        <Group justify="space-between">
          <Text size="sm">AI citations</Text>
          <Badge color="teal" variant="light" radius="sm">
            {aiCitations} tracked prompts
          </Badge>
        </Group>

        <Box>
          <Group justify="space-between" mb={4}>
            <Text size="sm">SEO health</Text>
            <Text size="sm" fw={600}>
              {seoHealthPct}%
            </Text>
          </Group>
          <Progress
            value={seoHealthPct}
            color={seoHealthPct >= 70 ? 'teal' : 'yellow'}
            size="sm"
            radius="xl"
          />
        </Box>

        <Group justify="space-between">
          <Text size="sm">Sitemap freshness</Text>
          <Text size="sm" c="dimmed">
            {sitemapFreshnessLabel}
          </Text>
        </Group>
      </Stack>
    </Paper>
  );
};

export const OverviewTab = () => {
  const mock = getWebsiteOverview();
  const { phase, error, leads, metrics, reload } = useSiteLeads();

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

  return (
    <Box p="md">
      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        <Box>
          <Group gap={8} align="center">
            <IconChartBar size={18} />
            <Title order={4}>Overview</Title>
          </Group>
          <Text c="dimmed" size="sm" mt={2}>
            How the site is performing — live lead numbers, plus a preview of the
            content and SEO agents.
          </Text>
        </Box>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconRefresh size={14} />}
          onClick={reload}
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
            <MetricCard label="Site leads (total)" value={String(metrics.total)} />
            <MetricCard
              label="This week"
              value={String(metrics.thisWeek)}
              deltaPct={metrics.last7dVsPrior7dPct}
            />
            <MetricCard
              label="Unassigned"
              value={String(metrics.unassigned)}
              tone={metrics.unassigned > 0 ? 'red' : 'teal'}
            />
            <MetricCard
              label="SLA breaches"
              value={String(metrics.slaBreaches)}
              tone={metrics.slaBreaches > 0 ? 'red' : 'teal'}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mb="lg">
            <BreakdownPanel
              title="Leads by source page"
              icon={<IconWorld size={18} />}
              buckets={byPage}
              total={metrics.total}
              emptyLabel="No website leads yet — pages appear here as forms are submitted."
            />
            <BreakdownPanel
              title="Leads by form type"
              icon={<IconFileText size={18} />}
              buckets={byFormType}
              total={metrics.total}
              emptyLabel="No website leads yet — form types appear here as forms are submitted."
            />
          </SimpleGrid>
        </>
      )}

      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
        <Box style={{ gridColumn: 'span 2' }}>
          <Group gap={8} align="center" mb="md">
            <IconRobot size={18} />
            <Title order={5}>Agents at work</Title>
            <Badge color="gray" variant="light" size="xs">
              Preview
            </Badge>
          </Group>
          <AgentActivityFeed rows={mock.agentActivity} />
        </Box>

        <SearchVisibilityPanel {...mock.searchVisibility} />
      </SimpleGrid>
    </Box>
  );
};
