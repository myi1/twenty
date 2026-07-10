import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Tiles come from the image-service tile proxy — NO Mapbox key in the bundle (the
// token stays server-side in the image-service). `window.__propelConfig.tileBase`
// overrides at runtime (set this in prod to a same-origin `/tiles` reverse-proxy).
// Default = the staging m4 image-service origin, which the m4 browser reaches
// directly at http://localhost:3006 (same pattern as MEDIA_PROXY_URL). The tile
// route sends `access-control-allow-origin: *` so MapLibre's WebGL upload works
// cross-origin.
const TILE_BASE = (window as any).__propelConfig?.tileBase ?? 'http://localhost:3006/tiles';

export function OffplanMap({ points }: { points: Array<{ lon: number; lat: number; label: string }> }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
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
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    // simple markers (clustering is P1)
    points.forEach((p) => new maplibregl.Marker().setLngLat([p.lon, p.lat]).setPopup(new maplibregl.Popup().setText(p.label)).addTo(map));
  }, [points]);
  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}
