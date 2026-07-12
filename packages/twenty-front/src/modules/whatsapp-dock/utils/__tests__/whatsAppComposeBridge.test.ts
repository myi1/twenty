import { getTokenPair } from '@/apollo/utils/getTokenPair';
import {
  resolveWaTarget,
  sendWaText,
  type WaPersonResult,
  type WaTarget,
} from '@/whatsapp-dock/utils/whatsAppComposeBridge';

jest.mock('@/apollo/utils/getTokenPair', () => ({
  getTokenPair: jest.fn(),
}));

const mockGetTokenPair = getTokenPair as jest.MockedFunction<typeof getTokenPair>;

const validTokenPair = {
  accessOrWorkspaceAgnosticToken: { token: 'valid-access-token', expiresAt: 'x' },
  refreshToken: { token: 'valid-refresh-token', expiresAt: 'x' },
} as ReturnType<typeof getTokenPair>;

// A brand-new contact: no existing WhatsApp thread yet.
const newContactTarget: WaTarget = {
  personId: 'person-1',
  name: 'Brand New Contact',
  e164Digits: '971501234567',
  conversationId: null,
  lineType: null,
  lastInboundAt: null,
};

describe('sendWaText — compose mode (no conversationId yet)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetTokenPair.mockReturnValue(validTokenPair);
    global.fetch = jest.fn();
  });

  it('actually calls fetch against /s/whatsapp/send for a brand-new contact', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, conversationId: 'new-conversation-id' }),
    });

    const outcome = await sendWaText(newContactTarget, 'Hello, first message');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/s\/whatsapp\/send$/);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      waPhoneNumber: '+971501234567',
      body: 'Hello, first message',
    });
    expect(outcome).toEqual({ ok: true, conversationId: 'new-conversation-id' });
  });

  it('resolves ok:true ONLY when the compose-mode fetch actually resolved successfully', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, conversationId: 'new-conversation-id' }),
    });

    const outcome = await sendWaText(newContactTarget, 'Hello again');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(true);
  });

  it('returns ok:false with a surfaced error when the compose-mode fetch fails, and never fabricates success', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Failed to fetch'));

    const outcome = await sendWaText(newContactTarget, 'This should not silently succeed');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok && !('windowClosed' in outcome)) {
      expect(outcome.error).toBeTruthy();
    }
  });

  it('returns ok:false when the server responds but rejects the send, without a false positive', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ kind: 'REJECTED' }),
    });

    const outcome = await sendWaText(newContactTarget, 'Rejected number');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(false);
  });
});

describe('resolveWaTarget — matching an existing conversation by phone', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetTokenPair.mockReturnValue(validTokenPair);
    global.fetch = jest.fn();
  });

  const person: WaPersonResult = {
    id: 'person-2',
    name: 'Brand New Contact',
    callingCode: '971',
    national: '501234567',
    e164Digits: '971501234567',
  };

  const conversationsResponse = (
    edges: { id: string; waPhoneNumber: string; lastInboundAt?: string }[],
  ) => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        whatsAppConversations: {
          edges: edges.map((e) => ({
            node: {
              id: e.id,
              lineType: 'EVERYDAY',
              lastInboundAt: e.lastInboundAt ?? null,
              waPhoneNumber: e.waPhoneNumber,
            },
          })),
        },
      },
    }),
  });

  it('resolves the conversation when the number matches exactly (after normalization)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      conversationsResponse([{ id: 'conv-exact', waPhoneNumber: '+971501234567' }]),
    );

    const result = await resolveWaTarget(person);

    expect(result.conversationId).toBe('conv-exact');
  });

  it('does NOT match a different conversation that merely shares a long digit suffix', async () => {
    // person.e164Digits = '971501234567' (UAE, 12 digits). This unrelated
    // number is '1' (North America) + '501234567' — a DIFFERENT real contact
    // whose 10-digit number happens to be an exact suffix of the UAE number
    // above. The old fuzzy "shorter >= 8 && endsWith" rule treated this as a
    // match (a real false positive: two different people, coincidental tail
    // overlap) — it must never be treated as the same contact.
    const unrelatedButSameTail = '1501234567';
    expect(person.e164Digits.endsWith(unrelatedButSameTail)).toBe(true);
    (global.fetch as jest.Mock).mockResolvedValue(
      conversationsResponse([{ id: 'conv-unrelated', waPhoneNumber: unrelatedButSameTail }]),
    );

    const result = await resolveWaTarget(person);

    // A brand-new contact whose number has no EXACT match must stay
    // conversationId: null — never silently rerouted into a stranger's
    // existing thread.
    expect(result.conversationId).toBeNull();
  });

  it('returns conversationId: null when no conversation exists for this contact yet', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(conversationsResponse([]));

    const result = await resolveWaTarget(person);

    expect(result.conversationId).toBeNull();
    expect(result.e164Digits).toBe('971501234567');
  });
});
