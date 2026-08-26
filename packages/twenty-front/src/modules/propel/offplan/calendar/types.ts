// Launch Calendar payload types — the composed `calendar` action's response shape.
// All bucketing/TBC/provenance/freshness logic lives SERVER-SIDE in the CRM app's
// import-free core (offplan-calendar-core.ts, unit-tested there); the tab renders,
// it does not think. Keep these mirrors in sync with that module.

export type MarketEventType = 'DEVELOPER_EVENT' | 'OFFER' | 'EOI_DEADLINE' | 'OTHER';

export type CalendarLaunchItem = {
  kind: 'launch';
  projectExternalId: number;
  name: string;
  developerName: string | null;
  districtName: string | null;
  /** Asia/Dubai day 'YYYY-MM-DD' (server-computed). */
  dayKey: string;
  provenance: 'FIRST_SEEN' | 'ANNOUNCED' | 'ANNOUNCED_UNCONFIRMED';
  minPrice: number | null;
  heroImageUrl: string | null;
  handoverYear: string | null;
  plottable: boolean;
};

export type CalendarEventItem = {
  kind: 'event';
  id: string;
  name: string;
  eventType: MarketEventType;
  startsAtMs: number;
  endsAtMs: number | null;
  isAllDay: boolean;
  developerName: string | null;
  projectExternalId: number | null;
  projectName: string | null;
  sourceNote: string | null;
  notesSummary: string | null;
  url: string | null;
};

export type CalendarItem = CalendarLaunchItem | CalendarEventItem;

export type TbcGroup = { monthKey: string; dayKey: string; count: number; names: string[] };

export type CalendarSections = {
  justLaunched: CalendarLaunchItem[];
  closingSoon: CalendarEventItem[];
  next7: CalendarItem[];
  following14: CalendarItem[];
  later: { count: number; items: CalendarItem[] };
  tbcGroups: TbcGroup[];
  monthPlot: { dayKey: string; endDayKey: string | null; label: string; type: 'launch' | MarketEventType; ref: string }[];
};

export type FreshnessState = 'green' | 'amber' | 'red' | 'unreachable';

export type SourceState = 'ok' | 'error' | 'truncated';

export type CalendarPayload = {
  freshness: { state: FreshnessState; label: string; hoursSinceSync: number | null };
  sections: CalendarSections;
  sources: { launchCalendar: SourceState; weekLaunches: SourceState; events: SourceState };
  truncated: boolean;
  generatedAt: string;
  canManage: boolean;
};

/** The marketEvent route's full row (detail / edit form). */
export type MarketEventRecord = {
  id: string;
  name: string;
  eventType: MarketEventType;
  startsAt: string;
  endsAt: string | null;
  isAllDay: boolean;
  developerName: string | null;
  developerSlug: string | null;
  districtName: string | null;
  districtId: string | null;
  projectExternalId: number | null;
  projectName: string | null;
  notes: string | null;
  sourceNote: string | null;
  url: string | null;
};

export type EventFormValues = {
  eventType: MarketEventType;
  name: string;
  startsAt: string; // 'YYYY-MM-DD' (all-day v1 — the form's granularity)
  endsAt: string; // '' = single day
  deadline: string; // EOI only
  developerName: string;
  developerSlug: string | null;
  sourceNote: string;
  notes: string;
  url: string;
};
