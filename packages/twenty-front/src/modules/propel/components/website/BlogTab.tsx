import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconCalendar,
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconFileText,
  IconLanguage,
  IconPencil,
  IconRefresh,
  IconRepeat,
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
import {
  decideBlogPost,
  generateBlogDraft,
  retryBlogPost,
  cadenceLabel,
  isRecurring,
  BLOG_CADENCES,
  type BlogCadence,
  type BlogPost,
} from '@/propel/lib/blogCrm';
import { friendlyError } from '@/propel/lib/friendlyError';
import { amplifyBrief, generatePlan } from '@/propel/lib/socialCrm';
import { ALL_NETWORKS } from '@/propel/lib/socialCalendarConfig';
import { useCanPublish } from '@/propel/lib/canPublish';
import {
  AmbientAgentCard,
  clickableCard,
  InvitingEmpty,
  KanbanBoard,
  KanbanColumn,
  Seal,
  statusSeal,
  stop,
  SubmissionBadge,
  SurfaceIntro,
} from '@/propel/components/marketingHero/deskShared';
import { SubmitForApprovalButton } from '@/propel/components/marketingHero/SubmitForApprovalButton';
import { BlogPostDrawer } from '@/propel/components/website/BlogPostDrawer';

// Blog sub-tab of the Website tab — the NEWSROOM (marketing-tabs upgrade §2, the
// flagship). The pipeline is staged like an assignment desk: Assignments (topics
// picked) → Writing (grounding + drafting) → Copy desk (the HumanGate) → Scheduled
// → Published, fed from real `blogPost` rows via blog-queue-route. Ambient agent
// cards show each bench agent ON the post it's working (not idle/active lamps).
// Warm empties invite the next brief. The founder's scheduling ask rides here too:
// the brief bar carries a cadence + scheduled-date, and cadence/next-run surface on
// every card. The HumanGate (Approve → scheduled → Ghost / Reject) and the
// maker-checker submit path are unchanged. All routes are Manager/Admin-gated and
// ship behind the gated CRM deploy; until then the board drops to a clean preview
// state (empty lanes + honest banner) — it never crashes the hero.

// Card click → drawer; inner action buttons withhold the click via stop(e). The
// clickableCard/stop helpers + the KanbanColumn/KanbanBoard the lanes use are the
// SHARED desk primitives (see desk/kit.tsx) so all four marketing boards match.
const STAGE_META: Record<string, { label: string }> = {
  IDEA: { label: 'Assigned' },
  GROUNDING: { label: 'Researching' },
  DRAFTING: { label: 'Drafting' },
  SEO_REVIEW: { label: 'SEO / AEO' },
  FAILED: { label: 'Snagged' },
};

const localeBadge = (locale: string): ReactNode =>
  locale ? (
    <Badge size="xs" variant="light" color="gray" leftSection={<IconLanguage size={11} />}>
      {locale.toUpperCase()}
    </Badge>
  ) : null;

// The recurrence tag — only shown when the post recurs (a one-off stays quiet).
const cadenceTag = (cadence: BlogCadence): ReactNode =>
  isRecurring(cadence) ? (
    <Tooltip label={`Recurs ${cadenceLabel(cadence).toLowerCase()} — the next occurrence is seeded when this one publishes`}>
      <Badge size="xs" variant="light" color="gray" leftSection={<IconRepeat size={11} />}>
        {cadenceLabel(cadence)}
      </Badge>
    </Tooltip>
  ) : null;

// ── amplify hook helpers (4S-B AM2) — unchanged ──────────────────────────────
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

const formatWhenTime = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

// datetime-local (browser-local) → ISO for the backend. Empty / unparsable → undefined.
const localToIso = (v: string): string | undefined => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

// ── cards ──────────────────────────────────────────────────────────────────────
// A shared card head: a status Seal + stage label + locale + recurrence tag.
const CardHead = ({ post, stageLabel }: { post: BlogPost; stageLabel: string }) => (
  <Group gap={8} wrap="nowrap" align="center">
    <Seal kind={statusSeal(post.status)} />
    <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.04em' }}>
      {stageLabel}
    </Text>
    <Group gap={6} wrap="nowrap" ml="auto">
      {cadenceTag(post.cadence)}
      {localeBadge(post.locale)}
    </Group>
  </Group>
);

// Scheduled / next-run line (shown when a post carries a scheduledAt).
const ScheduledLine = ({ iso, prefix }: { iso: string | null; prefix: string }) =>
  iso ? (
    <Group gap={6} wrap="nowrap">
      <IconCalendarEvent size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
      <Text size="xs" c="dimmed">
        {prefix} {formatWhenTime(iso)}
      </Text>
    </Group>
  ) : null;

// Assignments + Writing (idea → seo_review), plus FAILED surfaced in Writing.
// A FAILED card shows a human message (never the raw pipeline error) + a Retry
// action that re-runs the pipeline — an issue is never a dead end.
const PipelineCard = ({
  item,
  onOpen,
  onRetry,
  retrying,
}: {
  item: BlogPost;
  onOpen: () => void;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const meta = STAGE_META[item.status] ?? { label: item.status };
  return (
    <Paper withBorder radius="md" p="md" {...clickableCard(onOpen)}>
      <Stack gap="xs">
        <CardHead post={item} stageLabel={meta.label} />
        <Text size="sm" fw={600}>
          {item.title}
        </Text>
        {item.topicSeed ? (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {item.topicSeed}
          </Text>
        ) : null}
        <ScheduledLine iso={item.scheduledAt} prefix="Targeting" />
        {item.status === 'FAILED' ? (
          <Group justify="space-between" gap="xs" wrap="nowrap" align="center">
            <Text size="xs" c="red" lineClamp={2} style={{ flex: 1, minWidth: 0 }}>
              {friendlyError(item.lastError, 'pipeline')}
            </Text>
            <Button
              size="compact-xs"
              variant="light"
              color="red"
              leftSection={<IconRefresh size={12} />}
              loading={retrying}
              onClick={(e) => {
                stop(e);
                onRetry();
              }}
            >
              Retry
            </Button>
          </Group>
        ) : null}
      </Stack>
    </Paper>
  );
};

// The Copy-desk card: the HumanGate — full context + Approve / Reject.
const CopyDeskCard = ({
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
  canPublish: boolean;
  publishLoading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
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
      <CardHead post={item} stageLabel="Awaiting sign-off" />
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
      <ScheduledLine iso={item.scheduledAt} prefix="Targeting" />
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
      <CardHead post={item} stageLabel="On the slate" />
      <Text size="sm" fw={600}>
        {item.title}
      </Text>
      <Group gap={6} wrap="nowrap">
        <IconClock size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
        <Text size="xs" c="dimmed">
          {item.scheduledAt ? formatWhenTime(item.scheduledAt) : 'Publishing next tick'}
        </Text>
      </Group>
    </Stack>
  </Paper>
);

const PublishedCard = ({ item, onOpen }: { item: BlogPost; onOpen: () => void }) => (
  <Paper withBorder radius="md" p="md" {...clickableCard(onOpen)}>
    <Stack gap="xs">
      <CardHead post={item} stageLabel="Filed" />
      <Text size="sm" fw={600}>
        {item.title}
      </Text>
      {item.excerpt ? (
        <Text size="xs" c="dimmed" lineClamp={2}>
          {item.excerpt}
        </Text>
      ) : null}
      {isRecurring(item.cadence) ? (
        <Text size="xs" c="dimmed">
          Next {cadenceLabel(item.cadence).toLowerCase()} edition{' '}
          {item.recurrenceSpawnedAt ? 'is on the desk' : 'seeds when this publishes'}.
        </Text>
      ) : null}
    </Stack>
  </Paper>
);

// ── ambient bench: derive each agent's current piece of work ─────────────────
type AgentBench = { key: BlogAgentKey; label: string; Icon: IconComponent; workingOn: string | null };

const firstTitle = (posts: BlogPost[], statuses: string[]): string | null => {
  const hit = posts.find((p) => statuses.includes(p.status));
  return hit ? hit.title : null;
};

export const BlogTab = () => {
  const notify = usePropelToast();
  const { canPublish, loading: publishLoading } = useCanPublish();
  const { phase, error, preview, columns, total, reload } = useBlogPipeline();

  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [topicSeed, setTopicSeed] = useState('');
  const [cadence, setCadence] = useState<BlogCadence>('ONE_OFF');
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [openRow, setOpenRow] = useState<BlogPost | null>(null);

  // Campaign Spine V2 deep-link: open a post's drawer once the load settles, then
  // strip the ?post= param so back/refresh don't re-trigger it.
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

  // ── amplify hook (4S-B AM2) — unchanged ────────────────────────────────────
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

  // Split the coarse in-progress bucket into the two newsroom lanes.
  const assignments = useMemo(
    () => visibleColumns.inProgress.filter((p) => p.status === 'IDEA' || p.status === 'GROUNDING'),
    [visibleColumns.inProgress],
  );
  const writing = useMemo(
    () => [
      ...visibleColumns.failed,
      ...visibleColumns.inProgress.filter(
        (p) => p.status === 'DRAFTING' || p.status === 'SEO_REVIEW',
      ),
    ],
    [visibleColumns.failed, visibleColumns.inProgress],
  );

  // The ambient bench: each agent + the actual post it's on right now (or idle).
  const bench: AgentBench[] = useMemo(() => {
    const all = [
      ...visibleColumns.inProgress,
      ...visibleColumns.needsApproval,
      ...visibleColumns.scheduled,
    ];
    return [
      { key: 'ideas', label: 'Ideas desk', Icon: IconSparkles, workingOn: firstTitle(all, ['IDEA', 'GROUNDING']) },
      { key: 'writer', label: 'Staff writer', Icon: IconPencil, workingOn: firstTitle(all, ['DRAFTING']) },
      { key: 'seoReviewer', label: 'SEO / AEO editor', Icon: IconTarget, workingOn: firstTitle(all, ['SEO_REVIEW']) },
      { key: 'scheduler', label: 'Scheduler', Icon: IconCalendar, workingOn: firstTitle(all, ['SCHEDULED']) },
    ];
  }, [visibleColumns.inProgress, visibleColumns.needsApproval, visibleColumns.scheduled]);

  const decide = async (id: string, action: 'approve' | 'reject') => {
    const post = columns.needsApproval.find((p) => p.id === id);
    setBusyId(id);
    setDecidedIds((prev) => new Set(prev).add(id));
    const res = await decideBlogPost(id, action);
    setBusyId(null);
    if (res.ok) {
      notify(action === 'approve' ? 'Approved → scheduled to publish' : 'Draft rejected', 'success');
      if (action === 'approve') maybeAmplifyBlog(post);
      reload();
    } else {
      setDecidedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      notify(res.error, 'error');
    }
  };

  // Retry a FAILED post from the board — re-enters the pipeline (same route the
  // drawer's Retry uses). The card shows a friendly message; this is its action.
  const retry = async (id: string) => {
    setRetryingId(id);
    const res = await retryBlogPost(id);
    setRetryingId(null);
    if (res.ok) {
      notify('Retry queued — the pipeline will re-run this post.', 'success');
      reload();
    } else {
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
    const res = await generateBlogDraft({
      topicSeed: seed,
      cadence,
      scheduledAt: localToIso(scheduledLocal),
    });
    setSeeding(false);
    if (res.ok) {
      const recur = isRecurring(cadence) ? ` It’ll recur ${cadenceLabel(cadence).toLowerCase()}.` : '';
      notify(`Assigned — the writer bench will run it to sign-off.${recur}`, 'success');
      setTopicSeed('');
      setCadence('ONE_OFF');
      setScheduledLocal('');
      reload();
    } else {
      notify(res.error, 'error');
    }
  };

  return (
    <Box p="md">
      <SurfaceIntro
        eyebrow="The newsroom"
        title="Idea to byline — the desk that files, proofs, and publishes for you."
        icon={<IconFileText size={20} />}
        actions={
          <>
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
          </>
        }
      />

      {preview ? (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} mb="md">
          <Text span fw={600} c="var(--mantine-color-yellow-7)">
            Preview.
          </Text>{' '}
          The newsroom goes live when the blog pipeline is deployed to this workspace. Until then the
          board is empty and Assign / Approve / Reject are disabled. The blog itself is live — real
          published articles render at{' '}
          <Text span fw={600}>
            remaxhub.ae/blog
          </Text>
          .{error ? ` (${error})` : ''}
        </Alert>
      ) : null}

      {/* The commission bar: assign a topic, set its cadence + target date. */}
      <Paper withBorder radius="md" p="md" mb="md">
        <Group gap="xs" mb="xs">
          <IconSparkles size={16} />
          <Text fw={600}>Commission a story</Text>
          <Badge size="xs" variant="light" color="gray">
            AI writer bench
          </Badge>
        </Group>
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <TextInput
            style={{ flex: 1, minWidth: 0 }}
            label="Topic"
            placeholder="e.g. Palm Jumeirah 2-bed rental yields, 2026 outlook"
            value={topicSeed}
            onChange={(e) => setTopicSeed(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !preview && !seeding) void seedTopic();
            }}
            disabled={preview || seeding}
          />
          <Select
            label="Cadence"
            w={130}
            data={BLOG_CADENCES.map((c) => ({ value: c.value, label: c.label }))}
            value={cadence}
            onChange={(v) => setCadence((v as BlogCadence) ?? 'ONE_OFF')}
            disabled={preview || seeding}
            allowDeselect={false}
            leftSection={<IconRepeat size={14} />}
          />
          <TextInput
            label="Publish on"
            type="datetime-local"
            w={210}
            value={scheduledLocal}
            onChange={(e) => setScheduledLocal(e.currentTarget.value)}
            disabled={preview || seeding}
          />
          <Button
            color="red"
            leftSection={<IconSend size={16} />}
            onClick={() => void seedTopic()}
            loading={seeding}
            disabled={preview}
          >
            Assign
          </Button>
        </Group>
        {isRecurring(cadence) ? (
          <Text size="xs" c="dimmed" mt="xs">
            Recurring: when each edition publishes, the next is auto-drafted on the same topic and
            still goes through sign-off — nothing recurs to the live blog unreviewed.
          </Text>
        ) : null}
      </Paper>

      {/* Ambient bench — each agent shown on the piece it's actually working. */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="lg">
        {bench.map((a) => (
          <AmbientAgentCard
            key={a.key}
            label={a.label}
            icon={<a.Icon size={15} />}
            workingOn={a.workingOn}
            seal={a.key === 'scheduler' ? 'amber' : 'grey'}
            idleLabel="Between assignments"
          />
        ))}
      </SimpleGrid>

      {phase === 'loading' && total === 0 && !preview ? (
        <Center py="xl">
          <Loader color="red" />
        </Center>
      ) : (
        <KanbanBoard cols={{ base: 1, sm: 2, lg: 5 }}>
          <KanbanColumn
            title="Assignments"
            count={assignments.length}
            icon={<IconSparkles size={15} style={{ color: 'var(--mantine-color-dimmed)' }} />}
            empty={
              <InvitingEmpty
                compact
                title="The desk is quiet"
                message="Commission a story above and it lands here."
              />
            }
          >
            {assignments.map((item) => (
              <PipelineCard
                key={item.id}
                item={item}
                onOpen={() => setOpenRow(item)}
                onRetry={() => void retry(item.id)}
                retrying={retryingId === item.id}
              />
            ))}
          </KanbanColumn>

          <KanbanColumn
            title="Writing"
            count={writing.length}
            icon={<IconPencil size={15} style={{ color: 'var(--mantine-color-dimmed)' }} />}
            empty={
              <InvitingEmpty
                compact
                title="No copy in the works"
                message="Assigned stories move here as the writer picks them up."
              />
            }
          >
            {writing.map((item) => (
              <PipelineCard
                key={item.id}
                item={item}
                onOpen={() => setOpenRow(item)}
                onRetry={() => void retry(item.id)}
                retrying={retryingId === item.id}
              />
            ))}
          </KanbanColumn>

          <KanbanColumn
            title="Copy desk"
            count={visibleColumns.needsApproval.length}
            icon={<IconCheck size={15} style={{ color: 'var(--mantine-color-dimmed)' }} />}
            empty={
              <InvitingEmpty
                compact
                title="Nothing awaiting sign-off"
                message="Finished drafts queue here for your approval."
              />
            }
          >
            {visibleColumns.needsApproval.map((item) => (
              <CopyDeskCard
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
            icon={<IconCalendar size={15} style={{ color: 'var(--mantine-color-dimmed)' }} />}
            empty={
              <InvitingEmpty
                compact
                title="Nothing on the slate"
                message="Approved stories wait here for their publish date."
              />
            }
          >
            {visibleColumns.scheduled.map((item) => (
              <ScheduledCard key={item.id} item={item} onOpen={() => setOpenRow(item)} />
            ))}
          </KanbanColumn>

          <KanbanColumn
            title="Published"
            count={visibleColumns.published.length}
            icon={<IconFileText size={15} style={{ color: 'var(--mantine-color-dimmed)' }} />}
            empty={
              <InvitingEmpty
                compact
                title="No editions filed yet"
                message="Published stories land here and go live on the blog."
              />
            }
          >
            {visibleColumns.published.map((item) => (
              <PublishedCard key={item.id} item={item} onOpen={() => setOpenRow(item)} />
            ))}
          </KanbanColumn>
        </KanbanBoard>
      )}

      <BlogPostDrawer row={openRow} onClose={() => setOpenRow(null)} onChanged={reload} />
    </Box>
  );
};
