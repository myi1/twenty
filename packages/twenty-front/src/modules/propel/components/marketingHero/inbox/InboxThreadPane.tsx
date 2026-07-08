import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Anchor, Box, Button, Group, Loader, Text } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { IconArrowDown, IconReload, IconUser } from 'twenty-ui-deprecated/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  type InboxChannel,
  type InboxMediaKind,
  type InboxThreadPayload,
  type InboxThreadRow,
  type InboxViewerRole,
} from '@/propel/types/inbox';
import {
  type PendingMessage,
  isNearBottom,
  latestInboundId,
  reconcilePending,
} from '@/propel/lib/inboxThread';
import { fetchInboxThread, saveInboxMedia } from '@/propel/lib/inboxApi';
import {
  ChannelBadge,
  SurfaceBadge,
  channelLabel,
  humanizeEnum,
} from '@/propel/components/marketingHero/inbox/InboxBits';
import {
  type PendingRow,
  MessageBubble,
} from '@/propel/components/marketingHero/inbox/MessageBubble';
import { InboxComposer } from '@/propel/components/marketingHero/inbox/InboxComposer';
import { InboxContextRail } from '@/propel/components/marketingHero/inbox/InboxContextRail';

// How often the open thread silently re-polls its body (paused while the tab is
// hidden). 6s is a chat-cadence without subscriptions (twenty-front has GraphQL
// subscriptions, but the inbox routes are REST logic-functions, so we poll).
const THREAD_POLL_MS = 6000;

export const InboxThreadPane = ({
  id,
  channel,
  reloadToken,
  row,
  viewerRole,
  onActed,
}: {
  id: string;
  channel: InboxChannel;
  reloadToken: number;
  // The enriched queue row for this thread (triage fields) — the rail's triage card
  // + actions read it; null when the row isn't in the current list slice.
  row: InboxThreadRow | null;
  viewerRole: InboxViewerRole;
  // Refresh the list after a triage action (assign/create-opp/ping) lands.
  onActed: () => void;
}) => {
  const navigate = useNavigate();
  const notify = usePropelToast();

  const [thread, setThread] = useState<InboxThreadPayload | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [localReload, setLocalReload] = useState(0);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  const curKey = useRef('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const stickRef = useRef(true);
  const historyLoadedRef = useRef(false);
  const lastInboundRef = useRef('');
  const seenIdsRef = useRef<Set<string>>(new Set());
  const claimedRowIdsRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<PendingMessage[]>([]);
  const inFlightRef = useRef(false);
  const reqSeqRef = useRef(0);

  // Imperative thread load. `reason` distinguishes a SWITCH (blank to skeleton,
  // reset per-thread state, always fetch) from a REFRESH (silent, in-place, skipped
  // while a fetch is already running so a slow request is never superseded).
  const loadThread = useCallback(
    (reason: 'switch' | 'refresh') => {
      const isSwitch = reason === 'switch';
      if (!isSwitch && inFlightRef.current) return;
      if (isSwitch) {
        setPhase('loading');
        setThread(null);
        setPending([]);
        pendingRef.current = [];
        setHasNewBelow(false);
        historyLoadedRef.current = false;
        lastInboundRef.current = '';
        nearBottomRef.current = true;
        stickRef.current = true;
        seenIdsRef.current = new Set();
        claimedRowIdsRef.current = new Set();
      }
      const seq = (reqSeqRef.current += 1);
      inFlightRef.current = true;
      fetchInboxThread(id, channel)
        .then((res) => {
          if (seq !== reqSeqRef.current) return; // superseded by a newer request
          if (!res || !res.ok) {
            if (isSwitch) setPhase('error');
            return;
          }
          const newest = latestInboundId(res.messages);
          const inboundChanged =
            newest !== '' && newest !== lastInboundRef.current;
          lastInboundRef.current = newest;
          if (isSwitch || nearBottomRef.current) {
            stickRef.current = true;
            setHasNewBelow(false);
          } else {
            stickRef.current = false;
            if (inboundChanged && historyLoadedRef.current)
              setHasNewBelow(true);
          }
          setThread(res);
          // Reconcile optimistic temps the server now reflects — run the PURE
          // matcher ONCE here against the live pendingRef mirror, then commit both
          // halves of its result.
          const r = reconcilePending(
            pendingRef.current,
            res.messages,
            claimedRowIdsRef.current,
          );
          for (const rowId of r.newlyClaimed)
            claimedRowIdsRef.current.add(rowId);
          if (r.kept !== pendingRef.current) {
            pendingRef.current = r.kept;
            setPending(r.kept);
          }
          setPhase('ready');
        })
        .catch(() => {
          if (seq === reqSeqRef.current && isSwitch) setPhase('error');
        })
        .finally(() => {
          if (seq === reqSeqRef.current) inFlightRef.current = false;
        });
    },
    [id, channel],
  );

  // Keep pendingRef a faithful mirror of `pending` after every commit.
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // Switch: fetch when the open thread changes (id/channel).
  useEffect(() => {
    const key = `${channel}:${id}`;
    if (curKey.current === key) return;
    curKey.current = key;
    loadThread('switch');
  }, [id, channel, loadThread]);

  // Refresh: a post-send reload (localReload) or an inbox-list bump (reloadToken)
  // silently re-pulls the body in place. Skip the very first run (the switch effect
  // already did the initial load).
  const didInitialRef = useRef(false);
  useEffect(() => {
    if (!didInitialRef.current) {
      didInitialRef.current = true;
      return;
    }
    loadThread('refresh');
  }, [reloadToken, localReload, loadThread]);

  // Live updates: poll the open thread body, paused while the tab is hidden,
  // re-pulling on re-show.
  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadThread('refresh');
    };
    const timer = setInterval(tick, THREAD_POLL_MS);
    const onVis = () => {
      if (typeof document !== 'undefined' && !document.hidden)
        loadThread('refresh');
    };
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', onVis);
    };
  }, [loadThread]);

  // After the first successful render, history is "seen" — later arrivals are new.
  useEffect(() => {
    if (phase === 'ready') historyLoadedRef.current = true;
  }, [phase]);

  // Tick `nowMs` once a minute so the FB/IG media expiry countdown stays live.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Re-host an UNSAVED FB/IG inbound attachment to B2 and attach it to the Person.
  const handleSaveMedia = useCallback(
    (messageId: string) => {
      if (savingId) return; // one save at a time; ignore double-clicks
      setSavingId(messageId);
      setSaveErrors((prev) => {
        if (!prev[messageId]) return prev;
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
      saveInboxMedia(messageId, channel)
        .then((res) => {
          if (res && res.ok) {
            setLocalReload((v) => v + 1); // reload → row flips to "Saved"
            return;
          }
          const reason =
            (res && (res.operatorAction || res.error)) ||
            'Couldn’t save this image. Try again.';
          setSaveErrors((prev) => ({ ...prev, [messageId]: reason }));
          notify(reason, 'error');
        })
        .catch(() => {
          const reason = 'Couldn’t save this image. Try again.';
          setSaveErrors((prev) => ({ ...prev, [messageId]: reason }));
          notify(reason, 'error');
        })
        .finally(() => setSavingId(null));
    },
    [savingId, channel, notify],
  );

  // Track near-bottom as the reader scrolls.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || typeof el.scrollHeight !== 'number') return;
    const near = isNearBottom(el);
    nearBottomRef.current = near;
    if (near && hasNewBelow) setHasNewBelow(false);
  }, [hasNewBelow]);

  // Pin to the bottom after layout when we decided to stick.
  const allCount = (thread?.messages.length ?? 0) + pending.length;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof el.scrollHeight !== 'number') return;
    if (stickRef.current) {
      try {
        el.scrollTop = el.scrollHeight;
      } catch {
        /* best-effort */
      }
    }
  }, [allCount, phase]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    stickRef.current = true;
    setHasNewBelow(false);
    if (el && typeof el.scrollHeight === 'number') {
      try {
        el.scrollTop = el.scrollHeight;
      } catch {
        /* best-effort */
      }
    }
  }, []);

  // Optimistic-send wiring handed to the composer.
  const pushPending = useCallback(
    (
      body: string,
      media?: { url: string; kind: InboxMediaKind } | null,
    ): string => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      stickRef.current = true;
      nearBottomRef.current = true;
      setPending((ts) => [
        ...ts,
        {
          id: tempId,
          body,
          at: Date.now(),
          failed: false,
          mediaUrl: media?.url ?? null,
          mediaKind: media?.kind ?? 'NONE',
        },
      ]);
      return tempId;
    },
    [],
  );
  const markPendingFailed = useCallback((tempId: string) => {
    setPending((ts) =>
      ts.map((t) => (t.id === tempId ? { ...t, failed: true } : t)),
    );
  }, []);
  const markPendingSent = useCallback((tempId: string) => {
    setPending((ts) =>
      ts.map((t) => (t.id === tempId ? { ...t, sent: true } : t)),
    );
  }, []);

  if (phase === 'loading') {
    return (
      <Box
        style={{ flex: 1, display: 'grid', placeItems: 'center', minWidth: 0 }}
      >
        <Loader color="red" />
      </Box>
    );
  }
  if (phase === 'error' || !thread) {
    return (
      <Box
        style={{ flex: 1, display: 'grid', placeItems: 'center', minWidth: 0 }}
      >
        <Text size="sm" c="dimmed">
          Couldn’t load this conversation.
        </Text>
      </Box>
    );
  }

  // Pending temps render as outbound bubbles after the server messages; once the
  // server reflects them they reconcile away.
  const pendingRows: PendingRow[] = pending.map((t) => ({
    id: t.id,
    direction: 'OUTBOUND' as const,
    body: t.body,
    authorName: '',
    whenLabel: t.sent ? 'Sent' : '',
    sentAtMs: t.at,
    mediaUrl: t.mediaUrl ?? null,
    mediaKind: t.mediaKind ?? ('NONE' as InboxMediaKind),
    mediaPersisted: true,
    mediaExpiresAtMs: null,
    pending: !t.sent && !t.failed,
    failed: t.failed,
  }));
  // Merge server messages with surviving pending temps in CHRONOLOGICAL order.
  const allRows: PendingRow[] = [...thread.messages, ...pendingRows].sort(
    (a, b) => (a.sentAtMs || 0) - (b.sentAtMs || 0),
  );

  // Update the seen-id set so a poll returning unchanged ids is a no-op.
  const seen = seenIdsRef.current;
  for (const m of allRows) seen.add(m.id);

  return (
    <Box style={{ flex: 1, display: 'flex', minWidth: 0 }}>
      {/* conversation column — header, messages, composer */}
      <Box
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          position: 'relative',
        }}
      >
        {/* thread header */}
        <Group
          gap={10}
          wrap="nowrap"
          px="md"
          py="sm"
          style={{
            flex: 'none',
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <ChannelBadge channel={thread.channel} />
          <Box style={{ minWidth: 0 }}>
            <Group gap={7} wrap="nowrap">
              <Text
                fw={700}
                size="sm"
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {thread.title}
              </Text>
              <SurfaceBadge channel={thread.channel} surface={thread.surface} />
            </Group>
            <Text size="xs" c="dimmed">
              {channelLabel(thread.channel)} · {humanizeEnum(thread.status)}
            </Text>
          </Box>
          {thread.personId ? (
            <Anchor
              component="button"
              type="button"
              onClick={() => navigate(`/object/person/${thread.personId}`)}
              ml="auto"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12.5,
                fontWeight: 600,
                flex: 'none',
              }}
            >
              <IconUser size={14} /> {thread.contactName || 'View contact'}
            </Anchor>
          ) : null}
        </Group>

        {/* messages region — relative so the "↓ new messages" pill anchors here */}
        <Box
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            minHeight: 0,
          }}
        >
          <Box
            ref={scrollRef}
            onScroll={onScroll}
            role="log"
            aria-live="polite"
            aria-label={`Conversation with ${thread.contactName || thread.title}`}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {allRows.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" mt={20}>
                No messages in this thread.
              </Text>
            ) : (
              allRows.map((m) => (
                <MessageBubble
                  key={m.id}
                  m={m}
                  nowMs={nowMs}
                  isSocial={channel !== 'WHATSAPP'}
                  saveBusy={savingId === m.id}
                  saveError={saveErrors[m.id] ?? null}
                  onSaveMedia={handleSaveMedia}
                />
              ))
            )}
          </Box>

          {hasNewBelow ? (
            <Button
              size="compact-sm"
              color="red"
              radius="xl"
              leftSection={<IconArrowDown size={13} />}
              onClick={scrollToBottom}
              aria-label="Jump to newest messages"
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 12,
                transform: 'translateX(-50%)',
                zIndex: 5,
              }}
            >
              New messages
            </Button>
          ) : null}
        </Box>

        {/* composer when the channel can actually send; otherwise the reason why */}
        {thread.canReply ? (
          <InboxComposer
            id={thread.id}
            channel={thread.channel}
            surface={thread.surface}
            onPending={pushPending}
            onPendingFailed={markPendingFailed}
            onPendingSent={markPendingSent}
            onSent={() => setLocalReload((v) => v + 1)}
          />
        ) : (
          <Box
            p="md"
            style={{
              flex: 'none',
              borderTop: '1px solid var(--mantine-color-default-border)',
            }}
          >
            <Group gap={7} wrap="nowrap">
              <IconReload size={14} color="var(--mantine-color-dimmed)" />
              <Text size="sm" c="dimmed">
                {thread.replyHint ||
                  'Replying isn’t available for this thread.'}
              </Text>
            </Group>
          </Box>
        )}
      </Box>

      <InboxContextRail
        thread={thread}
        row={row}
        viewerRole={viewerRole}
        onActed={onActed}
      />
    </Box>
  );
};
