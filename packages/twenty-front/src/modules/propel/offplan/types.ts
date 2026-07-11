export type OffplanUnit = {
  externalId: number; projectId: string; projectName: string; developerName: string;
  districtId: string; districtName: string; price: number; pricePerSqft: number;
  squareFt: number; layoutName: string; floor: string; status: string; floorPlanUrl?: string;
};
export type OffplanSearchResult = { units: OffplanUnit[]; total: number; hasMore: boolean };

// One card per PROJECT (the browse rail groups the flat unit list by projectId so
// the same tower isn't listed once per unit). `anchorUnit` is the cheapest unit —
// it seeds the detail drawer + pitch generate, which are still unit-anchored.
export type OffplanProject = {
  projectId: string; projectName: string; developerName: string;
  districtId: string; districtName: string;
  fromPriceAed: number; unitCount: number; layouts: string[];
  minSquareFt: number; maxSquareFt: number;
  anchorUnit: OffplanUnit;
};

// A map pin, one per project with resolved coordinates (from /v1/media/maps).
export type OffplanPin = { projectId: string; lon: number; lat: number; label: string };

export type OffplanFiltersState = {
  q: string;
  districtIds: string[];
  minPriceAed?: number;
  maxPriceAed?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  handoverBeforeIso?: string; // derived from a "before Q<n> <year>" picker (Plan 2)
  developerSlugs?: string[];
};
export type OffplanMapsResult = {
  project?: { externalId: number; name: string };
  location?: { lat: number | null; lon: number | null };
};
export type RouteEnvelope<T> = { ok: boolean; data?: T; error?: string; code?: string };

// A bulk map point from /offplan/browse { action:'mapPoints' } → geniemap /v1/map/points.
export type OffplanMapPoint = {
  externalId: number;
  name: string;
  lat: number;
  lon: number;
  districtId: string;
  districtName: string;
  priceFromAed: number | null;
  unitCount: number;
  isLaunch: boolean;
  status: string;
  handover: string | null;
  developerName: string | null;
  developerSlug: string | null;
  heroImageUrl?: string | null;
};
// Paged shape from /v1/map/points when { offset, limit } are sent. nextOffset +
// hasMore drive the hero's page loop (the CRM proxy's IPC response channel drops
// payloads > ~64KB, so the ~550KB set is pulled in bounded pages). nextOffset/
// hasMore are optional so the unpaged whole-set response still type-checks.
export type OffplanMapPointsResult = {
  points: OffplanMapPoint[];
  total: number;
  nextOffset?: number;
  hasMore?: boolean;
};

// Full project detail from /offplan/browse { action:'projectDetail' } →
// geniemap POST /v1/projects/detail. Deliberately separate from the lean
// OffplanMapPoint — the point feed stays small; detail is fetched lazily.
export type OffplanProjectDetail = {
  externalId: number;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  isLaunch: boolean;
  hasResale: boolean;
  has3DModel: boolean;
  handover: string | null;
  startOfSales: string | null;
  minPriceAed: number | null;
  maxPriceAed: number | null;
  minSquareFt: number | null;
  maxSquareFt: number | null;
  ownershipType: string | null;
  eoiAed: number | null;
  nocPct: number | null;
  serviceCharge: number | null;
  commissionMinPct: number | null;
  commissionMaxPct: number | null;
  unitCount: number;
  unitTypes: Array<{ id?: string; name?: string }>;
  lat: number | null;
  lon: number | null;
  developer: { name: string; slug: string; description: string | null };
  district: { id: string; name: string };
  amenities: Array<{ name: string | null; code: string | null }>;
  paymentPlans: Array<{
    id: string;
    name: string;
    description: string | null;
    downPaymentPct: number | null;
    postHandover: boolean;
    items: Array<{
      rawName: string;
      description: string | null;
      order: number;
      installmentPct: number | null;
      dldPct: number | null;
      adminFeeAed: number | null;
      conditional: boolean;
      condition: string | null;
    }>;
  }>;
  renders: { primary: string | null; gallery: string[] };
  documents: Array<{ kind: string; label: string; url: string }>;
};

// Developer profile from /offplan/browse { action:'developerDetail' }.
export type OffplanDeveloperDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isJointVenture: boolean;
  contactName: string | null;
  contactPhone: string | null;
  site: string | null;
  activeProjects: number;
  portfolio: Array<{
    externalId: number;
    name: string;
    districtName: string;
    status: string;
    isLaunch: boolean;
    handover: string | null;
    minPrice: number | null;
    unitCount: number;
  }>;
  portfolioTotal: number;
};

// ── Pitch wizard ─────────────────────────────────────────────────────────────
export type PitchClient = { id: string; name: string; phoneE164: string | null };
export type PitchTheme = 'nocturne' | 'riviera' | 'atlas';
export type PitchSections = {
  cover: boolean;
  districtIntro: boolean;
  projectPages: boolean;
  units: boolean;
  layouts: boolean;
  amenities: boolean;
  paymentPlan: boolean;
  areaStrength: boolean;
  investorRoi: boolean;
};
export type PitchGenerated = {
  projectExternalId: number;
  url: string;
  filename?: string;
  noteId?: string;
};

// Client-side browse filters applied over the full point feed. `projectIdAllowlist`
// is set only when a unit-level (beds/layout) filter narrows to a matching id set.
export type OffplanBrowseFilters = {
  q: string;
  districtIds: string[];
  minPriceAed?: number;
  maxPriceAed?: number;
  handoverBeforeIso?: string;
  developerSlugs: string[];
  newLaunchOnly: boolean;
  projectIdAllowlist?: Set<number>; // set when a unit-level (beds) filter is active
};
export type MarkerMode = 'district' | 'project';
export const DISTRICT_ZOOM_MAX = 11; // < this ⇒ district bubbles; ≥ this ⇒ project pills

// A district-level cluster rendered as a labelled bubble at low zoom.
export type OffplanDistrictCluster = {
  districtId: string;
  districtName: string;
  count: number;
  lat: number; // mean of member points
  lon: number;
  minPriceFromAed: number | null;
};

// [west, south, east, north] — MapLibre LngLatBounds order.
export type MapBounds = { west: number; south: number; east: number; north: number };
