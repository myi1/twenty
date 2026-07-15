import { useEffect, useState } from 'react';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import type { OffplanMapArea, OffplanMapAreasResult, RouteEnvelope } from './types';

// Page size for the map/areas pull. Same rationale as MAP_PAGE_SIZE in
// useOffplanMapData: the CRM logic-function proxy's IPC response channel
// silently truncates payloads above the OS pipe buffer (~64KB). The full
// shaded-area set is ~76KB, so we pull it in bounded pages (~60 districts ≈
// 33KB each, safe margin) and concatenate.
const AREA_PAGE_SIZE = 60;

// Loads the district shading polygons (geniemap-coloured Dubai communities) in
// bounded pages. Best-effort: shading is decorative, so any failure resolves to
// an empty set — the map still renders pins, never blocks or errors the browse.
export function useOffplanMapAreas() {
  const [areas, setAreas] = useState<OffplanMapArea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const all: OffplanMapArea[] = [];
      let offset = 0;
      // Hard iteration cap so a bad hasMore/nextOffset can never spin forever.
      for (let guard = 0; guard < 1000; guard++) {
        const res = await callPropelRoute<RouteEnvelope<OffplanMapAreasResult>>(
          '/offplan/browse', { action: 'areas', params: { offset, limit: AREA_PAGE_SIZE } },
        );
        if (!alive) return;
        // Decorative layer: on any non-ok response, keep whatever pages we have
        // and stop (never surface an error — the map is still fully usable).
        if (!res || !res.ok || !res.data) break;
        all.push(...(res.data.areas ?? []));
        const next = res.data.nextOffset;
        if (res.data.hasMore !== true || typeof next !== 'number' || next <= offset) break;
        offset = next;
      }
      if (!alive) return;
      setAreas(all);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  return { areas, loading };
}
