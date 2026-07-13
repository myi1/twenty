import { createBoardLoadCoordinator } from '../boardLoad';
import type { DeskPartialFailure, DeskRow } from '../types';

const row = (id: string): DeskRow => ({
  id,
  laneObject: 'lead',
  recordId: id,
  personId: id,
  phoneE164: null,
  hasWhatsApp: false,
  name: id,
  meta: 'Dubai · Web lead',
  stage: 'NEW',
  valueAed: null,
  nextAction: null,
  nextActionTaskId: null,
  nextActionDueAt: null,
  nextActionSource: 'stageMap',
  lastTouchAt: null,
  slaDeadline: null,
  snoozedUntil: null,
  unreadWa: 0,
  viewingTodayAt: null,
  taskDueToday: false,
});

type PageCallback = (rows: DeskRow[], failures: DeskPartialFailure[]) => void;
type MetaCallback = (meta: {
  actingMemberName: string | null;
  memberId: string | null;
}) => void;

type PendingLoad = {
  onPage: PageCallback;
  onMeta?: MetaCallback;
  resolve: () => void;
  reject: (error: Error) => void;
};

const setup = () => {
  const pending: PendingLoad[] = [];
  const fetchBoard = (
    onPage: PageCallback,
    onMeta?: MetaCallback,
  ): Promise<unknown> =>
    new Promise((resolve, reject) => {
      pending.push({
        onPage,
        onMeta,
        resolve: () => resolve(undefined),
        reject,
      });
    });
  const state = {
    rows: [row('existing')],
    partial: true,
    partialFailures: [
      { source: 'existing-source', code: 'LOOKUP_FAILED' },
    ] as DeskPartialFailure[],
    error: 'STALE_ERROR' as string | null,
    status: 'ready' as 'loading' | 'ready' | 'error',
    firstName: 'Existing agent' as string | null,
    memberId: 'existing-member' as string | null,
  };
  const coordinator = createBoardLoadCoordinator({
    fetchBoard,
    hasRows: () => state.rows.length > 0,
    onStart: () => {
      state.error = null;
      state.partial = false;
      state.partialFailures = [];
    },
    onPage: (rows, failures) => {
      state.rows = rows;
      state.partial = failures.length > 0;
      state.partialFailures = failures;
      state.status = 'ready';
    },
    onMeta: (meta) => {
      state.firstName = meta.actingMemberName;
      state.memberId = meta.memberId;
    },
    onPartialError: () => {
      state.partial = true;
      state.status = 'ready';
    },
    onError: (error) => {
      state.status = 'error';
      state.error = error;
    },
  });

  return { coordinator, pending, state };
};

it('keeps only the newest retry writes and preserves rows until its first page', async () => {
  const { coordinator, pending, state } = setup();

  const oldLoad = coordinator.load();
  expect(state).toMatchObject({
    rows: [row('existing')],
    partial: false,
    partialFailures: [],
    error: null,
  });

  const newLoad = coordinator.load();
  expect(state.rows).toEqual([row('existing')]);

  pending[1].onPage([row('new')], []);
  pending[1].onMeta?.({
    actingMemberName: 'New agent',
    memberId: 'new-member',
  });
  pending[1].resolve();
  await newLoad;

  pending[0].onPage(
    [row('old')],
    [{ source: 'old-source', code: 'LOOKUP_FAILED' }],
  );
  pending[0].onMeta?.({
    actingMemberName: 'Old agent',
    memberId: 'old-member',
  });
  pending[0].reject(new Error('OLD_LOAD_FAILED'));
  await oldLoad;

  expect(state).toEqual({
    rows: [row('new')],
    partial: false,
    partialFailures: [],
    error: null,
    status: 'ready',
    firstName: 'New agent',
    memberId: 'new-member',
  });
});

it('invalidates a StrictMode-cleaned load before a later setup becomes active', async () => {
  const { coordinator, pending, state } = setup();

  const cleanedLoad = coordinator.load();
  coordinator.invalidate();
  const activeLoad = coordinator.load();

  pending[1].onPage([row('active')], []);
  pending[1].resolve();
  await activeLoad;

  pending[0].onPage([row('cleaned')], []);
  pending[0].reject(new Error('CLEANED_LOAD_FAILED'));
  await cleanedLoad;

  expect(state.rows).toEqual([row('active')]);
  expect(state.partial).toBe(false);
  expect(state.partialFailures).toEqual([]);
  expect(state.error).toBeNull();
});

it('publishes the exact current partial-failure sources without collapsing them', async () => {
  const { coordinator, pending, state } = setup();
  const load = coordinator.load();
  const failures: DeskPartialFailure[] = [
    { source: 'secondaryOpportunity', code: 'LOOKUP_FAILED' },
    { source: 'viewings', code: 'LOOKUP_FAILED' },
  ];

  pending[0].onPage([row('current')], failures);
  pending[0].resolve();
  await load;

  expect(state.partialFailures).toEqual(failures);
});
