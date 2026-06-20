// Types for the Lead Routing tab (Lead Engine S3) — a Mantine port of the legacy
// app-sandbox front-component. The wire shapes match the UNCHANGED gated routes
// /lead/source-config (read + flat upsert) and /lead/source-config/seed.

export type LeadConfigRow = {
  id: string;
  name: string | null;
  sourceKey: string | null;
  channel: string | null;
  defaultPipeline: string | null;
  assignmentMode: string | null;
  agentPool: unknown;
  slaMinutes: number | null;
  slaBehavior: string | null;
  enabled: boolean | null;
};

export type LeadConfigAgent = {
  id: string;
  name: string;
  availability: string | null;
};

export type LeadConfigReadResponse = {
  ok: boolean;
  configs?: LeadConfigRow[];
  agents?: LeadConfigAgent[];
  error?: string;
};

export type LeadConfigWriteResponse = {
  ok: boolean;
  config?: LeadConfigRow;
  mode?: string;
  error?: string;
};

export type LeadConfigSeedResponse = {
  ok: boolean;
  created?: string[];
  skipped?: string[];
  total?: number;
  error?: string;
};

// Option lists — mirror the SELECT field values the server route validates against
// (so a malformed value can't be written). Order/labels carried over from the
// legacy front-component for parity.
export const LEAD_ASSIGNMENT_MODES: { value: string; label: string }[] = [
  { value: 'MANUAL', label: 'Manual / triage' },
  { value: 'ROUND_ROBIN', label: 'Round-robin' },
  { value: 'FIRST_AVAILABLE', label: 'First available' },
  { value: 'AI_RECOMMENDED', label: 'AI / best-fit' },
  { value: 'OWNER_LOCKED', label: 'Owner-locked' },
  { value: 'CLAIM_RACE', label: 'Claim race' },
];

export const LEAD_PIPELINES: { value: string; label: string }[] = [
  { value: 'AUTO', label: 'Auto (classify)' },
  { value: 'SECONDARY', label: 'Secondary' },
  { value: 'SELL', label: 'Sell' },
  { value: 'OFFPLAN', label: 'Off-plan' },
  { value: 'INSTITUTIONAL', label: 'Institutional' },
  { value: 'RCBI', label: 'RCBI' },
];

export const LEAD_SLA_BEHAVIORS: { value: string; label: string }[] = [
  { value: 'ROTATE', label: 'Rotate' },
  { value: 'ALERT_ONLY', label: 'Alert only' },
  { value: 'BOTH', label: 'Rotate + alert' },
];
