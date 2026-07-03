import {
  Badge,
  Box,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconChartBar,
  IconRobot,
  IconSearch,
  IconTrendingDown,
  IconTrendingUp,
} from 'twenty-ui/display';
import { getWebsiteOverview } from '@/propel/mocks/websiteMockData';
import { AgentActivityFeed } from '@/propel/components/website/AgentActivityFeed';

// Overview sub-tab (Website tab, spec §6): metric strip + "Agents at work" feed +
// search-visibility panel. Mock-data only this wave — a plain `const data = ...`
// at the top per CONVENTIONS.md (no fetch hook needed; nothing here holds local UI
// state).

const formatMetricValue = (value: number): string =>
  value >= 1000 ? value.toLocaleString('en-US') : String(value);

const MetricCard = ({
  label,
  value,
  deltaPct,
}: {
  label: string;
  value: number;
  deltaPct: number | null;
}) => {
  const isUp = deltaPct !== null && deltaPct >= 0;
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap={4}>
        <Text size="xs" c="dimmed">
          {label}
        </Text>
        <Text size="xl" fw={700}>
          {formatMetricValue(value)}
        </Text>
        {deltaPct !== null ? (
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
              vs prior 30d
            </Text>
          </Group>
        ) : null}
      </Stack>
    </Paper>
  );
};

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
      <Group gap={8} align="center" mb="md">
        <IconSearch size={18} />
        <Title order={5}>Search visibility</Title>
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
  const data = getWebsiteOverview();

  return (
    <Box p="md">
      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        <Box>
          <Group gap={8} align="center">
            <IconChartBar size={18} />
            <Title order={4}>Overview</Title>
          </Group>
          <Text c="dimmed" size="sm" mt={2}>
            How the site is performing and what the site agents did recently.
          </Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md" mb="lg">
        {data.metrics.map((m) => (
          <MetricCard
            key={m.key}
            label={m.label}
            value={m.value}
            deltaPct={m.deltaPct}
          />
        ))}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
        <Box style={{ gridColumn: 'span 2' }}>
          <Group gap={8} align="center" mb="md">
            <IconRobot size={18} />
            <Title order={5}>Agents at work</Title>
          </Group>
          <AgentActivityFeed rows={data.agentActivity} />
        </Box>

        <SearchVisibilityPanel {...data.searchVisibility} />
      </SimpleGrid>
    </Box>
  );
};
