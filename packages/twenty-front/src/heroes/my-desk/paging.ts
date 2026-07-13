import { sortRows } from './banding';
import type { DeskPartialFailure, DeskRow, DeskTimelineEvent } from './types';

export const mergeDeskRows = (
  current: DeskRow[],
  incoming: DeskRow[],
  nowMs: number,
): DeskRow[] => {
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, row);
  return sortRows([...byId.values()], nowMs);
};

export const mergePartialFailures = (
  current: DeskPartialFailure[],
  incoming: DeskPartialFailure[],
): DeskPartialFailure[] => {
  const keyed = new Map<string, DeskPartialFailure>();
  for (const failure of [...current, ...incoming]) {
    keyed.set(`${failure.source}:${failure.code}`, failure);
  }
  return [...keyed.values()];
};

export const mergeTimelineEvents = (
  current: DeskTimelineEvent[],
  incoming: DeskTimelineEvent[],
): DeskTimelineEvent[] => {
  const keyed = new Map(
    current.map((event) => [`${event.type}:${event.id}`, event]),
  );
  for (const event of incoming) keyed.set(`${event.type}:${event.id}`, event);
  return [...keyed.values()].sort(
    (left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
  );
};
