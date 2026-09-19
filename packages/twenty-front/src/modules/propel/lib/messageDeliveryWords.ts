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

// The words behind each failure code. Owned in the CRM app
// (src/shared/wa-failure-reason.ts); kept here because a hero bundle cannot import from
// it. An UNRECOGNISED code deliberately renders as plain "Not delivered": a raw provider
// string in front of an agent is noise dressed as information.
const FAILURE_WORDS: Record<string, string> = {
  NOT_ON_WHATSAPP: 'this number has no WhatsApp — call them instead',
  LINE_DISCONNECTED: 'our WhatsApp line was disconnected — not their end',
  MEDIA_REJECTED: 'WhatsApp refused the attachment',
  REFUSED: 'WhatsApp refused this message',
};

export const messageDeliveryWords = (
  status: InboxDeliveryStatus | undefined,
  // WHY it failed, when the channel told us. "Not delivered" alone is a dead end: the
  // two causes behind it call for opposite actions — phone them, or try again — and
  // until 2026-09-19 an agent could not tell which they were looking at.
  failureReason?: string | null,
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
    case 'FAILED': {
      const why = failureReason ? FAILURE_WORDS[failureReason] : undefined;
      return { text: why ? `Not delivered — ${why}` : 'Not delivered', tone: 'bad' };
    }
    default:
      return null;
  }
};
