import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { markerModeForZoom } from './browseSelect';
import { DISTRICT_ZOOM_MAX } from './types';
import type { FeatureCollection } from 'geojson';
import type { OffplanMapPoint, OffplanMapArea, OffplanDistrictCluster, MapBounds } from './types';

// The three MapLibre pieces of the shaded-area layer. IDs are stable so the
// data-refresh effect can `getSource`/`setData` instead of re-adding.
const AREA_SOURCE = 'op-areas';
const AREA_FILL = 'op-areas-fill';
const AREA_LINE = 'op-areas-line';

// A representative label point for a district: the centroid of its outer ring's
// vertices. Cheap (no polygon-area weighting) but visually fine for a name tag.
type AreaLabel = { id: string; name: string; color: string; lon: number; lat: number };
function areaLabel(a: OffplanMapArea): AreaLabel | null {
  const ring = a.geometry?.coordinates?.[0];
  if (!ring || ring.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const [lon, lat] of ring) { sx += lon; sy += lat; }
  return { id: a.districtId, name: a.name, color: a.color, lon: sx / ring.length, lat: sy / ring.length };
}

// FeatureCollection for the fill/line source — colour rides on each feature so
// the paint expression `['get','color']` picks the vendor hue per district.
function areasToGeoJSON(areas: OffplanMapArea[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: areas.map((a) => ({
      type: 'Feature',
      properties: { color: a.color, name: a.name },
      geometry: a.geometry,
    })),
  };
}

// Tiles come from the image-service tile proxy — NO Mapbox key in the bundle (the
// token stays server-side in the image-service). `window.__propelConfig.tileBase`
// overrides at runtime (set this in prod to a same-origin `/tiles` reverse-proxy).
const TILE_BASE = (window as any).__propelConfig?.tileBase ?? 'http://localhost:3006/tiles';
const REMAX_RED = '#dc1c2e';
const GOLD = '#d4af37';

const aedShort = (n: number | null): string =>
  n == null ? '—' : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`;

// Single source of truth for a project pill's look, shared by the build effect (which
// creates the markers) and the restyle effect (which only re-applies cssText on
// hover/select/view changes — no marker teardown). `_p` is unused today but kept in the
// signature so styling can key off the point later without touching both call sites.
function pillStyle(
  _p: OffplanMapPoint,
  s: { selected: boolean; hovered: boolean; viewed: boolean; favorited: boolean },
): string {
  const bg = s.selected ? GOLD : s.viewed ? '#7c8aa3' : '#fff';
  const fg = s.selected ? '#1a1408' : s.viewed ? '#dfe6f2' : '#0c1830';
  // Red outline wins for select/hover; otherwise a favorited pin gets a gold ring.
  const outline = s.selected || s.hovered ? `outline:2px solid ${REMAX_RED};` : s.favorited ? `outline:2px solid ${GOLD};` : '';
  return `background:${bg};color:${fg};border-radius:14px;padding:3px 8px;font:700 11px system-ui;white-space:nowrap;cursor:pointer;box-shadow:0 4px 11px rgba(0,0,0,.45);${outline}`;
}

export function OffplanMap({
  visiblePoints, clusters, areas = [], selectedId, hoveredId, viewedIds,
  favoritedIds, favoritedDistrictIds,
  onViewportChange, onPinClick, onPinHover, onClusterClick,
}: {
  visiblePoints: OffplanMapPoint[];
  clusters: OffplanDistrictCluster[];
  areas?: OffplanMapArea[];
  selectedId: number | null;
  hoveredId: number | null;
  viewedIds: Set<number>;
  favoritedIds: Set<number>;
  favoritedDistrictIds?: Set<string>;
  onViewportChange: (bounds: MapBounds, zoom: number) => void;
  onPinClick: (projectId: number) => void;
  onPinHover: (projectId: number | null) => void;
  onClusterClick?: (lon: number, lat: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Area name-tags are their own DOM-marker pool (rendered only at project zoom,
  // never restyled on hover) — kept separate from the pin pool so a pin rebuild
  // doesn't churn them and vice-versa.
  const areaLabelsRef = useRef<maplibregl.Marker[]>([]);
  const areaLabels = useMemo(
    () => areas.map(areaLabel).filter((l): l is AreaLabel => l !== null),
    [areas],
  );
  // projectId → its pill element, so hover/select can RESTYLE a marker instead of
  // rebuilding the whole layer. Repopulated whenever the build effect runs.
  const pillEls = useRef<Map<number, HTMLDivElement>>(new Map());
  // Bumped once the style has loaded so the shading effect knows it can safely
  // add sources/layers (addSource before 'load' throws).
  const [styleLoaded, setStyleLoaded] = useState(false);
  // capture latest callbacks without re-running init
  const cb = useRef({ onViewportChange, onPinClick, onPinHover, onClusterClick });
  cb.current = { onViewportChange, onPinClick, onPinHover, onClusterClick };

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: { version: 8, sources: { osm: { type: 'raster', tiles: [`${TILE_BASE}/{z}/{x}/{y}`], tileSize: 256, attribution: '© Mapbox © OpenStreetMap' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] },
      center: [55.27, 25.2], zoom: 9,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const report = () => {
      const b = map.getBounds();
      cb.current.onViewportChange({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, map.getZoom());
    };
    map.on('load', () => { setStyleLoaded(true); report(); });
    map.on('moveend', report);
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove()); markersRef.current = [];
      areaLabelsRef.current.forEach((m) => m.remove()); areaLabelsRef.current = [];
      map.remove(); mapRef.current = null; setStyleLoaded(false);
    };
  }, []);

  // Shaded-area layer: vendor-coloured district fill + border, added once the
  // style is up and (re)fed as areas stream in over the page loop. These are
  // canvas layers under the DOM pin markers, so pins always sit on top.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    const data = areasToGeoJSON(areas);
    const existing = map.getSource(AREA_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (existing) { existing.setData(data); return; }
    map.addSource(AREA_SOURCE, { type: 'geojson', data });
    map.addLayer({
      id: AREA_FILL, type: 'fill', source: AREA_SOURCE,
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.16 },
    });
    map.addLayer({
      id: AREA_LINE, type: 'line', source: AREA_SOURCE,
      paint: { 'line-color': ['get', 'color'], 'line-width': 1.4, 'line-opacity': 0.85 },
    });
  }, [areas, styleLoaded]);

  // Re-plot markers only when WHICH markers exist changes (points/clusters/favorites).
  // Hover/select/view changes do NOT rebuild here — they restyle in the effect below.
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    pillEls.current.clear();
    const mode = markerModeForZoom(map.getZoom());

    if (mode === 'district') {
      for (const c of clusters) {
        const el = document.createElement('div');
        el.className = 'op-clus';
        el.textContent = `${c.districtName} · ${c.count}`;
        const favDistrict = favoritedDistrictIds?.has(c.districtId) ?? false;
        el.style.cssText = `background:rgba(9,18,34,.88);border:${favDistrict ? '2px' : '1.5px'} solid ${GOLD};color:#fff;border-radius:20px;padding:5px 10px;font:600 12px system-ui;white-space:nowrap;cursor:pointer;box-shadow:${favDistrict ? `0 0 0 3px rgba(212,175,55,.55),` : ''}0 5px 14px rgba(0,0,0,.4)`;
        // Zoom-to-cluster: clicking a district bubble flies the map in (which flips to
        // project price-pills once past DISTRICT_ZOOM_MAX). Works without any page wiring.
        el.addEventListener('click', () => {
          const m = mapRef.current;
          if (m) m.flyTo({ center: [c.lon, c.lat], zoom: Math.max(DISTRICT_ZOOM_MAX, m.getZoom() + 2) });
          cb.current.onClusterClick?.(c.lon, c.lat);
        });
        markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([c.lon, c.lat]).addTo(map));
      }
      return;
    }

    for (const p of visiblePoints) {
      const el = document.createElement('div');
      el.textContent = `${p.isLaunch ? 'L ' : ''}AED ${aedShort(p.priceFromAed)}`;
      el.style.cssText = pillStyle(p, {
        selected: p.externalId === selectedId,
        hovered: p.externalId === hoveredId,
        viewed: viewedIds.has(p.externalId),
        favorited: favoritedIds.has(p.externalId),
      });
      el.addEventListener('click', (e) => { e.stopPropagation(); cb.current.onPinClick(p.externalId); });
      el.addEventListener('mouseenter', () => cb.current.onPinHover(p.externalId));
      el.addEventListener('mouseleave', () => cb.current.onPinHover(null));
      pillEls.current.set(p.externalId, el);
      markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedId/hoveredId/viewedIds are applied by the restyle effect, not here
  }, [visiblePoints, clusters, favoritedIds, favoritedDistrictIds]);

  // Restyle-only path: when selection/hover/view changes, re-apply cssText to the
  // affected pills WITHOUT tearing down or recreating any markers.
  useEffect(() => {
    if (!mapRef.current) return;
    for (const p of visiblePoints) {
      const el = pillEls.current.get(p.externalId);
      if (!el) continue;
      el.style.cssText = pillStyle(p, {
        selected: p.externalId === selectedId,
        hovered: p.externalId === hoveredId,
        viewed: viewedIds.has(p.externalId),
        favorited: favoritedIds.has(p.externalId),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visiblePoints/favoritedIds drive the build effect; here we only react to select/hover/view
  }, [selectedId, hoveredId, viewedIds]);

  // Area name-tags: only at project zoom (at district zoom the cluster bubbles
  // already name the area), and only for districts whose centroid is in view —
  // at that zoom the viewport is small so the count stays tiny. Re-runs on pan/
  // zoom via visiblePoints (which is viewport-derived). pointer-events:none so
  // tags never intercept a pin click; they sit visually beneath the price pills.
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    areaLabelsRef.current.forEach((m) => m.remove());
    areaLabelsRef.current = [];
    if (markerModeForZoom(map.getZoom()) !== 'project') return;
    const b = map.getBounds();
    for (const l of areaLabels) {
      if (l.lon < b.getWest() || l.lon > b.getEast() || l.lat < b.getSouth() || l.lat > b.getNorth()) continue;
      const el = document.createElement('div');
      el.textContent = l.name;
      el.style.cssText = `pointer-events:none;color:${l.color};font:700 11px system-ui;letter-spacing:.4px;text-transform:uppercase;text-shadow:0 1px 3px rgba(0,0,0,.9),0 0 2px rgba(0,0,0,.9);opacity:.9;white-space:nowrap`;
      areaLabelsRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([l.lon, l.lat]).addTo(map));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visiblePoints is the viewport-change proxy that should re-place labels
  }, [areaLabels, visiblePoints, styleLoaded]);

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}
