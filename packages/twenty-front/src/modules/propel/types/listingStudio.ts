// Listing Studio hero — shared types (S2).
//
// Mirror of the CRM route surface (propel-crm-integration
// src/listing-studio/studio-routes.ts). The hero owns draft state CLIENT-SIDE in
// S2 (React + localStorage); the routes are stateless proxies. These shapes are
// duplicated here (not imported) because the fork and the CRM app are separate
// repos — the same reason the S1 client mirrors the PF enums verbatim.

// The 6 steps of the Studio flow (lane spec §3). The rail renders them in order.
export const STUDIO_STEPS = [
  'intake',
  'details',
  'photos',
  'writeup',
  'permit',
  'publish',
] as const;
export type StudioStep = (typeof STUDIO_STEPS)[number];

// Two entry points (spec §3): A = blank from documents; B = from a CRM property.
export type StudioEntry = 'scratch' | 'property';

// The subset of CRM `property` facts the Studio collects/edits. All optional —
// entry A starts empty; entry B prefills what the property knows.
export interface StudioFacts {
  name?: string;
  assetClass?: string;
  community?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  furnishing?: string;
  sizeSqft?: number;
  plotSqft?: number;
  /** AED whole units (NOT micros). */
  askingPriceAed?: number;
  floor?: string;
  unitNumber?: string;
  parking?: number;
  view?: string;
  completionStatus?: string;
  tenure?: string;
}

// ── Write-up (Step 4) — the AI EN+AR copy + the chosen tone. ──────────────────
export type StudioTone = 'luxury' | 'friendly' | 'facts';

export interface StudioWriteup {
  titleEn?: string;
  descriptionEn?: string;
  titleAr?: string;
  descriptionAr?: string;
  tone?: StudioTone;
}

// A single compliance-lint finding from the write-up route.
export interface StudioLintFinding {
  severity: 'hard' | 'soft';
  field: 'titleEn' | 'titleAr' | 'descriptionEn' | 'descriptionAr';
  message: string;
}

// ── Photos (Step 3) — a watermarked, ordered photo. `dataUrl` is the in-browser
//    preview (the stamped bytes); `hosted` is the public URL PF will fetch (set
//    once the host step runs — an open dependency on the B2 path). ──
export interface StudioPhoto {
  id: string;
  name: string;
  /** data: URL of the stamped (or original) bytes for preview. */
  dataUrl: string;
  /** true once the RE/MAX watermark has been applied to this photo. */
  watermarked: boolean;
  /** the public HTTPS URL PF fetches (set by the host step; may be absent). */
  hosted?: string;
}

// ── Permit (Step 5) — the manually-entered Trakheesi block + validation result. ─
export type StudioPermitAuthority = 'rera' | 'dtcm' | 'adrec';

export interface StudioPermit {
  permitNumber?: string;
  authority?: StudioPermitAuthority;
  licenseNumber?: string;
  issuanceDate?: string;
  /** the step-5 attestation checkbox. */
  userConfirmedDataIsCorrect?: boolean;
  /** set true once /listing-studio/permit validated it. */
  validated?: boolean;
  /** PF's expiry for the reality-check. */
  expiresAt?: string;
}

// ── The PF location resolved by the typeahead (Step 2). ───────────────────────
export interface StudioLocation {
  id: number;
  name: string;
  /** true when this is the sandbox fallback (geo lookup unavailable). */
  fallback?: boolean;
}

// ── Publish result (Step 6) the manage card renders. ──────────────────────────
export interface StudioPublishResult {
  listingId: string;
  reference?: string;
  published: boolean;
  /** PF state, e.g. "pending_publishing" (async — 200 != live). */
  state?: string;
  cost?: { name?: string; credits?: number };
}

// A Studio draft as the hero owns it. `draftId` is client-minted in S2; S3+ add
// the per-step state (location, photos, writeup, permit, publish).
export interface StudioDraft {
  draftId: string;
  entry: StudioEntry;
  propertyId?: string;
  facts: StudioFacts;
  step: StudioStep;
  /** Step 2 — the resolved PF location. */
  location?: StudioLocation;
  /** Step 3 — watermarked, ordered photos (cover = index 0). */
  photos?: StudioPhoto[];
  /** Step 4 — the AI write-up. */
  writeup?: StudioWriteup;
  /** Step 5 — the validated permit. */
  permit?: StudioPermit;
  /** Step 6 — the publish/manage result once live. */
  publish?: StudioPublishResult;
}

// The PF-vocabulary projection the preview pane renders (spec §6). Built server-
// side by /listing-studio/preview from the S1 CRM→PF transforms; every field
// optional so the card "builds as you go" (spec §16).
export interface StudioPreview {
  category?: string;
  type?: string;
  bedrooms?: string;
  bathrooms?: string;
  size?: number;
  projectStatus?: string;
  furnishingType?: string;
  priceAed?: number;
  locationLabel?: string;
  title?: string;
}

// ── Route response envelopes (the CRM routes return { ok, ... } | error) ──────
export interface StudioStartResponse {
  ok: boolean;
  draft?: StudioDraft;
  error?: string;
}
export interface StudioSaveResponse {
  ok: boolean;
  draftId?: string;
  step?: StudioStep;
  accepted?: StudioFacts;
  error?: string;
}
export interface StudioPreviewResponse {
  ok: boolean;
  preview?: StudioPreview;
  error?: string;
}

// A CRM property the entry-B picker lists. Read from the CRM via the standard
// records GraphQL (not a Propel route) by useStudioPropertyPicker.
export interface StudioPropertyOption {
  id: string;
  name: string;
  community?: string | null;
  bedrooms?: number | null;
}
