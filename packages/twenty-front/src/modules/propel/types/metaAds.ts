// Hero-local copy of the Meta Ads payload contract for the Marketing hero's Ads
// tab. The wire shape is OWNED by the CRM app's logic-function routes (POST
// /marketing/meta-ads-monitor + /marketing/meta-ads-action); this mirrors
// src/shared/meta-ads-types.ts in the propel-crm-integration repo so the hero can
// type the responses. The hero is a separate package and can't import from the CRM
// app's src/shared, so the types are duplicated here (not re-exported). Keep in
// sync with the routes if the contract changes.
//
// Money crosses the wire as MINOR units (fils, ×100) AND pre-formatted AED strings
// — the tab renders the strings and never re-does currency math (the route owns
// the formatting). The only client-side currency math is the budget-input AED↔fils
// conversion, which the route re-validates server-side.

export type AdsRange = '7d' | '30d' | '90d';

// Why the panel has no live Meta data (drives the empty/notice state). 'OK' means
// data is present. Server-decided so the copy stays server-owned.
export type AdsUnavailableReason =
  | 'OK'
  | 'NOT_CONFIGURED' // META_SYSTEM_USER_TOKEN unset on this container
  | 'META_ERROR' // Graph call failed (message carried, already redacted)
  | 'NO_CAMPAIGNS'; // token works but the account has no campaigns

// One campaign row: Meta metrics + the CRM-side join, all display-ready.
export interface AdsCampaignRow {
  campaignId: string; // Meta campaign id (stable React key)
  name: string;
  statusLabel: string; // from effective_status
  statusTone: 'good' | 'warn' | 'bad' | 'mute';
  objectiveLabel: string;
  // Meta side — null when no insight row in the window (then *Label is '—')
  hasInsights: boolean;
  spendMinor: number | null;
  spendLabel: string; // 'AED 1,250.00' or '—'
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  metaLeads: number | null;
  cplMinor: number | null;
  cplLabel: string; // 'AED 42.00' or '—'
  budgetLabel: string; // 'AED 50/day', 'AED 5,000 total', or '—'
  // CRM side — all null when this Meta campaign has no marketingCampaign join.
  crmLinked: boolean;
  crmLeads: number | null;
  crmOpps: number | null;
  attributedRevenueMinor: number | null;
  attributedRevenueLabel: string; // 'AED 120,000' or '—'
  attributedDeals: number | null;
  roi: number | null; // ratio (3.2 = 320%); null when not computable
  roiLabel: string; // '3.2×' style or '—'
}

// Window totals (KPI strip).
export interface AdsTotalsView {
  campaigns: number;
  activeCampaigns: number;
  linkedCampaigns: number;
  spendMinor: number;
  spendLabel: string;
  impressions: number;
  clicks: number;
  metaLeads: number;
  crmLeads: number;
  crmOpps: number;
  attributedRevenueMinor: number;
  attributedRevenueLabel: string;
  blendedCplLabel: string; // 'AED 38.00' or '—'
  blendedRoiLabel: string; // '3.1×' or '—'
}

// 'COORDINATOR' = manager/admin (data); 'VIEWER_BLOCKED' = agent (empty shape).
export type AdsTier = 'COORDINATOR' | 'VIEWER_BLOCKED';

export interface MetaAdsMonitorPayload {
  tier: AdsTier;
  range: AdsRange;
  generatedAtLabel: string; // Asia/Dubai 'HH:MM' style
  available: AdsUnavailableReason;
  /** human notice when available !== 'OK' (already redacted); '' when OK. */
  notice: string;
  /** account id shown in the header chip (e.g. 'act_1931317161145711'). */
  adAccountId: string;
  rows: AdsCampaignRow[];
  totals: AdsTotalsView;
}

// One day in the per-campaign detail drawer (time_increment=1).
export interface AdsDailyPointView {
  dayKey: string;
  label: string; // short Asia/Dubai label
  spendMinor: number;
  spendLabel: string;
  impressions: number;
  clicks: number;
  leads: number;
}

export interface MetaAdsDetailPayload {
  tier: AdsTier;
  campaignId: string;
  name: string;
  available: AdsUnavailableReason;
  notice: string;
  series: AdsDailyPointView[];
}

// ── action route (/marketing/meta-ads-action) wire types ─────────────────────

export type MetaBudgetKind = 'daily' | 'lifetime';

// One ad set as returned by the action route's listAdSets sub-request.
export interface AdSetLite {
  id: string;
  name: string;
  dailyBudgetMinor: number | null;
  lifetimeBudgetMinor: number | null;
}

// listAdSets sub-request response.
export type ListAdSetsResp = {
  ok?: true;
  adSets?: AdSetLite[];
  cboBudget?: boolean;
  error?: string;
  operatorAction?: string;
};

// pause/resume/budget/duplicate response.
export type ActionResp = {
  ok?: true;
  newCampaignId?: string;
  error?: string;
  operatorAction?: string;
};
