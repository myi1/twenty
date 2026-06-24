// Campaign → lane CONVERSION action (Pools ↔ Marketing Cloud "the loop closes").
//
// Backend = POST /lead/campaign-convert (CRM repo, branch
// feat/pools-marketing-segments, lead-campaign-convert-route.ts). When a campaign
// engagement signals intent (a reply, in the hero's recipient-activity surface),
// this pulls the engaged lead BACK to an active lane, ATTRIBUTES the conversion to
// the campaign, and flips the lead out of its pool so live membership drops it.
//
// This module is the fork-local contract for that route — only what the hero
// calls. The lane keys MUST match the route's LANE map exactly.

import { type RouteEnvelopeError } from '@/propel/types/campaignBuilder';

// The lanes the convert route accepts (LANE map in lead-campaign-convert-route.ts).
// Labels mirror the lifecycle lanes the rest of Propel shows.
export const CONVERT_LANE_OPTIONS: { value: ConvertLane; label: string }[] = [
  { value: 'secondary', label: 'Buyer / Resale' },
  { value: 'sell', label: 'Seller' },
  { value: 'offplan', label: 'Off-plan' },
  { value: 'institutional', label: 'Institutional' },
  { value: 'rcbi', label: 'RCBI' },
];

export type ConvertLane =
  | 'secondary'
  | 'sell'
  | 'offplan'
  | 'institutional'
  | 'rcbi';

// POST /lead/campaign-convert request body. ownerId defaults to the acting member
// server-side; createOpportunity defaults true (we always create on a manual
// convert — attribute-only is a flow-builder concern, not this manual action).
export interface CampaignConvertRequest {
  personId: string;
  campaignId: string;
  lane: ConvertLane;
  ownerId?: string;
  createOpportunity?: boolean;
  name?: string;
}

export interface CampaignConvertResponse extends RouteEnvelopeError {
  ok?: boolean;
  personId?: string;
  campaignId?: string;
  attributed?: boolean;
  opportunityId?: string | null;
  lane?: string | null;
}
