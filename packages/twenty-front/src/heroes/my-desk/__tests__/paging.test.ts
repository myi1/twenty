import {
  mergeDeskRows,
  mergePartialFailures,
  mergeTimelineEvents,
} from '../paging';
import type { DeskPartialFailure, DeskRow, DeskTimelineEvent } from '../types';

const NOW = Date.parse('2026-07-13T08:00:00.000Z');

const row = (overrides: Partial<DeskRow> = {}): DeskRow => ({
  id: 'lead:a',
  laneObject: 'lead',
  recordId: 'a',
  personId: 'person-a',
  phoneE164: '+971500000000',
  hasWhatsApp: true,
  name: 'Lead A',
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

const failure = (source: string): DeskPartialFailure => ({
  source,
  code: 'LOOKUP_FAILED',
});

const event = (
  id: string,
  occurredAt: string,
  overrides: Partial<DeskTimelineEvent> = {},
): DeskTimelineEvent => ({
  id,
  type: 'NOTE',
  occurredAt,
  title: `Event ${id}`,
  by: 'Agent',
  ...overrides,
});

describe('mergeDeskRows', () => {
  it('deduplicates by row id across pages and keeps the newest representation', () => {
    const first = [
      row({ id: 'lead:a', name: 'old' }),
      row({ id: 'lead:b', recordId: 'b' }),
    ];
    const second = [
      row({ id: 'lead:a', name: 'new' }),
      row({ id: 'lead:c', recordId: 'c' }),
    ];

    const merged = mergeDeskRows(first, second, NOW);

    expect(merged).toHaveLength(3);
    expect(merged.find(({ id }) => id === 'lead:a')?.name).toBe('new');
  });

  it('re-sorts the complete accumulated set using My Desk band order', () => {
    const coldRow = row({ id: 'lead:cold', recordId: 'cold' });
    const hotRow = row({
      id: 'lead:hot',
      recordId: 'hot',
      slaDeadline: '2026-07-13T08:30:00.000Z',
    });

    expect(mergeDeskRows([coldRow], [hotRow], NOW)).toEqual([hotRow, coldRow]);
  });

  it('sorts the same band by oldest touch first, treating no touch as oldest', () => {
    const untouched = row({
      id: 'lead:untouched',
      recordId: 'untouched',
      lastTouchAt: null,
    });
    const older = row({
      id: 'lead:older',
      recordId: 'older',
      lastTouchAt: '2026-07-11T08:00:00.000Z',
    });
    const newer = row({
      id: 'lead:newer',
      recordId: 'newer',
      lastTouchAt: '2026-07-12T08:00:00.000Z',
    });

    expect(mergeDeskRows([newer], [older, untouched], NOW)).toEqual([
      untouched,
      older,
      newer,
    ]);
  });
});

describe('mergePartialFailures', () => {
  it('deduplicates repeated failures while retaining distinct source failures', () => {
    const failureA = failure('tasks');
    const failureB = failure('viewings');

    expect(mergePartialFailures([failureA], [failureA, failureB])).toEqual([
      failureA,
      failureB,
    ]);
  });
});

describe('mergeTimelineEvents', () => {
  it('deduplicates by type and id, keeps the newest representation, and sorts newest first', () => {
    const oldNote = event('shared', '2026-07-13T07:00:00.000Z', {
      title: 'Old note',
    });
    const updatedNote = event('shared', '2026-07-13T07:30:00.000Z', {
      title: 'Updated note',
    });
    const call = event('shared', '2026-07-13T08:00:00.000Z', { type: 'CALL' });

    expect(mergeTimelineEvents([oldNote], [updatedNote, call])).toEqual([
      call,
      updatedNote,
    ]);
  });
});
