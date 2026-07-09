import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconFileText,
  IconLanguage,
  IconPencil,
  IconRefresh,
  IconSend,
  IconSparkles,
  IconTarget,
  IconTrendingUp,
  IconX,
  type IconComponent,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  useBlogPipeline,
  type BlogAgentKey,
  type BlogColumns,
} from '@/propel/hooks/useBlogPipeline';
import { decideBlogPost, generateBlogDraft, type BlogPost } from '@/propel/lib/blogCrm';
import { amplifyBrief, generatePlan } from '@/propel/lib/socialCrm';
import { ALL_NETWORKS } from '@/propel/lib/socialCalendarConfig';
import { useCanPublish } from '@/propel/lib/canPublish';
import { SubmissionBadge } from '@/propel/components/marketingHero/deskShared';
import { SubmitForApprovalButton } from '@/propel/components/marketingHero/SubmitForApprovalButton';
import { BlogPostDrawer } from '@/propel/components/website/BlogPostDrawer';

// Every card opens the detail drawer on click; withhold the click from the
// inner Approve/Reject buttons so those still act inline (real DOM here — this is
// the twenty-front hero, not the in-sandbox front-component, so stopPropagation
// works, unlike the sandboxed builders).
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const clickableCard = (onOpen: () => void) => ({
  style: { cursor: 'pointer' as const },
  onClick: onOpen,
  role: 'button' as const,
  tabIndex: 0,
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  },
});

// Blog sub-tab of the Website tab (WEBSITE-REBUILD-DESIGN.md §6 "Blog"). LIVE wave:
// a 4-column pipeline board (In progress → Needs approval → Scheduled → Published)
// fed from real `blogPost` rows via blog-queue-route. The HumanGate lives here —
// Approve (→ scheduled → Ghost) / Reject (→ rejected) call blog-approve-route with
// an optimistic update + toast + refetch. A "Draft a topic" seed calls
// blog-generate-route. All three routes are Manager/Admin-gated and ship behind the
// gated CRM deploy; until then the tab drops to a clean preview state (empty board +
// honest banner) — it never crashes the hero (see useBlogPipeline graceful degrade).

// ── agent status chips ───────────────────────────────────────────────────────
// A compact "which pipeline agents are working right now" strip. Real: `active`
// is derived from which stages currently hold work (useBlogPipeline.activeAgents),
// not a fixed demo set.
const BLOG_AGENTS: { key: BlogAgentKey; label: string; Icon: IconComponent }[] = [
  { key: 'ideas', label: 'Ideas', Icon: IconSparkles },
  { key: 'writer', label: 'Writer', Icon: IconPencil },
  { key: 'seoReviewer', label: 'SEO reviewer', Icon: IconTarget },
  { key: 'scheduler', label: 'Scheduler', Icon: IconCalendar },
];

const AgentStatusChips = ({ active }: { active: Set<BlogAgentKey> }) => (
  <Group gap="xs" mb="lg">
    {BLOG_AGENTS.map((agent) => {
      const isActive = active.has(agent.key);
      return (
        <Badge
          key={agent.key}
          size="lg"
          variant="light"
          color={isActive ? 'red' : 'gray'}
          leftSection={<agent.Icon size={13} />}
          radius="sm"
        >
          {agent.label} · {isActive ? 'active' : 'idle'}
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

const STAGE_META: Record<string, { color: string; label: string }> = {
  IDEA: { color: 'gray', label: 'Idea' },
  GROUNDING: { color: 'blue', label: 'Grounding' },
  DRAFTING: { color: 'indigo', label: 'Drafting' },
  SEO_REVIEW: { color: 'teal', label: 'SEO review' },
  FAILED: { color: 'red', label: 'Failed' },
};

const localeBadge = (locale: string): ReactNode =>
  locale ? (
    <Badge size="xs" variant="light" color="gray" leftSection={<IconLanguage size={11} />}>
      {locale.toUpperCase()}
    </Badge>
  ) : null;

// ── amplify hook helpers (4S-B AM2) ──────────────────────────────────────────
// The public URL the amplify plan's CTAs point at. Approve fires BEFORE Ghost
// publishes (approve → scheduled → Ghost next tick), so there's no ghostUrl yet;
// we derive the address the same way Ghost will — the SEO optimizer's slug
// (seoMeta.slug) or, failing that, the slugified title — under the live blog
// base the tab already advertises (remaxhub.ae/blog). Falls back to the blog
// index when no slug can be derived. Pure; never throws.
const BLOG_PUBLIC_BASE = 'https://remaxhub.ae/blog';

const blogPublicUrl = (post: BlogPost): string => {
  let meta = post.seoMeta;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = null;
    }
  }
  let slug = '';
  if (meta !== null && typeof meta === 'object') {
    const s = (meta as Record<string, unknown>).slug;
    if (typeof s === 'string') slug = s.trim();
  }
  if (slug === '') {
    slug = post.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  return slug === '' ? BLOG_PUBLIC_BASE : `${BLOG_PUBLIC_BASE}/${slug}`;
};

const formatWhen = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

// In-progress + failed cards: title, stage badge, locale.
const InProgressCard = ({ item, onOpen }: { item: BlogPost; onOpen: () => void }) => {
  const meta = STAGE_META[item.status] ?? { color: 'gray', label: item.status };
  return (
    <Paper withBorder radius="md" p="md" {...clickableCard(onOpen)}>
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          {item.title}
        </Text>
        {item.topicSeed ? (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {item.topicSeed}
          </Text>
        ) : null}
        <Group gap={6}>
          <Badge
            size="xs"
            variant="light"
            color={meta.color}
            leftSection={item.status === 'FAILED' ? <IconAlertTriangle size={11} /> : undefined}
            style={{ alignSelf: 'flex-start' }}
          >
            {meta.label}
          </Badge>
          {localeBadge(item.locale)}
        </Group>
        {item.status === 'FAILED' && item.lastError ? (
          <Tooltip label={item.lastError} multiline w={260}>
            <Text size="xs" c="red" lineClamp={1}>
              {item.lastError}
            </Text>
          </Tooltip>
        ) : null}
      </Stack>
    </Paper>
  );
};

// The HumanGate card: full context + Approve / Reject.
const NeedsApprovalCard = ({
  item,
  busy,
  canPublish,
  publishLoading,
  onApprove,
  onReject,
  onSubmitted,
  onOpen,
}: {
  item: BlogPost;
  busy: boolean;
  /** Maker-checker (Phase 2): true → publisher (keeps "Approve"). */
  canPublish: boolean;
  /** The publish verdict is still in flight → the go-live control is disabled. */
  publishLoading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  /** Fired after an agent submits this post for approval → reload the board. */
  onSubmitted: () => void;
  onOpen: () => void;
}) => (
  <Paper
    withBorder
    radius="md"
    p="md"
    {...clickableCard(onOpen)}
    style={{ borderColor: 'var(--mantine-color-red-3)', cursor: 'pointer' }}
  >
    <Stack gap="xs">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Text size="sm" fw={600} style={{ flex: 1 }}>
          {item.title}
        </Text>
        <Group gap={6} wrap="nowrap">
          <SubmissionBadge
            size="xs"
            submittedForApprovalAt={item.submittedForApprovalAt}
            sentBackAt={item.sentBackAt}
            sentBackNote={item.sentBackNote}
          />
          {typeof item.criticScore === 'number' ? (
            <Tooltip label="AI critic score (0–100)">
              <Badge
                size="xs"
                variant="light"
                color={item.criticScore >= 80 ? 'teal' : item.criticScore >= 60 ? 'yellow' : 'red'}
              >
                {item.criticScore}
              </Badge>
            </Tooltip>
          ) : null}
        </Group>
      </Group>
      {item.excerpt ? (
        <Text size="xs" c="dimmed" lineClamp={3}>
          {item.excerpt}
        </Text>
      ) : null}
      <Group gap={6}>{localeBadge(item.locale)}</Group>
      <Group justify="flex-end" gap="xs" mt={4}>
        <Button
          size="compact-xs"
          variant="default"
          leftSection={<IconX size={13} />}
          disabled={busy}
          onClick={(e) => {
            stop(e);
            onReject(item.id);
          }}
        >
          Reject
        </Button>
        {publishLoading ? (
          <Button size="compact-xs" color="red" leftSection={<IconCheck size={13} />} disabled>
            Approve
          </Button>
        ) : canPublish ? (
          <Button
            size="compact-xs"
            color="red"
            leftSection={<IconCheck size={13} />}
            loading={busy}
            onClick={(e) => {
              stop(e);
              onApprove(item.id);
            }}
          >
            Approve
          </Button>
        ) : (
          // Agent → submit for approval; stop the click bubbling to the card open.
          <Box onClick={stop}>
            <SubmitForApprovalButton
              kind="BLOG"
              id={item.id}
              alreadySubmitted={
                item.submittedForApprovalAt != null && item.submittedForApprovalAt !== ''
              }
              onSubmitted={onSubmitted}
              size="compact-xs"
              iconSize={13}
            />
          </Box>
        )}
      </Group>
    </Stack>
  </Paper>
);

const ScheduledCard = ({ item, onOpen }: { item: BlogPost; onOpen: () => void }) => (
  <Paper withBorder radius="md" p="md" {...clickableCard(onOpen)}>
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        {item.title}
      </Text>
      <Group gap={6} wrap="nowrap">
        <IconCalendar size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
        <Text size="xs" c="dimmed">
          {formatWhen(item.scheduledAt) || 'Publishing next tick'}
        </Text>
      </Group>
      <Group gap={6}>{localeBadge(item.locale)}</Group>
    </Stack>
  </Paper>
);

const PublishedCard = ({ item, onOpen }: { item: BlogPost; onOpen: () => void }) => (
  <Paper withBorder radius="md" p="md" {...clickableCard(onOpen)}>
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        {item.title}
      </Text>
      {item.excerpt ? (
        <Text size="xs" c="dimmed" lineClamp={2}>
          {item.excerpt}
        </Text>
      ) : null}
      <Group gap={6}>{localeBadge(item.locale)}</Group>
    </Stack>
  </Paper>
);

export const BlogTab = () => {
  const notify = usePropelToast();
  // Maker-checker (Phase 2): a publisher keeps "Approve"; an agent's same click
  // becomes "Submit for approval". Fails closed to the agent view.
  const { canPublish, loading: publishLoading } = useCanPublish();
  const { phase, error, preview, columns, activeAgents, total, reload } = useBlogPipeline();

  // Optimistic overlay: ids the coordinator just approved/rejected, hidden from
  // the Needs-approval column immediately; the reload replaces this with truth.
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [topicSeed, setTopicSeed] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [openRow, setOpenRow] = useState<BlogPost | null>(null);

  // Campaign Spine V2 deep-link: the campaign review's blog arm "Open in Blog"
  // navigates to /marketing?tab=website&sub=blog&post=<id>. There is no
  // standalone post route (the drawer rides local state), so — same one-shot
  // pattern as LandingPagesTab's ?edit= — once the pipeline load settles, open
  // that post's drawer and strip the param so back/refresh don't re-trigger it.
  const [searchParams, setSearchParams] = useSearchParams();
  const postParam = searchParams.get('post');
  const consumedPostRef = useRef(false);

  useEffect(() => {
    if (postParam === null || consumedPostRef.current) return;
    if (phase !== 'ready') return;
    consumedPostRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('post');
    setSearchParams(next, { replace: true });
    const hit = [
      ...columns.failed,
      ...columns.inProgress,
      ...columns.needsApproval,
      ...columns.scheduled,
      ...columns.published,
    ].find((p) => p.id === postParam);
    if (hit !== undefined) {
      setOpenRow(hit);
    } else {
      notify(
        'That blog post isn’t on the board yet — refresh once the pipeline catches up.',
        'info',
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postParam, phase, columns, searchParams, setSearchParams]);

  // ── amplify hook (4S-B AM2) ────────────────────────────────────────────────
  // After a successful Approve (the blog "publish" event — approve → scheduled
  // → Ghost), fire-and-forget a social AMPLIFY plan promoting the post. Never
  // blocks or fails the approve. `amplifyFiredRef` guards one fire per post per
  // session (a double-click / re-approve can't spawn duplicate plans);
  // `amplifyUnavailableRef` mirrors the featureOff detection — once the bench
  // answers FEATURE_OFF we stop calling AND stop toasting (one soft note max).
  const amplifyFiredRef = useRef<Set<string>>(new Set());
  const amplifyUnavailableRef = useRef(false);

  const maybeAmplifyBlog = (post: BlogPost | undefined) => {
    if (!post || amplifyUnavailableRef.current || amplifyFiredRef.current.has(post.id)) {
      return;
    }
    amplifyFiredRef.current.add(post.id);
    void (async () => {
      const res = await generatePlan(
        amplifyBrief('blog post', post.title, post.excerpt),
        ALL_NETWORKS,
        undefined,
        undefined,
        {
          mode: 'AMPLIFY',
          sourceKind: 'BLOG',
          sourceRef: post.id,
          destinationUrl: blogPublicUrl(post),
        },
      );
      if (res.ok) {
        notify('Social plan drafted — review in the Social tab', 'success');
        return;
      }
      if (res.featureOff) amplifyUnavailableRef.current = true;
      notify('Couldn’t draft the social plan — create one manually in the Social tab.', 'info');
    })();
  };

  const visibleColumns: BlogColumns = useMemo(
    () => ({
      ...columns,
      needsApproval: columns.needsApproval.filter((p) => !decidedIds.has(p.id)),
    }),
    [columns, decidedIds],
  );

  const decide = async (id: string, action: 'approve' | 'reject') => {
    // Capture the row BEFORE the await — the reload below replaces columns and
    // the amplify hook needs the title/excerpt/seoMeta it was approved with.
    const post = columns.needsApproval.find((p) => p.id === id);
    setBusyId(id);
    // optimistic: hide the card now
    setDecidedIds((prev) => new Set(prev).add(id));
    const res = await decideBlogPost(id, action);
    setBusyId(null);
    if (res.ok) {
      notify(action === 'approve' ? 'Approved → scheduled to publish' : 'Draft rejected', 'success');
      if (action === 'approve') maybeAmplifyBlog(post);
      reload();
    } else {
      // rollback the optimistic hide, surface the reason
      setDecidedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      notify(res.error, 'error');
    }
  };

  const seedTopic = async () => {
    const seed = topicSeed.trim();
    if (!seed) {
      notify('Enter a topic to draft.', 'error');
      return;
    }
    setSeeding(true);
    const res = await generateBlogDraft({ topicSeed: seed });
    setSeeding(false);
    if (res.ok) {
      notify('Draft queued — the writer bench will run it to approval.', 'success');
      setTopicSeed('');
      reload();
    } else {
      notify(res.error, 'error');
    }
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
        <Group gap="md" wrap="nowrap">
          <Group gap={4} wrap="nowrap">
            <IconTrendingUp size={14} style={{ color: 'var(--mantine-color-dimmed)' }} />
            <Text size="xs" c="dimmed">
              {visibleColumns.published.length} published
            </Text>
          </Group>
          <Button
            size="compact-sm"
            variant="default"
            leftSection={<IconRefresh size={14} />}
            onClick={reload}
            loading={phase === 'loading'}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      {/* Honest state marker: preview mode = the gated blog routes aren't deployed
          to this workspace yet, so the board is empty and actions are disabled.
          The blog ITSELF is live (Ghost-backed /blog on the site). */}
      {preview ? (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} mb="md">
          <Text span fw={600} c="var(--mantine-color-yellow-7)">
            Preview.
          </Text>{' '}
          The approval queue goes live when the blog pipeline is deployed to this workspace. Until
          then the board is empty and Approve/Reject/Draft are disabled. The blog itself is live —
          real published articles render at{' '}
          <Text span fw={600}>
            remaxhub.ae/blog
          </Text>
          .{error ? ` (${error})` : ''}
        </Alert>
      ) : null}

      {/* Draft-a-topic seed (blog-generate-route). Disabled in preview. */}
      <Paper withBorder radius="md" p="md" mb="md">
        <Group gap="xs" mb="xs">
          <IconSparkles size={16} />
          <Text fw={600}>Draft a topic</Text>
          <Badge size="xs" variant="light" color="gray">
            AI writer
          </Badge>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            placeholder="e.g. Palm Jumeirah 2-bed rental yields, 2026 outlook"
            value={topicSeed}
            onChange={(e) => setTopicSeed(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !preview && !seeding) void seedTopic();
            }}
            disabled={preview || seeding}
          />
          <Button
            color="red"
            leftSection={<IconSend size={16} />}
            onClick={() => void seedTopic()}
            loading={seeding}
            disabled={preview}
          >
            Draft
          </Button>
        </Group>
      </Paper>

      <AgentStatusChips active={activeAgents} />

      {phase === 'loading' && total === 0 && !preview ? (
        <Center py="xl">
          <Loader color="red" />
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          <KanbanColumn
            title="In progress"
            count={visibleColumns.inProgress.length + visibleColumns.failed.length}
            Icon={IconPencil}
          >
            {[...visibleColumns.failed, ...visibleColumns.inProgress].map((item) => (
              <InProgressCard key={item.id} item={item} onOpen={() => setOpenRow(item)} />
            ))}
          </KanbanColumn>

          <KanbanColumn
            title="Needs approval"
            count={visibleColumns.needsApproval.length}
            Icon={IconCheck}
          >
            {visibleColumns.needsApproval.map((item) => (
              <NeedsApprovalCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                canPublish={canPublish}
                publishLoading={publishLoading}
                onApprove={(id) => void decide(id, 'approve')}
                onReject={(id) => void decide(id, 'reject')}
                onSubmitted={reload}
                onOpen={() => setOpenRow(item)}
              />
            ))}
          </KanbanColumn>

          <KanbanColumn
            title="Scheduled"
            count={visibleColumns.scheduled.length}
            Icon={IconCalendar}
          >
            {visibleColumns.scheduled.map((item) => (
              <ScheduledCard key={item.id} item={item} onOpen={() => setOpenRow(item)} />
            ))}
          </KanbanColumn>

          <KanbanColumn
            title="Published"
            count={visibleColumns.published.length}
            Icon={IconFileText}
          >
            {visibleColumns.published.map((item) => (
              <PublishedCard key={item.id} item={item} onOpen={() => setOpenRow(item)} />
            ))}
          </KanbanColumn>
        </SimpleGrid>
      )}

      <BlogPostDrawer
        row={openRow}
        onClose={() => setOpenRow(null)}
        onChanged={reload}
      />
    </Box>
  );
};
