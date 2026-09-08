// Lead Page: hero-side type mirror.
// The CRM repo (propel-crm-integration) and this fork can't share imports, so
// these types are a hand-maintained MIRROR: keep them in sync manually when the
// source files change.
//
//   LeadLane / LeadDeal / LeadTimelineEvent, mirrored VERBATIM from
//     /Users/yahyaismail/dev/_wt/lead-page/src/shared/lead-page-core.ts and
//     /Users/yahyaismail/dev/_wt/lead-page/src/shared/my-desk-timeline-page.ts
//     (CRM repo). `LeadDeal` here additionally carries `laneLabel` / `deskLane` /
//     `laneKey`, which the route derives from LANE_META before it answers: the
//     base LeadDeal in the CRM repo does not have them.
//
//   LeadLoad / LeadErr / SaveOutcomeInput / SaveOutcomeResult: the exact shapes
//     emitted by the `/lead-page` route:
//     /Users/yahyaismail/dev/_wt/lead-page/src/logic-functions/lead-page-route.ts
//
// LeadLoad / SaveOutcomeResult are the DATA shape only, they do not carry `ok`.
// leadApi.ts's `R<T>` wrapper adds `{ ok: true }` on top for the success case.

// ── lead-page-core.ts mirror (verbatim) ──────────────────────────────────────

export type LeadLane =
  | 'offPlanOpportunity'
  | 'secondaryOpportunity'
  | 'sellOpportunity'
  | 'rcbiOpportunity'
  | 'institutionalOpportunity';

export type LeadDeal = {
  id: string;
  lane: LeadLane;
  laneLabel: string;
  deskLane: string;
  laneKey: string;
  name: string | null;
  stage: string | null;
  status: string | null;
  updatedAt: string;
  fields: Record<string, unknown>;
};

// my-desk-timeline-page.ts's TimelineEvent, verbatim.
export type LeadTimelineEvent = {
  id: string;
  type: 'NOTE' | 'TASK' | 'CALL' | 'WHATSAPP';
  occurredAt: string;
  title: string;
  by: string;
  callStatus?: string | null;
  durationSeconds?: number | null;
};

// ── /lead-page route contract ────────────────────────────────────────────────

// NOT_VISIBLE is the DATABASE's refusal, not the route's. Every query the route
// makes runs with the CALLER's own credentials, so Twenty's row-level security
// refuses another agent's row before the route ever sees it, and a findOne for a
// row you cannot see throws rather than returning null (lead-page-route.ts's
// isRecordNotVisible). It means "not there FOR YOU", and covers BOTH "you do not
// own it" AND "it does not exist": RLS refuses to say which, and neither may we,
// or this route becomes a way to probe which record ids exist. Any wording for it
// has to be true under both readings — see errorText in leadApi.ts.
//
// It is returned from gatePerson, i.e. from EVERY person-scoped action (load,
// saveOutcome, setLeadPick, savePicture, addNote, createFollowUp, completeTask,
// markLost, setName, setContactField), and from setDealField's deal read. In a
// healthy workspace it is what an agent reaching someone else's record actually
// gets: the route's own FORBIDDEN owner checks sit BEHIND the RLS refusal and are
// unreachable while RLS works, so do not treat FORBIDDEN as the live case.
export type LeadErr = {
  ok: false;
  error: 'NOT_FOUND' | 'NOT_VISIBLE' | 'FORBIDDEN' | 'INVALID_INPUT' | 'UPSTREAM_FAILED' | 'DUPLICATE_REQUEST';
};

export type LeadLoad = {
  person: {
    id: string;
    displayName: string;
    hasName: boolean;
    phoneE164: string | null;
    city: string | null;
    country: 'UK' | 'UAE' | null;
    email: string | null;
    preferredLanguage: string | null;
    assignedAgentId: string | null;
    assignedAgentName: string | null;
    assignedAt: string | null;
    isLost: boolean;
    snoozedUntil: string | null;
    routingState: string | null;
    sourceLabel: string | null;
    campaignName: string | null;
    createdAt: string;
    picture: {
      situation: string | null;
      motivation: string | null;
      want: string | null;
      decision: string | null;
      concern: string | null;
    };
    // `buyingTimeline` is the ONE timing answer: the Meta lead form fills it in and
    // the agent may correct it (route: picks.buyingTimeline). The old `buyTimeline`
    // asked the same question and is gone. `formAnswers` below can still carry the
    // lead's ORIGINAL form answer alongside it — that row is the provenance, not a
    // second copy of this.
    picks: {
      purpose: string | null;
      buyingTimeline: string | null;
      moneyComfort: string | null;
    };
    formAnswers: Array<{ label: string; value: string }>;
    lastTouch: { at: string | null; by: string | null; summary: string | null };
    optedOutWhatsApp: boolean;
  };
  deals: LeadDeal[];
  selectedDealId: string | null;
  // status !== 'DONE', soonest dueAt first.
  openTasks: Array<{ id: string; title: string; kind: string | null; dueAt: string | null; assigneeId: string | null }>;
  timeline: {
    events: LeadTimelineEvent[];
    nextCursor: string | null;
    partialFailures: Array<{ source: string; code: string }>;
  };
  wa: {
    conversationId: string | null;
    lineType: 'OFFICIAL' | 'EVERYDAY';
    lineLabel: string;
    lineNumber: string;
    lastInboundAt: string | null;
    canReply: boolean;
  };
  latestCall: {
    id: string;
    startedAt: string | null;
    endedAt: string | null;
    durationSeconds: number | null;
    disposition: string | null;
  } | null;
  replySignal: { repliedAt: string | null; minutes: number | null };
  viewer: { workspaceMemberId: string; role: 'ADMIN' | 'MANAGER' | 'AGENT' };
};

export type SaveOutcomeInput = {
  personId: string;
  dealId?: string;
  outcome: 'INTERESTED' | 'CALLBACK' | 'NO_ANSWER' | 'CONVERTED' | 'NOT_INTERESTED' | 'WRONG_NUMBER';
  nextStep: 'SEND_FILES' | 'CALL_BACK' | 'BOOK_CALL' | 'NOTHING';
  when?: 'IN_1H' | 'TOMORROW_10' | string; // or an ISO instant
  zone?: string;
  line?: string;
  clientRequestId: string;
};

export type SaveOutcomeResult = {
  noteId: string | null;
  followUpTaskId: string | null;
  callTaskId: string | null;
  // The route only ever SUGGESTS a stage; it never writes one itself.
  suggestedStage: string | null;
  partial: string[];
};
