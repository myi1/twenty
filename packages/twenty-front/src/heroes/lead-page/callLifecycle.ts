// What the page is allowed to say about a call, and when it may stop asking.
//
// F4 (2026-09-12). The page used to hold the call in a REF:
//
//   const callStartedAt = useRef<number | null>(null);
//   const onCallStarted = () => { callStartedAt.current = Date.now();
//                                 setData((d) => (d ? { ...d } : d)); };
//
// A ref does not re-render, so that `setData` spread was there to nudge the poll
// effect awake — except the effect's dependency is `data?.latestCall?.id`, and
// spreading `data` does not change it. **Pressing Call therefore did not reliably
// start the poll at all**, and when it did it was by coincidence of some other
// dependency moving. The outcome sheet then never opened and the agent logged
// nothing. Making the call a piece of STATE is not tidying; it is the fix.
//
// The second half is what the page is entitled to claim. `startPropelCall`
// returns true when it has POSTED a window message to the dialer dock —
// `window.postMessage` cannot fail and returns nothing, so true means "we spoke
// into the room", not "a call is being placed". With the dock closed, the
// softphone unregistered or the SIP line down, the page showed a call underway
// and then polled for thirty minutes for something that was never going to
// exist. Until J3 gives us a durable acknowledgement from the dialer, the honest
// states are REQUESTED (we asked), CONNECTED (the CRM has a call row for it) and
// UNCONFIRMED (we asked, and nothing ever appeared) — and the page says which.
//
// Import-free on purpose, so the whole lifecycle is testable with node --test.

export type CallStatus =
  /** nothing in flight */
  | 'IDLE'
  /** the dial message went out; no call row has appeared yet */
  | 'REQUESTED'
  /** a call row exists for this dial and has not ended */
  | 'CONNECTED'
  /** it ended; the outcome sheet is owed */
  | 'ENDED'
  /** refused before anything left: no dock, or a number we will not dial */
  | 'REFUSED'
  /** we asked and nothing ever came back. NOT the same as "no call happened" */
  | 'UNCONFIRMED';

export type CallState = {
  status: CallStatus;
  /** when the dial message was posted */
  requestedAt: number | null;
  /** the call row being tracked, once one appears */
  callId: string | null;
  /** filled on ENDED, for the outcome sheet's subtitle */
  endedSeconds: number | null;
};

export const IDLE_CALL: CallState = { status: 'IDLE', requestedAt: null, callId: null, endedSeconds: null };

/**
 * How long a dial may show as "Calling…" before the page admits it cannot see
 * the call. Long enough for a PBX to place it and the CRM to write the row;
 * short enough that an agent is not lied to for half an hour.
 */
export const CALL_ACK_TIMEOUT_MS = 45_000;

/** The cap on watching one call, unchanged from the original poll. */
export const CALL_WATCH_TIMEOUT_MS = 30 * 60_000;

/** How often to ask, while asking is worth doing. */
export const CALL_POLL_INTERVAL_MS = 10_000;

/**
 * Should the page still be polling?
 *
 * The plan's shape, kept exactly: the statuses that mean something is in flight,
 * AND a live session. The session term is the one that used to be missing — an
 * expired session made every poll fail, and the effect simply returned and tried
 * again ten seconds later, for thirty minutes, against a CRM that was refusing it.
 */
export const shouldPollCall = (status: string, sessionActive: boolean): boolean =>
  sessionActive && ['REQUESTED', 'RINGING', 'CONNECTED'].includes(status);

/** The call row as the lead-page route reports it. */
export type ObservedCall = {
  id: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
} | null;

/** The dial message went out. */
export const callRequested = (now: number): CallState => ({
  status: 'REQUESTED',
  requestedAt: now,
  callId: null,
  endedSeconds: null,
});

/** The dial was refused before anything left the browser. */
export const callRefused = (): CallState => ({ ...IDLE_CALL, status: 'REFUSED' });

const parse = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/**
 * Advance the call state from what the CRM currently reports.
 *
 * The ONE rule that matters: a call row only counts for this dial if it began
 * AFTER the dial did. Without that, the lead's previous call — already ended,
 * possibly from days ago — matches immediately and the outcome sheet pops for a
 * conversation that is not happening. That comparison was in the original code
 * and is kept deliberately.
 */
export const nextCallState = (prev: CallState, observed: ObservedCall, now: number): CallState => {
  // Terminal, or never started: nothing to advance.
  if (prev.status === 'IDLE' || prev.status === 'ENDED' || prev.status === 'UNCONFIRMED' || prev.status === 'REFUSED') {
    return prev;
  }
  if (prev.requestedAt === null) return IDLE_CALL;

  const startedAt = parse(observed?.startedAt ?? null);
  const endedAt = parse(observed?.endedAt ?? null);
  const isOurs = observed !== null && ((startedAt !== null && startedAt >= prev.requestedAt) || (endedAt !== null && endedAt > prev.requestedAt));

  if (isOurs && endedAt !== null) {
    return { status: 'ENDED', requestedAt: prev.requestedAt, callId: observed!.id, endedSeconds: observed!.durationSeconds ?? null };
  }
  if (isOurs) {
    return { status: 'CONNECTED', requestedAt: prev.requestedAt, callId: observed!.id, endedSeconds: null };
  }

  // Nothing of ours in sight.
  const waited = now - prev.requestedAt;
  if (prev.status === 'REQUESTED' && waited > CALL_ACK_TIMEOUT_MS) {
    return { ...prev, status: 'UNCONFIRMED' };
  }
  if (waited > CALL_WATCH_TIMEOUT_MS) {
    return { ...prev, status: 'UNCONFIRMED' };
  }
  return prev;
};

/**
 * What the agent is told. Never "on a call" unless the CRM can see one — the
 * whole point of the UNCONFIRMED state is that the page stops asserting things
 * it cannot check.
 */
export const CALL_STATUS_TEXT: Record<CallStatus, string | null> = {
  IDLE: null,
  REQUESTED: 'Calling…',
  CONNECTED: 'On a call',
  ENDED: null,
  REFUSED: 'Could not place the call from here — dial the number shown.',
  UNCONFIRMED: 'We could not confirm this call started. Check your dialer before trying again.',
};

/** Does this state warrant the outcome sheet opening by itself? */
export const shouldOpenOutcomeSheet = (s: CallState): boolean => s.status === 'ENDED';
