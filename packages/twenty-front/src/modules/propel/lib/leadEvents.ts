// Presentation helpers for the lead-event timeline (Lead Engine #62, surface 1).
//
// The leadEvent log is append-only OPERATIONAL METADATA (no PII / message content) —
// see lead-event.object.ts. This lib turns a raw event node into a human-readable
// timeline row: an icon name + color + label per eventType, a relative-time string,
// and a short payload-derived detail when one is safely present. No I/O — pure
// transforms, kept out of the component so the mapping is one place + testable.

import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconCircleX,
  IconHistory,
  IconMessage,
  IconRefresh,
  IconSparkles,
  IconTargetArrow,
  IconUserPlus,
} from 'twenty-ui/display';
import { type LeadEventNode, type LeadEventType } from '@/propel/types/inbox';

// Re-export the node shape under the name the rail imports.
export type LeadEventRow = LeadEventNode;

type IconCmp = typeof IconHistory;

export interface LeadEventDescriptor {
  label: string;
  color: string; // Mantine theme color key
  Icon: IconCmp;
}

const DESCRIPTORS: Record<LeadEventType, LeadEventDescriptor> = {
  LEAD_CREATED: { label: 'Lead created', color: 'green', Icon: IconSparkles },
  LEAD_ASSIGNED: { label: 'Assigned', color: 'blue', Icon: IconUserPlus },
  LEAD_REASSIGNED: { label: 'Reassigned', color: 'cyan', Icon: IconRefresh },
  LEAD_RESPONDED: { label: 'First response', color: 'teal', Icon: IconMessage },
  OPPORTUNITY_CREATED: { label: 'Opportunity created', color: 'grape', Icon: IconTargetArrow },
  STAGE_CHANGED: { label: 'Stage changed', color: 'orange', Icon: IconArrowRight },
  DEAL_WON: { label: 'Deal won', color: 'green', Icon: IconCheck },
  DEAL_LOST: { label: 'Deal lost', color: 'red', Icon: IconCircleX },
  LEAD_SLA_BREACHED: { label: 'SLA breached', color: 'red', Icon: IconAlertTriangle },
  LEAD_CLASSIFIED: { label: 'Classified', color: 'gray', Icon: IconHistory },
  AGENT_SUGGESTED: { label: 'Agent suggested', color: 'gray', Icon: IconHistory },
  HUMAN_OVERRODE: { label: 'Human overrode', color: 'gray', Icon: IconHistory },
  REPLY_DRAFTED: { label: 'Reply drafted', color: 'gray', Icon: IconHistory },
};

const FALLBACK: LeadEventDescriptor = {
  label: 'Event',
  color: 'gray',
  Icon: IconHistory,
};

// Icon + color + label for an event type. Unknown / future types degrade to a
// neutral history glyph + a humanized label — never throws on an unmapped value.
export const leadEventDescriptor = (
  eventType: string,
): LeadEventDescriptor => {
  const d = DESCRIPTORS[eventType as LeadEventType];
  if (d) return d;
  return {
    ...FALLBACK,
    label: eventType
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (m) => m.toUpperCase()),
  };
};

// Relative "x ago" from an ISO timestamp (or null). Coarse buckets — a timeline of
// lifecycle events doesn't need second precision. Returns '' for an unparseable or
// missing time so the row simply omits the time chip.
export const relativeTimeLabel = (iso: string | null, nowMs = Date.now()): string => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, nowMs - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
};

// A short, SAFE detail line from the event's operational payload — ids/keys/method
// only (the object carries no PII by design). We surface a small allow-list of keys
// that read well in a timeline; anything else is omitted. Defensive: payload may be
// an object, a JSON string, or null.
export const leadEventDetail = (payload: unknown): string => {
  const obj = coercePayload(payload);
  if (!obj) return '';
  const parts: string[] = [];
  const stage = pickString(obj, ['toStage', 'stage', 'newStage']);
  if (stage) parts.push(humanize(stage));
  const lane = pickString(obj, ['lane', 'pipeline', 'subjectObjectType']);
  if (lane) parts.push(humanize(lane));
  const method = pickString(obj, ['method', 'channel', 'assignMode', 'mode']);
  if (method) parts.push(humanize(method));
  const source = pickString(obj, ['source', 'leadSource']);
  if (source) parts.push(humanize(source));
  return parts.slice(0, 2).join(' · ');
};

// ── internal helpers ─────────────────────────────────────────────────────────
const coercePayload = (payload: unknown): Record<string, unknown> | null => {
  if (payload && typeof payload === 'object') return payload as Record<string, unknown>;
  if (typeof payload === 'string' && payload.trim()) {
    try {
      const parsed = JSON.parse(payload);
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
};

const pickString = (obj: Record<string, unknown>, keys: string[]): string => {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
};

const humanize = (s: string): string =>
  s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
