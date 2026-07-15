// Pure geo helpers for the Off-Plan Studio map. No MapLibre, no DOM — unit-tested.
import type { OffplanMapPoint, OffplanDistrictCluster, MapBounds } from './types';

export function isWithinBounds(p: { lat: number; lon: number }, b: MapBounds): boolean {
  return p.lon >= b.west && p.lon <= b.east && p.lat >= b.south && p.lat <= b.north;
}

export function pointsWithinBounds(points: OffplanMapPoint[], b: MapBounds): OffplanMapPoint[] {
  return points.filter((p) => isWithinBounds(p, b));
}

// Collapse points into one labelled cluster per district: count, mean coordinate
// (for bubble placement), and the cheapest from-price across the district.
export function groupPointsByDistrict(points: OffplanMapPoint[]): OffplanDistrictCluster[] {
  const by = new Map<string, OffplanMapPoint[]>();
  for (const p of points) {
    const list = by.get(p.districtId);
    if (list) list.push(p);
    else by.set(p.districtId, [p]);
  }
  const clusters: OffplanDistrictCluster[] = [];
  for (const list of by.values()) {
    const first = list[0];
    const lat = list.reduce((s, p) => s + p.lat, 0) / list.length;
    const lon = list.reduce((s, p) => s + p.lon, 0) / list.length;
    const prices = list.map((p) => p.priceFromAed).filter((n): n is number => n != null);
    clusters.push({
      districtId: first.districtId,
      districtName: first.districtName,
      count: list.length,
      lat,
      lon,
      minPriceFromAed: prices.length ? Math.min(...prices) : null,
    });
  }
  return clusters.sort((a, b) => b.count - a.count);
}

export type OffplanPointFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: {
      externalId: number;
      name: string;
      districtId: string;
      priceFromAed: number | null;
      isLaunch: boolean;
    };
  }>;
};

export function pointsToGeoJSON(points: OffplanMapPoint[]): OffplanPointFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: {
        externalId: p.externalId,
        name: p.name,
        districtId: p.districtId,
        priceFromAed: p.priceFromAed,
        isLaunch: p.isLaunch,
      },
    })),
  };
}
