import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

import { StoryComposer } from '../StoryComposer';
import type { LeadLoad } from '../types';

jest.mock('@/propel/components/marketingHero/inbox/InboxComposer', () => ({
  InboxComposer: () => <div data-testid="live-inbox-composer" />,
}));

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(global, 'ResizeObserver', { value: TestResizeObserver });

const base = {
  person: {
    id: 'person-1',
    displayName: 'Mdshahin Khan',
    hasName: true,
    phoneE164: '+971558739146',
    city: null,
    country: 'UAE',
    email: null,
    preferredLanguage: null,
    assignedAgentId: 'agent-1',
    assignedAgentName: 'Akhil Desai',
    assignedAt: null,
    isLost: false,
    snoozedUntil: null,
    routingState: null,
    sourceLabel: null,
    campaignName: null,
    createdAt: '2026-09-19T00:00:00.000Z',
    picture: { situation: null, motivation: null, want: null, decision: null, concern: null },
    picks: { purpose: null, buyingTimeline: null, moneyComfort: null },
    formAnswers: [],
    lastTouch: { at: null, by: null, summary: null },
    optedOutWhatsApp: false,
  },
  deals: [],
  selectedDealId: null,
  openTasks: [],
  timeline: { events: [], nextCursor: null, partialFailures: [] },
  wa: {
    conversationId: null,
    lineType: 'EVERYDAY',
    lineLabel: 'RE/MAX Hub, Dubai line',
    lineNumber: '+971 56 460 5612',
    lastInboundAt: null,
    canReply: true,
    ownershipSyncPending: false,
    replyHint: '',
  },
  latestCall: null,
  rotation: null,
  replySignal: { repliedAt: null, minutes: null },
  viewer: { workspaceMemberId: 'agent-1', role: 'AGENT' },
} as unknown as LeadLoad;

const renderWith = (whatsappUnreachable: boolean | undefined) =>
  render(
    <MantineProvider>
      <StoryComposer
        host={{
          callPropelRoute: async () => null,
          getToken: () => undefined,
          serverBaseUrl: 'https://crm.example',
          navigate: () => {},
          notify: () => {},
          searchParams: new URLSearchParams(),
        }}
        data={{ ...base, person: { ...base.person, whatsappUnreachable } } as LeadLoad}
        thread={null}
        drafts={{ mode: 'message', message: '', note: '' }}
        onDraftsChange={() => {}}
        pushPending={() => 'temp-1'}
        markPendingFailed={() => {}}
        markPendingSent={() => {}}
        onChanged={() => {}}
      />
    </MantineProvider>,
  );

// Prod, 19–20 Sep 2026: six Meta leads had no WhatsApp account. The agent's only clue
// was a message that never delivered, which looks exactly like being ignored.
describe('Lead Page composer — no WhatsApp account', () => {
  it('warns the agent, and says what to do instead', () => {
    renderWith(true);
    expect(screen.getByRole('status')).toHaveTextContent(
      'This number has no WhatsApp account — a message will not arrive. Call instead.',
    );
  });

  it('still lets them send — it is a warning, not a block', () => {
    renderWith(true);
    // The composer must remain present: a message to a dead number harms nobody, and
    // removing the option would be a worse failure than the one being fixed.
    expect(screen.queryByText(/Do not message on WhatsApp/i)).toBeNull();
  });

  it('says NOTHING when the number is fine, or when we never checked', () => {
    // UNKNOWN must not render as a soft no — the whole safety property of the feature.
    for (const value of [false, undefined]) {
      const { unmount } = renderWith(value);
      expect(screen.queryByText(/no WhatsApp account/i)).toBeNull();
      unmount();
    }
  });
});
