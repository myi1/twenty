// Fork-local PORT of the Propel built-in merge-tag metadata (propel-crm-integration:
// src/shared/merge-tags.ts). Pure, React-free — the human-metadata layer over the
// closed merge vocabulary, consumed by the Templates → "Merge tags" reference list
// + the custom-fields manager's reserved-name gate.
//
// SOURCE of truth for WHICH built-in tags exist is the campaign-renderer
// MERGE_FIELDS_V1 / DEFAULT_MERGE_FIELDS (here we re-declare the FULL vocabulary
// byte-faithfully — independent of the hero's smaller email-preview campaignRenderer
// subset). Each tag gets a coordinator-facing label and a plain-English "where the
// real value comes from" hint.

import { WA_MERGE_FIELDS_V1, type WaMergeField } from './waTemplate';

export interface MergeTagMeta {
  key: WaMergeField;
  label: string;
  resolvesFrom: string;
}

// The DEFAULT per-recipient palette every email automatically fills — the
// recipient + agent + office identity set (DEFAULT_MERGE_FIELDS in campaign-renderer).
// listingTitle/listingPrice/permitNumber are campaign-scoped (not in this default
// palette) and unsubscribeUrl is auto-appended, so none appear in the "always
// available" reference list.
export const DEFAULT_MERGE_FIELDS: readonly WaMergeField[] = [
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'agentName',
  'agentPhone',
  'agentEmail',
  'officeName',
];

// Total over the closed vocabulary — every tag gets a label + hint, so the
// reference list can never surface a raw key.
const MERGE_TAG_META: Record<
  WaMergeField,
  { label: string; resolvesFrom: string }
> = {
  firstName: { label: 'First name', resolvesFrom: "The recipient's first name" },
  lastName: { label: 'Last name', resolvesFrom: "The recipient's last name" },
  fullName: {
    label: 'Full name',
    resolvesFrom: "The recipient's first + last name",
  },
  email: { label: 'Email', resolvesFrom: "The recipient's email address" },
  phone: { label: 'Phone', resolvesFrom: "The recipient's phone number" },
  agentName: {
    label: 'Agent name',
    resolvesFrom: "The recipient's assigned agent",
  },
  agentPhone: {
    label: 'Agent phone',
    resolvesFrom: "The assigned agent's phone number",
  },
  agentEmail: {
    label: 'Agent email',
    resolvesFrom: "The assigned agent's email address",
  },
  officeName: {
    label: 'Office name',
    resolvesFrom: 'Your brokerage / office name',
  },
  listingTitle: {
    label: 'Listing title',
    resolvesFrom: "The campaign listing's title",
  },
  listingPrice: {
    label: 'Listing price',
    resolvesFrom: "The campaign listing's price",
  },
  permitNumber: {
    label: 'Permit number',
    resolvesFrom: "The campaign listing's permit number",
  },
  unsubscribeUrl: {
    label: 'Unsubscribe link',
    resolvesFrom: 'Auto-appended in the email footer',
  },
};

// Human metadata for a built-in merge tag. Falls back to the raw key (defensive).
export const mergeTagMeta = (key: WaMergeField): MergeTagMeta => {
  const m = MERGE_TAG_META[key];
  return { key, label: m?.label ?? key, resolvesFrom: m?.resolvesFrom ?? '' };
};

// The "always available" built-in tags shown read-only in the Merge tags tab —
// the per-recipient DEFAULT palette, in declared order, each with its label +
// resolves-from hint.
export const ALWAYS_AVAILABLE_MERGE_TAGS: MergeTagMeta[] =
  DEFAULT_MERGE_FIELDS.map(mergeTagMeta);

// ── Custom-field key gate (mirrors marketing-save-custom-field-route) ───────────
// A merge tag is lowercase snake (^[a-z][a-z0-9_]{0,39}$) AND not a reserved name.
// Reserved = the FULL closed vocabulary (MERGE_FIELDS_V1) PLUS 'email' (the
// sequence test-send special value) — EXACTLY the route's RESERVED set, so the
// Save button can't enable for a key the server will reject.
export const CUSTOM_FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
export const RESERVED_MERGE_KEYS = new Set<string>([
  ...WA_MERGE_FIELDS_V1,
  'email',
]);
