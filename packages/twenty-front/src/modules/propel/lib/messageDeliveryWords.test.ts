import { messageDeliveryWords } from '@/propel/lib/messageDeliveryWords';

describe('messageDeliveryWords', () => {
  it('separates accepted-but-undelivered from actually delivered', () => {
    // The whole point: these two must never read the same again.
    expect(messageDeliveryWords('SENT')).toEqual({ text: 'Sent, not delivered yet', tone: 'wait' });
    expect(messageDeliveryWords('DELIVERED')).toEqual({ text: 'Delivered', tone: 'ok' });
    expect(messageDeliveryWords('SENT')).not.toEqual(messageDeliveryWords('DELIVERED'));
  });

  it('shouts about a failure and is patient about a queue', () => {
    expect(messageDeliveryWords('FAILED')).toEqual({ text: 'Not delivered', tone: 'bad' });
    expect(messageDeliveryWords('QUEUED')).toEqual({ text: 'Waiting to send', tone: 'wait' });
    expect(messageDeliveryWords('READ')).toEqual({ text: 'Read', tone: 'ok' });
  });

  it('says nothing at all when the channel reports nothing', () => {
    // A tick we cannot stand behind is worse than no tick.
    expect(messageDeliveryWords(null)).toBeNull();
    expect(messageDeliveryWords(undefined)).toBeNull();
    expect(messageDeliveryWords('WEIRD' as never)).toBeNull();
  });
});

// ── WHY it was not delivered ────────────────────────────────────────────────
// Prod 2026-09-19: a Meta instant-form lead typed a number with no WhatsApp account.
// Both messages to him failed and the thread said only "Not delivered" — which reads
// identically to a message WhatsApp refused once, and sent his agent on waiting for a
// reply that could never arrive. The two cases need opposite actions.

describe('failure reasons', () => {
  it('names the action, not the error, when the number has no WhatsApp', () => {
    const w = messageDeliveryWords('FAILED', 'NOT_ON_WHATSAPP');
    expect(w?.text).toContain('call them instead');
    expect(w?.tone).toBe('bad');
  });

  it('does not blame the lead for our own disconnected line', () => {
    expect(messageDeliveryWords('FAILED', 'LINE_DISCONNECTED')?.text).toContain('not their end');
  });

  it('falls back to the plain label for a code it does not know', () => {
    // The code is TEXT end to end precisely so a new provider reason cannot break the
    // write. The cost of that freedom is that the UI must degrade, never render raw.
    expect(messageDeliveryWords('FAILED', 'SOME_FUTURE_CODE')?.text).toBe('Not delivered');
    expect(messageDeliveryWords('FAILED', '')?.text).toBe('Not delivered');
    expect(messageDeliveryWords('FAILED', null)?.text).toBe('Not delivered');
    expect(messageDeliveryWords('FAILED')?.text).toBe('Not delivered');
  });

  it('never attaches a reason to a status that did not fail', () => {
    expect(messageDeliveryWords('DELIVERED', 'NOT_ON_WHATSAPP')?.text).toBe('Delivered');
    expect(messageDeliveryWords('SENT', 'NOT_ON_WHATSAPP')?.text).toBe('Sent, not delivered yet');
  });
});
