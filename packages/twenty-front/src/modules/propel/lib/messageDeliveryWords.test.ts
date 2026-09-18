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
