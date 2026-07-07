import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useState, type ReactNode } from 'react';
import {
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconDownload,
  IconEye,
  IconFileText,
  IconLanguage,
  IconPencil,
  IconSparkles,
  IconTarget,
  IconTrendingUp,
  IconUsers,
  type IconComponent,
} from 'twenty-ui/display';
import {
  getBlogPipeline,
  type AgentJobKey,
  type BlogDraftingItem,
  type BlogIdeaItem,
  type BlogPipelineColumns,
  type BlogPublishedItem,
  type BlogScheduledItem,
} from '@/propel/mocks/websiteMockData';

// Blog sub-tab of the Website tab (WEBSITE-REBUILD-DESIGN.md §6 "Blog"). Mock-data
// wave (CONVENTIONS.md "Data-fetching pattern") — a 4-column pipeline board (Ideas ->
// Drafting -> Scheduled -> Published) seeded from getBlogPipeline(). The only
// interactive action is "Approve" on an idea card, which moves it client-side into
// Drafting to demo the flow — no route call, no persistence (comment on the handler).

// Agent-status chips row: a compact summary strip above the board (distinct from
// Overview's full AgentActivityFeed — this is just "which agents touch the blog
// pipeline and are they idle/active right now"). Demo state only: a fixed active
// set chosen to match the mock pipeline's busiest lanes (Ideas has 4 pending,
// Writer has 2 drafts in flight) — not wired to any real job queue.
const BLOG_AGENTS: { key: AgentJobKey; label: string; Icon: IconComponent }[] = [
  { key: 'ideas', label: 'Ideas', Icon: IconSparkles },
  { key: 'writer', label: 'Writer', Icon: IconPencil },
  { key: 'seoReviewer', label: 'SEO reviewer', Icon: IconTarget },
  { key: 'translator', label: 'Translator', Icon: IconLanguage },
  { key: 'scheduler', label: 'Scheduler', Icon: IconCalendar },
];

const ACTIVE_AGENT_KEYS = new Set<AgentJobKey>(['ideas', 'writer']);

const AgentStatusChips = () => (
  <Group gap="xs" mb="lg">
    {BLOG_AGENTS.map((agent) => {
      const active = ACTIVE_AGENT_KEYS.has(agent.key);
      return (
        <Badge
          key={agent.key}
          size="lg"
          variant="light"
          color={active ? 'red' : 'gray'}
          leftSection={<agent.Icon size={13} />}
          radius="sm"
        >
          {agent.label} · {active ? 'active' : 'idle'}
        </Badge>
      );
    })}
  </Group>
);

const KanbanColumn = ({
  title,
  count,
  Icon,
  children,
}: {
  title: string;
  count: number;
  Icon: IconComponent;
  children: ReactNode;
}) => (
  <Stack gap="sm" style={{ minWidth: 0 }}>
    <Group gap={6} wrap="nowrap">
      <Icon size={15} style={{ color: 'var(--mantine-color-dimmed)' }} />
      <Text size="sm" fw={700}>
        {title}
      </Text>
      <Badge size="xs" variant="light" color="gray" radius="sm">
        {count}
      </Badge>
    </Group>
    <Stack gap="sm">
      {count === 0 ? (
        <Paper withBorder p="md" radius="md" style={{ borderStyle: 'dashed' }}>
          <Text c="dimmed" size="xs" ta="center">
            Nothing here
          </Text>
        </Paper>
      ) : (
        children
      )}
    </Stack>
  </Stack>
);

const IdeaCard = ({
  item,
  approving,
  onApprove,
}: {
  item: BlogIdeaItem;
  approving: boolean;
  onApprove: (id: string) => void;
}) => (
  <Paper withBorder radius="md" p="md">
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        {item.title}
      </Text>
      <Group gap={6} wrap="nowrap" align="flex-start">
        <IconSparkles size={13} style={{ marginTop: 2, flexShrink: 0 }} />
        <Text size="xs" c="dimmed">
          {item.justification}
        </Text>
      </Group>
      <Group justify="flex-end" mt={4}>
        <Button
          size="compact-xs"
          color="red"
          leftSection={<IconCheck size={13} />}
          loading={approving}
          onClick={() => onApprove(item.id)}
        >
          Approve
        </Button>
      </Group>
    </Stack>
  </Paper>
);

const SEO_REVIEW_META: Record<
  BlogDraftingItem['seoReviewStatus'],
  { color: string; label: string }
> = {
  PENDING: { color: 'gray', label: 'SEO review pending' },
  PASSED: { color: 'teal', label: 'SEO review passed' },
  FLAGGED: { color: 'yellow', label: 'SEO issues flagged' },
};

const DraftingCard = ({ item }: { item: BlogDraftingItem }) => {
  const seoMeta = SEO_REVIEW_META[item.seoReviewStatus];
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          {item.title}
        </Text>
        <Box>
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed">
              Writer progress
            </Text>
            <Text size="xs" c="dimmed">
              {item.writerPct}%
            </Text>
          </Group>
          <Progress value={item.writerPct} color="red" size="sm" radius="sm" />
        </Box>
        <Tooltip
          label={
            item.seoReviewStatus === 'FLAGGED'
              ? `${item.seoIssueCount} issue${item.seoIssueCount === 1 ? '' : 's'} flagged`
              : seoMeta.label
          }
        >
          <Badge
            size="xs"
            variant="light"
            color={seoMeta.color}
            leftSection={
              item.seoReviewStatus === 'FLAGGED' ? (
                <IconAlertTriangle size={11} />
              ) : undefined
            }
            style={{ alignSelf: 'flex-start' }}
          >
            {seoMeta.label}
            {item.seoReviewStatus === 'FLAGGED' ? ` (${item.seoIssueCount})` : ''}
          </Badge>
        </Tooltip>
      </Stack>
    </Paper>
  );
};

const ScheduledCard = ({ item }: { item: BlogScheduledItem }) => (
  <Paper withBorder radius="md" p="md">
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        {item.title}
      </Text>
      <Group gap={6} wrap="nowrap">
        <IconCalendar size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
        <Text size="xs" c="dimmed">
          {item.scheduledDateLabel}
        </Text>
      </Group>
      <Group gap={6}>
        {item.languages.map((lang) => (
          <Badge key={lang} size="xs" variant="light" color="gray">
            {lang}
          </Badge>
        ))}
        {item.gatedPdf ? (
          <Badge
            size="xs"
            variant="light"
            color="grape"
            leftSection={<IconDownload size={11} />}
          >
            Gated PDF
          </Badge>
        ) : null}
      </Group>
    </Stack>
  </Paper>
);

const PublishedCard = ({ item }: { item: BlogPublishedItem }) => (
  <Paper withBorder radius="md" p="md">
    <Stack gap="xs">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Text size="sm" fw={600} style={{ flex: 1 }}>
          {item.title}
        </Text>
        {item.aiCited ? (
          <Tooltip label="Cited by at least one tracked AI engine">
            <Badge
              size="xs"
              variant="light"
              color="grape"
              leftSection={<IconSparkles size={11} />}
            >
              AI-cited
            </Badge>
          </Tooltip>
        ) : null}
      </Group>
      <Text size="xs" c="dimmed">
        Published {item.publishedDateLabel}
      </Text>
      <Group gap="md">
        <Group gap={4} wrap="nowrap">
          <IconEye size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
          <Text size="xs" c="dimmed">
            {item.views.toLocaleString()} views
          </Text>
        </Group>
        <Group gap={4} wrap="nowrap">
          <IconUsers size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
          <Text size="xs" c="dimmed">
            {item.leads} leads
          </Text>
        </Group>
      </Group>
    </Stack>
  </Paper>
);

export const BlogTab = () => {
  // Mock-backed local state, per CONVENTIONS.md: a plain getBlogPipeline() read
  // seeded into useState so "Approve" can mutate the columns client-side. No
  // useEffect/fetch cycle — there is no route to call yet.
  const [columns, setColumns] = useState<BlogPipelineColumns>(() =>
    getBlogPipeline(),
  );
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // STUB: "Approve" moves the idea into Drafting client-side to demo the flow. Real
  // approval will call a `/website/blog/approve-idea` route (writer agent picks it
  // up server-side) — follow-up, not built this wave. The short delay + loading
  // state on the button is purely cosmetic so the action reads as real.
  const handleApprove = (id: string) => {
    setApprovingId(id);
    setTimeout(() => {
      setColumns((prev) => {
        const idea = prev.ideas.find((i) => i.id === id);
        if (!idea) return prev;
        const promoted: BlogDraftingItem = {
          id: idea.id,
          stage: 'DRAFTING',
          title: idea.title,
          writerPct: 0,
          seoReviewStatus: 'PENDING',
          seoIssueCount: 0,
        };
        return {
          ...prev,
          ideas: prev.ideas.filter((i) => i.id !== id),
          drafting: [promoted, ...prev.drafting],
        };
      });
      setApprovingId(null);
    }, 700);
  };

  return (
    <Box p="md">
      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        <Box>
          <Group gap={8} align="center">
            <IconFileText size={18} />
            <Title order={4}>Blog</Title>
          </Group>
          <Text c="dimmed" size="sm" mt={2}>
            Idea → draft → schedule → publish, run by the AI writer bench.
          </Text>
        </Box>
        <Group gap={4} wrap="nowrap">
          <IconTrendingUp size={14} style={{ color: 'var(--mantine-color-dimmed)' }} />
          <Text size="xs" c="dimmed">
            {columns.published.length} published this quarter
          </Text>
        </Group>
      </Group>

      {/* Honest state marker: the pipeline board below is sample data — the AI
          writer bench (Ideas → Draft → Schedule) is designed but not yet built.
          The blog ITSELF is live and real (Ghost-backed /blog on the site). */}
      <Paper
        withBorder
        radius="md"
        p="sm"
        mb="md"
        style={{ borderColor: 'var(--mantine-color-yellow-4)' }}
      >
        <Group gap={8} align="flex-start" wrap="nowrap">
          <IconAlertTriangle
            size={16}
            style={{ color: 'var(--mantine-color-yellow-6)', marginTop: 2, flexShrink: 0 }}
          />
          <Text size="xs" c="dimmed">
            <Text span fw={600} c="var(--mantine-color-yellow-7)">
              Preview.
            </Text>{' '}
            The Ideas, Drafting and Scheduled cards below are sample data showing
            how the AI writer bench will run — that automation is designed, not
            yet built. The blog itself is live: real published articles render on
            the site at{' '}
            <Text span fw={600}>
              remaxhub.ae/blog
            </Text>
            .
          </Text>
        </Group>
      </Paper>

      <AgentStatusChips />

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <KanbanColumn title="Ideas" count={columns.ideas.length} Icon={IconSparkles}>
          {columns.ideas.map((item) => (
            <IdeaCard
              key={item.id}
              item={item}
              approving={approvingId === item.id}
              onApprove={handleApprove}
            />
          ))}
        </KanbanColumn>

        <KanbanColumn
          title="Drafting"
          count={columns.drafting.length}
          Icon={IconPencil}
        >
          {columns.drafting.map((item) => (
            <DraftingCard key={item.id} item={item} />
          ))}
        </KanbanColumn>

        <KanbanColumn
          title="Scheduled"
          count={columns.scheduled.length}
          Icon={IconCalendar}
        >
          {columns.scheduled.map((item) => (
            <ScheduledCard key={item.id} item={item} />
          ))}
        </KanbanColumn>

        <KanbanColumn
          title="Published"
          count={columns.published.length}
          Icon={IconFileText}
        >
          {columns.published.map((item) => (
            <PublishedCard key={item.id} item={item} />
          ))}
        </KanbanColumn>
      </SimpleGrid>
    </Box>
  );
};
