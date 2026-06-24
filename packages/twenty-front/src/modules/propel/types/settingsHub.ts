// ─────────────────────────────────────────────────────────────────────────────
// Settings Hub hero — route WIRE TYPES
// ─────────────────────────────────────────────────────────────────────────────
//
// The request/response shapes for the UNCHANGED CRM logic-function routes the hero
// reuses (no app-side schema or route changes):
//   • /settings/automation-config        (read configs + members; save singleton)
//   • /settings/automation-config/seed   (idempotent seed of a singleton)
//   • /settings/custom-fields            (list lane objects + fields; create/rename/remove)
//   • /lead/agent-profile                (read members; upsert one profile)
//   • /lead/source-config (+ /seed)      → see types/leadRouting.ts (reused as-is)
//   • /marketing/save-rules              (write quiet hours / caps; read via /marketing/hub)
//
// Every response either carries `ok: true` + data, or `ok: false` + `error`. The
// hero treats a null callPropelRoute result (non-2xx / network) the same as
// `ok: false`.

// ── /settings/automation-config (singleton configs: routing + 4 lanes) ────────

export type ConfigRow = Record<string, unknown> & { id?: string };
export type Member = { id: string; name: string };

export type AutomationConfigReadResponse = {
  ok: boolean;
  configs?: Record<string, ConfigRow | null>;
  members?: Member[];
  canEdit?: boolean;
  error?: string;
};

export type AutomationConfigWriteResponse = {
  ok: boolean;
  group?: string;
  config?: ConfigRow | null;
  mode?: string;
  error?: string;
};

export type AutomationConfigSeedResponse = {
  ok: boolean;
  created?: string[];
  skipped?: string[];
  error?: string;
};

// ── /settings/custom-fields ───────────────────────────────────────────────────

export type CustomField = {
  id: string;
  name: string;
  label: string;
  type: string;
  isCustom: boolean;
  isActive: boolean;
  appOwned: boolean;
  userCreated: boolean;
  automationWired: boolean;
  warning?: string;
};

export type CustomFieldObject = {
  nameSingular: string;
  label: string;
  objectMetadataId: string | null;
  fields: CustomField[];
};

export type CustomFieldsListResponse = {
  ok: boolean;
  objects?: CustomFieldObject[];
  canEdit?: boolean;
  error?: string;
};

export type CustomFieldMutationResponse = {
  ok: boolean;
  field?: CustomField;
  fieldId?: string;
  mode?: string;
  warning?: string;
  error?: string;
  needsDataModelPermission?: boolean;
};

// ── /lead/agent-profile ───────────────────────────────────────────────────────

export type AgentProfileMember = {
  id: string;
  name: string;
  agentAreas: unknown;
  agentLanguages: unknown;
  agentLaneQualifications: unknown;
  agentPoolMemberships: unknown;
  agentAvailability: string | null;
  agentWhatsApp: string | null;
};

export type AgentProfileReadResponse = {
  ok: boolean;
  members?: AgentProfileMember[];
  actingMemberId?: string;
  canEditAll?: boolean;
  error?: string;
};

export type AgentProfileWriteResponse = {
  ok: boolean;
  updated?: string[];
  error?: string;
};

// Patch sent to the upsert route (memberId + the changed fields only).
export type AgentProfilePatch = Partial<
  Pick<
    AgentProfileMember,
    | 'agentAreas'
    | 'agentLanguages'
    | 'agentLaneQualifications'
    | 'agentPoolMemberships'
    | 'agentAvailability'
    | 'agentWhatsApp'
  >
>;

// Availability + lane vocab (mirror the route's validation sets).
export const AGENT_AVAILABILITY: { value: string; label: string }[] = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'BUSY', label: 'Busy' },
  { value: 'OOO', label: 'Out of office' },
];

export const AGENT_LANES: string[] = [
  'SECONDARY',
  'SELL',
  'OFFPLAN',
  'INSTITUTIONAL',
  'RCBI',
];
