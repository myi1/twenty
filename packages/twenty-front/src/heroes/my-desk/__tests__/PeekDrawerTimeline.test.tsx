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
import {
  createTimelineLoadCoordinator,
  type TimelineLoadCoordinator,
  type TimelineLoadState,
} from '../timelineLoadCoordinator';
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

jest.mock('../timelineLoadCoordinator', () => {
  const actual = jest.requireActual(
    '../timelineLoadCoordinator',
  ) as typeof import('../timelineLoadCoordinator');

  return {
    ...actual,
    createTimelineLoadCoordinator: jest.fn(
      (
        fetchTimeline: Parameters<
          typeof actual.createTimelineLoadCoordinator
        >[0],
        onChange: Parameters<typeof actual.createTimelineLoadCoordinator>[1],
      ) => {
        const onChangeSpy = jest.fn(onChange);
        const coordinator = actual.createTimelineLoadCoordinator(
          fetchTimeline,
          onChangeSpy,
        );
        return {
          ...coordinator,
          cancel: jest.fn(coordinator.cancel),
          onChangeSpy,
        };
      },
    ),
  };
});

const mockedDeskApi = {
  assistCallNote: jest.mocked(assistCallNote),
  assistNextAction: jest.mocked(assistNextAction),
  assistWaDraft: jest.mocked(assistWaDraft),
  fetchTimeline: jest.mocked(fetchTimeline),
  fetchWaContext: jest.mocked(fetchWaContext),
  runDeskAction: jest.mocked(runDeskAction),
  sendDeskWhatsApp: jest.mocked(sendDeskWhatsApp),
};

type ObservedTimelineCoordinator = TimelineLoadCoordinator & {
  cancel: jest.Mock<void, []>;
  onChangeSpy: jest.Mock<void, [TimelineLoadState]>;
};

const getObservedCoordinator = (): ObservedTimelineCoordinator => {
  const factory = jest.mocked(createTimelineLoadCoordinator);
  const result = factory.mock.results[factory.mock.results.length - 1];
  if (!result || result.type !== 'return') {
    throw new Error('Timeline coordinator was not created.');
  }
  return result.value as ObservedTimelineCoordinator;
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
    Object.values(mockedDeskApi).forEach((mock) => mock.mockReset());
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
    const loadOlderClass = [...loadOlder.classList].find((className) =>
      className.startsWith('css-'),
    );
    const focusRule = [...document.styleSheets]
      .flatMap((styleSheet) => [...styleSheet.cssRules])
      .map((rule) => rule.cssText)
      .find((cssText) => cssText.includes(`.${loadOlderClass}:focus-visible`));
    expect(focusRule).toContain('outline: 2px solid var(--p-accent)');
    expect(focusRule).toContain('outline-offset: 2px');

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
    const partialWarning = screen.getByRole('status');
    expect(partialWarning).toHaveTextContent(
      'Some timeline sources could not be loaded.',
    );
    expect(partialWarning).toHaveStyle({ color: 'var(--p-warn)' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Load older activity' }),
    ).not.toBeInTheDocument();
  });

  it('renders only the replacement record when the previous initial request resolves late', async () => {
    const leadARequest = deferred<DeskTimelineResponse | null>();
    const leadBRequest = deferred<DeskTimelineResponse | null>();
    mockedDeskApi.fetchTimeline
      .mockReturnValueOnce(leadARequest.promise)
      .mockReturnValueOnce(leadBRequest.promise);
    const view = render(
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
    const coordinator = getObservedCoordinator();
    const leadB = {
      ...row,
      id: 'lead:lead-b',
      recordId: 'lead-b',
      name: 'Lead B',
    };

    view.rerender(
      <PeekDrawer
        row={leadB}
        mode="overview"
        host={host}
        onClose={jest.fn()}
        onStartCall={jest.fn()}
        onRowPatch={jest.fn()}
        onMoveStage={jest.fn()}
      />,
    );
    expect(coordinator.cancel).toHaveBeenCalledTimes(1);
    const publicationsAfterReplacement =
      coordinator.onChangeSpy.mock.calls.length;

    await act(async () => {
      leadARequest.resolve(
        success([event('lead-a-event', '2026-07-13T10:00:00.000Z')], 'a-2'),
      );
      await leadARequest.promise;
    });
    expect(coordinator.onChangeSpy).toHaveBeenCalledTimes(
      publicationsAfterReplacement,
    );
    expect(screen.queryByText('Event lead-a-event')).not.toBeInTheDocument();
    expect(screen.getByText('Loading activity…')).toBeInTheDocument();

    await act(async () => {
      leadBRequest.resolve(
        success([event('lead-b-event', '2026-07-13T11:00:00.000Z')], 'b-2'),
      );
      await leadBRequest.promise;
    });

    expect(screen.getByText('Event lead-b-event')).toBeInTheDocument();
    expect(screen.queryByText('Event lead-a-event')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Load older activity' }),
    ).toBeInTheDocument();
    expect(mockedDeskApi.fetchTimeline).toHaveBeenNthCalledWith(
      2,
      'lead',
      'lead-b',
    );
  });

  it('cancels an unresolved initial load on unmount before it can publish', async () => {
    const initialRequest = deferred<DeskTimelineResponse | null>();
    mockedDeskApi.fetchTimeline.mockReturnValueOnce(initialRequest.promise);
    const view = render(
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
    const coordinator = getObservedCoordinator();

    view.unmount();
    const publicationsBeforeResolution =
      coordinator.onChangeSpy.mock.calls.length;

    await act(async () => {
      initialRequest.resolve(
        success([event('late-initial', '2026-07-13T10:00:00.000Z')], null),
      );
      await initialRequest.promise;
    });

    expect(coordinator.onChangeSpy).toHaveBeenCalledTimes(
      publicationsBeforeResolution,
    );
    expect(coordinator.cancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Event late-initial')).not.toBeInTheDocument();
  });

  it('does not publish a late older-page update after the drawer unmounts', async () => {
    const olderRequest = deferred<DeskTimelineResponse | null>();
    mockedDeskApi.fetchTimeline
      .mockResolvedValueOnce(
        success([event('first', '2026-07-13T10:00:00.000Z')], 'page-2'),
      )
      .mockReturnValueOnce(olderRequest.promise);
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const view = render(
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

    const loadOlder = await screen.findByRole('button', {
      name: 'Load older activity',
    });
    const coordinator = getObservedCoordinator();
    fireEvent.click(loadOlder);
    view.unmount();
    const publicationsBeforeResolution =
      coordinator.onChangeSpy.mock.calls.length;
    await act(async () => {
      olderRequest.resolve(
        success([event('late', '2026-07-12T10:00:00.000Z')], null, true),
      );
      await olderRequest.promise;
    });

    expect(coordinator.onChangeSpy).toHaveBeenCalledTimes(
      publicationsBeforeResolution,
    );
    expect(coordinator.cancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Event late')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Some timeline sources could not be loaded.'),
    ).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('renders retryable failures as errors and clears them after a successful retry', async () => {
    mockedDeskApi.fetchTimeline
      .mockResolvedValueOnce(
        success([event('first', '2026-07-13T10:00:00.000Z')], 'page-2'),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(success([], null));
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

    fireEvent.click(
      await screen.findByRole('button', { name: 'Load older activity' }),
    );
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Could not load older activity.');
    expect(error).toHaveStyle({ color: 'var(--p-bad)' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Load older activity' }),
    );

    expect(await screen.findByText('Event first')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Load older activity' }),
    ).not.toBeInTheDocument();
  });
});
