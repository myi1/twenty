// Pure thread-view logic for the unified Inbox hero tab — ported from the legacy
// app-sandbox (propel-crm-integration src/shared/marketing-cloud-inbox-thread.ts),
// itself a port of chat-panel.tsx. The load-bearing DECISIONS (which media kind,
// are we near the bottom, has a reconciliation match arrived) live here as pure
// functions so the render/scroll wiring in the component stays thin and these can
// be reasoned about (and unit-tested) without a DOM, network, or React.

import {
  type InboxMediaKind,
  type InboxMessageRow,
} from '@/propel/types/inbox';

// ── Media kind normalization ────────────────────────────────────────────────
// The thread route surfaces `mediaKind` straight from the whatsAppMessage SELECT
// column. A row written before the column existed — or an FB/IG row — can carry an
// absent/blank/unknown value. Normalize defensively so the renderer only ever
// branches on the six known kinds.
const MEDIA_KINDS: readonly InboxMediaKind[] = [
  'IMAGE',
  'AUDIO',
  'VIDEO',
  'DOCUMENT',
  'STICKER',
];

export const normalizeMediaKind = (v: unknown): InboxMediaKind => {
  const s = typeof v === 'string' ? v.toUpperCase() : 'NONE';
  return (MEDIA_KINDS as readonly string[]).includes(s)
    ? (s as InboxMediaKind)
    : 'NONE';
};

// A message has renderable media only when BOTH a non-empty url and a non-NONE
// kind are present. (A kind without a url, or a url without a kind, renders as
// plain text — never a broken thumbnail.)
export const hasRenderableMedia = (
  m: Pick<InboxMessageRow, 'mediaUrl' | 'mediaKind'>,
): boolean => Boolean(m.mediaUrl) && m.mediaKind !== 'NONE';

// ── Save-on-demand expiry indicator ─────────────────────────────────────────
// FB/IG inbound media is a PERISHABLE Meta CDN link until the agent clicks "Save".
// While unsaved, the UI shows how long the link is expected to last, computed
// client-side from the row's parsed oe= expiry. Returns:
//   • null            → saved OR no expiry → caller shows a soft "Save to keep it".
//   • { expired: true } → past expiry (Save will likely 404).
//   • { label }       → a coarse human countdown ("Expires in 23h", "in 4m").
export type ExpiryIndicator =
  | { expired: true }
  | { expired: false; label: string }
  | null;

export const mediaExpiryIndicator = (
  mediaExpiresAtMs: number | null,
  nowMs: number,
): ExpiryIndicator => {
  if (mediaExpiresAtMs == null || !Number.isFinite(mediaExpiresAtMs)) return null;
  const remaining = mediaExpiresAtMs - nowMs;
  if (remaining <= 0) return { expired: true };
  const mins = Math.floor(remaining / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const label =
    days >= 1
      ? `Expires in ${days}d`
      : hours >= 1
        ? `Expires in ${hours}h`
        : mins >= 1
          ? `Expires in ${mins}m`
          : 'Expires soon';
  return { expired: false, label };
};

// Should the bubble show the save/expiry affordance for this media row? Only for
// FB/IG inbound media that is NOT yet persisted. Outbound (already on B2) and
// WhatsApp (durable on ingest) never show it.
export const showSaveAffordance = (
  m: Pick<
    InboxMessageRow,
    'direction' | 'mediaPersisted' | 'mediaUrl' | 'mediaKind'
  >,
): boolean =>
  m.direction === 'INBOUND' && !m.mediaPersisted && hasRenderableMedia(m);

// ── Scroll-stick (near-bottom detection) ────────────────────────────────────
// A thread should auto-pin to the bottom on a new message ONLY when the reader is
// already at/near the bottom — never yank someone who scrolled up to read history.
export const NEAR_BOTTOM_PX = 120;

export const isNearBottom = (
  geom: { scrollHeight: number; scrollTop: number; clientHeight: number },
  thresholdPx: number = NEAR_BOTTOM_PX,
): boolean =>
  geom.scrollHeight - geom.scrollTop - geom.clientHeight < thresholdPx;

// ── Optimistic-append reconciliation ────────────────────────────────────────
// On send we push a local "sending" bubble into a `pending` list; the next thread
// reload returns the real server record. Drop a pending temp once the server
// reflects it — matched on direction OUTBOUND + same trimmed body + a recent
// timestamp (asymmetric window: a real echo lands at-or-after the client `at`).
export const RECONCILE_WINDOW_MS = 120_000;
export const RECONCILE_BACK_SKEW_MS = 10_000;

export interface PendingMessage {
  id: string; // a temp-… id, distinct from any server id
  body: string;
  at: number; // client clock at send (ms)
  failed: boolean; // a hard send failure → keep showing it
  // Sent + accepted but possibly NOT yet persisted as a server row (a warning-tone
  // success). Rendered as a normal sent bubble (not "Sending…") and kept until a
  // matching server row reconciles it — so a reply that went out but didn't sync
  // is still visible (never looks un-sent → no duplicate send).
  sent?: boolean;
  // Optimistic attachment preview — the composer carries the uploaded media's
  // signed URL + kind so the "Sending…" bubble shows the attachment immediately.
  mediaUrl?: string | null;
  mediaKind?: InboxMediaKind;
}

export interface ReconcileResult {
  kept: PendingMessage[];
  newlyClaimed: string[];
}

// Reconcile a pending list against a fresh server snapshot: drop every temp the
// server now reflects, keep the rest. PURE — does NOT mutate `claimedIds`; it only
// READS it and reports the rows it would claim via `result.newlyClaimed`, so the
// caller can fold claims in exactly once outside any (replayable) setState updater.
//
// `kept` is the SAME array reference as the input when nothing changed (so the
// caller can skip a re-render). Matching is a DISTINCT 1:1 CLOSEST-MATCH assignment
// that is MONOTONIC across calls (each server row reconciles at most one temp ever),
// which keeps the "sent the same short reply twice" and "retry after failure" cases
// correct.
export const reconcilePending = (
  pending: readonly PendingMessage[],
  serverRows: readonly Pick<
    InboxMessageRow,
    'id' | 'direction' | 'body' | 'sentAtMs'
  >[],
  claimedIds: ReadonlySet<string> = new Set(),
  windowMs: number = RECONCILE_WINDOW_MS,
  backSkewMs: number = RECONCILE_BACK_SKEW_MS,
): ReconcileResult => {
  const outbound = serverRows
    .filter((m) => m.direction === 'OUTBOUND' && !claimedIds.has(m.id))
    .map((m, oi) => ({ id: m.id, body: (m.body ?? '').trim(), at: m.sentAtMs ?? 0, oi }))
    .sort((a, b) => a.at - b.at || a.oi - b.oi);

  const want = (s: string) => s.trim();
  const pairs: { ti: number; oj: number; dist: number; tat: number; rat: number }[] =
    [];
  for (let ti = 0; ti < pending.length; ti += 1) {
    const body = want(pending[ti].body);
    const tat = pending[ti].at;
    for (let oj = 0; oj < outbound.length; oj += 1) {
      if (outbound[oj].body !== body) continue;
      const delta = outbound[oj].at - tat;
      if (delta < -backSkewMs || delta >= windowMs) continue;
      pairs.push({ ti, oj, dist: Math.abs(delta), tat, rat: outbound[oj].at });
    }
  }
  pairs.sort((a, b) => a.dist - b.dist || a.tat - b.tat || a.rat - b.rat);

  const tempClaimed = new Array<boolean>(pending.length).fill(false);
  const rowClaimed = new Array<boolean>(outbound.length).fill(false);
  const reconciledIdx = new Set<number>();
  const newlyClaimed: string[] = [];
  for (const p of pairs) {
    if (tempClaimed[p.ti] || rowClaimed[p.oj]) continue;
    tempClaimed[p.ti] = true;
    rowClaimed[p.oj] = true;
    reconciledIdx.add(p.ti);
    newlyClaimed.push(outbound[p.oj].id);
  }

  if (reconciledIdx.size === 0)
    return { kept: pending as PendingMessage[], newlyClaimed };
  return { kept: pending.filter((_, i) => !reconciledIdx.has(i)), newlyClaimed };
};

// ── New-inbound detection (for the "↓ new messages" pill) ───────────────────
// When a poll brings in messages while the reader is scrolled UP, we show a pill
// instead of yanking them down — but only when the newest INBOUND id changed (an
// outbound echo of the agent's own send shouldn't trigger it). Returns the latest
// inbound id (or '') so the component can compare against the previous tick.
export const latestInboundId = (
  messages: readonly Pick<InboxMessageRow, 'id' | 'direction'>[],
): string => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].direction === 'INBOUND') return messages[i].id;
  }
  return '';
};
