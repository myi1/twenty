import type {
  DeskLane,
  DeskTimelineEvent,
  DeskTimelineResponse,
} from './types';
import { mergeTimelineEvents } from './paging';

export type TimelineFetch = (
  laneObject: DeskLane,
  recordId: string,
  cursor?: string,
) => Promise<DeskTimelineResponse | null>;

export type TimelineLoadState = {
  events: DeskTimelineEvent[];
  cursor: string | null;
  loadingInitial: boolean;
  loadingOlder: boolean;
  error: string | null;
};

export const initialTimelineLoadState: TimelineLoadState = {
  events: [],
  cursor: null,
  loadingInitial: true,
  loadingOlder: false,
  error: null,
};

export type TimelineLoadCoordinator = {
  getState: () => TimelineLoadState;
  loadInitial: (laneObject: DeskLane, recordId: string) => Promise<void>;
  loadOlder: (laneObject: DeskLane, recordId: string) => Promise<void>;
  cancel: () => void;
};

export const createTimelineLoadCoordinator = (
  fetchTimeline: TimelineFetch,
  onChange: (state: TimelineLoadState) => void,
): TimelineLoadCoordinator => {
  let state = initialTimelineLoadState;
  let requestVersion = 0;

  const update = (patch: Partial<TimelineLoadState>) => {
    state = { ...state, ...patch };
    onChange(state);
  };

  const loadInitial = async (laneObject: DeskLane, recordId: string) => {
    const version = ++requestVersion;
    update({
      events: [],
      cursor: null,
      loadingInitial: true,
      loadingOlder: false,
      error: null,
    });

    try {
      const response = await fetchTimeline(laneObject, recordId);
      if (version !== requestVersion) return;
      if (response === null || !response.ok) {
        throw new Error(
          response && !response.ok
            ? response.error
            : 'Could not load activity.',
        );
      }
      update({
        events: response.events,
        cursor: response.nextCursor,
        loadingInitial: false,
        error:
          response.partialFailures.length > 0
            ? 'Some timeline sources could not be loaded.'
            : null,
      });
    } catch (error) {
      if (version !== requestVersion) return;
      update({
        loadingInitial: false,
        error:
          error instanceof Error ? error.message : 'Could not load activity.',
      });
    }
  };

  const loadOlder = async (laneObject: DeskLane, recordId: string) => {
    if (state.cursor === null || state.loadingOlder) return;
    const version = requestVersion;
    const cursor = state.cursor;
    update({ loadingOlder: true, error: null });

    try {
      const response = await fetchTimeline(laneObject, recordId, cursor);
      if (version !== requestVersion) return;
      if (response === null || !response.ok) {
        throw new Error(
          response && !response.ok
            ? response.error
            : 'Could not load older activity.',
        );
      }
      update({
        events: mergeTimelineEvents(state.events, response.events),
        cursor: response.nextCursor,
        loadingOlder: false,
        error:
          response.partialFailures.length > 0
            ? 'Some timeline sources could not be loaded.'
            : null,
      });
    } catch (error) {
      if (version !== requestVersion) return;
      update({
        loadingOlder: false,
        error:
          error instanceof Error
            ? error.message
            : 'Could not load older activity.',
      });
    }
  };

  return {
    getState: () => state,
    loadInitial,
    loadOlder,
    cancel: () => {
      requestVersion += 1;
    },
  };
};
