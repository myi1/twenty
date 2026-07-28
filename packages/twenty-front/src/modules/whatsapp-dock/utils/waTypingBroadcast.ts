// Own-side typing presence ONLY — "the CRM agent is composing on another
// device/session" (spec: 2026-07-12 WhatsApp dock redesign). This is a real
// signal (this browser's OTHER tabs/windows genuinely composing), not a
// fabricated one — it is intentionally NOT the contact's typing state.
//
// Contact-side (inbound) typing was investigated and is NOT wired: the
// OFFICIAL line (Meta Cloud API) exposes no inbound typing event for a
// business number at all (a documented platform limitation); the EVERYDAY
// line (wa-service / Evolution API) COULD technically surface presence
// updates at the protocol level, but this deployment's webhook subscription
// (MESSAGES_UPSERT, MESSAGES_UPDATE, CONNECTION_UPDATE, QRCODE_UPDATED only —
// see wa-service/src/evolution.ts) never asks for or parses presence events,
// so there is no real data to show. Per the founder's "never fabricate
// presence" rule, this build ships own-side only and no fake contact
// indicator.
//
// Mechanism: BroadcastChannel — same-browser, cross-tab, zero server calls.
// This means "another session" here means another TAB/WINDOW of the same
// browser profile, not literally a different physical device signed into the
// same account — an honest scope limitation worth knowing, not a defect.

const CHANNEL_NAME = 'propel-wa-dock-typing';
const TYPING_TTL_MS = 3000;
const BROADCAST_THROTTLE_MS = 1200;

type TypingPing = { conversationId: string; at: number };

const supportsBroadcastChannel = typeof BroadcastChannel !== 'undefined';

let channel: BroadcastChannel | null = null;
const getChannel = (): BroadcastChannel | null => {
  if (!supportsBroadcastChannel) {
    return null;
  }
  if (channel === null) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
};

let lastSentAt = 0;

/** Call on every composer keystroke — throttled, so it's cheap to call often. */
export const announceOwnTyping = (conversationId: string): void => {
  const ch = getChannel();
  if (ch === null || !conversationId) {
    return;
  }
  const now = Date.now();
  if (now - lastSentAt < BROADCAST_THROTTLE_MS) {
    return;
  }
  lastSentAt = now;
  const ping: TypingPing = { conversationId, at: now };
  ch.postMessage(ping);
};

/**
 * Subscribe to own-side typing pings for one conversation. `onTyping` fires
 * each time a ping for `conversationId` arrives; the caller is expected to
 * pair this with a short-lived "typing…" UI state that clears itself after
 * ~TYPING_TTL_MS of silence (this module does not own that timer — it just
 * relays real events).
 */
export const subscribeOwnTyping = (
  conversationId: string,
  onTyping: () => void,
): (() => void) => {
  const ch = getChannel();
  if (ch === null) {
    return () => {};
  }
  const handler = (event: MessageEvent<TypingPing>) => {
    const ping = event.data;
    if (
      ping &&
      ping.conversationId === conversationId &&
      Date.now() - ping.at < TYPING_TTL_MS
    ) {
      onTyping();
    }
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
};

export const OWN_TYPING_TTL_MS = TYPING_TTL_MS;
