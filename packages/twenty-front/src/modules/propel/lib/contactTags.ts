// Contact-tagging taxonomy (Phase B — the Inbox "Classify" card).
//
// Mirrors the Phase A server contract (propel-crm-integration feat/contact-tagging:
// src/fields/person-contact-type.field.ts + src/shared/contact-pipeline-eligibility.ts).
// The fork hero is a CLIENT of those routes, so this is a deliberate, lockstepped
// mirror — a single edit here keeps the dropdown, the chip label, and the "filtered"
// hint in sync with what /contact/classify accepts and what the inbox route reports
// as `pipelineEligible`.
//
// 14 values in 3 GROUPS. The group drives BOTH the dropdown sections AND whether the
// contact stays in the lead pipeline (allow-list, §5.3 of the spec): only the four
// PROSPECTS values (+ untagged) stay in; every partner / agent / supplier / spam
// value is filtered by default, so a future non-prospect type can never accidentally
// start receiving SLA chases or campaign blasts.

export type ContactTypeValue =
  // Prospects — stay in the lead pipeline
  | 'LEAD'
  | 'CLIENT'
  | 'VENDOR'
  | 'OTHER'
  // Partners — visible, but NOT leads (filtered from the pipeline)
  | 'RCBI_PARTNER'
  | 'DEVELOPER_PARTNER'
  | 'REFERRAL_PARTNER'
  | 'MORTGAGE_PARTNER'
  | 'LEGAL_PARTNER'
  | 'PARTNER'
  // Not prospects — filtered from the pipeline
  | 'REMAX_HUB_AGENT'
  | 'AGENT'
  | 'SUPPLIER_SALESPERSON'
  | 'SPAM';

export interface ContactTypeOption {
  value: ContactTypeValue;
  label: string;
}

export interface ContactTypeGroup {
  group: string; // section heading in the Select
  pipeline: boolean; // true → these values keep the contact in the lead pipeline
  options: ContactTypeOption[];
}

// The single source of the dropdown's three sections + their labels. Order and
// labels match the approved mockup / Phase A enum exactly.
export const CONTACT_TYPE_GROUPS: ContactTypeGroup[] = [
  {
    group: 'Prospects',
    pipeline: true,
    options: [
      { value: 'LEAD', label: 'Lead' },
      { value: 'CLIENT', label: 'Client' },
      { value: 'VENDOR', label: 'Vendor (property seller)' },
      { value: 'OTHER', label: 'Other' },
    ],
  },
  {
    group: 'Partners',
    pipeline: false,
    options: [
      { value: 'RCBI_PARTNER', label: 'RCBI Partner' },
      { value: 'DEVELOPER_PARTNER', label: 'Developer Partner' },
      { value: 'REFERRAL_PARTNER', label: 'Referral Partner' },
      { value: 'MORTGAGE_PARTNER', label: 'Mortgage / Bank Partner' },
      { value: 'LEGAL_PARTNER', label: 'Conveyancing / Legal Partner' },
      { value: 'PARTNER', label: 'Other Partner' },
    ],
  },
  {
    group: 'Not prospects',
    pipeline: false,
    options: [
      { value: 'REMAX_HUB_AGENT', label: 'Remax Hub Agent' },
      { value: 'AGENT', label: 'External Agent' },
      { value: 'SUPPLIER_SALESPERSON', label: 'Supplier / Salesperson' },
      { value: 'SPAM', label: 'Spam' },
    ],
  },
];

// The Mantine <Select data={...}> shape: grouped options. The component renders the
// sections in order; each value's group heading comes straight from the taxonomy.
export const CONTACT_TYPE_SELECT_DATA = CONTACT_TYPE_GROUPS.map((g) => ({
  group: g.group,
  items: g.options.map((o) => ({ value: o.value, label: o.label })),
}));

// The allow-list of values that keep a contact IN the lead pipeline (§5.3). Untagged
// (null) also stays in — handled by isPipelineContactType below — and a set team-
// member link always filters (handled server-side + reflected in row.pipelineEligible).
export const PIPELINE_CONTACT_TYPES: ContactTypeValue[] = [
  'LEAD',
  'CLIENT',
  'VENDOR',
  'OTHER',
];

// Map a contactType value to its display label (falls back to a humanized form for an
// unknown/legacy value so the chip never shows a raw ENUM_NAME).
const LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(
  CONTACT_TYPE_GROUPS.flatMap((g) => g.options).map((o) => [o.value, o.label]),
);

export const contactTypeLabel = (value: string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '';
  return (
    LABEL_BY_VALUE[value] ??
    value
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (m) => m.toUpperCase())
  );
};

// Is a bare contactType value a pipeline (prospect) value? Untagged → true (a fresh,
// unclassified lead is never silently dropped). This is the CLIENT-side mirror of the
// allow-list; the authoritative `pipelineEligible` still comes from the inbox route
// (which also accounts for the team-member link). Used only for the local chip/hint.
export const isPipelineContactType = (
  value: string | null | undefined,
): boolean => {
  if (value === null || value === undefined || value === '') return true;
  return (PIPELINE_CONTACT_TYPES as string[]).includes(value);
};
