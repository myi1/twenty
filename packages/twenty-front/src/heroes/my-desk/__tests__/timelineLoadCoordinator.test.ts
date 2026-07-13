import {
  createTimelineLoadCoordinator,
  type TimelineFetch,
} from '../timelineLoadCoordinator';
import type { DeskTimelineEvent, DeskTimelineResponse } from '../types';

const event = (
  id: string,
  occurredAt: string,
  type: DeskTimelineEvent['type'] = 'NOTE',
): DeskTimelineEvent => ({
  id,
  type,
  occurredAt,
  title: `Event ${id}`,
  by: 'Agent',
});

const success = (
  events: DeskTimelineEvent[],
  nextCursor: string | null,
  partialSources: string[] = [],
): DeskTimelineResponse => ({
  ok: true,
  events,
  nextCursor,
  partialFailures: partialSources.map((source) => ({
    source,
    code: 'LOOKUP_FAILED',
  })),
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('createTimelineLoadCoordinator', () => {
  it('replaces the initial timeline and surfaces partial source failures without dropping events', async () => {
    const fetchTimeline: TimelineFetch = jest
      .fn()
      .mockResolvedValue(
        success([event('new', '2026-07-13T10:00:00.000Z')], 'older-page', [
          'tasks',
        ]),
      );
    const coordinator = createTimelineLoadCoordinator(fetchTimeline, () => {});

    await coordinator.loadInitial('lead', 'lead-a');

    expect(coordinator.getState()).toMatchObject({
      events: [event('new', '2026-07-13T10:00:00.000Z')],
      cursor: 'older-page',
      loadingInitial: false,
      loadingOlder: false,
      error: 'Some timeline sources could not be loaded.',
    });
  });

  it('appends older events losslessly, deduplicates overlaps, and removes the control at the terminal cursor', async () => {
    const first = event('first', '2026-07-13T10:00:00.000Z');
    const older = event('older', '2026-07-12T10:00:00.000Z', 'TASK');
    const fetchTimeline: TimelineFetch = jest
      .fn()
      .mockResolvedValueOnce(success([first], 'page-2'))
      .mockResolvedValueOnce(success([first, older], null));
    const coordinator = createTimelineLoadCoordinator(fetchTimeline, () => {});

    await coordinator.loadInitial('lead', 'lead-a');
    await coordinator.loadOlder('lead', 'lead-a');

    expect(coordinator.getState()).toMatchObject({
      events: [first, older],
      cursor: null,
      loadingOlder: false,
      error: null,
    });
    expect(fetchTimeline).toHaveBeenNthCalledWith(
      2,
      'lead',
      'lead-a',
      'page-2',
    );
  });

  it('preserves events and cursor after failure so one guarded retry requests the same page', async () => {
    const first = event('first', '2026-07-13T10:00:00.000Z');
    const pendingFailure = deferred<DeskTimelineResponse | null>();
    const fetchTimeline: TimelineFetch = jest
      .fn()
      .mockResolvedValueOnce(success([first], 'page-2'))
      .mockReturnValueOnce(pendingFailure.promise)
      .mockResolvedValueOnce({ ok: false, error: 'Timeline unavailable.' })
      .mockResolvedValueOnce(success([], null));
    const coordinator = createTimelineLoadCoordinator(fetchTimeline, () => {});

    await coordinator.loadInitial('lead', 'lead-a');
    const failedLoad = coordinator.loadOlder('lead', 'lead-a');
    const ignoredRapidClick = coordinator.loadOlder('lead', 'lead-a');
    pendingFailure.resolve(null);
    await Promise.all([failedLoad, ignoredRapidClick]);

    expect(coordinator.getState()).toMatchObject({
      events: [first],
      cursor: 'page-2',
      loadingOlder: false,
      error: 'Could not load older activity.',
    });
    expect(fetchTimeline).toHaveBeenCalledTimes(2);

    await coordinator.loadOlder('lead', 'lead-a');

    expect(fetchTimeline).toHaveBeenNthCalledWith(
      3,
      'lead',
      'lead-a',
      'page-2',
    );
    expect(coordinator.getState()).toMatchObject({
      events: [first],
      cursor: 'page-2',
      error: 'Timeline unavailable.',
    });

    await coordinator.loadOlder('lead', 'lead-a');

    expect(fetchTimeline).toHaveBeenNthCalledWith(
      4,
      'lead',
      'lead-a',
      'page-2',
    );
    expect(coordinator.getState().cursor).toBeNull();
  });

  it('ignores an older-page response after switching records or cancelling', async () => {
    const leadAFirst = event('a-first', '2026-07-13T10:00:00.000Z');
    const leadAOlder = event('a-older', '2026-07-12T10:00:00.000Z');
    const leadBFirst = event('b-first', '2026-07-13T11:00:00.000Z');
    const olderRequest = deferred<DeskTimelineResponse | null>();
    const leadBRequest = deferred<DeskTimelineResponse | null>();
    const fetchTimeline: TimelineFetch = jest
      .fn()
      .mockResolvedValueOnce(success([leadAFirst], 'a-page-2'))
      .mockReturnValueOnce(olderRequest.promise)
      .mockReturnValueOnce(leadBRequest.promise);
    const coordinator = createTimelineLoadCoordinator(fetchTimeline, () => {});

    await coordinator.loadInitial('lead', 'lead-a');
    const staleOlderLoad = coordinator.loadOlder('lead', 'lead-a');
    const leadBLoad = coordinator.loadInitial('lead', 'lead-b');
    leadBRequest.resolve(success([leadBFirst], null));
    await leadBLoad;
    olderRequest.resolve(success([leadAOlder], null));
    await staleOlderLoad;

    expect(coordinator.getState()).toMatchObject({
      events: [leadBFirst],
      cursor: null,
      loadingInitial: false,
      loadingOlder: false,
    });

    const staleAfterCancel = deferred<DeskTimelineResponse | null>();
    (fetchTimeline as jest.Mock).mockReturnValueOnce(staleAfterCancel.promise);
    const cancelledLoad = coordinator.loadInitial('lead', 'lead-c');
    coordinator.cancel();
    staleAfterCancel.resolve(
      success([event('c-first', '2026-07-13T12:00:00.000Z')], null),
    );
    await cancelledLoad;

    expect(coordinator.getState().events).toEqual([]);
  });
});
