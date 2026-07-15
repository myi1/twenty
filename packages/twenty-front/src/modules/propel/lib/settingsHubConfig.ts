// ─────────────────────────────────────────────────────────────────────────────
// Settings Hub hero — config-group METADATA (mirror of the CRM app's source)
// ─────────────────────────────────────────────────────────────────────────────
//
// This is the twenty-front HERO copy of the field metadata the CRM app defines in
// propel-crm-integration src/shared/settings-hub-core.ts (SETTINGS_GROUPS). It is
// pure presentation data — the labels, help text, units, defaults and field kinds
// the hero renders. The AUTHORITY for validation + coercion still lives in the CRM
// route (settings-automation-config-route.ts → buildConfigPatch), which the hero
// reaches UNCHANGED via callPropelRoute('/settings/automation-config'). The hero
// only sends what a manager explicitly typed; an unset field stays null and the
// crons fall back to their spec defaults.
//
// Keep the `key`, `objectPlural`-less group identity and field `name`s in EXACT
// sync with the CRM module — a patch key the route doesn't recognize is rejected.
// (The hero does not need objectPlural / mutation names: those are server-side
// concerns. It carries only what it renders + the patch keys it sends.)

export type SettingsFieldKind = 'number' | 'boolean' | 'idList';

export interface SettingsField {
  /** the GraphQL field name on the config object (also the patch key sent to the route). */
  name: string;
  /** plain-language label shown in the hub. */
  label: string;
  /** the control + validation kind. */
  kind: SettingsFieldKind;
  /** the spec default, shown as the placeholder/help so a manager sees "(default N)". */
  defaultValue?: number | boolean;
  /** non-obvious values get a one-line explanation under the control. */
  help?: string;
  /** number-field unit suffix shown next to the input (e.g. "min", "hours", "days"). */
  unit?: string;
}

export interface SettingsGroup {
  /** stable key — the tab/section id AND the `save.group` value the route keys on. */
  key: string;
  /** plain-language section title. */
  title: string;
  /** one-line description of what this group governs. */
  blurb: string;
  /** the editable fields. */
  fields: SettingsField[];
}

// The four lane AutomationConfigs share the same base shape.
const laneAutomationFields = (): SettingsField[] => [
  {
    name: 'newSlaMinutes',
    label: 'First-response SLA',
    kind: 'number',
    defaultValue: 10,
    unit: 'min',
    help: 'A brand-new lead must be contacted within this many minutes, or an SLA-breach alert fires.',
  },
  {
    name: 'contactedStallHours',
    label: 'Contacted stall',
    kind: 'number',
    defaultValue: 48,
    unit: 'hours',
    help: 'Hours a contacted lead may sit with no progress before a stall reminder.',
  },
  {
    name: 'resumeReminderLeadDays',
    label: 'Resume reminder lead',
    kind: 'number',
    defaultValue: 7,
    unit: 'days',
    help: 'How many days before an on-hold lead’s resume date to remind the owner.',
  },
  {
    name: 'onHoldMaxDays',
    label: 'On-hold maximum',
    kind: 'number',
    defaultValue: 90,
    unit: 'days',
    help: 'Days a lead may stay on hold before a manager review alert.',
  },
  {
    name: 'escalationContactIds',
    label: 'Extra escalation contacts',
    kind: 'idList',
    help: 'Team members added to this lane’s SLA / on-hold alerts, on top of the owner and their manager.',
  },
];

// The lead-routing (brokerage-wide) config group.
export const ROUTING_GROUP: SettingsGroup = {
  key: 'leadRouting',
  title: 'Lead routing engine',
  blurb:
    'Brokerage-wide rules for the lead engine — when an idle lead recycles to the pool, the soft active-lead cap, and who staffs the triage desk.',
  fields: [
    {
      name: 'idleHotHours',
      label: 'Idle reassign — hot lead',
      kind: 'number',
      defaultValue: 48,
      unit: 'hours',
      help: 'Hours a HOT lead may sit with no agent activity before it recycles back to the pool.',
    },
    {
      name: 'idleWarmHours',
      label: 'Idle reassign — warm lead',
      kind: 'number',
      defaultValue: 72,
      unit: 'hours',
      help: 'Hours a WARM (or cooler) lead may sit idle before it recycles back to the pool.',
    },
    {
      name: 'qualifiedStaleDays',
      label: 'Qualified-stage stale',
      kind: 'number',
      defaultValue: 7,
      unit: 'days',
      help: 'A qualified opportunity needs a logged action at least this often, or it auto-escalates. Pauses once a meeting or negotiation begins.',
    },
    {
      name: 'activeLeadCap',
      label: 'Active-lead cap (soft)',
      kind: 'number',
      defaultValue: 100,
      unit: 'leads',
      help: 'Once an agent is carrying this many active leads, new pool leads stop routing to them and a manager is flagged. Never orphans a lead.',
    },
    {
      name: 'poolUnassignedAlertMinutes',
      label: 'Pool unassigned alert',
      kind: 'number',
      defaultValue: 10,
      unit: 'min',
      help: 'Minutes a pool lead may sit unassigned before the triage desk is alerted (matches the first-response SLA).',
    },
    {
      name: 'notifyTriageDeskOnWhatsApp',
      label: 'WhatsApp the triage desk on a new pool lead',
      kind: 'boolean',
      defaultValue: true,
      help: 'When a pool lead is assigned to a triage owner, also send them a WhatsApp nudge so they go triage it. Skipped silently for anyone without an Agent WhatsApp number.',
    },
    {
      name: 'deskOwnerIds',
      label: 'Triage desk owners',
      kind: 'idList',
      help: 'The team members pool leads are auto-assigned to (round-robin) and who get the unassigned-pool alert. Leave empty and pool leads simply wait for manual triage.',
    },
    {
      name: 'escalationContactIds',
      label: 'Extra escalation contacts',
      kind: 'idList',
      help: 'Team members added to cap-exceeded / desk-overflow alerts, on top of the desk owners and managers.',
    },
  ],
};

// The four per-lane AutomationConfig groups, in display order (RCBI first — it
// carries the extra partner-confirm + compliance-authority fields).
export const LANE_GROUPS: SettingsGroup[] = [
  {
    key: 'rcbiAutomation',
    title: 'RCBI lane',
    blurb:
      'SLA timers, partner-confirm window and compliance authority for the RCBI (citizenship / residency) lane.',
    fields: [
      {
        name: 'newSlaMinutes',
        label: 'First-response SLA',
        kind: 'number',
        defaultValue: 10,
        unit: 'min',
        help: 'A brand-new RCBI lead must be contacted within this many minutes, or an SLA-breach alert fires.',
      },
      {
        name: 'contactedStallHours',
        label: 'Contacted stall',
        kind: 'number',
        defaultValue: 48,
        unit: 'hours',
        help: 'Hours a contacted RCBI lead may sit with no progress before a stall reminder.',
      },
      {
        name: 'partnerConfirmHours',
        label: 'Partner-confirm window',
        kind: 'number',
        defaultValue: 48,
        unit: 'hours',
        help: 'Hours after a hand-off before an unconfirmed partner triggers an alert.',
      },
      {
        name: 'resumeReminderLeadDays',
        label: 'Resume reminder lead',
        kind: 'number',
        defaultValue: 7,
        unit: 'days',
        help: 'How many days before an on-hold lead’s resume date to remind the owner.',
      },
      {
        name: 'onHoldMaxDays',
        label: 'On-hold maximum',
        kind: 'number',
        defaultValue: 90,
        unit: 'days',
        help: 'Days an RCBI lead may stay on hold before a manager review alert.',
      },
      {
        name: 'complianceAuthorityIds',
        label: 'Compliance authority',
        kind: 'idList',
        help: 'Who gets notified on a compliance escalation (the CEO / compliance officer). Leave empty to fall back to the owner’s manager.',
      },
      {
        name: 'escalationContactIds',
        label: 'Extra escalation contacts',
        kind: 'idList',
        help: 'Team members added to RCBI SLA / partner / on-hold alerts, on top of the owner and their manager.',
      },
    ],
  },
  {
    key: 'buyerResaleAutomation',
    title: 'Buyer resale lane',
    blurb: 'SLA timers and on-hold thresholds for the buyer (resale) lane.',
    fields: laneAutomationFields(),
  },
  {
    key: 'sellerAutomation',
    title: 'Seller lane',
    blurb: 'SLA timers and on-hold thresholds for the seller lane.',
    fields: laneAutomationFields(),
  },
  {
    key: 'offplanAutomation',
    title: 'Off-plan lane',
    blurb: 'SLA timers and on-hold thresholds for the off-plan lane.',
    fields: laneAutomationFields(),
  },
];

// RAW_JSON id-list fields arrive parsed (array) or as a JSON string on some paths —
// accept both. (Mirrors toIdArray in the CRM core.)
export const toIdArray = (raw: unknown): string[] => {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : [];
};

// ── Custom Fields tab metadata (mirror of CRM custom-fields-core.ts) ──────────
// The Custom Fields panel drives its object picker + field rows ENTIRELY from the
// route's LIST response (objects[].nameSingular/label/fields), so the hero needs no
// hardcoded object list. The constant below is only a tiny fallback for the
// initial active tab before the first load resolves; it mirrors the CRM's 5
// editable lane objects (custom-fields-core.ts EDITABLE_LANE_OBJECTS, verified
// 2026-06-24) so the first paint names a real object.

export const EDITABLE_LANE_OBJECTS: { nameSingular: string; label: string }[] = [
  { nameSingular: 'secondaryOpportunity', label: 'Buyer / Tenant (Secondary)' },
  { nameSingular: 'sellOpportunity', label: 'Seller' },
  { nameSingular: 'offPlanOpportunity', label: 'Off-plan' },
  { nameSingular: 'rcbiOpportunity', label: 'RCBI' },
  { nameSingular: 'institutionalOpportunity', label: 'Institutional' },
];

// Field types offered in the "add field" form. The CRM route re-validates against
// its own creatable set; these are the dropdown options the hero shows.
export const CREATABLE_FIELD_TYPES: { type: string; label: string }[] = [
  { type: 'TEXT', label: 'Text' },
  { type: 'NUMBER', label: 'Number' },
  { type: 'BOOLEAN', label: 'Yes / No' },
  { type: 'DATE_TIME', label: 'Date & time' },
  { type: 'DATE', label: 'Date' },
  { type: 'CURRENCY', label: 'Currency' },
  { type: 'LINKS', label: 'Links' },
  { type: 'EMAILS', label: 'Emails' },
  { type: 'PHONES', label: 'Phones' },
  { type: 'RATING', label: 'Rating' },
  { type: 'RICH_TEXT', label: 'Rich text' },
];

export const fieldTypeLabel = (t: string): string =>
  CREATABLE_FIELD_TYPES.find((x) => x.type === t)?.label ?? t;

// Local label validation (the route re-validates; this gives instant UI feedback).
export const validateNewFieldLabel = (
  label: string,
): { ok: true } | { ok: false; error: string } => {
  const trimmed = (label ?? '').trim();
  if (!trimmed) return { ok: false, error: 'Enter a name for the field.' };
  if (trimmed.length > 60)
    return { ok: false, error: 'Field name is too long (max 60 characters).' };
  return { ok: true };
};
