// Pure transition over the actual Person assignment fields. The caller must hold
// the Person/version locks and resolve actor + next-owner eligibility inside its
// transaction. This function never authenticates a caller or writes a database.
export type AssignmentRootState = {
  personId: string;
  assignedAgentId: string | null;
  assignedAt: string | null;
  slaBreachedAt: string | null;
  slaWarnedAt: string | null;
  assignmentAuthorityEpoch: string | null;
  assignmentVersion: string;
  lastFence: string;
};

export type AssignmentTransitionRequest = {
  nextOwnerId: string | null;
  expectedVersion: string;
  fence: string;
  authorityEpoch: string;
  nextOwnerEligible: boolean;
};

export type AssignmentTransition = {
  changed: boolean;
  fromOwnerId: string | null;
  ownerId: string | null;
  assignmentVersion: string;
  lastFence: string;
  eventType: 'LEAD_ASSIGNED' | 'LEAD_REASSIGNED' | null;
  personPatch: Partial<Pick<AssignmentRootState,
    'assignedAgentId' | 'assignedAt' | 'slaBreachedAt' | 'slaWarnedAt'>>;
};

export class AssignmentTransitionError extends Error {
  readonly code: 'DEPENDENCY_UNAVAILABLE' | 'VALIDATION_FAILED' | 'FORBIDDEN' | 'STALE_VERSION';

  constructor(code: AssignmentTransitionError['code'], message: string) {
    super(message);
    this.name = 'AssignmentTransitionError';
    this.code = code;
  }
}

const MAX_ASSIGNMENT_COUNTER = 9007199254740991n;
const canonicalCounter = (value: unknown): value is string =>
  typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) &&
  value.length <= 16 && BigInt(value) <= MAX_ASSIGNMENT_COUNTER;
const canonicalId = (value: unknown): value is string => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const clockIsValid = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export const planAssignmentTransition = (
  state: AssignmentRootState,
  request: AssignmentTransitionRequest,
  committedAt: string,
): AssignmentTransition => {
  if (!canonicalCounter(state.assignmentVersion) || !canonicalCounter(state.lastFence) ||
      !canonicalId(state.personId) || (state.assignedAgentId !== null && !canonicalId(state.assignedAgentId)) ||
      (state.assignedAgentId === null ? state.assignedAt !== null : !clockIsValid(state.assignedAt)) ||
      (state.slaBreachedAt !== null && !clockIsValid(state.slaBreachedAt)) ||
      (state.slaWarnedAt !== null && !clockIsValid(state.slaWarnedAt))) {
    throw new AssignmentTransitionError('DEPENDENCY_UNAVAILABLE', 'Stored assignment authority is malformed');
  }
  if (!canonicalCounter(request.expectedVersion) || !canonicalCounter(request.fence) ||
      request.fence === '0' || (request.nextOwnerId !== null && !canonicalId(request.nextOwnerId)) ||
      !clockIsValid(committedAt)) {
    throw new AssignmentTransitionError('VALIDATION_FAILED', 'Invalid assignment transition input');
  }
  if (request.authorityEpoch !== 'assignment-v1' || state.assignmentAuthorityEpoch !== request.authorityEpoch) {
    throw new AssignmentTransitionError('FORBIDDEN', 'Person is not enrolled in this command authority');
  }
  if (request.nextOwnerId !== null && request.nextOwnerEligible !== true) {
    throw new AssignmentTransitionError('FORBIDDEN', 'Next owner is not an active eligible workspace member');
  }
  // Replay lookup happens under the root lock BEFORE this new-intent function.
  if (state.assignmentVersion !== request.expectedVersion || BigInt(request.fence) <= BigInt(state.lastFence)) {
    throw new AssignmentTransitionError('STALE_VERSION', 'Assignment version or claim fence is stale');
  }
  const changed = state.assignedAgentId !== request.nextOwnerId;
  if (changed && BigInt(state.assignmentVersion) === MAX_ASSIGNMENT_COUNTER) {
    throw new AssignmentTransitionError('DEPENDENCY_UNAVAILABLE', 'Assignment version cannot advance safely');
  }
  return {
    changed, fromOwnerId: state.assignedAgentId, ownerId: request.nextOwnerId,
    assignmentVersion: (BigInt(state.assignmentVersion) + (changed ? 1n : 0n)).toString(),
    lastFence: request.fence,
    eventType: changed ? (state.assignedAgentId === null ? 'LEAD_ASSIGNED' : 'LEAD_REASSIGNED') : null,
    personPatch: changed ? {
      assignedAgentId: request.nextOwnerId,
      assignedAt: request.nextOwnerId === null ? null : committedAt,
      slaBreachedAt: null,
      slaWarnedAt: null,
    } : {},
  };
};
