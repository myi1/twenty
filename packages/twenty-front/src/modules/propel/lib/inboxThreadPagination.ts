type ChronologicalMessage = { id: string; sentAtMs: number };

export type InboxThreadPageState<Message extends ChronologicalMessage> = {
  messages: Message[];
  nextCursor: string | null;
  complete: boolean;
  phase: 'idle' | 'loading' | 'error';
};

const cursorFrom = (cursor: string | null | undefined): string | null =>
  typeof cursor === 'string' && cursor.length > 0 ? cursor : null;

// Older-route fields are optional while the deployed route is still on the
// non-paginated contract. An absent continuation is a complete history, never a
// guess that can create a request loop.
export const createThreadPageState = <Message extends ChronologicalMessage>(
  messages: Message[],
  nextCursor?: string | null,
  complete?: boolean,
): InboxThreadPageState<Message> => ({
  messages,
  nextCursor: complete === false ? cursorFrom(nextCursor) : null,
  complete: complete !== false || cursorFrom(nextCursor) === null,
  phase: 'idle',
});

export const beginOlderThreadPageLoad = <Message extends ChronologicalMessage>(
  state: InboxThreadPageState<Message>,
): InboxThreadPageState<Message> => ({ ...state, phase: 'loading' });

export const failOlderThreadPageLoad = <Message extends ChronologicalMessage>(
  state: InboxThreadPageState<Message>,
): InboxThreadPageState<Message> => ({ ...state, phase: 'error' });

const chronological = <Message extends ChronologicalMessage>(
  messages: Message[],
): Message[] =>
  messages
    .map((message, index) => ({ message, index }))
    .sort(
      (left, right) =>
        left.message.sentAtMs - right.message.sentAtMs ||
        left.index - right.index,
    )
    .map(({ message }) => message);

// The non-cursor refresh still returns the newest page. Keep previously loaded
// history that is outside that page, but let the fresh response replace matching
// ids so changing delivery/media fields are not frozen in an old snapshot.
export const mergeLiveThreadPage = <Message extends ChronologicalMessage>(
  existing: Message[],
  fresh: Message[],
): Message[] => {
  const freshIds = new Set(fresh.map((message) => message.id));
  return chronological([
    ...existing.filter((message) => !freshIds.has(message.id)),
    ...fresh,
  ]);
};

// Adds an older page without duplicating an overlapping cursor boundary. The
// existing rows win because they may be a fresher live-poll representation of the
// same server id; the page only contributes previously unseen ids.
export const applyOlderThreadPage = <Message extends ChronologicalMessage>(
  state: InboxThreadPageState<Message>,
  page: Pick<
    InboxThreadPageState<Message>,
    'messages' | 'nextCursor' | 'complete'
  >,
): InboxThreadPageState<Message> => {
  const existingIds = new Set(state.messages.map((message) => message.id));
  const olderUnseen = page.messages.filter(
    (message) => !existingIds.has(message.id),
  );
  const nextCursor =
    page.complete === false ? cursorFrom(page.nextCursor) : null;

  return {
    messages: chronological([...olderUnseen, ...state.messages]),
    nextCursor,
    complete: page.complete !== false || nextCursor === null,
    phase: 'idle',
  };
};

export const isCurrentOlderThreadPageRequest = (
  requestThreadKey: string,
  currentThreadKey: string,
  requestSequence: number,
  currentSequence: number,
): boolean =>
  requestThreadKey === currentThreadKey && requestSequence === currentSequence;
