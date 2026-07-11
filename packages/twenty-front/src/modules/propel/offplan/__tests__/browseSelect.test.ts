import { applyFilters, selectVisibleProjects, markerModeForZoom } from '../browseSelect';
import type { OffplanMapPoint, OffplanBrowseFilters, MapBounds } from '../types';

const pt = (o: Partial<OffplanMapPoint> = {}): OffplanMapPoint => ({
  externalId: 1, name: 'Aristo', lat: 25.2, lon: 55.27, districtId: '120', districtName: 'Dubai South',
  priceFromAed: 498000, unitCount: 14, isLaunch: false, status: 'available',
  handover: '2027-10-02', developerName: 'OKSA', developerSlug: 'oksa', ...o,
});
const base: OffplanBrowseFilters = { q: '', districtIds: [], developerSlugs: [], newLaunchOnly: false, stockedOnly: false };

describe('applyFilters', () => {
  it('filters by price-from range', () => {
    const out = applyFilters([pt({ externalId: 1, priceFromAed: 400000 }), pt({ externalId: 2, priceFromAed: 900000 })], { ...base, maxPriceAed: 500000 });
    expect(out.map((p) => p.externalId)).toEqual([1]);
  });
  it('filters by district, developer, new-launch, and handover-before', () => {
    expect(applyFilters([pt({ externalId: 1, districtId: '120' }), pt({ externalId: 2, districtId: '999' })], { ...base, districtIds: ['120'] }).map((p) => p.externalId)).toEqual([1]);
    expect(applyFilters([pt({ externalId: 1, isLaunch: true }), pt({ externalId: 2, isLaunch: false })], { ...base, newLaunchOnly: true }).map((p) => p.externalId)).toEqual([1]);
    expect(applyFilters([pt({ externalId: 1, handover: '2026-05-01' }), pt({ externalId: 2, handover: '2028-01-01' })], { ...base, handoverBeforeIso: '2027-10-01' }).map((p) => p.externalId)).toEqual([1]);
    expect(applyFilters([pt({ externalId: 1, developerSlug: 'oksa' }), pt({ externalId: 2, developerSlug: 'emaar' })], { ...base, developerSlugs: ['emaar'] }).map((p) => p.externalId)).toEqual([2]);
  });
  it('stockedOnly keeps only projects with unitCount > 0', () => {
    const out = applyFilters([pt({ externalId: 1, unitCount: 0 }), pt({ externalId: 2, unitCount: 14 })], { ...base, stockedOnly: true });
    expect(out.map((p) => p.externalId)).toEqual([2]);
    // off ⇒ both pass
    expect(applyFilters([pt({ externalId: 1, unitCount: 0 }), pt({ externalId: 2, unitCount: 14 })], base).map((p) => p.externalId)).toEqual([1, 2]);
  });
  it('filters by text over name/developer/district and by projectId allowlist', () => {
    expect(applyFilters([pt({ externalId: 1, name: 'Aristo' }), pt({ externalId: 2, name: 'Zeta' })], { ...base, q: 'zet' }).map((p) => p.externalId)).toEqual([2]);
    expect(applyFilters([pt({ externalId: 1 }), pt({ externalId: 2 })], { ...base, projectIdAllowlist: new Set([2]) }).map((p) => p.externalId)).toEqual([2]);
  });
});

describe('selectVisibleProjects', () => {
  it('keeps only in-viewport points, sorted by price-from asc (nulls last)', () => {
    const bounds: MapBounds = { west: 55.0, south: 25.0, east: 55.5, north: 25.4 };
    const out = selectVisibleProjects(
      [pt({ externalId: 1, lon: 55.27, priceFromAed: 900000 }), pt({ externalId: 2, lon: 55.27, priceFromAed: 400000 }), pt({ externalId: 3, lon: 56.0 })],
      bounds,
    );
    expect(out.map((p) => p.externalId)).toEqual([2, 1]);
  });
});

describe('markerModeForZoom', () => {
  it('is district below the threshold and project at/above it', () => {
    expect(markerModeForZoom(9)).toBe('district');
    expect(markerModeForZoom(11)).toBe('project');
    expect(markerModeForZoom(13)).toBe('project');
  });
});
