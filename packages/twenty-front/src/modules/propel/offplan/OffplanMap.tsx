import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Tiles come from the CRM/image-service proxy — NO key in the bundle. The proxy base
// is injected at runtime via window.__propelConfig?.imageServiceProxy or defaults to
// same-origin '/image' rewrite; adjust TILE_BASE to the staging proxy path.
const TILE_BASE = (window as any).__propelConfig?.tileBase ?? '/tiles';

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
