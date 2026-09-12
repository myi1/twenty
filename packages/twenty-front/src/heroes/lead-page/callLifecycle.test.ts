// F4 regressions: what the page may claim about a call, and when it stops asking.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CALL_ACK_TIMEOUT_MS,
  CALL_STATUS_TEXT,
  CALL_WATCH_TIMEOUT_MS,
  callRefused,
  callRequested,
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
    for (const s of ['REQUESTED', 'RINGING', 'CONNECTED']) {
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
    for (const s of ['REQUESTED', 'RINGING', 'CONNECTED', 'IDLE', 'ENDED']) {
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

  it('and it still times out into UNCONFIRMED rather than waiting forever', () => {
    const old: ObservedCall = { id: 'call-old', startedAt: iso(T0 - 86_400_000), endedAt: iso(T0 - 86_000_000), durationSeconds: 120 };
    const s = nextCallState(callRequested(T0), old, T0 + CALL_ACK_TIMEOUT_MS + 1);
    assert.equal(s.status, 'UNCONFIRMED');
  });
});

describe('nextCallState — a postMessage is not an acknowledgement', () => {
  it('nothing observed within the window becomes UNCONFIRMED, not "on a call"', () => {
    // startPropelCall returns true when it has POSTED a window message.
    // postMessage cannot fail, so true means "we spoke into the room". With the
    // dock closed or the softphone unregistered, the page used to show a call
    // underway and poll for thirty minutes for something that never existed.
    let s = callRequested(T0);
    s = nextCallState(s, null, T0 + CALL_ACK_TIMEOUT_MS - 1);
    assert.equal(s.status, 'REQUESTED', 'not yet — give the PBX and the CRM a moment');
    s = nextCallState(s, null, T0 + CALL_ACK_TIMEOUT_MS + 1);
    assert.equal(s.status, 'UNCONFIRMED');
    assert.equal(shouldPollCall(s.status, true), false, 'and it stops asking');
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
    for (const status of ['IDLE', 'REQUESTED', 'CONNECTED', 'REFUSED', 'UNCONFIRMED'] as const) {
      assert.equal(shouldOpenOutcomeSheet({ ...IDLE_CALL, status }), false, status);
    }
    assert.equal(shouldOpenOutcomeSheet({ ...IDLE_CALL, status: 'ENDED' }), true);
  });

  it('an UNCONFIRMED call does not pop the sheet — there is no outcome to log', () => {
    const s = nextCallState(callRequested(T0), null, T0 + CALL_ACK_TIMEOUT_MS + 1);
    assert.equal(shouldOpenOutcomeSheet(s), false);
  });
});
