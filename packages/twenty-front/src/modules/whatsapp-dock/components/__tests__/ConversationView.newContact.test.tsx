import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { ConversationView } from '@/whatsapp-dock/components/ConversationView';
import { type WaTarget } from '@/whatsapp-dock/utils/whatsAppComposeBridge';

// Regression coverage for the founder-flagged bug (3rd fix attempt): sending a
// text message to a BRAND-NEW contact (conversationId: null — no existing
// WhatsApp thread yet) silently did nothing — zero network request, zero
// console output, yet the composer's text box still cleared as if it
// succeeded. This test exercises the REAL wiring end-to-end (ConversationView
// -> sendWaText -> appRoute -> fetch), mocking only the token and the network
// boundary, so it would have caught a bug ANYWHERE in that chain — not just
// inside sendWaText in isolation.

jest.mock('@/apollo/utils/getTokenPair', () => ({
  getTokenPair: jest.fn(),
}));

const mockGetTokenPair = getTokenPair as jest.MockedFunction<typeof getTokenPair>;

const validTokenPair = {
  accessOrWorkspaceAgnosticToken: { token: 'valid-access-token', expiresAt: 'x' },
  refreshToken: { token: 'valid-refresh-token', expiresAt: 'x' },
} as ReturnType<typeof getTokenPair>;

const newContactTarget: WaTarget = {
  personId: 'person-1',
  name: 'Brand New Contact',
  e164Digits: '971501234567',
  conversationId: null,
  lineType: null,
  lastInboundAt: null,
};

describe('ConversationView — sending the first text to a brand-new contact', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetTokenPair.mockReturnValue(validTokenPair);
    global.fetch = jest.fn();
    // jsdom doesn't implement scrollIntoView — unrelated to the bug under
    // test; ConversationView calls it on every message-list update.
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('fires a real network request to /s/whatsapp/send and clears the composer only after a confirmed send', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith('/s/whatsapp/send')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ok: true, conversationId: 'new-conversation-id' }),
        });
      }
      // /marketing/inbox-thread etc. — not expected to be hit for a
      // null-conversationId target, but keep the mock permissive.
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });

    render(
      <ConversationView
        onBack={jest.fn()}
        onTargetUpdate={jest.fn()}
        target={newContactTarget}
      />,
    );

    const textarea = screen.getByPlaceholderText('Message…');
    fireEvent.change(textarea, { target: { value: 'Hello, first message' } });

    const sendButton = screen.getByRole('button', { name: 'Send' });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    const sendCalls = (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
      String(url).endsWith('/s/whatsapp/send'),
    );
    expect(sendCalls).toHaveLength(1);
    const [, init] = sendCalls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      waPhoneNumber: '+971501234567',
      body: 'Hello, first message',
    });

    await waitFor(() => {
      expect(textarea).toHaveValue('');
    });
  });

  it('never clears the composer if the compose-mode send never actually reaches the network', async () => {
    // Simulate the exact reported symptom directly: fetch throws / never
    // resolves truthy — the composer MUST NOT clear the typed text.
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Failed to fetch'));

    render(
      <ConversationView
        onBack={jest.fn()}
        onTargetUpdate={jest.fn()}
        target={newContactTarget}
      />,
    );

    const textarea = screen.getByPlaceholderText('Message…');
    fireEvent.change(textarea, { target: { value: 'Should not vanish' } });

    const sendButton = screen.getByRole('button', { name: 'Send' });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(textarea).toHaveValue('Should not vanish');
    expect(
      screen.getByText('Could not reach WhatsApp. Try again.'),
    ).toBeInTheDocument();
  });
});
