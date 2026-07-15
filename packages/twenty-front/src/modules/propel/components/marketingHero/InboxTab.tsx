import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconInbox, IconRefresh, IconSearch, IconX } from 'twenty-ui/display';
import {
  type ConversationStatusTab,
  type InboxChannel,
  type InboxPayload,
  type InboxStatusAction,
  type InboxThreadRow as InboxThreadRowData,
} from '@/propel/types/inbox';
import {
  type ViewerContext,
  bulkSetInboxStatus,
  fetchInbox,
  fetchViewerContext,
} from '@/propel/lib/inboxApi';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { tabForStatus } from '@/propel/lib/inboxStatusCore';
import { effectiveNeedsTriage } from '@/propel/lib/inboxTriage';
import { channelLabel } from '@/propel/components/marketingHero/inbox/InboxBits';
import { InboxThreadRow } from '@/propel/components/marketingHero/inbox/InboxThreadRow';
import { InboxThreadPane } from '@/propel/components/marketingHero/inbox/InboxThreadPane';

// Inbox tab of the unified Marketing hero — a Mantine rebuild of the legacy
// app-sandbox InboxView (propel-crm-integration src/shared/marketing-cloud-inbox.tsx).
// It unions FB/IG comment + DM threads with WhatsApp threads over the SAME, UNCHANGED
// logic-function routes (/marketing/inbox, /marketing/inbox-thread, /marketing/inbox-
// reply, /marketing/inbox-ai, /marketing/inbox/save-media), rendering a two-pane
// list + conversation view with the same real-time/media discipline (optimistic send
// + poll-reconcile, inbound media render, save-on-demand, channel-routed reply).
//
// Channel filters appear only for networks with a connected account (presence) —
// never a WhatsApp filter with no line paired. An empty thread list → a quiet empty
// state, never a zero-row table.

// List poll cadence — a touch slower than the open-thread body poll (the list is
// cheaper to be slightly stale than the conversation you're reading).
const INBOX_LIST_POLL_MS = 8000;

// The two-pane list+conversation layout needs a definite height so each pane
// scrolls independently. The Tabs.Panel above is in a flex column but doesn't pass
// a resolved height down, so anchor to the viewport minus the chrome above the tab
// body (top bar + page header + tab strip ≈ 168px). overflow stays inside the panes.
const INBOX_HEIGHT = 'calc(100vh - 168px)';

export const InboxTab = () => {
  const notify = usePropelToast();
  const [payload, setPayload] = useState<InboxPayload | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filter, setFilter] = useState<'all' | InboxChannel>('all');
  // Lead Engine S1 / #62 — triage segmentation for MANAGER/ADMIN (who see the whole
  // intake pool): 'needs' = unowned + wants-a-human; 'mine' = assigned to me; 'all' =
  // everything. The viewer's own member id comes from the route payload
  // (viewerWorkspaceMemberId). An AGENT's list is already owner-scoped server-side,
  // so the segment is hidden for agents (every row is already theirs).
  const [triage, setTriage] = useState<'all' | 'needs' | 'mine'>('all');
  // TM#92 — Open / Snoozed / Done tab over the thread list (default Open, the live
  // queue). Snoozed = SNOOZED (future wake); Done = RESOLVED; an overdue snooze
  // renders under Open (tabForStatus handles the belt-and-braces).
  const [statusTab, setStatusTab] = useState<ConversationStatusTab>('OPEN');
  // Optimistic status overrides keyed `${channel}:${id}` — a Done/Snooze/Reopen
  // moves the row to its new tab instantly; reconciled (dropped) on the next load
  // once the server row matches.
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, { status: string; snoozeUntil: string | null }>
  >({});
  const [search, setSearch] = useState('');
  // Acting-viewer identity for canned-reply merge tags + the quick-reply manager's
  // owner gate. Fetched once (in-hero GraphQL, not the bundled auth atoms); blanks
  // until it resolves (merge tags then stay literal, per contract).
  const [viewer, setViewer] = useState<ViewerContext>({
    memberId: '',
    agentName: '',
    officeName: '',
  });
  const [selected, setSelected] = useState<{
    id: string;
    channel: InboxChannel;
  } | null>(null);
  // Inbox cleanup — bulk selection, keyed "channel:id". Cleared when the view changes.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const selKey = (t: { channel: InboxChannel; id: string }) => `${t.channel}:${t.id}`;
  const toggleSelected = useCallback((t: { channel: InboxChannel; id: string }) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const k = `${t.channel}:${t.id}`;
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  // Bumped on each successful (re)load so the open thread pane re-fetches its body
  // in lockstep with the list — not just the list rows.
  const [reloadToken, setReloadToken] = useState(0);
  const listInFlightRef = useRef(false);

  // Clear the bulk selection whenever the view changes underneath it (a different
  // status tab, triage segment, or search means the selected rows may no longer be
  // visible together).
  useEffect(() => {
    clearSelection();
  }, [statusTab, triage, filter, search, clearSelection]);

  // `silent` skips the full loading flip — used by the background poll + manual
  // refresh so the list updates in place. The first mount + error-retry show the
  // initial loading state.
  const load = useCallback((silent = false) => {
    if (!silent) setPhase('loading');
    listInFlightRef.current = true;
    fetchInbox()
      .then((res) => {
        if (!res || !res.tier) {
          if (!silent) setPhase('error');
          return;
        }
        setPayload(res);
        setReloadToken((v) => v + 1);
        // Reconcile optimistic status overrides the server now reflects.
        setStatusOverrides((prev) => {
          if (Object.keys(prev).length === 0) return prev;
          const next = { ...prev };
          let changed = false;
          for (const t of res.threads) {
            const k = `${t.channel}:${t.id}`;
            const ov = next[k];
            if (
              ov &&
              ov.status === t.status &&
              (ov.snoozeUntil ?? null) === (t.snoozeUntil ?? null)
            ) {
              delete next[k];
              changed = true;
            }
          }
          return changed ? next : prev;
        });
        setPhase('ready');
      })
      .catch(() => {
        if (!silent) setPhase('error');
      })
      .finally(() => {
        listInFlightRef.current = false;
      });
  }, []);
  useEffect(() => load(), [load]);

  // Resolve the acting viewer's name + office once for canned-reply merge tags.
  useEffect(() => {
    let alive = true;
    fetchViewerContext()
      .then((v) => {
        if (alive) setViewer(v);
      })
      .catch(() => {
        /* blanks are fine — tags stay literal */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Live updates: poll the thread LIST silently (paused while the tab is hidden or a
  // fetch is already in flight), and re-pull on re-show. Bumping reloadToken also
  // re-fetches the open thread body in lockstep.
  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (listInFlightRef.current) return;
      load(true);
    };
    const timer = setInterval(tick, INBOX_LIST_POLL_MS);
    const onVis = () => {
      if (
        typeof document !== 'undefined' &&
        !document.hidden &&
        !listInFlightRef.current
      )
        load(true);
    };
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  // Push an optimistic status/snoozeUntil for a thread (called by the thread pane
  // when a Done/Snooze/Reopen action fires) so its row jumps to the new tab at once.
  const applyStatusOverride = useCallback(
    (
      id: string,
      channel: InboxChannel,
      status: string,
      snoozeUntil: string | null,
    ) => {
      setStatusOverrides((prev) => ({
        ...prev,
        [`${channel}:${id}`]: { status, snoozeUntil },
      }));
    },
    [],
  );

  // The tab a thread currently belongs to, honoring any optimistic override.
  const effectiveTab = useCallback(
    (t: InboxThreadRowData, now: number): ConversationStatusTab => {
      const ov = statusOverrides[`${t.channel}:${t.id}`];
      const status = ov?.status ?? t.status;
      const snoozeUntil = ov ? ov.snoozeUntil : t.snoozeUntil;
      return tabForStatus(status, snoozeUntil, now);
    },
    [statusOverrides],
  );

  const channelChips = useMemo(() => {
    if (!payload) return [] as { id: 'all' | InboxChannel; label: string }[];
    const chips: { id: 'all' | InboxChannel; label: string }[] = [
      { id: 'all', label: 'All' },
    ];
    if (payload.presence.facebook)
      chips.push({ id: 'FACEBOOK', label: channelLabel('FACEBOOK') });
    if (payload.presence.instagram)
      chips.push({ id: 'INSTAGRAM', label: channelLabel('INSTAGRAM') });
    if (payload.presence.whatsapp)
      chips.push({ id: 'WHATSAPP', label: channelLabel('WHATSAPP') });
    return chips;
  }, [payload]);

  // The viewer's own member id — drives the "Mine" segment. Absent on an older route
  // response (then "Mine" simply matches nothing, and the segment is hidden anyway
  // for the non-manager case).
  const viewerMemberId = payload?.viewerWorkspaceMemberId ?? '';

  // Count of threads that want a human (unowned + real-intent/unclassified) — the
  // "Needs triage" segment size, shown as a badge on the chip. Uses the EFFECTIVE
  // needs-triage so the fork-derived FB/IG classification is reflected.
  const needsCount = useMemo(
    () => (payload?.threads ?? []).filter((t) => effectiveNeedsTriage(t)).length,
    [payload],
  );

  // Count of threads assigned to the current viewer — the "Mine" segment badge.
  const mineCount = useMemo(
    () =>
      viewerMemberId
        ? (payload?.threads ?? []).filter(
            (t) => t.assignedAgentId === viewerMemberId,
          ).length
        : 0,
    [payload, viewerMemberId],
  );

  // Per-tab counts (Open / Snoozed / Done) over the whole pool, honoring overrides —
  // shown as small badges on the tab strip so an agent sees the queue depth.
  const statusCounts = useMemo(() => {
    const now = Date.now();
    const counts: Record<ConversationStatusTab, number> = {
      OPEN: 0,
      SNOOZED: 0,
      DONE: 0,
      ARCHIVED: 0,
    };
    for (const t of payload?.threads ?? []) counts[effectiveTab(t, now)] += 1;
    return counts;
  }, [payload, effectiveTab]);

  const shown = useMemo(() => {
    const now = Date.now();
    const all = payload?.threads ?? [];
    // Status tab first — every list below is scoped to the active Open/Snoozed/Done.
    const byStatus = all.filter((t) => effectiveTab(t, now) === statusTab);
    const byTriage =
      triage === 'needs'
        ? byStatus.filter((t) => effectiveNeedsTriage(t))
        : triage === 'mine'
          ? byStatus.filter((t) => t.assignedAgentId === viewerMemberId)
          : byStatus;
    const byChannel =
      filter === 'all'
        ? byTriage
        : byTriage.filter((t) => t.channel === filter);
    const q = search.trim().toLowerCase();
    if (!q) return byChannel;
    // Client-side search over the contact name + last-message preview — the only
    // text the list payload carries. Substring, case-insensitive.
    return byChannel.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.contactName.toLowerCase().includes(q) ||
        t.preview.toLowerCase().includes(q),
    );
  }, [payload, filter, triage, search, viewerMemberId, statusTab, effectiveTab]);

  // The likely-junk rows in the CURRENT view (Tidy up acts on the view).
  const junkInView = useMemo(() => shown.filter((t) => t.likelyJunk), [shown]);

  // Tidy up: pre-tick every likely-junk row in view. Nothing is mutated yet.
  const tidyUp = useCallback(() => {
    setSelectedIds(new Set(junkInView.map((t) => `${t.channel}:${t.id}`)));
  }, [junkInView]);

  // Run one action over the current selection: optimistically move the rows, call
  // the bulk route, then revert anything that didn't actually succeed (a network
  // error, or a per-item skip/fail) before reloading + reconciling. The reconcile
  // loop in `load` only drops an override once the server row MATCHES it, so a
  // skipped/failed row left overridden would stay wrongly moved forever.
  const runBulk = useCallback(
    async (action: InboxStatusAction, snoozeUntil?: string) => {
      const targets = (payload?.threads ?? []).filter((t) =>
        selectedIds.has(`${t.channel}:${t.id}`),
      );
      if (targets.length === 0) return;
      const items = targets.map((t) => ({ id: t.id, channel: t.channel }));
      // Snapshot each item's CURRENT status/snoozeUntil (keyed `channel:id`) before
      // applying the optimistic override, so a not-succeeded item can be reverted.
      const prior = new Map<
        string,
        { status: string; snoozeUntil: string | null }
      >();
      for (const t of targets)
        prior.set(`${t.channel}:${t.id}`, {
          status: t.status,
          snoozeUntil: t.snoozeUntil,
        });

      setBulkBusy(true);
      const status =
        action === 'archive'
          ? 'ARCHIVED'
          : action === 'done'
            ? 'RESOLVED'
            : action === 'reopen'
              ? 'OPEN'
              : 'SNOOZED';
      for (const it of items)
        applyStatusOverride(it.id, it.channel, status, snoozeUntil ?? null);

      try {
        const res = await bulkSetInboxStatus({ items, action, snoozeUntil }).catch(
          () => null,
        );

        const revert = (id: string, channel: InboxChannel) => {
          const p = prior.get(`${channel}:${id}`);
          if (p) applyStatusOverride(id, channel, p.status, p.snoozeUntil);
        };

        if (!res) {
          // Transport/network failure — nothing on the server changed for any item.
          for (const it of items) revert(it.id, it.channel);
          notify(
            "Couldn't update those conversations. Nothing was changed.",
            'error',
          );
        } else {
          const notSucceeded = [...(res.skipped ?? []), ...(res.failed ?? [])];
          if (notSucceeded.length > 0) {
            for (const x of notSucceeded) {
              const target = items.find((it) => it.id === x.id);
              if (target) revert(target.id, target.channel);
            }
            const doneCount = res.counts?.done ?? items.length - notSucceeded.length;
            notify(`Updated ${doneCount}, skipped ${notSucceeded.length}.`, 'warning');
          }
        }
      } finally {
        setBulkBusy(false);
        clearSelection();
        load(true);
      }
    },
    [payload, selectedIds, applyStatusOverride, clearSelection, load, notify],
  );

  if (phase === 'loading') {
    return (
      <Center mih={320}>
        <Loader color="red" />
      </Center>
    );
  }
  if (phase === 'error' || !payload) {
    return (
      <Center mih={320}>
        <Stack align="center" gap="sm">
          <Text size="sm" c="dimmed">
            Couldn’t load the Inbox.
          </Text>
          <Button variant="default" onClick={() => load()}>
            Try again
          </Button>
        </Stack>
      </Center>
    );
  }

  const noPresence =
    !payload.presence.facebook &&
    !payload.presence.instagram &&
    !payload.presence.whatsapp;

  if (payload.threads.length === 0) {
    return (
      <Center mih={360} p="xl">
        <Stack align="center" gap="sm" maw={440}>
          <Box
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--mantine-color-red-light)',
              color: 'var(--mantine-color-red-7)',
            }}
          >
            <IconInbox size={26} />
          </Box>
          <Title order={4}>No conversations yet</Title>
          <Text size="sm" c="dimmed" ta="center">
            {noPresence
              ? 'Connect a Facebook or Instagram page (and a WhatsApp line) to start collecting comments and messages here.'
              : 'When someone comments on your posts or messages you, the thread shows up here automatically.'}
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Box style={{ height: INBOX_HEIGHT, display: 'flex', minHeight: 360 }}>
      {/* thread list */}
      <Box
        w={340}
        style={{
          flex: 'none',
          borderRight: '1px solid var(--mantine-color-default-border)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <Box p="sm" style={{ flex: 'none' }}>
          <Group gap={8} align="center" mb="xs">
            <Title order={5}>Inbox</Title>
            {payload.totalUnread > 0 ? (
              <Badge size="sm" color="red" variant="filled">
                {payload.totalUnread} unread
              </Badge>
            ) : null}
            <ActionIcon
              variant="subtle"
              color="gray"
              ml="auto"
              onClick={() => load(true)}
              aria-label="Refresh inbox"
              title="Refresh"
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Group>
          {/* TM#92 — Open / Snoozed / Done status tabs over the whole list. */}
          <SegmentedControl
            fullWidth
            size="xs"
            mb="xs"
            color="red"
            value={statusTab}
            onChange={(v) => setStatusTab(v as ConversationStatusTab)}
            data={[
              {
                value: 'OPEN',
                label: `Open${statusCounts.OPEN ? ` (${statusCounts.OPEN})` : ''}`,
              },
              {
                value: 'SNOOZED',
                label: `Snoozed${statusCounts.SNOOZED ? ` (${statusCounts.SNOOZED})` : ''}`,
              },
              {
                value: 'DONE',
                label: `Done${statusCounts.DONE ? ` (${statusCounts.DONE})` : ''}`,
              },
              {
                value: 'ARCHIVED',
                label: `Archived${statusCounts.ARCHIVED ? ` (${statusCounts.ARCHIVED})` : ''}`,
              },
            ]}
          />
          <TextInput
            size="xs"
            mb="xs"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="Search conversations…"
            leftSection={<IconSearch size={14} />}
            aria-label="Search conversations"
          />
          {/* Triage segmentation (MANAGER/ADMIN only — agents already see only their
              own threads). Needs-triage = the unowned pool that wants a human; Mine =
              threads assigned to me; All = the whole pool. */}
          {payload.viewerRole === 'MANAGER' ||
          payload.viewerRole === 'ADMIN' ? (
            <Group gap={6} mb={6} style={{ flexWrap: 'wrap' }}>
              <Button
                size="compact-xs"
                radius="xl"
                variant={triage === 'needs' ? 'filled' : 'default'}
                color="red"
                rightSection={
                  needsCount > 0 ? (
                    <Badge
                      size="xs"
                      circle
                      variant={triage === 'needs' ? 'white' : 'filled'}
                      color="red"
                    >
                      {needsCount}
                    </Badge>
                  ) : undefined
                }
                onClick={() => setTriage('needs')}
              >
                Needs triage
              </Button>
              {/* "Mine" — only when the route reported the viewer's member id. */}
              {viewerMemberId ? (
                <Button
                  size="compact-xs"
                  radius="xl"
                  variant={triage === 'mine' ? 'filled' : 'default'}
                  color="red"
                  rightSection={
                    mineCount > 0 ? (
                      <Badge
                        size="xs"
                        circle
                        variant={triage === 'mine' ? 'white' : 'filled'}
                        color="red"
                      >
                        {mineCount}
                      </Badge>
                    ) : undefined
                  }
                  onClick={() => setTriage('mine')}
                >
                  Mine
                </Button>
              ) : null}
              <Button
                size="compact-xs"
                radius="xl"
                variant={triage === 'all' ? 'filled' : 'default'}
                color="red"
                onClick={() => setTriage('all')}
              >
                All
              </Button>
            </Group>
          ) : null}
          <Group gap={6} style={{ flexWrap: 'wrap' }}>
            {channelChips.map((ch) => (
              <Button
                key={ch.id}
                size="compact-xs"
                radius="xl"
                variant={filter === ch.id ? 'filled' : 'default'}
                color="red"
                onClick={() => {
                  setFilter(ch.id);
                  // drop the open thread if the new filter hides it
                  if (ch.id !== 'all' && selected && selected.channel !== ch.id)
                    setSelected(null);
                }}
              >
                {ch.label}
              </Button>
            ))}
          </Group>
        </Box>
        {selectedIds.size > 0 ? (
          <Group
            gap={6}
            p="xs"
            mb="xs"
            style={{
              background: 'var(--mantine-color-red-light)',
              borderRadius: 8,
              flex: 'none',
            }}
          >
            <Text size="xs" fw={500} c="red">
              {selectedIds.size} selected
            </Text>
            <Button
              size="compact-xs"
              variant="default"
              ml="auto"
              loading={bulkBusy}
              onClick={() =>
                runBulk(statusTab === 'ARCHIVED' ? 'reopen' : 'archive')
              }
            >
              {statusTab === 'ARCHIVED' ? 'Reopen' : 'Archive'}
            </Button>
            <Button
              size="compact-xs"
              variant="default"
              loading={bulkBusy}
              onClick={() => runBulk('done')}
            >
              Done
            </Button>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label="Clear selection"
              onClick={clearSelection}
            >
              <IconX size={14} />
            </ActionIcon>
          </Group>
        ) : null}
        <Box style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {shown.length === 0 ? (
            <Text size="sm" c="dimmed" p="md">
              {search.trim()
                ? 'No conversations match your search.'
                : triage === 'mine'
                  ? 'No conversations assigned to you.'
                  : triage === 'needs'
                    ? 'Nothing needs triage right now.'
                    : statusTab === 'SNOOZED'
                      ? 'Nothing snoozed right now.'
                      : statusTab === 'DONE'
                        ? 'No resolved conversations yet.'
                        : statusTab === 'ARCHIVED'
                          ? 'Nothing archived.'
                          : 'No open conversations in this channel.'}
            </Text>
          ) : (
            (() => {
              const renderRow = (t: InboxThreadRowData) => (
                <InboxThreadRow
                  key={`${t.channel}-${t.id}`}
                  row={t}
                  active={selected?.id === t.id}
                  onClick={() => setSelected({ id: t.id, channel: t.channel })}
                  selected={selectedIds.has(selKey(t))}
                  onToggleSelect={() => toggleSelected(t)}
                />
              );
              const isOpenTab = statusTab === 'OPEN';
              const real = isOpenTab ? shown.filter((t) => !t.likelyJunk) : shown;
              const junk = isOpenTab ? shown.filter((t) => t.likelyJunk) : [];
              return (
                <>
                  {real.map(renderRow)}
                  {junk.length > 0 ? (
                    <>
                      <Group
                        gap={8}
                        px="sm"
                        py={6}
                        style={{ background: 'var(--mantine-color-default-hover)' }}
                      >
                        <Text size="xs" c="dimmed">
                          Low-priority chatter ({junk.length})
                        </Text>
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="red"
                          ml="auto"
                          onClick={tidyUp}
                        >
                          Tidy up
                        </Button>
                      </Group>
                      {junk.map(renderRow)}
                    </>
                  ) : null}
                </>
              );
            })()
          )}
        </Box>
      </Box>

      {/* thread pane */}
      {selected ? (
        <InboxThreadPane
          key={`${selected.channel}-${selected.id}`}
          id={selected.id}
          channel={selected.channel}
          reloadToken={reloadToken}
          row={
            payload.threads.find(
              (t) => t.id === selected.id && t.channel === selected.channel,
            ) ?? null
          }
          viewerRole={payload.viewerRole ?? 'AGENT'}
          actingMemberId={viewer.memberId || viewerMemberId}
          agentName={viewer.agentName}
          officeName={viewer.officeName}
          onActed={() => load(true)}
          onStatusOptimistic={applyStatusOverride}
        />
      ) : (
        <Center style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" c="dimmed">
            Select a conversation to read it.
          </Text>
        </Center>
      )}
    </Box>
  );
};
