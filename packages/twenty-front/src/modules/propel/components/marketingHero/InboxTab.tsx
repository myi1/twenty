import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconInbox, IconRefresh, IconSearch } from 'twenty-ui/display';
import { type InboxChannel, type InboxPayload } from '@/propel/types/inbox';
import { fetchInbox } from '@/propel/lib/inboxApi';
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
  const [payload, setPayload] = useState<InboxPayload | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filter, setFilter] = useState<'all' | InboxChannel>('all');
  // Lead Engine S1 — triage segmentation. 'needs' = unowned + wants-a-human (the
  // pool to work); 'all' = everything. (A "Mine" segment would need the viewer's
  // member id; an AGENT's list is already owner-scoped server-side, so Needs/All is
  // the clean, host-decoupled split. Shown only to MANAGER/ADMIN, who triage the
  // pool — an agent only sees their own threads, so the segment would be moot.)
  const [triage, setTriage] = useState<'all' | 'needs'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{
    id: string;
    channel: InboxChannel;
  } | null>(null);
  // Bumped on each successful (re)load so the open thread pane re-fetches its body
  // in lockstep with the list — not just the list rows.
  const [reloadToken, setReloadToken] = useState(0);
  const listInFlightRef = useRef(false);

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

  // Count of threads that want a human (unowned + real-intent/unclassified) — the
  // "Needs triage" segment size, shown as a badge on the chip.
  const needsCount = useMemo(
    () => (payload?.threads ?? []).filter((t) => t.needsTriage).length,
    [payload],
  );

  const shown = useMemo(() => {
    const all = payload?.threads ?? [];
    const byTriage =
      triage === 'needs' ? all.filter((t) => t.needsTriage) : all;
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
  }, [payload, filter, triage, search]);

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
          <TextInput
            size="xs"
            mb="xs"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="Search conversations…"
            leftSection={<IconSearch size={14} />}
            aria-label="Search conversations"
          />
          {/* Triage segmentation (MANAGER/ADMIN only — agents only see their own
              threads). Needs-triage = the unowned pool that wants a human. */}
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
        <Box style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {shown.length === 0 ? (
            <Text size="sm" c="dimmed" p="md">
              {search.trim()
                ? 'No conversations match your search.'
                : 'No conversations in this channel.'}
            </Text>
          ) : (
            shown.map((t) => (
              <InboxThreadRow
                key={`${t.channel}-${t.id}`}
                row={t}
                active={selected?.id === t.id}
                onClick={() => setSelected({ id: t.id, channel: t.channel })}
              />
            ))
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
          onActed={() => load(true)}
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
