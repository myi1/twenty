// Task 38 — what the Send step tells the agent, derived from what doc-service
// actually did. The service (a2a-steps.ts `sendToCounterparty` @ 8a38265) answers
// `ok: true` even when every requested channel failed, and reports each leg in
// `distribution[{ channel, ok, reason? }]`. Until now the hook read only `ok`, so
// the screen said "Sent to the counterparty" after a send that sent nothing.
//
// Runs under `node --test --experimental-strip-types` like the lead-page tests
// (explicit .ts import; excluded from the project tsconfig for that reason).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  describeSendOutcome,
  summariseDistribution,
  type SendOutcome,
} from '../../modules/propel/lib/a2aSendOutcome.ts';

describe('summariseDistribution — which legs really went out', () => {
  it('copy-link alone: nothing was delivered by us, but the link is ready to hand over', () => {
    const o = summariseDistribution([{ channel: 'copy-link', ok: true }]);
    assert.deepEqual(o, { linkReady: true, delivered: [], failed: [] });
  });

  it('a WhatsApp leg that the service could not send is a FAILURE, not a send', () => {
    const o = summariseDistribution([
      { channel: 'whatsapp', ok: false, reason: 'wa-service not configured (WA_SERVICE_URL/WA_SERVICE_TOKEN unset)' },
    ]);
    assert.deepEqual(o, {
      linkReady: false,
      delivered: [],
      failed: [{ channel: 'whatsapp', reason: 'wa-service not configured (WA_SERVICE_URL/WA_SERVICE_TOKEN unset)' }],
    });
  });

  it('email at send time is reported exactly as the service says it (not wired yet)', () => {
    const o = summariseDistribution([{ channel: 'email', ok: false, reason: 'email-at-send not wired (use copy-link or WhatsApp)' }]);
    assert.equal(o.delivered.length, 0);
    assert.equal(o.failed[0].channel, 'email');
  });

  it('a delivered WhatsApp leg counts as delivered', () => {
    const o = summariseDistribution([{ channel: 'whatsapp', ok: true }, { channel: 'copy-link', ok: true }]);
    assert.deepEqual(o, { linkReady: true, delivered: ['whatsapp'], failed: [] });
  });

  it('a missing or malformed distribution is treated as "nothing delivered" — never as success', () => {
    for (const bad of [undefined, null, 'ok', {}, [{ channel: 'whatsapp' }], [{ ok: true }]]) {
      const o = summariseDistribution(bad as never);
      assert.deepEqual(o.delivered, [], String(bad));
      assert.equal(o.linkReady, false, String(bad));
    }
  });
});

describe('describeSendOutcome — one plain sentence for the agent', () => {
  const say = (o: SendOutcome) => describeSendOutcome(o, 'Ahmed');

  it('link only: tells the agent to send it themselves and what happens after signing', () => {
    const s = say({ linkReady: true, delivered: [], failed: [] });
    assert.match(s, /link is ready/i);
    assert.match(s, /send it to Ahmed yourself/i);
    assert.match(s, /signed PDF/i);
    assert.doesNotMatch(s, /sent to the counterparty/i);
  });

  it('delivered over WhatsApp: says so, naming the channel', () => {
    const s = say({ linkReady: true, delivered: ['whatsapp'], failed: [] });
    assert.match(s, /WhatsApp/);
    assert.match(s, /Ahmed/);
  });

  it('a failed automatic leg is named honestly and falls back to the link', () => {
    const s = say({ linkReady: true, delivered: [], failed: [{ channel: 'whatsapp', reason: 'wa-service not configured' }] });
    assert.match(s, /could not be sent over WhatsApp/i);
    assert.match(s, /copy the link/i);
  });

  it('nothing at all (no link, no delivery) is an honest failure sentence', () => {
    const s = say({ linkReady: false, delivered: [], failed: [{ channel: 'email', reason: 'email-at-send not wired' }] });
    assert.match(s, /not sent/i);
    assert.doesNotMatch(s, /ready/i);
  });

  it('never leaks a raw service reason string to the agent', () => {
    const s = say({ linkReady: true, delivered: [], failed: [{ channel: 'whatsapp', reason: 'wa-service not configured (WA_SERVICE_URL/WA_SERVICE_TOKEN unset)' }] });
    assert.doesNotMatch(s, /WA_SERVICE|wa-service|unset/);
  });
});
