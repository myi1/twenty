import { callPropelRoute } from '@/propel/lib/callPropelRoute';

import { fetchBoard } from '../deskApi';
import type { DeskBoardResponse, DeskPartialFailure, DeskRow } from '../types';

jest.mock('@/propel/lib/callPropelRoute');

const mockCall = callPropelRoute as jest.MockedFunction<typeof callPropelRoute>;
const NOW = Date.parse('2026-07-13T08:00:00.000Z');

const row = (id: string, overrides: Partial<DeskRow> = {}): DeskRow => ({
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
  ...overrides,
});

const page = (
  rows: DeskRow[],
  nextCursor: string | null,
  partialFailures: DeskPartialFailure[] = [],
): Extract<DeskBoardResponse, { ok: true }> => ({
  ok: true,
  rows,
  nextCursor,
  partialFailures,
  actingMemberName: 'Yahya',
  memberId: 'member-1',
});

beforeEach(() => {
  mockCall.mockReset();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('streams a deduplicated, canonically sorted snapshot and accumulated failures after every page', async () => {
  const cold = row('cold', { name: 'Old cold' });
  const hot = row('hot', { slaDeadline: '2026-07-13T08:30:00.000Z' });
  const updatedCold = row('cold', { name: 'Updated cold' });
  const tasksFailure: DeskPartialFailure = {
    source: 'tasks',
    code: 'LOOKUP_FAILED',
  };
  const viewingsFailure: DeskPartialFailure = {
    source: 'viewings',
    code: 'LOOKUP_FAILED',
  };
  mockCall
    .mockResolvedValueOnce(page([cold], 'opaque-2', [tasksFailure]) as never)
    .mockResolvedValueOnce(
      page([hot, updatedCold], null, [tasksFailure, viewingsFailure]) as never,
    );
  const snapshots: Array<{ rows: DeskRow[]; failures: DeskPartialFailure[] }> =
    [];
  const onMeta = jest.fn();

  const result = await fetchBoard(
    (rows, failures) => snapshots.push({ rows, failures }),
    onMeta,
  );

  expect(snapshots).toEqual([
    { rows: [cold], failures: [tasksFailure] },
    { rows: [hot, updatedCold], failures: [tasksFailure, viewingsFailure] },
  ]);
  expect(result).toEqual({
    rows: [hot, updatedCold],
    partialFailures: [tasksFailure, viewingsFailure],
  });
  expect(onMeta).toHaveBeenCalledTimes(1);
  expect(mockCall).toHaveBeenNthCalledWith(2, '/my-desk', {
    action: 'board',
    cursor: 'opaque-2',
  });
});

it('rejects a later transport failure only after streaming the successful snapshot', async () => {
  const first = row('first');
  mockCall
    .mockResolvedValueOnce(page([first], 'opaque-2') as never)
    .mockResolvedValueOnce(null as never);
  const snapshots: DeskRow[][] = [];

  await expect(fetchBoard((rows) => snapshots.push(rows))).rejects.toThrow(
    'DESK_LOAD_FAILED',
  );

  expect(snapshots).toEqual([[first]]);
});

it('throws on a repeated cursor after delivering that page snapshot', async () => {
  mockCall
    .mockResolvedValueOnce(page([row('first')], 'same-cursor') as never)
    .mockResolvedValueOnce(page([row('second')], 'same-cursor') as never);
  const snapshots: DeskRow[][] = [];

  await expect(fetchBoard((rows) => snapshots.push(rows))).rejects.toThrow(
    'DESK_PAGING_STUCK',
  );

  expect(snapshots).toHaveLength(2);
  expect(snapshots[1].map(({ id }) => id)).toEqual(['first', 'second']);
});

it('delivers the 40th page snapshot before throwing the overflow guard', async () => {
  for (let pageIndex = 0; pageIndex < 40; pageIndex += 1) {
    mockCall.mockResolvedValueOnce(
      page([row(`row-${pageIndex}`)], `cursor-${pageIndex + 1}`) as never,
    );
  }
  const snapshots: DeskRow[][] = [];

  await expect(fetchBoard((rows) => snapshots.push(rows))).rejects.toThrow(
    'DESK_PAGING_OVERFLOW',
  );

  expect(snapshots).toHaveLength(40);
  expect(snapshots[39]).toHaveLength(40);
  expect(snapshots[39]).toContainEqual(row('row-39'));
});

it('emits first-page metadata only once across multiple pages', async () => {
  mockCall
    .mockResolvedValueOnce(page([row('first')], 'opaque-2') as never)
    .mockResolvedValueOnce(page([row('second')], null) as never);
  const onMeta = jest.fn();

  await fetchBoard(() => undefined, onMeta);

  expect(onMeta).toHaveBeenCalledTimes(1);
  expect(onMeta).toHaveBeenCalledWith({
    actingMemberName: 'Yahya',
    memberId: 'member-1',
  });
});
