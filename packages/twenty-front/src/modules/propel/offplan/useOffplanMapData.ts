import { useEffect, useMemo, useState } from 'react';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { groupPointsByDistrict } from './mapGeo';
import type { OffplanMapPoint, OffplanMapPointsResult, OffplanDistrictCluster, RouteEnvelope } from './types';

// Page size for the map/points pull. The CRM logic-function proxy returns its
// result over an IPC channel that silently truncates payloads above the OS pipe
// buffer (~64KB); the full ~550KB point set is dropped (blank map). So we pull it
// in bounded pages (~120 points ≈ 50KB each, safe margin) and concatenate — the
// whole browse (map + list) still runs client-side over the assembled set.
const MAP_PAGE_SIZE = 120;

// Loads the full active off-plan point set in bounded pages (see MAP_PAGE_SIZE).
// Exposes points, an id→point index, and district clusters.
// `enabled` (Launch Calendar refactor): the Studio's Calendar tab must NOT trigger
// the full catalog pull — the load starts the first time the Browse tab is active
// and then sticks (a deep link straight to the calendar costs zero map calls).
export function useOffplanMapData(enabled = true) {
  const [points, setPoints] = useState<OffplanMapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      const all: OffplanMapPoint[] = [];
      let offset = 0;
      // Hard cap on iterations so a bad hasMore/nextOffset can never spin forever.
      for (let guard = 0; guard < 1000; guard++) {
        const res = await callPropelRoute<RouteEnvelope<OffplanMapPointsResult>>(
          '/offplan/browse', { action: 'mapPoints', params: { offset, limit: MAP_PAGE_SIZE } },
        );
        if (!alive) return;
        if (!res || !res.ok || !res.data) {
          setError(res?.error ?? res?.code ?? 'could not load off-plan map');
          setPoints([]);
          setLoading(false);
          return;
        }
        all.push(...(res.data.points ?? []));
        // Page on the server's raw-row cursor, not the (post-coordless-drop)
        // point count. Stop when the server says there's no more, or if it
        // failed to advance the cursor (defensive against a stuck offset).
        const next = res.data.nextOffset;
        if (res.data.hasMore !== true || typeof next !== 'number' || next <= offset) break;
        offset = next;
      }
      if (!alive) return;
      setPoints(all);
      setError(null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [enabled]);

  const byId = useMemo(() => new Map(points.map((p) => [p.externalId, p])), [points]);
  const clusters: OffplanDistrictCluster[] = useMemo(() => groupPointsByDistrict(points), [points]);

  return { points, byId, clusters, loading, error };
}
