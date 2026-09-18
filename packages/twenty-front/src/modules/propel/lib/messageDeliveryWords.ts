import { type InboxDeliveryStatus } from '@/propel/types/inbox';

// What an agent is told about an outbound message's fate.
//
// The distinction that matters is SENT vs DELIVERED. WhatsApp ACCEPTS a message — and
// hands back a real message id — long before it reaches a handset, and it may never
// reach one at all. Until 2026-09-18 both rendered identically: a reply proven on
// production to have been accepted and never delivered looked exactly like one that
// landed, with no tick, no warning and nothing to click. That is how an agent ends up
// certain they answered a lead they never reached.
//
// Anything the channel does not report stays SILENT. A tick we cannot stand behind is
// worse than no tick, because it manufactures the same false confidence the bug did.
export type DeliveryTone = 'ok' | 'wait' | 'bad';

export const messageDeliveryWords = (
  status: InboxDeliveryStatus | undefined,
): { text: string; tone: DeliveryTone } | null => {
  switch (status) {
    case 'READ':
      return { text: 'Read', tone: 'ok' };
    case 'DELIVERED':
      return { text: 'Delivered', tone: 'ok' };
    case 'SENT':
      return { text: 'Sent, not delivered yet', tone: 'wait' };
    case 'QUEUED':
      return { text: 'Waiting to send', tone: 'wait' };
    case 'FAILED':
      return { text: 'Not delivered', tone: 'bad' };
    default:
      return null;
  }
};
