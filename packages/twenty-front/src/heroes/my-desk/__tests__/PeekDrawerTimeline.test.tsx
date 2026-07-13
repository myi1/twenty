import { act, fireEvent, render, screen } from '@testing-library/react';

import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import {
  assistCallNote,
  assistNextAction,
  assistWaDraft,
  fetchTimeline,
  fetchWaContext,
  runDeskAction,
  sendDeskWhatsApp,
} from '../deskApi';
import { PeekDrawer } from '../PeekDrawer';
import type {
  DeskRow,
  DeskTimelineEvent,
  DeskTimelineResponse,
} from '../types';

jest.mock('../deskApi', () => ({
  assistCallNote: jest.fn(),
  assistNextAction: jest.fn(),
  assistWaDraft: jest.fn(),
  fetchTimeline: jest.fn(),
  fetchWaContext: jest.fn(),
  runDeskAction: jest.fn(),
  sendDeskWhatsApp: jest.fn(),
}));

const mockedDeskApi = {
  assistCallNote: jest.mocked(assistCallNote),
  assistNextAction: jest.mocked(assistNextAction),
  assistWaDraft: jest.mocked(assistWaDraft),
  fetchTimeline: jest.mocked(fetchTimeline),
  fetchWaContext: jest.mocked(fetchWaContext),
  runDeskAction: jest.mocked(runDeskAction),
  sendDeskWhatsApp: jest.mocked(sendDeskWhatsApp),
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const event = (id: string, occurredAt: string): DeskTimelineEvent => ({
  id,
  type: 'NOTE',
  occurredAt,
  title: `Event ${id}`,
  by: 'Agent',
});

const success = (
  events: DeskTimelineEvent[],
  nextCursor: string | null,
  partial = false,
): DeskTimelineResponse => ({
  ok: true,
  events,
  nextCursor,
  partialFailures: partial ? [{ source: 'tasks', code: 'LOOKUP_FAILED' }] : [],
});

const row: DeskRow = {
  id: 'lead:lead-a',
  laneObject: 'lead',
  recordId: 'lead-a',
  personId: null,
  phoneE164: null,
  hasWhatsApp: false,
  name: 'Lead A',
  meta: 'Dubai · Web lead',
  stage: 'NEW',
  valueAed: null,
  nextAction: 'Review lead',
  nextActionTaskId: null,
  nextActionDueAt: null,
  nextActionSource: 'task',
  lastTouchAt: null,
  slaDeadline: null,
  snoozedUntil: null,
  unreadWa: 0,
  viewingTodayAt: null,
  taskDueToday: false,
};

const host: PropelHeroHost = {
  callPropelRoute: jest.fn(),
  getToken: jest.fn(),
  serverBaseUrl: 'http://localhost',
  navigate: jest.fn(),
  notify: jest.fn(),
  searchParams: new URLSearchParams(),
};

describe('PeekDrawer timeline pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('offers an accessible guarded load-older control and hides it at the terminal cursor', async () => {
    const firstRequest = deferred<DeskTimelineResponse | null>();
    const olderRequest = deferred<DeskTimelineResponse | null>();
    mockedDeskApi.fetchTimeline
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(olderRequest.promise);

    render(
      <PeekDrawer
        row={row}
        mode="overview"
        host={host}
        onClose={jest.fn()}
        onStartCall={jest.fn()}
        onRowPatch={jest.fn()}
        onMoveStage={jest.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Load older activity' }),
    ).not.toBeInTheDocument();

    await act(async () => {
      firstRequest.resolve(
        success([event('first', '2026-07-13T10:00:00.000Z')], 'page-2'),
      );
      await firstRequest.promise;
    });

    const loadOlder = screen.getByRole('button', {
      name: 'Load older activity',
    });
    fireEvent.click(loadOlder);
    fireEvent.click(loadOlder);

    expect(loadOlder).toBeDisabled();
    expect(loadOlder).toHaveTextContent('Loading…');
    expect(mockedDeskApi.fetchTimeline).toHaveBeenCalledTimes(2);

    await act(async () => {
      olderRequest.resolve(
        success([event('older', '2026-07-12T10:00:00.000Z')], null, true),
      );
      await olderRequest.promise;
    });

    expect(screen.getByText('Event first')).toBeInTheDocument();
    expect(screen.getByText('Event older')).toBeInTheDocument();
    expect(
      screen.getByText('Some timeline sources could not be loaded.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Load older activity' }),
    ).not.toBeInTheDocument();
  });
});
