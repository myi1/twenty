export type OffplanUnit = {
  externalId: number; projectId: string; projectName: string; developerName: string;
  districtId: string; districtName: string; price: number; pricePerSqft: number;
  squareFt: number; layoutName: string; floor: string; status: string; floorPlanUrl?: string;
};
export type OffplanSearchResult = { units: OffplanUnit[]; total: number; hasMore: boolean };
export type OffplanFiltersState = {
  q: string; districtIds: string[]; minPriceAed?: number; maxPriceAed?: number;
  minBedrooms?: number; maxBedrooms?: number;
};
export type RouteEnvelope<T> = { ok: boolean; data?: T; error?: string; code?: string };
