// F4 regressions: what the page may claim about a call, and when it stops asking.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CALL_ACK_TIMEOUT_MS,
  CALL_POLL_INTERVAL_MS,
  CALL_SLOW_POLL_INTERVAL_MS,
  CALL_STATUS_TEXT,
  CALL_STATUS_TONE,
  CALL_WATCH_TIMEOUT_MS,
  callPollIntervalMs,
  callRefused,
  callRequested,
  canDismissCall,
  IDLE_CALL,
  nextCallState,
  shouldOpenOutcomeSheet,
  shouldPollCall,
  type CallState,
  type ObservedCall,
} from './callLifecycle.ts';

const T0 = Date.parse('2026-09-12T10:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const call = (o: Partial<NonNullable<ObservedCall>> = {}): ObservedCall => ({
  id: 'call-1',
  startedAt: iso(T0 + 2_000),
  endedAt: null,
  durationSeconds: null,
  ...o,
});

describe('shouldPollCall — the plan"s table', () => {
  it('polls only while something is in flight AND the session is live', () => {
    for (const s of ['REQUESTED', 'RINGING', 'NOT_YET_SEEN', 'CONNECTED']) {
      assert.equal(shouldPollCall(s, true), true, s);
    }
    for (const s of ['IDLE', 'ENDED', 'REFUSED', 'UNCONFIRMED', 'ANYTHING_ELSE']) {
      assert.equal(shouldPollCall(s, true), false, s);
    }
  });

  it('an expired session stops the poll for EVERY status', () => {
    // THE REGRESSION. The old loop had no session term: once the session lapsed
    // every request failed, the effect returned, and it tried again ten seconds
    // later — for thirty minutes, against a CRM that was refusing it.
    for (const s of ['REQUESTED', 'RINGING', 'NOT_YET_SEEN', 'CONNECTED', 'IDLE', 'ENDED']) {
      assert.equal(shouldPollCall(s, false), false, s);
    }
  });
});

describe('nextCallState — REQUESTED → CONNECTED → ENDED', () => {
  it('walks the full lifecycle', () => {
    let s = callRequested(T0);
    assert.equal(s.status, 'REQUESTED');

    s = nextCallState(s, call(), T0 + 3_000);
    assert.equal(s.status, 'CONNECTED');
    assert.equal(s.callId, 'call-1');

    s = nextCallState(s, call({ endedAt: iso(T0 + 90_000), durationSeconds: 88 }), T0 + 91_000);
    assert.equal(s.status, 'ENDED');
    assert.equal(s.endedSeconds, 88);
    assert.equal(shouldOpenOutcomeSheet(s), true);
  });

  it('a call that ends between two polls is still caught', () => {
    // The poll is every 10s; a 6-second call starts and ends inside one gap, so
    // the first row this ever sees already carries endedAt. Requiring CONNECTED
    // first would lose the outcome sheet for every short call.
    const s = nextCallState(callRequested(T0), call({ startedAt: iso(T0 + 1_000), endedAt: iso(T0 + 7_000), durationSeconds: 6 }), T0 + 10_000);
    assert.equal(s.status, 'ENDED');
    assert.equal(s.endedSeconds, 6);
  });

  it('ENDED is terminal — a later poll cannot drag it backwards', () => {
    const ended = nextCallState(callRequested(T0), call({ endedAt: iso(T0 + 60_000), durationSeconds: 58 }), T0 + 61_000);
    assert.deepEqual(nextCallState(ended, call(), T0 + 70_000), ended);
  });
});

describe('nextCallState — the lead"s PREVIOUS call must never be mistaken for this one', () => {
  it('a call that started before the dial is ignored', () => {
    // Without this the lead's last call — ended days ago — matches on the first
    // poll and the outcome sheet pops for a conversation nobody is having.
    const old: ObservedCall = { id: 'call-old', startedAt: iso(T0 - 86_400_000), endedAt: iso(T0 - 86_000_000), durationSeconds: 120 };
    const s = nextCallState(callRequested(T0), old, T0 + 3_000);
    assert.equal(s.status, 'REQUESTED', 'an old call is not this call');
  });

  it('and it still gives up at the cap rather than waiting forever', () => {
    // Task 57: past the ack window the page keeps watching. The old call must not end
    // that watch early, and must not stop it ending at the cap.
    const old: ObservedCall = { id: 'call-old', startedAt: iso(T0 - 86_400_000), endedAt: iso(T0 - 86_000_000), durationSeconds: 120 };
    const past = nextCallState(callRequested(T0), old, T0 + CALL_ACK_TIMEOUT_MS + 1);
    assert.equal(past.status, 'NOT_YET_SEEN');
    assert.equal(nextCallState(past, old, T0 + CALL_WATCH_TIMEOUT_MS + 1).status, 'UNCONFIRMED');
  });
});

describe('nextCallState — a postMessage is not an acknowledgement', () => {
  it('nothing observed: "Calling…" ends at the window, the watch does not, and only the cap gives up', () => {
    // startPropelCall returns true when it has POSTED a window message.
    // postMessage cannot fail, so true means "we spoke into the room". With the
    // dock closed or the softphone unregistered, the page used to show a call
    // underway and poll for thirty minutes for something that never existed.
    //
    // TASK 57 changed the middle. This test used to assert UNCONFIRMED and "it stops
    // asking" at the window — which was the defect itself: for a PBX dial, no row is
    // also what a call in progress looks like, because the row is written at hang-up.
    let s = callRequested(T0);
    s = nextCallState(s, null, T0 + CALL_ACK_TIMEOUT_MS - 1);
    assert.equal(s.status, 'REQUESTED', 'not yet — give the PBX and the CRM a moment');
    s = nextCallState(s, null, T0 + CALL_ACK_TIMEOUT_MS + 1);
    assert.equal(s.status, 'NOT_YET_SEEN');
    assert.equal(shouldPollCall(s.status, true), true, 'and it keeps asking');
    assert.equal(callPollIntervalMs(s.status), CALL_SLOW_POLL_INTERVAL_MS, 'more slowly');
    s = nextCallState(s, null, T0 + CALL_WATCH_TIMEOUT_MS - 1);
    assert.equal(s.status, 'NOT_YET_SEEN');
    s = nextCallState(s, null, T0 + CALL_WATCH_TIMEOUT_MS + 1);
    assert.equal(s.status, 'UNCONFIRMED');
    assert.equal(shouldPollCall(s.status, true), false, 'and only now does it stop asking');
  });

  it('UNCONFIRMED never claims a call happened, and never claims one did not', () => {
    assert.match(String(CALL_STATUS_TEXT.UNCONFIRMED), /could not confirm/i);
    assert.doesNotMatch(String(CALL_STATUS_TEXT.UNCONFIRMED), /failed|did not/i);
  });

  it('a refused dial is its own state, distinct from an unconfirmed one', () => {
    // No dock, or a number we will not hand to the PBX: we KNOW nothing left.
    const s = callRefused();
    assert.equal(s.status, 'REFUSED');
    assert.equal(shouldPollCall(s.status, true), false, 'there is nothing to poll for');
    assert.equal(s.requestedAt, null);
    assert.notEqual(CALL_STATUS_TEXT.REFUSED, CALL_STATUS_TEXT.UNCONFIRMED);
  });

  it('a connected call that goes quiet still ends the watch at the cap', () => {
    const connected: CallState = { status: 'CONNECTED', requestedAt: T0, callId: 'call-1', endedSeconds: null };
    assert.equal(nextCallState(connected, null, T0 + CALL_WATCH_TIMEOUT_MS - 1).status, 'CONNECTED');
    assert.equal(nextCallState(connected, null, T0 + CALL_WATCH_TIMEOUT_MS + 1).status, 'UNCONFIRMED');
  });
});

describe('nextCallState — a stale response after a lead switch', () => {
  it('IDLE absorbs anything a late response carries', () => {
    // The parent resets to IDLE on a personId change. A poll already in flight
    // for the PREVIOUS lead can still land afterwards; it must not resurrect a
    // call, and above all must not open the outcome sheet on the new lead.
    const s = nextCallState(IDLE_CALL, call({ endedAt: iso(T0 + 5_000), durationSeconds: 5 }), T0 + 6_000);
    assert.deepEqual(s, IDLE_CALL);
    assert.equal(shouldOpenOutcomeSheet(s), false);
  });

  it('a state with no requestedAt falls back to IDLE rather than guessing', () => {
    const broken: CallState = { status: 'CONNECTED', requestedAt: null, callId: 'x', endedSeconds: null };
    assert.deepEqual(nextCallState(broken, call(), T0), IDLE_CALL);
  });

  it('an unparseable timestamp is not treated as a match', () => {
    const bad: ObservedCall = { id: 'c', startedAt: 'not a date', endedAt: 'nor this', durationSeconds: null };
    assert.equal(nextCallState(callRequested(T0), bad, T0 + 1_000).status, 'REQUESTED');
  });
});

describe('the outcome sheet opens for exactly one state', () => {
  it('only ENDED', () => {
    for (const status of ['IDLE', 'REQUESTED', 'NOT_YET_SEEN', 'CONNECTED', 'REFUSED', 'UNCONFIRMED'] as const) {
      assert.equal(shouldOpenOutcomeSheet({ ...IDLE_CALL, status }), false, status);
    }
    assert.equal(shouldOpenOutcomeSheet({ ...IDLE_CALL, status: 'ENDED' }), true);
  });

  it('neither NOT_YET_SEEN nor UNCONFIRMED pops the sheet — there is no outcome to log', () => {
    const waiting = nextCallState(callRequested(T0), null, T0 + CALL_ACK_TIMEOUT_MS + 1);
    assert.equal(waiting.status, 'NOT_YET_SEEN');
    assert.equal(shouldOpenOutcomeSheet(waiting), false);
    const gaveUp = nextCallState(waiting, null, T0 + CALL_WATCH_TIMEOUT_MS + 1);
    assert.equal(gaveUp.status, 'UNCONFIRMED');
    assert.equal(shouldOpenOutcomeSheet(gaveUp), false);
  });
});

describe('the status line must be seen, and must never flatter', () => {
  // Added after a real call on 2026-09-12: the page said "Calling…" correctly for
  // the whole call and the founder never noticed it — 13px, 0.85 opacity, beside a
  // large live dialer panel. Right words, unread.
  it('every state that has words also has a tone', () => {
    for (const s of ['REQUESTED', 'NOT_YET_SEEN', 'CONNECTED', 'REFUSED', 'UNCONFIRMED'] as const) {
      assert.ok(CALL_STATUS_TEXT[s], `${s} must say something`);
      assert.ok(CALL_STATUS_TONE[s].bg !== 'transparent', `${s} must be visible, not a whisper`);
      assert.ok(CALL_STATUS_TONE[s].icon !== '', `${s} must carry an icon`);
    }
  });

  it('the silent states stay silent', () => {
    for (const s of ['IDLE', 'ENDED'] as const) {
      assert.equal(CALL_STATUS_TEXT[s], null);
      assert.equal(CALL_STATUS_TONE[s].bg, 'transparent');
    }
  });

  // THE ONE THAT MATTERS: green is reserved for a call the CRM can actually see.
  it('REQUESTED is never styled like a connected call', () => {
    assert.notEqual(CALL_STATUS_TONE.REQUESTED.fg, CALL_STATUS_TONE.CONNECTED.fg);
    assert.notEqual(CALL_STATUS_TONE.REQUESTED.bg, CALL_STATUS_TONE.CONNECTED.bg);
    assert.notEqual(CALL_STATUS_TONE.REQUESTED.icon, CALL_STATUS_TONE.CONNECTED.icon);
  });

  it('UNCONFIRMED is not dressed as success either', () => {
    assert.notEqual(CALL_STATUS_TONE.UNCONFIRMED.fg, CALL_STATUS_TONE.CONNECTED.fg);
    assert.equal(CALL_STATUS_TONE.UNCONFIRMED.fg, CALL_STATUS_TONE.REQUESTED.fg, 'both are "we do not know yet"');
    assert.equal(CALL_STATUS_TONE.NOT_YET_SEEN.fg, CALL_STATUS_TONE.REQUESTED.fg, 'and so is waiting for the row');
  });
});

// ── task 57: a call's row lands at HANG-UP, so "no row yet" is what a call in progress looks like ──
//
// voice-service writes the Call row from one place for a dial placed through the
// office PBX: POST /v1/calls, "from the PBX hang-up handler". /v1/answered only
// screen-pops. So for the whole of a live call the CRM sees exactly what it sees
// for a dial that never started — nothing. The 45-second window was written as if
// the row appeared when the call was placed, and turned every call longer than
// ~45 seconds from click to hang-up into "We could not confirm this call started"
// WHILE THE AGENT WAS STILL TALKING, with polling stopped so the outcome form
// never opened. Found by the desk on prod, 2026-09-12 20:27Z: one real 14-second
// call passed with a 6-second margin.
//
// These drive the REAL module through the poll loop index.tsx runs, over timelines
// shaped like the real one.
type Timeline = { rowLandsAfterMs: number | null; row: NonNullable<ObservedCall>; previous?: ObservedCall };
const at = (ms: number) => iso(T0 + ms);
const pbxRow = (startMs: number, endMs: number, seconds: number): NonNullable<ObservedCall> => ({
  id: 'call-57', startedAt: at(startMs), endedAt: at(endMs), durationSeconds: seconds,
});
// The pace the hero actually uses, so these timelines exercise the slow watch too.
// (Watched red first against eea509dd76 with a flat 10s pace: tonight's control
// passed; the 60-second and both 3-minute calls went UNCONFIRMED at +50s with
// polling stopped — the same trace the desk's simulation produced.)
const pollAsTheHeroDoes = (s: CallState) => callPollIntervalMs(s.status);

const runTimeline = (tl: Timeline, horizonMs: number, interval: (s: CallState) => number) => {
  let s = callRequested(T0);
  let t = T0;
  const seen: Array<{ atMs: number; status: string }> = [];
  while (t - T0 <= horizonMs && shouldPollCall(s.status, true)) {
    t += interval(s);
    const landed = tl.rowLandsAfterMs !== null && t - T0 >= tl.rowLandsAfterMs;
    s = nextCallState(s, landed ? tl.row : (tl.previous ?? null), t);
    seen.push({ atMs: t - T0, status: s.status });
    if (shouldOpenOutcomeSheet(s)) break;
  }
  return { final: s, seen, sheetOpensAtMs: shouldOpenOutcomeSheet(s) ? t - T0 : null };
};

// The prod call of 2026-09-12, to the millisecond: click 20:27:06.341, startedAt
// 20:27:22.200, endedAt 20:27:44.099, row createdAt 20:27:45.159, 14 seconds.
const TONIGHT: Timeline = { rowLandsAfterMs: 38_818, row: pbxRow(15_859, 37_758, 14) };
const TALK_60S: Timeline = { rowLandsAfterMs: 84_100, row: pbxRow(16_000, 83_000, 60) };
const TALK_3MIN: Timeline = { rowLandsAfterMs: 204_100, row: pbxRow(16_000, 203_000, 180) };
const TALK_3MIN_AFTER_A_PREVIOUS_CALL: Timeline = {
  ...TALK_3MIN,
  previous: { id: 'call-yesterday', startedAt: at(-86_400_000), endedAt: at(-86_280_000), durationSeconds: 120 },
};

describe('task 57 — a call longer than the ack window still ends in the outcome form', () => {
  for (const [name, tl] of [
    ['CONTROL: tonight\'s real 14-second call', TONIGHT],
    ['a 60-second call', TALK_60S],
    ['a 3-minute call', TALK_3MIN],
    ['a 3-minute call on a lead with an earlier call', TALK_3MIN_AFTER_A_PREVIOUS_CALL],
  ] as const) {
    it(`${name}: the form opens, with the right duration`, () => {
      const r = runTimeline(tl, 40 * 60_000, pollAsTheHeroDoes);
      assert.equal(r.final.status, 'ENDED', `ended as ${r.final.status}; trace ${JSON.stringify(r.seen)}`);
      assert.equal(r.final.endedSeconds, tl.row.durationSeconds);
      const pace = tl.rowLandsAfterMs! <= CALL_ACK_TIMEOUT_MS ? CALL_POLL_INTERVAL_MS : CALL_SLOW_POLL_INTERVAL_MS;
      assert.ok(r.sheetOpensAtMs !== null && r.sheetOpensAtMs <= tl.rowLandsAfterMs! + pace,
        `form opened at ${r.sheetOpensAtMs}ms for a row landing at ${tl.rowLandsAfterMs}ms`);
    });

    it(`${name}: never says it could not confirm the call while the call is still going`, () => {
      const r = runTimeline(tl, 40 * 60_000, pollAsTheHeroDoes);
      const falseWarnings = r.seen.filter((x) => x.atMs < tl.rowLandsAfterMs! && x.status === 'UNCONFIRMED');
      assert.deepEqual(falseWarnings, [], 'UNCONFIRMED shown mid-call');
    });
  }
});

describe('task 57 — a dial that never started is still caught, just not early', () => {
  it('no row ever: slow watch after the window, UNCONFIRMED only past the cap, then silence', () => {
    // The founder's first attempt on 2026-09-12 placed no call at all (no microphone).
    // That case must still end in the warning — it just cannot be told apart from a
    // live call before the cap, because both look like nothing.
    const r = runTimeline({ rowLandsAfterMs: null, row: pbxRow(0, 0, 0) }, 40 * 60_000, pollAsTheHeroDoes);
    assert.equal(r.final.status, 'UNCONFIRMED');
    const firstGiveUp = r.seen.find((x) => x.status === 'UNCONFIRMED')!;
    assert.ok(firstGiveUp.atMs > CALL_WATCH_TIMEOUT_MS, `gave up at ${firstGiveUp.atMs}ms`);
    assert.equal(r.seen[r.seen.length - 1]!.status, 'UNCONFIRMED', 'and nothing after it — the watch ended');
    const gapsWhileWaiting = r.seen.slice(1)
      .map((x, i) => ({ after: r.seen[i]!.status, gap: x.atMs - r.seen[i]!.atMs }))
      .filter((g) => g.after === 'NOT_YET_SEEN').map((g) => g.gap);
    assert.ok(gapsWhileWaiting.length > 50, `only ${gapsWhileWaiting.length} slow ticks`);
    assert.deepEqual([...new Set(gapsWhileWaiting)], [CALL_SLOW_POLL_INTERVAL_MS]);
  });

  it('the cap is checked BEFORE the window: a tick that arrives late lands on UNCONFIRMED', () => {
    // A closed laptop lid or a backgrounded phone can deliver the first tick an hour
    // late. Checking the window first would show a fresh "calls show up here…" band
    // on a dial already past the point of watching.
    assert.equal(nextCallState(callRequested(T0), null, T0 + CALL_WATCH_TIMEOUT_MS + 1).status, 'UNCONFIRMED');
  });
});

describe('task 57 — the cost of watching longer', () => {
  it('only a fresh dial is asked about often', () => {
    // Each ask reloads the whole lead page — at least nine reads, against a
    // 100-a-minute workspace limit the live WhatsApp bridge shares.
    assert.equal(callPollIntervalMs('REQUESTED'), CALL_POLL_INTERVAL_MS);
    for (const s of ['NOT_YET_SEEN', 'CONNECTED'] as const) {
      assert.equal(callPollIntervalMs(s), CALL_SLOW_POLL_INTERVAL_MS, s);
    }
    assert.ok(CALL_SLOW_POLL_INTERVAL_MS >= 30_000, 'a long call must not cost 54+ reads a minute');
  });

  it('the agent can end the watch whenever the page is unsure', () => {
    for (const s of ['NOT_YET_SEEN', 'UNCONFIRMED', 'REFUSED'] as const) assert.equal(canDismissCall(s), true, s);
    for (const s of ['IDLE', 'REQUESTED', 'CONNECTED', 'ENDED'] as const) assert.equal(canDismissCall(s), false, s);
  });
});

describe('task 57 — what the page may say while it cannot see the call', () => {
  it('NOT_YET_SEEN claims nothing went wrong, and nothing is connected', () => {
    // It is on screen for the whole of every longer call. Any hint of failure is
    // false for most of the agents reading it.
    const text = String(CALL_STATUS_TEXT.NOT_YET_SEEN);
    assert.doesNotMatch(text, /could not|couldn.t|fail|did not|didn.t|problem|error/i);
    assert.notEqual(text, CALL_STATUS_TEXT.CONNECTED);
    assert.notEqual(CALL_STATUS_TONE.NOT_YET_SEEN.fg, CALL_STATUS_TONE.CONNECTED.fg, 'not green');
  });

  it('and it still tells an agent with no call what to do', () => {
    const text = String(CALL_STATUS_TEXT.NOT_YET_SEEN);
    assert.match(text, /dialer/i, 'the no-microphone case must still be pointed at the dialer');
    assert.match(text, /after (they|it) end/i, 'and it says when a call will show');
  });
});
