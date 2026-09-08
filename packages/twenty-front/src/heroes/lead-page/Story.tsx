// Story.tsx: one time-ordered story of everything that happened with this lead.
// Calls, notes and tasks render as quiet rows; WhatsApp collapses into folded
// "bursts" (consecutive messages under a 30-minute gap) so a hundred messages
// don't bury the two facts that matter. StoryComposer.tsx sits at the bottom and
// writes either a WhatsApp message or a note.
//
// Two data sources feed the merged list:
//   - `older` (state, seeded from `data.timeline` and paginated via "Load older")
//     carries NOTE/TASK/CALL rows, always.
//   - `thread` (fetched from the Inbox route) carries the real WhatsApp messages
//     when a conversation exists. While it does, the timeline's own WHATSAPP rows
//     are dropped from the merge (the thread is the richer source for the same
//     events); when it doesn't (no conversation yet, or the fetch failed), the
//     timeline's WHATSAPP rows are shown instead as plain quiet rows so the story
//     never goes silent about WhatsApp activity just because the live thread
//     couldn't be fetched.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconChevronDown } from 'twenty-ui/display';
import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import { fetchInboxThread } from '@/propel/lib/inboxApi';
import { reconcilePending, type PendingMessage } from '@/propel/lib/inboxThread';
import type { InboxMediaKind, InboxMessageRow, InboxThreadPayload } from '@/propel/types/inbox';
import { MessageBubble, type PendingRow } from '@/propel/components/marketingHero/inbox/MessageBubble';
import { Btn } from '../_pulse/pulse';
import { BurstRow, CallCard, DaySep, Pill, QuietRow, StoryList } from './styles';
import { loadLead } from './leadApi';
import { minutesWords, OUTCOME_WORDS } from './words';
import type { LeadLoad, LeadTimelineEvent } from './types';
import { StoryComposer } from './StoryComposer';

// InboxMediaKind's no-media value (src/modules/propel/types/inbox.ts:190-196).
const NO_MEDIA = 'NONE' as InboxMediaKind;
// Consecutive WhatsApp messages under this gap fold into one burst.
const BURST_GAP_MS = 30 * 60_000;

// A CALL event's title is built in lead-timeline.ts (a shared module this branch
// moved verbatim and must not re-edit here): the call direction, the word
// "call", then a separator and the lowercased disposition code. The code is
// `Call.disposition`, which is a SELECT of exactly ANSWERED / MISSED /
// VOICEMAIL / FAILED (call.object.ts) — single words, never underscored, and
// written only by the external voice-service, never by this repo.
//
// So this is defensive, not corrective, and the OUTCOME_WORDS lookup below is
// currently UNREACHABLE: OUTCOME_WORDS is keyed by `Task.disposition` values
// (NOT_INTERESTED, WRONG_NUMBER, …), which is a DIFFERENT field — the one this
// lane's saveOutcome writes — and the two vocabularies do not overlap at all.
// Do not read this function as evidence that a Call disposition can be
// underscored; it cannot. Its only live effect today is capitalising the
// suffix ("answered" -> "Answered"). It is kept so that a code this page does
// not know about (a disposition added to either field later, or a lane that
// starts writing Call.disposition) degrades to a spaced, capitalised phrase
// rather than putting a raw enum in front of an agent.
const humaniseCallTitle = (title: string): string => {
  const sep = title.lastIndexOf(' — '); // lead-timeline.ts's own separator
  if (sep === -1) return title;
  const base = title.slice(0, sep);
  const raw = title.slice(sep + 3);
  if (!raw) return base;
  const known = OUTCOME_WORDS[raw.toUpperCase()]?.label;
  if (known) return `${base} — ${known}`;
  const spaced = raw.replace(/_/g, ' ').toLowerCase();
  return `${base} — ${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
};

type StoryItem =
  | { at: number; kind: 'event'; e: LeadTimelineEvent }
  | { at: number; kind: 'burst'; id: string; msgs: InboxMessageRow[] };

const dayLabel = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const fileCount = (msgs: InboxMessageRow[]) => msgs.filter((m) => m.mediaKind !== 'NONE').length;

export const Story = ({
  host,
  data,
  reloadToken,
  onChanged,
}: {
  host: PropelHeroHost;
  data: LeadLoad;
  reloadToken: number;
  onChanged: () => void;
}) => {
  const [thread, setThread] = useState<InboxThreadPayload | null>(null);
  // Has the thread fetch below settled at least once (resolved OR failed OR
  // skipped because there's no conversation yet)? Gates the initial scroll; see
  // the useLayoutEffect below for why this matters.
  const [threadSettled, setThreadSettled] = useState(false);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [openBursts, setOpenBursts] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [older, setOlder] = useState<{ events: LeadTimelineEvent[]; nextCursor: string | null }>({
    events: data.timeline.events,
    nextCursor: data.timeline.nextCursor,
  });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrolledOnceRef = useRef(false);
  // Mirror of `pending`, read synchronously inside the thread-fetch effect below
  // (a plain closure over `pending` would see a stale snapshot from whenever the
  // effect was created, not the latest sends). Same pattern as InboxThreadPane.
  const pendingRef = useRef<PendingMessage[]>([]);
  // Server row ids already matched to a pending temp, so the same real message
  // can never reconcile a second temp. Mirrors InboxThreadPane's claimedRowIdsRef.
  const claimedRowIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const conversationId = data.wa.conversationId;

  // Fetch (or refresh) the live WhatsApp thread. A null/failed payload leaves
  // `thread` null: the merge below then falls back to the timeline's own
  // WHATSAPP rows and StoryComposer falls back to first-contact compose mode.
  //
  // Also reconciles optimistic `pending` temps against the fresh server rows
  // (shared `reconcilePending` helper; see the pushPending/markPendingSent
  // block below for why this is load-bearing, not cosmetic).
  useEffect(() => {
    let alive = true;
    if (!conversationId) {
      setThread(null);
      setThreadSettled(true);
      return;
    }
    fetchInboxThread(conversationId, 'WHATSAPP').then((r) => {
      if (!alive) return;
      const next = r && r.ok !== false ? r : null;
      setThread(next);
      setThreadSettled(true);
      if (next) {
        const result = reconcilePending(pendingRef.current, next.messages, claimedRowIdsRef.current);
        for (const rowId of result.newlyClaimed) claimedRowIdsRef.current.add(rowId);
        if (result.kept !== pendingRef.current) {
          pendingRef.current = result.kept;
          setPending(result.kept);
        }
      }
    });
    return () => {
      alive = false;
    };
  }, [conversationId, reloadToken]);

  // Re-seed the "older" pagination window from a fresh full-page load. Keyed on
  // reloadToken ONLY (not on `data` itself): index.tsx's 10-second call-outcome
  // poll updates `data` without bumping reloadToken, and resetting "Load older"
  // progress on every poll tick would silently discard history the agent already
  // paged back through.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setOlder({ events: data.timeline.events, nextCursor: data.timeline.nextCursor });
  }, [reloadToken]);

  // Optimistic-send wiring handed down to StoryComposer / InboxComposer. Mirrors
  // InboxThreadPane's contract exactly (and reuses its `reconcilePending`, above):
  // markPendingSent marks the bubble "sent" but KEEPS it on screen; it does NOT
  // remove it. The real row only arrives once onChanged()'s reload lands (two
  // serialised round trips: onSent -> onChanged -> /lead-page reload -> bumped
  // reloadToken -> thread refetch), and reconcilePending is what drops the temp,
  // only once that refetch actually contains the matching real message. Removing
  // the temp early (the previous bug here) makes a just-sent message vanish for
  // seconds, which is exactly what invites an agent to press send again, and a
  // duplicate WhatsApp to a real customer is the one outcome "never re-send a
  // queued message" exists to prevent.
  const pushPending = useCallback(
    (body: string, media?: { url: string; kind: InboxMediaKind } | null): string => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setPending((ts) => [
        ...ts,
        {
          id: tempId,
          body,
          at: Date.now(),
          failed: false,
          mediaUrl: media?.url ?? null,
          mediaKind: media?.kind ?? NO_MEDIA,
        },
      ]);
      return tempId;
    },
    [],
  );
  const markPendingFailed = useCallback(
    (tempId: string) => setPending((ts) => ts.map((t) => (t.id === tempId ? { ...t, failed: true } : t))),
    [],
  );
  const markPendingSent = useCallback(
    (tempId: string) => setPending((ts) => ts.map((t) => (t.id === tempId ? { ...t, sent: true } : t))),
    [],
  );
  // Render shape for MessageBubble (InboxMessageRow-ish), derived from the
  // lighter PendingMessage state; same mapping InboxThreadPane uses. `pending`
  // (the "Sending…" chrome) is true only before either outcome is known; a sent
  // (unreconciled) bubble renders as a normal sent bubble via whenLabel below.
  const pendingRows: PendingRow[] = pending.map((t) => ({
    id: t.id,
    direction: 'OUTBOUND' as const,
    body: t.body,
    authorName: 'You',
    whenLabel: t.sent ? 'Sent' : '',
    sentAtMs: t.at,
    mediaUrl: t.mediaUrl ?? null,
    mediaKind: t.mediaKind ?? NO_MEDIA,
    mediaPersisted: true,
    mediaExpiresAtMs: null,
    pending: !t.sent && !t.failed,
    failed: t.failed,
  }));

  const loadOlder = async () => {
    if (!older.nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    const r = await loadLead(host, data.person.id, older.nextCursor);
    setLoadingOlder(false);
    if (!r || r.ok === false) {
      host.notify('Could not load older history. Try again.', 'warning');
      return;
    }
    setOlder((cur) => {
      const seen = new Set(cur.events.map((e) => e.id));
      return {
        events: [...r.timeline.events.filter((e) => !seen.has(e.id)), ...cur.events],
        nextCursor: r.timeline.nextCursor,
      };
    });
  };

  // ── Build the merged, time-ordered story ────────────────────────────────────
  const events = older.events.filter((e) => e.type !== 'WHATSAPP' || !thread);
  const msgs = thread?.messages ?? [];
  const bursts: Extract<StoryItem, { kind: 'burst' }>[] = [];
  let cur: InboxMessageRow[] = [];
  for (const m of msgs) {
    if (cur.length && m.sentAtMs - cur[cur.length - 1].sentAtMs > BURST_GAP_MS) {
      bursts.push({ at: cur[0].sentAtMs, kind: 'burst', id: cur[0].id, msgs: cur });
      cur = [];
    }
    cur.push(m);
  }
  if (cur.length) bursts.push({ at: cur[0].sentAtMs, kind: 'burst', id: cur[0].id, msgs: cur });
  const items: StoryItem[] = [
    ...events.map((e) => ({ at: Date.parse(e.occurredAt), kind: 'event' as const, e })),
    ...bursts,
  ].sort((a, b) => a.at - b.at);
  const latestBurstId = bursts.length ? bursts[bursts.length - 1].id : null;

  // The most recent burst starts open, re-derived whenever the thread refreshes
  // (a genuinely new burst id gets added; an unchanged one is a no-op).
  useEffect(() => {
    if (!latestBurstId) return;
    setOpenBursts((prev) => (prev.has(latestBurstId) ? prev : new Set(prev).add(latestBurstId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread]);

  // First load: show the latest activity, not the oldest. A sentinel + scrollIntoView
  // (rather than driving scrollTop on a specific div) works regardless of which
  // ancestor actually owns the scrollbar: this page has no fixed-height chat pane
  // of its own; it flows inside the CRM shell's own scrollable region.
  //
  // Gated on `threadSettled`, not just "is there anything to show yet": `older`
  // (the NOTE/TASK/CALL events) is seeded SYNCHRONOUSLY from data.timeline, so for
  // any lead that already has a note, a task or a call, `items.length` is already
  // non-zero on the very first render, before the WhatsApp thread fetch above has
  // resolved. Latching the scroll then means any WhatsApp bursts that merge in
  // afterwards render below the already-scrolled position and this effect never
  // runs again, so the agent lands mid-page instead of at the newest activity.
  // Waiting for the thread fetch to settle (succeed, fail, or skip because there's
  // no conversation) means the merged `items` list is complete before we scroll,
  // on every lead, not only ones with an empty timeline.
  useLayoutEffect(() => {
    if (scrolledOnceRef.current) return;
    if (!threadSettled) return;
    if (items.length === 0 && pending.length === 0) return;
    bottomRef.current?.scrollIntoView({ block: 'end' });
    scrolledOnceRef.current = true;
  });

  const toggleShowAll = () => {
    setShowAll((v) => {
      const next = !v;
      // Folding is a hard reset: collapse every individually-opened burst back
      // down to just the latest one. Otherwise "Fold messages" would only hide
      // the ones that were never opened, which isn't what "fold" promises.
      if (!next) setOpenBursts(latestBurstId ? new Set([latestBurstId]) : new Set());
      return next;
    });
  };

  const nowMs = Date.now();
  const rows: JSX.Element[] = [];
  let lastDay: string | null = null;
  for (const item of items) {
    const day = dayLabel(item.at);
    if (day !== lastDay) {
      rows.push(<DaySep key={`day-${item.at}`}>{day}</DaySep>);
      lastDay = day;
    }
    if (item.kind === 'event') {
      const e = item.e;
      if (e.type === 'CALL') {
        rows.push(
          <CallCard key={`event-${e.id}`}>
            <div style={{ fontWeight: 600 }}>{`Call · ${minutesWords(e.durationSeconds)}`}</div>
            <div style={{ color: 'var(--p-ink-2)', marginTop: 2 }}>{humaniseCallTitle(e.title)}</div>
          </CallCard>,
        );
      } else {
        // TASK / NOTE, and a timeline-sourced WHATSAPP row when there's no live
        // thread to render it as a real bubble instead.
        rows.push(
          <QuietRow key={`event-${e.id}`}>
            <span>{hhmm(Date.parse(e.occurredAt))}</span>
            <span>
              {e.by ? <b>{e.by}: </b> : null}
              {e.title}
            </span>
          </QuietRow>,
        );
      }
      continue;
    }
    const open = showAll || openBursts.has(item.id);
    const files = fileCount(item.msgs);
    const first = hhmm(item.msgs[0].sentAtMs);
    const last = hhmm(item.msgs[item.msgs.length - 1].sentAtMs);
    // A real toggle (add AND remove), not add-only: an open burst must be
    // individually re-foldable, so the header below is pressable in both states.
    const toggleBurst = () =>
      setOpenBursts((s) => {
        const next = new Set(s);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
    rows.push(
      <div key={`burst-${item.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <BurstRow onClick={toggleBurst} aria-expanded={open}>
          <span>{`WhatsApp · ${item.msgs.length} messages${files ? `, ${files} files` : ''} · ${first} to ${last}`}</span>
          <IconChevronDown
            size={14}
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }}
          />
        </BurstRow>
        {open && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {item.msgs.map((m) => (
              <MessageBubble
                key={m.id}
                m={m}
                nowMs={nowMs}
                isSocial={false}
                saveBusy={false}
                saveError={null}
                onSaveMedia={() => {}}
              />
            ))}
          </div>
        )}
      </div>,
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <StoryList>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <Pill>{`${data.wa.lineLabel} · ${data.wa.lineNumber}`}</Pill>
          <Btn variant="ghost" onClick={toggleShowAll} style={{ minHeight: 44 }}>
            {showAll ? 'Fold messages' : 'Show all messages'}
          </Btn>
        </div>

        {older.nextCursor && (
          <Btn
            variant="ghost"
            disabled={loadingOlder}
            onClick={() => void loadOlder()}
            style={{ alignSelf: 'center', minHeight: 44 }}
          >
            {loadingOlder ? 'Loading…' : 'Load older'}
          </Btn>
        )}

        {items.length === 0 && pending.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--p-ink-2)' }}>
            Nothing here yet.
          </div>
        )}

        {rows}

        {pendingRows.map((p) => (
          <MessageBubble
            key={p.id}
            m={p}
            nowMs={nowMs}
            isSocial={false}
            saveBusy={false}
            saveError={null}
            onSaveMedia={() => {}}
          />
        ))}
        <div ref={bottomRef} />
      </StoryList>

      <StoryComposer
        host={host}
        data={data}
        thread={thread}
        pushPending={pushPending}
        markPendingFailed={markPendingFailed}
        markPendingSent={markPendingSent}
        onChanged={onChanged}
      />
    </div>
  );
};
