import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { OffplanPin } from './types';

// Tiles come from the image-service tile proxy — NO Mapbox key in the bundle (the
// token stays server-side in the image-service). `window.__propelConfig.tileBase`
// overrides at runtime (set this in prod to a same-origin `/tiles` reverse-proxy).
// Default = the staging m4 image-service origin, which the m4 browser reaches
// directly at http://localhost:3006 (same pattern as MEDIA_PROXY_URL). The tile
// route sends `access-control-allow-origin: *` so MapLibre's WebGL upload works
// cross-origin.
const TILE_BASE = (window as any).__propelConfig?.tileBase ?? 'http://localhost:3006/tiles';

const REMAX_RED = '#dc1c2e';

export function OffplanMap({
  points, onPinClick,
}: {
  points: OffplanPin[];
  onPinClick?: (projectId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        sources: { osm: { type: 'raster', tiles: [`${TILE_BASE}/{z}/{x}/{y}`], tileSize: 256, attribution: '© Mapbox © OpenStreetMap' } },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [55.27, 25.2], zoom: 9, // Dubai
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    // Clear the previous marker set before plotting the new one (avoids stale/dup pins
    // as the result set changes with filters).
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (points.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    for (const p of points) {
      const marker = new maplibregl.Marker({ color: REMAX_RED })
        .setLngLat([p.lon, p.lat])
        .setPopup(new maplibregl.Popup({ offset: 18, closeButton: false }).setText(p.label))
        .addTo(map);
      const el = marker.getElement();
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onPinClickRef.current?.(p.projectId);
      });
      markersRef.current.push(marker);
      bounds.extend([p.lon, p.lat]);
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 64, maxZoom: 13, duration: 500 });
    }
  }, [points]);

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}
