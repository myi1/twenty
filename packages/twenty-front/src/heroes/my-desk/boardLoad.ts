import type { DeskBoardMeta } from './deskApi';
import type { DeskPartialFailure, DeskRow } from './types';

type FetchBoard = (
  onPage: (rows: DeskRow[], partialFailures: DeskPartialFailure[]) => void,
  onMeta?: (meta: DeskBoardMeta) => void,
) => Promise<unknown>;

type BoardLoadCallbacks = {
  fetchBoard: FetchBoard;
  hasRows: () => boolean;
  onStart: () => void;
  onPage: (rows: DeskRow[], partialFailures: DeskPartialFailure[]) => void;
  onMeta: (meta: DeskBoardMeta) => void;
  onPartialError: () => void;
  onError: (error: string) => void;
};

export const createBoardLoadCoordinator = (callbacks: BoardLoadCallbacks) => {
  let generation = 0;
  let active = false;

  const invalidate = () => {
    active = false;
    generation += 1;
  };

  const load = async (): Promise<void> => {
    const loadGeneration = generation + 1;
    generation = loadGeneration;
    active = true;
    const isCurrent = () => active && generation === loadGeneration;

    if (isCurrent()) callbacks.onStart();

    let pageReceived = false;
    try {
      await callbacks.fetchBoard(
        (rows, failures) => {
          if (!isCurrent()) return;
          pageReceived = true;
          callbacks.onPage(rows, failures);
        },
        (meta) => {
          if (!isCurrent()) return;
          callbacks.onMeta(meta);
        },
      );
    } catch (error: unknown) {
      if (!isCurrent()) return;
      if (pageReceived || callbacks.hasRows()) {
        callbacks.onPartialError();
        return;
      }
      callbacks.onError(
        error instanceof Error ? error.message : 'DESK_LOAD_FAILED',
      );
    }
  };

  return { invalidate, load };
};
