import { FALLBACK_OWNERSHIP_SYNC_MESSAGE, getWhatsAppReplyAvailability } from '../replyAvailability';

describe('Lead Page WhatsApp reply availability', () => {
  it('renders a sync-pending notice before a stale reply-capable thread can render a composer', () => {
    expect(
      getWhatsAppReplyAvailability({
        canReply: false,
        ownershipSyncPending: true,
        replyHint: 'Conversation access is updating. Please wait a moment.',
      }),
    ).toEqual({
      kind: 'SYNC_PENDING',
      message: 'Conversation access is updating. Please wait a moment.',
    });
  });

  it('uses the fixed notice when a pending-sync hint is not safe to show', () => {
    expect(
      getWhatsAppReplyAvailability({
        canReply: false,
        ownershipSyncPending: true,
        replyHint: 'upstream error: https://provider.example/token=secret',
      }),
    ).toEqual({ kind: 'SYNC_PENDING', message: FALLBACK_OWNERSHIP_SYNC_MESSAGE });
  });

  it('leaves ordinary unavailable replies on the existing renderer path', () => {
    expect(
      getWhatsAppReplyAvailability({
        canReply: false,
        ownershipSyncPending: false,
        replyHint: 'WhatsApp sending is not connected yet.',
      }),
    ).toEqual({ kind: 'NORMAL' });
  });

  it('does not show a sync-pending notice once replies are available', () => {
    expect(
      getWhatsAppReplyAvailability({
        canReply: true,
        ownershipSyncPending: true,
        replyHint: 'Conversation access is updating. Please wait a moment.',
      }),
    ).toEqual({ kind: 'NORMAL' });
  });
});
