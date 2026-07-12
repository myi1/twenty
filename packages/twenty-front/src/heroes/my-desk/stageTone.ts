// stageTone.ts — per-stage seal COLOR, shared by the board's Stage cell and the
// peek drawer's header seal. Mirrors the mockup's stage→color scheme
// (design-mockup-mydesk-nocturne.html L945–1113):
//   red    (bad)       → lead reply-now urgency — the hottest lane
//   gold   (qualified) → money-hot: offer · negotiation · agreed · closing
//   green  (good)      → active / live / healthy
//   amber  (warn)      → waiting: docs pending · compliance · pending publish
//   blue   (new)       → early: new · contacted · reserved · shortlisted
//   grey   (nurture)   → neutral / terminal / archived (also the default)
//
// Keyed on the NATIVE stage enum values (gates.ts STAGES_BY_LANE) so the same
// enum reads the same color across every lane. Anything unmapped falls to grey
// rather than ever showing a wrong-hot color.

import type { SealTone } from '../_pulse/pulse';
import type { DeskLane } from './types';

const STAGE_TONE: Record<string, SealTone> = {
  // early / new — blue
  NEW: 'new',
  CONTACTED: 'new',
  QUALIFIED: 'new',
  SHORTLISTED: 'new',
  RESERVED: 'new',
  DRAFT: 'new',
  QUALIFY_MANDATE: 'new',
  THESIS_SOURCE: 'new',
  LOI: 'new', // letter of intent ≈ the mockup's "Proposal sent"
  // active / live / healthy — green
  VIEWING: 'good',
  VALUATION: 'good',
  LISTING_SIGNED: 'good',
  LIVE: 'good',
  CONSULTATION: 'good',
  PARTNER_ENGAGED: 'good',
  // waiting / compliance / pending — amber
  COMPLIANCE_CHECK: 'warn',
  APPLICATION: 'warn',
  AWAITING_PUBLISH: 'warn',
  DUE_DILIGENCE: 'warn',
  CLEARANCE: 'warn',
  // money-hot: offer → close — gold
  OFFER: 'qualified',
  NEGOTIATION: 'qualified',
  AGREED: 'qualified',
  UNDER_OFFER: 'qualified',
  SPA_SIGNED: 'qualified',
  BOOKED: 'qualified',
  IC_APPROVAL: 'qualified',
  STRUCTURING_SPA: 'qualified',
  CLOSE_TRANSFER: 'qualified',
  SECURED: 'qualified',
  TRANSFER: 'qualified',
  REGISTERED: 'qualified',
  SOLD: 'qualified',
  CONVERTED: 'qualified',
  COMMISSION_SETTLED: 'qualified',
  // terminal / archived / neutral — grey (also the default)
  CLOSED: 'nurture',
  PASSED: 'nurture',
  COLLAPSED: 'nurture',
};

/** Seal tone for a row's stage. Leads are the reply-now lane, so they always
 *  read red regardless of their internal status; every other lane maps by its
 *  native stage enum, defaulting to grey. */
export const stageTone = (stage: string, lane: DeskLane): SealTone => {
  if (lane === 'lead') return 'bad';
  return STAGE_TONE[(stage ?? '').toUpperCase()] ?? 'nurture';
};
