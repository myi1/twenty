// Fork-side triage refinement for the unified Inbox (Lead Engine #62, surface 3).
//
// The server route (marketing-inbox-route) classifies a thread via classifyTriage()
// from whatsAppConversation.senderType. FB/IG threads carry NO triage columns yet (a
// separate superset-gated schema change — build-plan R3), so they arrive with
// triageClass === 'UNKNOWN' and no class badge. That's a visible gap: a Facebook DM
// asking "is this villa still available?" looks identical to an un-triaged comment.
//
// We close it WITHOUT any app-side change by deriving a sensible class from data the
// row ALREADY carries — channel, surface (DM vs COMMENT), contactType, leadSource. It
// is a deterministic heuristic, NOT the AI triage; it only ever FILLS IN an UNKNOWN
// FB/IG row, never overrides a real server class (WhatsApp AI triage always wins).

import {
  type InboxThreadRow,
  type InboxTriageClass,
} from '@/propel/types/inbox';

export interface EffectiveTriage {
  triageClass: InboxTriageClass;
  // A short, honest why-string when the class was DERIVED here (''=server-provided
  // or no signal). Surfaced in the rail's reason slot so the operator sees it's a
  // heuristic ("Facebook DM — direct enquiry"), not a confirmed AI classification.
  derivedReason: string;
  // true when this class came from the fork heuristic (not the server). Lets the UI
  // mark it as provisional if it wants; the rail uses it to phrase the reason.
  derived: boolean;
}

// Is this an FB/IG row with no server triage signal (the only rows we touch)?
const isUnclassifiedSocial = (row: InboxThreadRow): boolean =>
  (row.channel === 'FACEBOOK' || row.channel === 'INSTAGRAM') &&
  row.triageClass === 'UNKNOWN';

// Derive a class for an unclassified FB/IG row from existing signals. Order matters:
//  • An EXISTING client contact (contactType CLIENT) → LEAD (a known relationship).
//  • A DM (direct message) = a person reaching out privately → OPPORTUNITY-grade
//    intent (the strongest organic social signal short of AI triage).
//  • A COMMENT on a post = engagement, not yet a private enquiry → BROWSER, UNLESS
//    the contact is already a LEAD/known (then keep it as a lead touch).
//  • Anything else stays UNKNOWN ("needs a human look") — we never fabricate.
// Conservative on purpose: a COMMENT is intentionally NOT escalated to OPPORTUNITY,
// so the triage queue (needsTriage = unowned OPPORTUNITY/LEAD/UNKNOWN) is not flooded
// by every "nice!" comment, matching the founder's pool-vs-lead split.
const deriveSocialClass = (
  row: InboxThreadRow,
): { triageClass: InboxTriageClass; reason: string } => {
  const ct = (row.contactType ?? '').toUpperCase();
  const channelLabel = row.channel === 'INSTAGRAM' ? 'Instagram' : 'Facebook';

  if (ct === 'CLIENT' || ct === 'KNOWN' || ct === 'EXISTING') {
    return {
      triageClass: 'LEAD',
      reason: `${channelLabel} ${row.surface === 'DM' ? 'DM' : 'comment'} from a known contact`,
    };
  }

  if (row.surface === 'DM') {
    return {
      triageClass: 'OPPORTUNITY',
      reason: `${channelLabel} direct message — likely a real enquiry`,
    };
  }

  // A public comment: engagement. Keep it visible (UNKNOWN would also queue it), but
  // class it as BROWSER so it reads as "engagement, capture for the pool", not "act".
  return {
    triageClass: 'BROWSER',
    reason: `${channelLabel} comment — engagement, review before acting`,
  };
};

// The single entry point: resolve the EFFECTIVE triage class for any row. WhatsApp
// and already-classified social rows pass through untouched; an unclassified FB/IG
// row gets the derived class + a why-string.
export const effectiveTriage = (row: InboxThreadRow): EffectiveTriage => {
  if (!isUnclassifiedSocial(row)) {
    return { triageClass: row.triageClass, derivedReason: '', derived: false };
  }
  const d = deriveSocialClass(row);
  return { triageClass: d.triageClass, derivedReason: d.reason, derived: true };
};

// Whether the row "needs a human look" using the EFFECTIVE class — mirrors the
// server's needsTriage (unowned + OPPORTUNITY/LEAD/UNKNOWN). For WhatsApp + already-
// classified rows the server's row.needsTriage is authoritative and passes through.
// For an unclassified FB/IG row we RE-DERIVE off the refined class: a DM becomes
// OPPORTUNITY (queued), but a public COMMENT becomes BROWSER and is REMOVED from the
// triage queue (engagement → pool, not a lead) — the founder's pool-vs-lead split.
// That means a derived BROWSER row is intentionally dropped from Needs-triage even
// though the server (seeing UNKNOWN) had flagged it.
export const effectiveNeedsTriage = (row: InboxThreadRow): boolean => {
  if (row.assignedAgentId) return false;
  if (!isUnclassifiedSocial(row)) return row.needsTriage;
  const cls = effectiveTriage(row).triageClass;
  return cls === 'OPPORTUNITY' || cls === 'LEAD' || cls === 'UNKNOWN';
};
