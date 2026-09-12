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
// TASK 57 (2026-09-13) — the premise under the 45-second window was wrong. It
// assumed a call's row appears when the call is PLACED. It does not: for a dial
// through the office PBX, voice-service writes the row in one place, POST
// /v1/calls "from the PBX hang-up handler" (/v1/answered only screen-pops). So
// for the whole of a live call the CRM sees exactly what it sees for a dial that
// never started — nothing — and the old window told every agent on a call longer
// than ~45 seconds from click to hang-up "We could not confirm this call started"
// while they were still talking, then stopped polling, so the outcome form never
// opened. The desk found it on prod with one real 14-second call that passed by
// six seconds.
//
// Now: past the window the page stops saying "Calling…" but concludes nothing. It
// moves to NOT_YET_SEEN, keeps watching at a slower pace (CALL_SLOW_POLL_INTERVAL_MS
// says why), and says the one thing true either way — a call shows up once it
// ends. UNCONFIRMED is reached only at the watch cap. CONNECTED is kept, but no
// PBX dial reaches it today: the row arrives with its end time already set.
//
// Import-free on purpose, so the whole lifecycle is testable with node --test.

export type CallStatus =
  /** nothing in flight */
  | 'IDLE'
  /** the dial message went out, and we are still inside the ack window */
  | 'REQUESTED'
  /** past the ack window with still no row. For a PBX dial that is ALSO what a call
   *  in progress looks like, because its row is written at hang-up — so this state
   *  claims neither that a call is happening nor that it is not (task 57) */
  | 'NOT_YET_SEEN'
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
 * How long a dial may show as "Calling…". Past this the page stops saying
 * "Calling…" and moves to NOT_YET_SEEN — it does NOT give up. It used to give up
 * here, on the belief that the row is written when a call is placed; the row is
 * written at hang-up, which turned every longer call into a false warning (task 57).
 */
export const CALL_ACK_TIMEOUT_MS = 45_000;

/** The cap on watching one call, unchanged from the original poll. */
export const CALL_WATCH_TIMEOUT_MS = 30 * 60_000;

/** How often to ask while a dial is still "Calling…". */
export const CALL_POLL_INTERVAL_MS = 10_000;

/**
 * How often to ask once a dial is past the ack window — which, for a PBX call,
 * means for as long as the call lasts.
 *
 * Why slower: each ask reloads the whole lead page, which is at least nine reads
 * (counted in lead-page-route.ts: four direct queries plus five helpers that each
 * query), against the workspace's 100-requests-a-minute limit that the live
 * WhatsApp bridge shares. At 10 seconds that is 54+ reads a minute for EACH agent
 * on a long call; two such calls would crowd the bridge. At 30 seconds it is 18+.
 * The price: on a call longer than the window, the outcome form opens up to 30
 * seconds after the row lands instead of up to 10. The real fix is a read that
 * fetches only the latest call, which needs an app change, not a hero one.
 */
export const CALL_SLOW_POLL_INTERVAL_MS = 30_000;

/** The poll interval for a state. Only a fresh dial is worth asking about often. */
export const callPollIntervalMs = (status: string): number =>
  status === 'REQUESTED' ? CALL_POLL_INTERVAL_MS : CALL_SLOW_POLL_INTERVAL_MS;

/**
 * Should the page still be polling?
 *
 * The plan's shape, kept exactly: the statuses that mean something is in flight,
 * AND a live session. The session term is the one that used to be missing — an
 * expired session made every poll fail, and the effect simply returned and tried
 * again ten seconds later, for thirty minutes, against a CRM that was refusing it.
 */
export const shouldPollCall = (status: string, sessionActive: boolean): boolean =>
  sessionActive && ['REQUESTED', 'RINGING', 'NOT_YET_SEEN', 'CONNECTED'].includes(status);

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
  // The cap FIRST: a tab whose first tick arrives late (a closed laptop lid, a
  // backgrounded phone) must land on UNCONFIRMED, not on a fresh "calls show up
  // here…" band for a dial that is already past the point of watching.
  if (waited > CALL_WATCH_TIMEOUT_MS) {
    return { ...prev, status: 'UNCONFIRMED' };
  }
  // Past the window: stop saying "Calling…", but conclude nothing — for a PBX dial,
  // no row is exactly what a call in progress looks like (task 57).
  if (prev.status === 'REQUESTED' && waited > CALL_ACK_TIMEOUT_MS) {
    return { ...prev, status: 'NOT_YET_SEEN' };
  }
  return prev;
};

/**
 * What the agent is told. Never "on a call" unless the CRM can see one — the
 * whole point of the UNCONFIRMED state is that the page stops asserting things
 * it cannot check. And never "could not confirm" while a call may still be going:
 * NOT_YET_SEEN is on screen for the whole of every longer call (task 57).
 */
export const CALL_STATUS_TEXT: Record<CallStatus, string | null> = {
  IDLE: null,
  REQUESTED: 'Calling…',
  NOT_YET_SEEN: 'Calls show up here after they end, and the outcome form opens then. Not on a call? Check your dialer.',
  CONNECTED: 'On a call',
  ENDED: null,
  REFUSED: 'Could not place the call from here — dial the number shown.',
  UNCONFIRMED: 'We could not confirm this call. If you spoke to them, use Log outcome.',
};

/**
 * How each state LOOKS. Added after a real call on 2026-09-12: the founder placed
 * one through this page and never noticed the status line, because it was 13px at
 * 0.85 opacity beside a large, live dialer panel. The words were right and nobody
 * read them.
 *
 * Amber = waiting or unsure. Green = the CRM can actually SEE the call. Red = we
 * know nothing went out. **Never green on REQUESTED** — "we asked" is not "we
 * connected", and that distinction is the entire reason these states exist.
 */
export const CALL_STATUS_TONE: Record<CallStatus, { icon: string; fg: string; bg: string; border: string }> = {
  IDLE: { icon: '', fg: 'inherit', bg: 'transparent', border: 'transparent' },
  REQUESTED: { icon: '📞', fg: 'oklch(0.86 0.10 85)', bg: 'oklch(0.30 0.05 85 / 0.35)', border: 'oklch(0.55 0.10 85 / 0.55)' },
  NOT_YET_SEEN: { icon: '⏳', fg: 'oklch(0.86 0.10 85)', bg: 'oklch(0.30 0.05 85 / 0.35)', border: 'oklch(0.55 0.10 85 / 0.55)' },
  CONNECTED: { icon: '🟢', fg: 'oklch(0.88 0.12 150)', bg: 'oklch(0.30 0.06 150 / 0.35)', border: 'oklch(0.55 0.12 150 / 0.55)' },
  ENDED: { icon: '', fg: 'inherit', bg: 'transparent', border: 'transparent' },
  REFUSED: { icon: '⚠️', fg: 'oklch(0.85 0.13 25)', bg: 'oklch(0.30 0.07 25 / 0.35)', border: 'oklch(0.55 0.13 25 / 0.55)' },
  UNCONFIRMED: { icon: '⚠️', fg: 'oklch(0.86 0.10 85)', bg: 'oklch(0.30 0.05 85 / 0.35)', border: 'oklch(0.55 0.10 85 / 0.55)' },
};

/** Does this state warrant the outcome sheet opening by itself? */
export const shouldOpenOutcomeSheet = (s: CallState): boolean => s.status === 'ENDED';

/**
 * Which states carry a Dismiss button. NOT_YET_SEEN has one because only the agent
 * knows whether their dialer ever started a call; dismissing ends the watch, and
 * Log outcome still works by hand.
 */
export const canDismissCall = (status: CallStatus): boolean =>
  status === 'NOT_YET_SEEN' || status === 'UNCONFIRMED' || status === 'REFUSED';
