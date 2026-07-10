import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { markerModeForZoom } from './browseSelect';
import { DISTRICT_ZOOM_MAX } from './types';
import type { OffplanMapPoint, OffplanDistrictCluster, MapBounds } from './types';

// Tiles come from the image-service tile proxy — NO Mapbox key in the bundle (the
// token stays server-side in the image-service). `window.__propelConfig.tileBase`
// overrides at runtime (set this in prod to a same-origin `/tiles` reverse-proxy).
const TILE_BASE = (window as any).__propelConfig?.tileBase ?? 'http://localhost:3006/tiles';
const REMAX_RED = '#dc1c2e';
const GOLD = '#d4af37';

const aedShort = (n: number | null): string =>
  n == null ? '—' : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`;

export function OffplanMap({
  visiblePoints, clusters, selectedId, hoveredId, viewedIds,
  onViewportChange, onPinClick, onPinHover, onClusterClick,
}: {
  visiblePoints: OffplanMapPoint[];
  clusters: OffplanDistrictCluster[];
  selectedId: number | null;
  hoveredId: number | null;
  viewedIds: Set<number>;
  onViewportChange: (bounds: MapBounds, zoom: number) => void;
  onPinClick: (projectId: number) => void;
  onPinHover: (projectId: number | null) => void;
  onClusterClick?: (lon: number, lat: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
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
    map.on('load', report);
    map.on('moveend', report);
    mapRef.current = map;
    return () => { markersRef.current.forEach((m) => m.remove()); markersRef.current = []; map.remove(); mapRef.current = null; };
  }, []);

  // Re-plot markers whenever the derived inputs change.
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const mode = markerModeForZoom(map.getZoom());

    if (mode === 'district') {
      for (const c of clusters) {
        const el = document.createElement('div');
        el.className = 'op-clus';
        el.textContent = `${c.districtName} · ${c.count}`;
        el.style.cssText = `background:rgba(9,18,34,.88);border:1.5px solid ${GOLD};color:#fff;border-radius:20px;padding:5px 10px;font:600 12px system-ui;white-space:nowrap;cursor:pointer;box-shadow:0 5px 14px rgba(0,0,0,.4)`;
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
      const selected = p.externalId === selectedId;
      const hovered = p.externalId === hoveredId;
      const viewed = viewedIds.has(p.externalId);
      const bg = selected ? GOLD : viewed ? '#7c8aa3' : '#fff';
      const fg = selected ? '#1a1408' : viewed ? '#dfe6f2' : '#0c1830';
      el.textContent = `${p.isLaunch ? 'L ' : ''}AED ${aedShort(p.priceFromAed)}`;
      el.style.cssText = `background:${bg};color:${fg};border-radius:14px;padding:3px 8px;font:700 11px system-ui;white-space:nowrap;cursor:pointer;box-shadow:0 4px 11px rgba(0,0,0,.45);${selected || hovered ? 'outline:2px solid ' + REMAX_RED + ';' : ''}`;
      el.addEventListener('click', (e) => { e.stopPropagation(); cb.current.onPinClick(p.externalId); });
      el.addEventListener('mouseenter', () => cb.current.onPinHover(p.externalId));
      el.addEventListener('mouseleave', () => cb.current.onPinHover(null));
      markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map));
    }
  }, [visiblePoints, clusters, selectedId, hoveredId, viewedIds]);

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}
