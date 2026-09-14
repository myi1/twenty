import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

import { StoryComposer } from '../StoryComposer';
import type { LeadLoad } from '../types';
import type { InboxThreadPayload } from '@/propel/types/inbox';

jest.mock('@/propel/components/marketingHero/inbox/InboxComposer', () => ({
  InboxComposer: () => <div data-testid="live-inbox-composer" />,
}));

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(global, 'ResizeObserver', { value: TestResizeObserver });

const data = {
  person: {
    id: 'person-1',
    displayName: 'Ada Lovelace',
    hasName: true,
    phoneE164: '+971501234567',
    city: null,
    country: 'UAE',
    email: null,
    preferredLanguage: null,
    assignedAgentId: 'agent-1',
    assignedAgentName: 'Grace Hopper',
    assignedAt: null,
    isLost: false,
    snoozedUntil: null,
    routingState: null,
    sourceLabel: null,
    campaignName: null,
    createdAt: '2026-09-14T00:00:00.000Z',
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
    conversationId: 'thread-1',
    lineType: 'OFFICIAL',
    lineLabel: 'WhatsApp',
    lineNumber: '+971 50 123 4567',
    lastInboundAt: null,
    canReply: false,
    ownershipSyncPending: true,
    replyHint: 'Conversation access is updating. Please wait a moment.',
  },
  latestCall: null,
  rotation: null,
  replySignal: { repliedAt: null, minutes: null },
  viewer: { workspaceMemberId: 'agent-1', role: 'AGENT' },
} as LeadLoad;

const staleReplyCapableThread: InboxThreadPayload = {
  ok: true,
  id: 'thread-1',
  channel: 'WHATSAPP',
  surface: 'DM',
  title: 'Ada Lovelace',
  status: 'OPEN',
  snoozeUntil: null,
  personId: 'person-1',
  contactName: 'Ada Lovelace',
  contact: null,
  deal: null,
  canReply: true,
  replyHint: '',
  messages: [],
};

describe('Lead Page StoryComposer ownership sync', () => {
  it('suppresses a stale reply composer and renders the accessible pending explanation', () => {
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
        data={data}
        thread={staleReplyCapableThread}
        drafts={{ mode: 'message', message: '', note: '' }}
        onDraftsChange={() => {}}
        pushPending={() => 'temp-1'}
        markPendingFailed={() => {}}
        markPendingSent={() => {}}
        onChanged={() => {}}
        />
      </MantineProvider>,
    );

    expect(screen.queryByTestId('live-inbox-composer')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Conversation access is updating. Please wait a moment.');
  });
});
