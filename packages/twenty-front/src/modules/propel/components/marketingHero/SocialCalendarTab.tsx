import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
} from '@mantine/core';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  IconCalendar,
  IconClock,
  IconLayoutKanban,
  IconPlus,
  IconRefresh,
  IconSparkles,
} from 'twenty-ui/display';
import {
  clickableCard,
  InvitingEmpty,
  KanbanBoard,
  KanbanColumn,
  Seal,
  statusSeal,
  stop,
  SurfaceIntro,
} from '@/propel/components/desk';
import {
  ALL_STATUSES,
  CHANNEL_META,
  STATUS_META,
} from '@/propel/lib/socialCalendarConfig';
import { PlanReviewPanel } from '@/propel/components/marketingHero/PlanReviewPanel';
import { SocialCampaignPanel } from '@/propel/components/marketingHero/SocialCampaignPanel';
import { CalendarFilters } from '@/propel/components/calendar/CalendarFilters';
import {
  CalendarEmptyNoChannels,
  CalendarError,
  CalendarLoading,
} from '@/propel/components/calendar/CalendarStates';
import {
  type CalendarToastState,
  CalendarToast,
} from '@/propel/components/calendar/CalendarToast';
import {
  type ComposerOpen,
  PostComposer,
} from '@/propel/components/calendar/PostComposer';
import { PostDetailDrawer } from '@/propel/components/calendar/PostDetailDrawer';
import { SocialCalendar } from '@/propel/components/calendar/SocialCalendar';
import { useSocialCalendarData } from '@/propel/hooks/useSocialCalendarData';
import { isoToLocalInput } from '@/propel/lib/socialComposer';
import {
  type DeleteOutcome,
  type RetryOutcome,
  deletePost,
  publishNow,
  reschedulePost,
  retryPost,
} from '@/propel/lib/socialReschedule';
import {
  type SocialCalendarEvent,
  type SocialCalendarFilters,
  type SocialCalendarView,
  type SocialPost,
} from '@/propel/types/socialCalendar';

// Default schedule time for a day-cell "+" prefill: 9 AM local on the picked day
// (a sensible posting hour; the composer datetime field stays editable).
const slotToScheduleLocal = (slotStart: Date): string => {
  const d = new Date(slotStart);
  d.setHours(9, 0, 0, 0);
  return isoToLocalInput(d.toISOString());
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

// The channel chips on a card head — one small badge per selected network, in that
// platform's brand color, mirroring the calendar pills' channel language.
const networkPills = (networks: SocialPost['networks']): ReactNode => {
  const nets = (networks ?? []).filter((n) => CHANNEL_META[n] !== undefined);
  if (nets.length === 0) return null;
  return (
    <Group gap={4} wrap="nowrap" ml="auto">
      {nets.map((n) => {
        const meta = CHANNEL_META[n];
        return (
          <Badge
            key={n}
            size="xs"
            variant="light"
            leftSection={<meta.Icon size={11} color={meta.color} />}
            styles={{ root: { color: meta.color }, label: { textTransform: 'none' } }}
          >
            {meta.label}
          </Badge>
        );
      })}
    </Group>
  );
};

// One social-post card — the newsroom card grammar (Seal + stage label + channel
// chips, then the body preview, then the scheduled line). Whole card opens the
// existing PostDetailDrawer (all per-post actions live there); a FAILED post also
// gets an inline Retry so a snag is never a dead end, matching the Blog board.
const SocialPostCard = ({
  post,
  onOpen,
  onRetry,
  retrying,
}: {
  post: SocialPost;
  onOpen: () => void;
  onRetry: () => void;
  retrying: boolean;
}) => {
  const meta = STATUS_META[post.status];
  const preview = (post.body ?? '').trim() || (post.name ?? '').trim();
  return (
    <Paper withBorder radius="md" p="md" {...clickableCard(onOpen)}>
      <Stack gap="xs">
        <Group gap={8} wrap="nowrap" align="center">
          <Seal kind={statusSeal(post.status)} />
          <Text
            size="xs"
            c="dimmed"
            fw={600}
            tt="uppercase"
            style={{ letterSpacing: '0.04em' }}
          >
            {meta?.label ?? post.status}
          </Text>
          {networkPills(post.networks)}
        </Group>

        {preview ? (
          <Text size="sm" fw={600} lineClamp={3}>
            {preview}
          </Text>
        ) : (
          <Text size="sm" c="dimmed" fs="italic">
            Untitled post
          </Text>
        )}

        {post.scheduledAt ? (
          <Group gap={6} wrap="nowrap">
            <IconClock size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
            <Text size="xs" c="dimmed">
              {formatWhenTime(post.scheduledAt)}
            </Text>
          </Group>
        ) : null}

        {post.status === 'FAILED' ? (
          <Group justify="flex-end" mt={2}>
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

// Board lane copy per status — mirrors the Blog newsroom's inviting empties.
const STATUS_EMPTY: Record<
  SocialPost['status'],
  { title: string; message: string }
> = {
  DRAFT: {
    title: 'No drafts',
    message: 'Compose a post or generate a campaign and drafts land here.',
  },
  SCHEDULED: {
    title: 'Nothing scheduled',
    message: 'Approved posts wait here for their publish time.',
  },
  PUBLISHING: {
    title: 'Nothing publishing',
    message: 'Posts appear here while the publish run pushes them live.',
  },
  POSTED: {
    title: 'Nothing posted yet',
    message: 'Published posts settle here with their engagement.',
  },
  FAILED: {
    title: 'No failures',
    message: 'A post that couldn’t publish shows here so you can retry it.',
  },
};

// Social tab body of the unified Marketing hero. This is the former
// SocialCalendarPage content (the native Month/Week/List calendar + composer +
// detail drawer + drag-reschedule) extracted into a tab component. It owns its
// own Compose action row + the calendar + the overlay surfaces, but NOT the page
// chrome (PropelMantineProvider / PageContainer / PageHeader) — the hero shell
// owns those and the tab strip.
//
// Behaviour is unchanged from the standalone page (S1–S4 slices):
//   S1 — native Month/Week/List calendar, status pills, channel/status filters,
//        loading/empty/error states.
//   S2 — post-detail READ drawer.
//   S3 — two-pane composer (top Compose / day-cell + / drawer Edit).
//   S4 — drag-to-reschedule + drawer actions (reschedule / publish-now / delete /
//        duplicate / retry).
export const SocialCalendarTab = () => {
  const {
    accounts,
    events,
    posts,
    listings,
    connectUrl,
    connectedNetworks,
    isLoading,
    loaded,
    isError,
    payload,
    reload,
  } = useSocialCalendarData();

  // Board vs Calendar — the board is the default bench view (status columns, like
  // the Blog newsroom); the calendar stays one click away so nothing regresses.
  const [layout, setLayout] = useState<'board' | 'calendar'>('board');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [view, setView] = useState<SocialCalendarView>('month');
  const [date, setDate] = useState<Date>(() => new Date());
  const [filters, setFilters] = useState<SocialCalendarFilters>({
    networks: [],
    statuses: [],
  });
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [composer, setComposer] = useState<ComposerOpen | null>(null);
  const [toast, setToast] = useState<CalendarToastState | null>(null);
  const [optimisticAt, setOptimisticAt] = useState<Record<string, string>>({});
  // Social Bench (4S-A) campaign surfaces: the "Create campaign" brief modal and
  // the plan-review drawer. `campaignOpen` gates the brief box; `reviewPlanId` is
  // non-null while reviewing a freshly-generated (or re-opened) plan.
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [reviewPlanId, setReviewPlanId] = useState<string | null>(null);

  const showToast = useCallback(
    (tone: CalendarToastState['tone'], message: string) =>
      setToast({ id: Date.now(), tone, message }),
    [],
  );

  // Reconcile optimistic overrides against freshly-fetched truth (see the
  // standalone page for the full rationale — avoids a snap-back flicker).
  useEffect(() => {
    setOptimisticAt((m) => {
      const ids = Object.keys(m);
      if (ids.length === 0) return m;
      const byId = new Map(events.map((e) => [e.post.id, e.post.scheduledAt]));
      const sameInstant = (a: string, b: string | null | undefined): boolean => {
        if (b === null || b === undefined) return false;
        const ta = new Date(a).getTime();
        const tb = new Date(b).getTime();
        return !Number.isNaN(ta) && !Number.isNaN(tb) && ta === tb;
      };
      let changed = false;
      const next: Record<string, string> = {};
      for (const id of ids) {
        if (!byId.has(id) || sameInstant(m[id], byId.get(id))) {
          changed = true;
        } else {
          next[id] = m[id];
        }
      }
      return changed ? next : m;
    });
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events
      .filter((e) => {
        const post = e.post;
        const networkOk =
          filters.networks.length === 0 ||
          (post.networks ?? []).some((n) => filters.networks.includes(n));
        const statusOk =
          filters.statuses.length === 0 ||
          filters.statuses.includes(post.status);
        return networkOk && statusOk;
      })
      .map((e) => {
        const override = optimisticAt[e.post.id];
        if (override === undefined) return e;
        const start = new Date(override);
        if (Number.isNaN(start.getTime())) return e;
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        return {
          ...e,
          start,
          end,
          post: { ...e.post, scheduledAt: override },
        };
      });
  }, [events, filters, optimisticAt]);

  const hasChannels = accounts.length > 0;
  const hasAnyPosts = events.length > 0;

  // Bucket every post (incl. unscheduled DRAFTs the calendar can't place) into its
  // status lane for the board.
  const postsByStatus = useMemo(() => {
    const lanes: Record<SocialPost['status'], SocialPost[]> = {
      DRAFT: [],
      SCHEDULED: [],
      PUBLISHING: [],
      POSTED: [],
      FAILED: [],
    };
    for (const p of posts) {
      if (lanes[p.status] !== undefined) lanes[p.status].push(p);
    }
    return lanes;
  }, [posts]);

  // Retry from a board card — reuses the same lifecycle action the drawer uses,
  // tracking the in-flight id so only that card's button spins.
  const handleBoardRetry = useCallback(
    (post: SocialPost) => {
      setRetryingId(post.id);
      void handleRetry(post).finally(() => setRetryingId(null));
    },
    // handleRetry is a stable useCallback defined below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleSelectEvent = (event: SocialCalendarEvent) => {
    setSelectedPost(event.post);
  };

  const openCompose = () => setComposer({ kind: 'create' });

  const handleSelectSlot = (slotStart: Date) => {
    setComposer({
      kind: 'create',
      prefillScheduledLocal: slotToScheduleLocal(slotStart),
    });
  };

  const handleEditFromDrawer = (post: SocialPost) => {
    setSelectedPost(null);
    setComposer({ kind: 'edit', post });
  };

  const handleSaved = () => {
    setComposer(null);
    reload();
  };

  const handleReschedule = useCallback(
    (event: SocialCalendarEvent, newStart: Date) => {
      const post = event.post;
      const newIso = newStart.toISOString();
      setOptimisticAt((m) => ({ ...m, [post.id]: newIso }));
      void reschedulePost(post, newIso).then((outcome) => {
        if (outcome.ok) {
          reload();
        } else {
          setOptimisticAt((m) => {
            const next = { ...m };
            delete next[post.id];
            return next;
          });
          showToast('error', outcome.operatorAction ?? outcome.message);
        }
      });
    },
    [reload, showToast],
  );

  const handleDrawerReschedule = useCallback(
    async (post: SocialPost, newIso: string) => {
      const outcome = await reschedulePost(post, newIso);
      if (outcome.ok) {
        setSelectedPost(null);
        reload();
        showToast('success', 'Post rescheduled.');
      } else {
        showToast('error', outcome.operatorAction ?? outcome.message);
      }
      return outcome;
    },
    [reload, showToast],
  );

  const handlePublishNow = useCallback(
    async (post: SocialPost) => {
      const outcome = await publishNow(post);
      if (outcome.ok) {
        setSelectedPost(null);
        reload();
        showToast('success', 'Queued — the next publish run will post this.');
      } else {
        showToast('error', outcome.operatorAction ?? outcome.message);
      }
      return outcome;
    },
    [reload, showToast],
  );

  const handleDelete = useCallback(
    async (post: SocialPost): Promise<DeleteOutcome> => {
      const outcome = await deletePost(post.id);
      if (outcome.ok) {
        setSelectedPost(null);
        reload();
        showToast('success', 'Post deleted.');
      } else {
        showToast('error', outcome.operatorAction ?? outcome.message);
      }
      return outcome;
    },
    [reload, showToast],
  );

  const handleRetry = useCallback(
    async (post: SocialPost): Promise<RetryOutcome> => {
      const outcome = await retryPost(post.id);
      if (outcome.ok) {
        setSelectedPost(null);
        reload();
        showToast(
          'success',
          outcome.status === 'SCHEDULED'
            ? 'Retrying — queued for the next publish run.'
            : 'Moved back to draft — re-schedule when you’re ready.',
        );
      } else {
        showToast('error', outcome.operatorAction ?? outcome.message);
      }
      return outcome;
    },
    [reload, showToast],
  );

  const handleDuplicate = useCallback((post: SocialPost) => {
    setSelectedPost(null);
    setComposer({ kind: 'duplicate', source: post });
  }, []);

  // The board — status columns over the SAME posts the calendar plots, so a DRAFT
  // with no date (invisible to the calendar) still shows. Card click opens the
  // existing PostDetailDrawer (all per-post actions); FAILED gets inline Retry.
  const renderBoard = () => (
    <KanbanBoard cols={{ base: 1, sm: 2, lg: 5 }}>
      {ALL_STATUSES.map((status) => {
        const lanePosts = postsByStatus[status];
        const meta = STATUS_META[status];
        const empty = STATUS_EMPTY[status];
        return (
          <KanbanColumn
            key={status}
            title={meta.label}
            count={lanePosts.length}
            icon={
              <meta.Icon size={15} style={{ color: 'var(--mantine-color-dimmed)' }} />
            }
            empty={
              <InvitingEmpty compact title={empty.title} message={empty.message} />
            }
          >
            {lanePosts.map((post) => (
              <SocialPostCard
                key={post.id}
                post={post}
                onOpen={() => setSelectedPost(post)}
                onRetry={() => handleBoardRetry(post)}
                retrying={retryingId === post.id}
              />
            ))}
          </KanbanColumn>
        );
      })}
    </KanbanBoard>
  );

  const renderBody = () => {
    if (isLoading && payload === null) {
      return <CalendarLoading />;
    }
    if (isError && loaded) {
      return <CalendarError onRetry={reload} />;
    }
    if (loaded && !hasChannels) {
      return <CalendarEmptyNoChannels connectUrl={payload?.connectUrl} />;
    }
    if (layout === 'board') {
      return renderBoard();
    }
    return (
      <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
        <CalendarFilters filters={filters} onChange={setFilters} />
        <Box style={{ flex: 1, minHeight: 480 }}>
          <SocialCalendar
            events={filteredEvents}
            view={view}
            date={date}
            onView={setView}
            onNavigate={setDate}
            onSelectEvent={handleSelectEvent}
            onSelectSlot={handleSelectSlot}
            onCompose={openCompose}
            onReschedule={handleReschedule}
            hasAnyPosts={hasAnyPosts}
          />
        </Box>
      </Stack>
    );
  };

  return (
    <>
      <Box
        style={{
          padding: '12px 16px 24px',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        }}
      >
        <SurfaceIntro
          eyebrow="The social desk"
          title="Every post, benched by stage — draft to posted, at a glance."
          icon={<IconSparkles size={20} />}
          actions={
            <>
              <SegmentedControl
                size="xs"
                value={layout}
                onChange={(v) => setLayout(v as 'board' | 'calendar')}
                data={[
                  {
                    value: 'board',
                    label: (
                      <Group gap={6} wrap="nowrap">
                        <IconLayoutKanban size={14} />
                        <Text size="xs">Board</Text>
                      </Group>
                    ),
                  },
                  {
                    value: 'calendar',
                    label: (
                      <Group gap={6} wrap="nowrap">
                        <IconCalendar size={14} />
                        <Text size="xs">Calendar</Text>
                      </Group>
                    ),
                  },
                ]}
              />
              <Button
                size="xs"
                variant="light"
                color="grape"
                leftSection={<IconSparkles size={14} />}
                onClick={() => setCampaignOpen(true)}
              >
                Create campaign
              </Button>
              <Button
                size="xs"
                color="red"
                leftSection={<IconPlus size={14} />}
                onClick={openCompose}
                disabled={!hasChannels}
              >
                Compose
              </Button>
            </>
          }
        />
        {renderBody()}
      </Box>

      <PostDetailDrawer
        post={selectedPost}
        listings={listings}
        connectUrl={connectUrl}
        onClose={() => setSelectedPost(null)}
        onEdit={handleEditFromDrawer}
        onReschedule={handleDrawerReschedule}
        onPublishNow={handlePublishNow}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onRetry={handleRetry}
      />

      <PostComposer
        open={composer}
        connectedNetworks={connectedNetworks}
        listings={listings}
        onClose={() => setComposer(null)}
        onSaved={handleSaved}
      />

      <CalendarToast toast={toast} onDismiss={() => setToast(null)} />

      <SocialCampaignPanel
        opened={campaignOpen}
        onClose={() => setCampaignOpen(false)}
        onPlanCreated={(planId) => {
          setCampaignOpen(false);
          setReviewPlanId(planId);
        }}
      />

      <PlanReviewPanel
        planId={reviewPlanId}
        onClose={() => setReviewPlanId(null)}
        onApproved={() => {
          setReviewPlanId(null);
          reload();
        }}
      />
    </>
  );
};
