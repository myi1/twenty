import { Box, Button, Group, Stack } from '@mantine/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconPlus } from 'twenty-ui/display';
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
    listings,
    connectUrl,
    connectedNetworks,
    isLoading,
    loaded,
    isError,
    payload,
    reload,
  } = useSocialCalendarData();

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
        <Group gap="sm" wrap="nowrap" justify="flex-end" mb="md">
          <Button
            size="xs"
            color="red"
            leftSection={<IconPlus size={14} />}
            onClick={openCompose}
            disabled={!hasChannels}
          >
            Compose
          </Button>
        </Group>
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
    </>
  );
};
