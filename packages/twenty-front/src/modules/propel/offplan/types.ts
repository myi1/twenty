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
  q: string; districtIds: string[]; minPriceAed?: number; maxPriceAed?: number;
  minBedrooms?: number; maxBedrooms?: number;
};
export type OffplanMapsResult = {
  project?: { externalId: number; name: string };
  location?: { lat: number | null; lon: number | null };
};
export type RouteEnvelope<T> = { ok: boolean; data?: T; error?: string; code?: string };
