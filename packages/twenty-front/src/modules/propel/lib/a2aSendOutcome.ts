// Task 38 (2026-09-12) — what the Send step really did, from the service's own
// report. doc-service `sendToCounterparty` (a2a-steps.ts @ 8a38265) answers
// `ok: true` whenever the envelope was activated and the CRM row updated — even
// when EVERY requested delivery leg failed — and lists each leg in
// `distribution[{ channel, ok, reason? }]`. Reading only `ok` made the screen say
// "Sent to the counterparty" after a send that sent nothing (with WhatsApp unset
// on the service, that is every automatic send at launch). This module turns the
// report into a truthful state + one plain sentence; the raw service reasons
// (env-var names, service names) never reach the agent.

export type DistributionLeg = {
  channel: 'whatsapp' | 'email' | 'copy-link';
  ok: boolean;
  reason?: string;
};

export type SendOutcome = {
  /** The counterparty signing link exists and can be handed over by the agent. */
  linkReady: boolean;
  /** Channels the service delivered over on OUR behalf (WhatsApp/email). */
  delivered: DistributionLeg['channel'][];
  /** Requested automatic legs that did not go out, with the service's reason. */
  failed: { channel: DistributionLeg['channel']; reason: string }[];
};

const isLeg = (v: unknown): v is DistributionLeg =>
  typeof v === 'object' &&
  v !== null &&
  ((v as DistributionLeg).channel === 'whatsapp' ||
    (v as DistributionLeg).channel === 'email' ||
    (v as DistributionLeg).channel === 'copy-link') &&
  typeof (v as DistributionLeg).ok === 'boolean';

/**
 * Fold the service's per-leg report into an outcome. Anything that is not a
 * well-formed distribution list reads as "nothing delivered" — a send is never
 * assumed to have reached anyone.
 */
export const summariseDistribution = (distribution: unknown): SendOutcome => {
  const out: SendOutcome = { linkReady: false, delivered: [], failed: [] };
  if (!Array.isArray(distribution)) return out;
  for (const leg of distribution) {
    if (!isLeg(leg)) continue;
    if (leg.channel === 'copy-link') {
      if (leg.ok) out.linkReady = true;
      continue;
    }
    if (leg.ok) {
      out.delivered.push(leg.channel);
      out.linkReady = true;
    } else {
      out.failed.push({ channel: leg.channel, reason: leg.reason ?? 'not sent' });
    }
  }
  return out;
};

const CHANNEL_LABEL: Record<DistributionLeg['channel'], string> = {
  whatsapp: 'WhatsApp',
  email: 'email',
  'copy-link': 'link',
};

const SIGNED_PDF_NOTE =
  'Once both sides have signed, the signed PDF is emailed to them and to you automatically.';

/** One sentence for the agent. `counterpartyName` personalises it when known. */
export const describeSendOutcome = (
  outcome: SendOutcome,
  counterpartyName: string | null,
): string => {
  const who =
    counterpartyName !== null && counterpartyName.trim() !== ''
      ? counterpartyName.trim()
      : 'the other broker';

  if (outcome.delivered.length > 0) {
    const via = outcome.delivered.map((c) => CHANNEL_LABEL[c]).join(' and ');
    return `Sent to ${who} over ${via}. ${SIGNED_PDF_NOTE}`;
  }

  const failedVia = outcome.failed.map((f) => CHANNEL_LABEL[f.channel]).join(' or ');

  if (outcome.linkReady) {
    if (outcome.failed.length > 0) {
      return `The agreement could not be sent over ${failedVia} from here — copy the link below and send it to ${who} yourself. ${SIGNED_PDF_NOTE}`;
    }
    return `The signing link is ready — send it to ${who} yourself (WhatsApp or email). ${SIGNED_PDF_NOTE}`;
  }

  return `The agreement was not sent${outcome.failed.length > 0 ? ` (${failedVia} is not available here)` : ''}. Try again, or start over.`;
};
