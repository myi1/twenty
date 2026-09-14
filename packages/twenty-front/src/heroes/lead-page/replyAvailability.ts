// The Lead Page load is authoritative for whether a conversation is replyable.
// The Inbox fetch can be an older snapshot while its ownership write catches up,
// so a reply-capable thread must not override this pending state.

export const FALLBACK_OWNERSHIP_SYNC_MESSAGE =
  'Conversation access is updating. Please wait a moment, then try again.';

export type WhatsAppReplyAvailability =
  | { kind: 'NORMAL' }
  | { kind: 'SYNC_PENDING'; message: string };

type WhatsAppReplyState = {
  canReply: boolean;
  ownershipSyncPending?: boolean;
  replyHint?: string | null;
};

// The route can provide a human-facing progress sentence, but it must never turn
// an operational exception, URL, token-shaped value, or unbounded text into UI.
// React would escape markup, yet a small plain-sentence allowlist also keeps the
// explanation useful to agents and avoids echoing implementation detail.
const safeOwnershipSyncHint = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const hint = value.trim();
  if (!hint || hint.length > 180) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .,;:!?'’()\-]*$/u.test(hint)) return null;
  return hint;
};

export const getWhatsAppReplyAvailability = (
  wa: WhatsAppReplyState,
): WhatsAppReplyAvailability => {
  if (wa.canReply === false && wa.ownershipSyncPending === true) {
    return {
      kind: 'SYNC_PENDING',
      message: safeOwnershipSyncHint(wa.replyHint) ?? FALLBACK_OWNERSHIP_SYNC_MESSAGE,
    };
  }
  return { kind: 'NORMAL' };
};
