import {
  type MarketingHubPayload,
  type SequenceRow,
} from '@/propel/types/marketingHome';

// Pure mapping of the /marketing/hub payload into the unified campaigns table
// rows the Campaigns tab renders — ported byte-for-byte (logic-wise) from the
// legacy Marketing Cloud CampaignsView.buildRows (marketing-cloud-campaigns.tsx).
// One filterable table across every status: drafts / scheduled / sending / sent,
// plus non-archived sequences bucketed into sending (RUNNING) or draft.

export type CampaignFilter =
  | 'all'
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent';

export type ChannelKey = 'email' | 'whatsapp' | 'social' | 'voice';

const CH_OF: Record<string, ChannelKey> = {
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
  SOCIAL: 'social',
  VOICE: 'voice',
};
export const chOf = (c: string): ChannelKey => CH_OF[c] ?? 'email';

export const fmt = (n: number): string => n.toLocaleString('en-US');
export const pct = (v: number | null): string =>
  v === null ? '—' : `${Math.round(v)}%`;
export const titleCase = (s: string): string =>
  s ? s.charAt(0) + s.slice(1).toLowerCase() : s;

export type UnifiedRow = {
  id: string;
  name: string;
  channel: ChannelKey;
  status: CampaignFilter;
  statusLabel: string;
  when: string;
  audience: string;
  perf: string;
  kind: 'campaign' | 'sequence';
  seq?: SequenceRow;
  // listing-backed drafts can't be edited in the segment-only builder (it would
  // strip the listing + drop the permit gate) — they open the read-only detail.
  hasListing?: boolean;
  // Numeric perf carried for the Wave-0 control-room PerfStrip (additive; the
  // formatted `perf` string above stays as the fallback for rows with no numbers).
  sentCount?: number | null;
  openRate?: number | null; // whole-number percent
  clickRate?: number | null; // whole-number percent
  replies?: number | null;
  // Attribution roll-up — populated by the Wave 1 attribution loop (spine rolls).
  // Null today, so AttributionLink renders its honest "no leads yet".
  leads?: number | null;
  attributedDealCount?: number | null;
  attributedRevenue?: number | null;
};

export const buildCampaignRows = (
  payload: MarketingHubPayload,
): UnifiedRow[] => {
  const rows: UnifiedRow[] = [];

  for (const d of payload.sendingNow ?? []) {
    const materializing = d.targetCount <= 0;
    rows.push({
      id: d.id,
      name: d.name,
      channel: chOf(d.channel),
      status: 'sending',
      statusLabel: 'Sending',
      when: d.startedLabel,
      audience: materializing
        ? 'Building audience…'
        : `${fmt(d.targetCount)} recipients`,
      perf: materializing
        ? `${fmt(d.pendingLeft)} queued`
        : `${fmt(d.sentCount)} sent · ${fmt(d.pendingLeft)} left`,
      kind: 'campaign',
      sentCount: d.sentCount,
    });
  }

  for (const s of payload.scheduled ?? []) {
    rows.push({
      id: s.id,
      name: s.name,
      channel: chOf(s.channel),
      status: 'scheduled',
      statusLabel: 'Scheduled',
      when: s.whenLabel,
      audience: s.audienceLabel,
      perf: '—',
      kind: 'campaign',
    });
  }

  for (const d of payload.drafts ?? []) {
    rows.push({
      id: d.id,
      name: d.name,
      channel: chOf(d.channel),
      status: 'draft',
      statusLabel: 'Draft',
      when: d.updatedLabel,
      audience: d.hasSegment
        ? 'Segment set'
        : d.hasListing
          ? 'Listing set'
          : 'No audience yet',
      perf: '—',
      kind: 'campaign',
      hasListing: d.hasListing,
    });
  }

  for (const r of payload.recentResults ?? []) {
    rows.push({
      id: r.id,
      name: r.name,
      channel: chOf(r.channel),
      status: 'sent',
      statusLabel: 'Sent',
      when: r.completedLabel,
      audience: '—',
      perf: `${pct(r.openRate)} open · ${fmt(r.replies)} reply`,
      kind: 'campaign',
      openRate: r.openRate,
      clickRate: r.clickRate,
      replies: r.replies,
    });
  }

  // Multi-step sequences live in the same table. A running sequence buckets under
  // "Sending", a draft/paused one under "Drafts". ARCHIVED are terminal — dropped.
  for (const s of payload.sequences ?? []) {
    if (s.status === 'ARCHIVED') continue;
    const status: CampaignFilter = s.status === 'RUNNING' ? 'sending' : 'draft';
    rows.push({
      id: s.id,
      name: s.name,
      // Sequences can mix channels per-step; show WhatsApp only when every send
      // step is WhatsApp, else email (the default).
      channel:
        s.steps.some((st) => st.stepType === 'SEND_EMAIL') ||
        !s.steps.some((st) => st.stepType === 'SEND_WHATSAPP')
          ? 'email'
          : 'whatsapp',
      status,
      statusLabel: titleCase(s.status),
      when: '',
      audience:
        s.entryType === 'SEGMENT_POLL'
          ? 'Auto-enrolled segment'
          : s.entryType === 'EVENT'
            ? 'Event-triggered'
            : 'Manually enrolled',
      perf: `${fmt(s.enrolledCount)} enrolled · ${fmt(s.activeCount)} active`,
      kind: 'sequence',
      seq: s,
    });
  }

  return rows;
};

export const statusTone = (
  status: CampaignFilter,
): 'green' | 'yellow' | 'red' | 'gray' => {
  if (status === 'sending') return 'red';
  if (status === 'scheduled') return 'yellow';
  if (status === 'sent') return 'green';
  return 'gray';
};

export const seqStatusTone = (
  status: string,
): 'green' | 'yellow' | 'red' | 'gray' => {
  if (status === 'RUNNING') return 'green';
  if (status === 'PAUSED') return 'yellow';
  if (status === 'ARCHIVED') return 'red';
  return 'gray';
};
