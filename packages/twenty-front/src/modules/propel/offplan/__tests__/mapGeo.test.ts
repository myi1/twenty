import { isWithinBounds, pointsWithinBounds, groupPointsByDistrict, pointsToGeoJSON } from '../mapGeo';
import type { OffplanMapPoint, MapBounds } from '../types';

const pt = (over: Partial<OffplanMapPoint> = {}): OffplanMapPoint => ({
  externalId: 1, name: 'P', lat: 25.2, lon: 55.27, districtId: 'd1', districtName: 'Marina',
  priceFromAed: 500000, unitCount: 10, isLaunch: false, status: 'available',
  handover: '2027-10-02', developerName: 'OKSA', developerSlug: 'oksa', ...over,
});
const bounds: MapBounds = { west: 55.0, south: 25.0, east: 55.5, north: 25.4 };

describe('isWithinBounds', () => {
  it('is true inside and false outside', () => {
    expect(isWithinBounds(pt(), bounds)).toBe(true);
    expect(isWithinBounds(pt({ lon: 56.0 }), bounds)).toBe(false);
    expect(isWithinBounds(pt({ lat: 24.0 }), bounds)).toBe(false);
  });
});

describe('pointsWithinBounds', () => {
  it('keeps only in-bounds points', () => {
    const out = pointsWithinBounds([pt({ externalId: 1 }), pt({ externalId: 2, lon: 56 })], bounds);
    expect(out.map((p) => p.externalId)).toEqual([1]);
  });
});

describe('groupPointsByDistrict', () => {
  it('counts per district and averages coordinates + tracks min price', () => {
    const clusters = groupPointsByDistrict([
      pt({ externalId: 1, districtId: 'd1', lat: 25.0, lon: 55.0, priceFromAed: 600000 }),
      pt({ externalId: 2, districtId: 'd1', lat: 25.2, lon: 55.2, priceFromAed: 400000 }),
      pt({ externalId: 3, districtId: 'd2', districtName: 'JVC', priceFromAed: null }),
    ]);
    const d1 = clusters.find((c) => c.districtId === 'd1')!;
    expect(d1.count).toBe(2);
    expect(d1.lat).toBeCloseTo(25.1);
    expect(d1.lon).toBeCloseTo(55.1);
    expect(d1.minPriceFromAed).toBe(400000);
    expect(clusters.find((c) => c.districtId === 'd2')!.minPriceFromAed).toBeNull();
  });
});

describe('pointsToGeoJSON', () => {
  it('emits a FeatureCollection with point geometry + props', () => {
    const fc = pointsToGeoJSON([pt({ externalId: 7 })]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [55.27, 25.2] });
    expect(fc.features[0].properties.externalId).toBe(7);
  });
});
