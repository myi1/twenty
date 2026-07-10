import type { OffplanMapPoint, OffplanBrowseFilters, MapBounds, MarkerMode } from './types';
import { isWithinBounds } from './mapGeo';
import { DISTRICT_ZOOM_MAX } from './types';

export function applyFilters(points: OffplanMapPoint[], f: OffplanBrowseFilters): OffplanMapPoint[] {
  const needle = f.q.trim().toLowerCase();
  return points.filter((p) => {
    if (f.minPriceAed != null && (p.priceFromAed == null || p.priceFromAed < f.minPriceAed)) return false;
    if (f.maxPriceAed != null && (p.priceFromAed == null || p.priceFromAed > f.maxPriceAed)) return false;
    if (f.districtIds.length && !f.districtIds.includes(p.districtId)) return false;
    if (f.developerSlugs.length && (p.developerSlug == null || !f.developerSlugs.includes(p.developerSlug))) return false;
    if (f.newLaunchOnly && !p.isLaunch) return false;
    if (f.handoverBeforeIso && (p.handover == null || p.handover >= f.handoverBeforeIso)) return false;
    if (f.projectIdAllowlist && !f.projectIdAllowlist.has(p.externalId)) return false;
    if (needle) {
      const hay = `${p.name} ${p.developerName ?? ''} ${p.districtName}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

// In-viewport points, cheapest first (null price-from sorts last).
export function selectVisibleProjects(points: OffplanMapPoint[], bounds: MapBounds): OffplanMapPoint[] {
  return points
    .filter((p) => isWithinBounds(p, bounds))
    .sort((a, b) => (a.priceFromAed ?? Infinity) - (b.priceFromAed ?? Infinity));
}

export function markerModeForZoom(zoom: number): MarkerMode {
  return zoom < DISTRICT_ZOOM_MAX ? 'district' : 'project';
}
