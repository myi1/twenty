import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planAssignmentTransition } from '../../packages/twenty-server/src/modules/propel-command/assignment-root-transition.ts';

const personId = '11111111-1111-4111-8111-111111111111';
const agentA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const agentB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const clock = '2026-09-13T01:00:00.000Z';
const state = () => ({ personId, assignedAgentId: agentA, assignedAt: '2026-09-12T00:00:00.000Z', slaBreachedAt: clock, slaWarnedAt: clock, assignmentAuthorityEpoch: 'assignment-v1', assignmentVersion: '7', lastFence: '4' });
const request = () => ({ nextOwnerId: agentB, expectedVersion: '7', fence: '5', authorityEpoch: 'assignment-v1', nextOwnerEligible: true });
const fails = (fn, code) => assert.throws(fn, (error) => error.code === code);

test('real assignedAgentId/clocks transition increments once and leaves unrelated fields outside patch', () => {
  const original = state();
  const result = planAssignmentTransition(original, request(), clock);
  assert.equal(result.assignmentVersion, '8');
  assert.equal(result.lastFence, '5');
  assert.equal(result.fromOwnerId, agentA);
  assert.equal(result.eventType, 'LEAD_REASSIGNED');
  assert.deepEqual(result.personPatch, { assignedAgentId: agentB, assignedAt: clock, slaBreachedAt: null, slaWarnedAt: null });
  assert.deepEqual(original, state());
});

test('pool return clears current assignment clocks and advances; pool-to-agent is assigned event', () => {
  const pooled = planAssignmentTransition(state(), { ...request(), nextOwnerId: null, nextOwnerEligible: false }, clock);
  assert.deepEqual(pooled.personPatch, { assignedAgentId: null, assignedAt: null, slaBreachedAt: null, slaWarnedAt: null });
  const assigned = planAssignmentTransition({ ...state(), ...pooled.personPatch, assignmentVersion: '8', lastFence: '5' }, { ...request(), expectedVersion: '8', fence: '6' }, clock);
  assert.equal(assigned.assignmentVersion, '9');
  assert.equal(assigned.eventType, 'LEAD_ASSIGNED');
});

test('same owner retains version/clocks and creates no event; expected version still checked', () => {
  const same = planAssignmentTransition(state(), { ...request(), nextOwnerId: agentA }, clock);
  assert.equal(same.changed, false);
  assert.equal(same.assignmentVersion, '7');
  assert.deepEqual(same.personPatch, {});
  assert.equal(same.eventType, null);
  fails(() => planAssignmentTransition(state(), { ...request(), nextOwnerId: agentA, expectedVersion: '6' }, clock), 'STALE_VERSION');
});

test('epoch cannot be absent/mismatched and owner eligibility is required even for same owner', () => {
  for (const assignmentAuthorityEpoch of [null, '', 'old-v0']) fails(() => planAssignmentTransition({ ...state(), assignmentAuthorityEpoch }, request(), clock), 'FORBIDDEN');
  fails(() => planAssignmentTransition(state(), { ...request(), nextOwnerId: agentA, nextOwnerEligible: false }, clock), 'FORBIDDEN');
});

test('new command requires higher fence; malformed physical versions and unsafe growth refuse', () => {
  for (const fence of ['4', '3']) fails(() => planAssignmentTransition(state(), { ...request(), fence }, clock), 'STALE_VERSION');
  for (const assignmentVersion of ['07', '9007199254740992', 'NaN', null]) fails(() => planAssignmentTransition({ ...state(), assignmentVersion }, request(), clock), 'DEPENDENCY_UNAVAILABLE');
  const maximum = { ...state(), assignmentVersion: '9007199254740991' };
  fails(() => planAssignmentTransition(maximum, { ...request(), expectedVersion: maximum.assignmentVersion }, clock), 'DEPENDENCY_UNAVAILABLE');
  assert.equal(planAssignmentTransition(maximum, { ...request(), expectedVersion: maximum.assignmentVersion, nextOwnerId: agentA }, clock).changed, false);
});

test('golden root versions 7 to 11 across A→B→C→pool→B without mutation on stale replay', () => {
  let current = state();
  const agentC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  for (const [index, owner] of [agentB, agentC, null, agentB].entries()) {
    const result = planAssignmentTransition(current, { ...request(), nextOwnerId: owner, expectedVersion: String(7 + index), fence: String(5 + index) }, clock);
    current = { ...current, ...result.personPatch, assignmentVersion: result.assignmentVersion, lastFence: result.lastFence };
  }
  assert.equal(current.assignmentVersion, '11');
  assert.equal(current.assignedAgentId, agentB);
  fails(() => planAssignmentTransition(current, request(), clock), 'STALE_VERSION');
});


test('missing or malformed committed clocks are dependency failures, never reconstructed on no-op', () => {
  for (const patch of [{ assignedAt: null }, { assignedAt: 'yesterday' }, { slaWarnedAt: 'bad' }, { slaBreachedAt: '' }]) {
    fails(() => planAssignmentTransition({ ...state(), ...patch }, { ...request(), nextOwnerId: agentA }, clock), 'DEPENDENCY_UNAVAILABLE');
  }
});
