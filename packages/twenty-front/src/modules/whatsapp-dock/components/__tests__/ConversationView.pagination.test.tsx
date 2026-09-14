import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ConversationView } from '@/whatsapp-dock/components/ConversationView';
import {
  fetchWaThread,
  type WaMessage,
  type WaTarget,
  type WaThread,
} from '@/whatsapp-dock/utils/whatsAppComposeBridge';

jest.mock('@/whatsapp-dock/utils/waTypingBroadcast', () => ({
  subscribeOwnTyping: jest.fn(() => () => {}),
}));

jest.mock('@/whatsapp-dock/utils/whatsAppComposeBridge', () => ({
  fetchWaThread: jest.fn(),
  outboundKindFromFile: jest.fn(() => 'DOCUMENT'),
  sendWaMedia: jest.fn(),
  sendWaTemplate: jest.fn(),
  sendWaText: jest.fn(),
  uploadWaMedia: jest.fn(),
}));

const mockFetchWaThread = fetchWaThread as jest.MockedFunction<typeof fetchWaThread>;

const target = (conversationId: string): WaTarget => ({
  personId: `person-${conversationId}`,
  name: `Contact ${conversationId}`,
  e164Digits: '971501234567',
  conversationId,
  lineType: 'EVERYDAY',
  lastInboundAt: null,
});

const message = (id: string, body: string, sentAtMs: number): WaMessage => ({
  id,
  body,
  sentAtMs,
  direction: 'INBOUND',
  whenLabel: '',
  mediaUrl: null,
  mediaKind: 'NONE',
});

const thread = (
  id: string,
  messages: WaMessage[],
  options: { complete?: boolean; nextCursor?: string | null; ok?: boolean } = {},
): WaThread => ({
  ok: options.ok ?? true,
  id,
  title: `Contact ${id}`,
  personId: `person-${id}`,
  lineType: 'EVERYDAY',
  canReply: true,
  replyHint: '',
  sessionWindowOpen: true,
  sessionWindowEndsAtMs: null,
  suggestedTemplate: null,
  approvedTemplates: [],
  messages,
  complete: options.complete ?? true,
  nextCursor: options.nextCursor ?? null,
  error: options.ok === false ? 'Unavailable' : null,
});

const deferred = <Value,>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

describe('ConversationView older-message controls', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('requests the supplied cursor then visibly prepends a chronological, deduplicated older page', async () => {
    mockFetchWaThread
      .mockResolvedValueOnce(
        thread(
          'thread-a',
          [
            message('overlap', 'Overlapping boundary', 30),
            message('newest', 'Newest message', 40),
          ],
          { complete: false, nextCursor: 'cursor-before-30' },
        ),
      )
      .mockResolvedValueOnce(
        thread(
          'thread-a',
          [
            message('overlap', 'Overlapping boundary', 30),
            // Cursor responses are not trusted to arrive chronologically. The
            // rendered thread, rather than just the pagination helper, must
            // place this earlier row before the overlap and newest page.
            message('oldest', 'Oldest message', 10),
          ],
          { complete: true },
        ),
      );

    render(
      <ConversationView onBack={jest.fn()} onTargetUpdate={jest.fn()} target={target('thread-a')} />,
    );

    await screen.findByText('Newest message');
    fireEvent.click(screen.getByRole('button', { name: 'Load older messages' }));

    await waitFor(() => {
      expect(mockFetchWaThread).toHaveBeenLastCalledWith('thread-a', 'cursor-before-30');
    });
    await screen.findByText('Oldest message');

    expect(screen.getAllByText('Overlapping boundary')).toHaveLength(1);
    const renderedChronologically = [
      screen.getByText('Oldest message'),
      screen.getByText('Overlapping boundary'),
      screen.getByText('Newest message'),
    ];
    for (let index = 0; index < renderedChronologically.length - 1; index += 1) {
      expect(
        renderedChronologically[index].compareDocumentPosition(
          renderedChronologically[index + 1],
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: /older messages/i })).not.toBeInTheDocument();
  });

  it('keeps current rows visible after an older-page failure and retries the same cursor', async () => {
    mockFetchWaThread
      .mockResolvedValueOnce(
        thread('thread-a', [message('current', 'Current message', 40)], {
          complete: false,
          nextCursor: 'retry-cursor',
        }),
      )
      .mockResolvedValueOnce(thread('thread-a', [], { ok: false }))
      .mockResolvedValueOnce(
        thread('thread-a', [message('older', 'Recovered older message', 20)], {
          complete: true,
        }),
      );

    render(
      <ConversationView onBack={jest.fn()} onTargetUpdate={jest.fn()} target={target('thread-a')} />,
    );

    await screen.findByText('Current message');
    fireEvent.click(screen.getByRole('button', { name: 'Load older messages' }));

    await screen.findByRole('alert');
    expect(screen.getByText('Current message')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Retry older messages' });
    fireEvent.click(retry);

    await screen.findByText('Recovered older message');
    expect(mockFetchWaThread).toHaveBeenNthCalledWith(2, 'thread-a', 'retry-cursor');
    expect(mockFetchWaThread).toHaveBeenNthCalledWith(3, 'thread-a', 'retry-cursor');
    expect(screen.getByText('Current message')).toBeInTheDocument();
  });

  it('ignores an older page that resolves after the agent switches conversations', async () => {
    const staleOlderPage = deferred<WaThread>();
    mockFetchWaThread
      .mockResolvedValueOnce(
        thread('thread-a', [message('a-current', 'Thread A current', 40)], {
          complete: false,
          nextCursor: 'thread-a-cursor',
        }),
      )
      .mockReturnValueOnce(staleOlderPage.promise)
      .mockResolvedValueOnce(
        thread('thread-b', [message('b-current', 'Thread B current', 50)]),
      );

    const { rerender } = render(
      <ConversationView onBack={jest.fn()} onTargetUpdate={jest.fn()} target={target('thread-a')} />,
    );

    await screen.findByText('Thread A current');
    fireEvent.click(screen.getByRole('button', { name: 'Load older messages' }));
    expect(mockFetchWaThread).toHaveBeenLastCalledWith('thread-a', 'thread-a-cursor');

    rerender(
      <ConversationView onBack={jest.fn()} onTargetUpdate={jest.fn()} target={target('thread-b')} />,
    );
    await screen.findByText('Thread B current');

    await act(async () => {
      staleOlderPage.resolve(
        thread('thread-a', [message('a-stale', 'Stale older message', 10)], {
          complete: true,
        }),
      );
    });

    expect(screen.queryByText('Stale older message')).not.toBeInTheDocument();
    expect(screen.getByText('Thread B current')).toBeInTheDocument();
  });

  it('does not render an older-message control for a complete thread without a cursor', async () => {
    mockFetchWaThread.mockResolvedValueOnce(
      thread('thread-a', [message('only', 'Only message', 40)]),
    );

    render(
      <ConversationView onBack={jest.fn()} onTargetUpdate={jest.fn()} target={target('thread-a')} />,
    );

    await screen.findByText('Only message');
    expect(screen.queryByRole('button', { name: /older messages/i })).not.toBeInTheDocument();
  });
});
