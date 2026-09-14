import type { InboxMessageRow } from '@/propel/types/inbox';
import {
  applyOlderThreadPage,
  beginOlderThreadPageLoad,
  createThreadPageState,
  failOlderThreadPageLoad,
  isCurrentOlderThreadPageRequest,
  mergeLiveThreadPage,
} from '@/propel/lib/inboxThreadPagination';

const message = (id: string, sentAtMs: number): InboxMessageRow => ({
  id,
  direction: 'INBOUND',
  body: id,
  authorName: 'Customer',
  whenLabel: '',
  sentAtMs,
  mediaUrl: null,
  mediaKind: 'NONE',
  mediaPersisted: true,
  mediaExpiresAtMs: null,
});

describe('inbox thread continuation', () => {
  it('prepends 50 older messages once and preserves chronological order', () => {
    const current = Array.from({ length: 50 }, (_, index) =>
      message(`current-${index}`, 5_000 + index),
    );
    const older = Array.from({ length: 50 }, (_, index) =>
      message(`older-${index}`, index),
    );

    const result = applyOlderThreadPage(
      createThreadPageState(current, 'cursor-1', false),
      { messages: older, nextCursor: 'cursor-2', complete: false },
    );

    expect(result.messages).toHaveLength(100);
    expect(result.messages.map((row) => row.id)).toEqual([
      ...older.map((row) => row.id),
      ...current.map((row) => row.id),
    ]);
    expect(result.nextCursor).toBe('cursor-2');
    expect(result.complete).toBe(false);
  });

  it('deduplicates an overlapping page without dropping the existing message', () => {
    const result = applyOlderThreadPage(
      createThreadPageState(
        [message('newer', 20), message('overlap', 30)],
        'cursor-1',
        false,
      ),
      {
        messages: [message('oldest', 10), message('overlap', 30)],
        nextCursor: null,
        complete: true,
      },
    );

    expect(result.messages.map((row) => row.id)).toEqual([
      'oldest',
      'newer',
      'overlap',
    ]);
    expect(result.nextCursor).toBeNull();
    expect(result.complete).toBe(true);
  });

  it('keeps previously loaded older messages when a live page refreshes', () => {
    const result = mergeLiveThreadPage(
      [message('older', 10), message('current', 20)],
      [message('current', 20), message('newest', 30)],
    );

    expect(result.map((row) => row.id)).toEqual(['older', 'current', 'newest']);
  });

  it('keeps a retryable cursor after a failed page request', () => {
    const loading = beginOlderThreadPageLoad(
      createThreadPageState([message('newer', 20)], 'cursor-1', false),
    );
    const state = failOlderThreadPageLoad(loading);

    expect(state.nextCursor).toBe('cursor-1');
    expect(state.complete).toBe(false);
    expect(state.phase).toBe('error');
    expect(state.messages.map((row) => row.id)).toEqual(['newer']);
  });

  it('rejects an older-page response after the reader switches threads', () => {
    expect(
      isCurrentOlderThreadPageRequest(
        'WHATSAPP:thread-a',
        'WHATSAPP:thread-b',
        3,
        3,
      ),
    ).toBe(false);
    expect(
      isCurrentOlderThreadPageRequest(
        'WHATSAPP:thread-a',
        'WHATSAPP:thread-a',
        3,
        4,
      ),
    ).toBe(false);
  });

  it('treats a legacy response without continuation fields as complete', () => {
    const result = createThreadPageState([message('only', 1)]);

    expect(result.complete).toBe(true);
    expect(result.nextCursor).toBeNull();
  });
});
