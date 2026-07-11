import type { DeskLane } from './types';

// UI mirror of the verified staging engine ladder. The CRM route and engine
// remain authoritative for every move and gate check.
export type StageLane = Exclude<DeskLane, 'lead'>;

export const STAGES_BY_LANE: Record<StageLane, readonly string[]> = {
  secondaryOpportunity: ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'OFFER', 'NEGOTIATION', 'AGREED'],
  sellOpportunity: ['NEW', 'CONTACTED', 'QUALIFIED', 'VALUATION', 'LISTING_SIGNED', 'LIVE', 'OFFER', 'NEGOTIATION', 'SOLD'],
  offplanOpportunity: ['NEW', 'CONTACTED', 'QUALIFIED', 'SHORTLISTED', 'RESERVED', 'SPA_SIGNED', 'BOOKED'],
  rcbiOpportunity: ['NEW', 'CONTACTED', 'QUALIFIED', 'COMPLIANCE_CHECK', 'CONSULTATION', 'PARTNER_ENGAGED', 'APPLICATION', 'CONVERTED'],
  institutionalOpportunity: ['QUALIFY_MANDATE', 'THESIS_SOURCE', 'LOI', 'DUE_DILIGENCE', 'IC_APPROVAL', 'STRUCTURING_SPA', 'CLOSE_TRANSFER', 'PASSED'],
  listing: ['DRAFT', 'AWAITING_PUBLISH', 'LIVE', 'UNDER_OFFER', 'CLOSED'],
  deal: ['AGREED', 'SECURED', 'CLEARANCE', 'TRANSFER', 'REGISTERED', 'COMMISSION_SETTLED', 'CLOSED', 'COLLAPSED'],
};

export const isStageLane = (lane: DeskLane): lane is StageLane => lane !== 'lead';
