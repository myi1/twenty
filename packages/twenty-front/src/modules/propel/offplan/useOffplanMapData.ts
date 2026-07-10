import { useEffect, useMemo, useState } from 'react';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { groupPointsByDistrict } from './mapGeo';
import type { OffplanMapPoint, OffplanMapPointsResult, OffplanDistrictCluster, RouteEnvelope } from './types';

// Loads the full active off-plan point set ONCE (the whole browse — map + list —
// runs client-side over it). Exposes points, an id→point index, and district clusters.
export function useOffplanMapData() {
  const [points, setPoints] = useState<OffplanMapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await callPropelRoute<RouteEnvelope<OffplanMapPointsResult>>(
        '/offplan/browse', { action: 'mapPoints', params: {} },
      );
      if (!alive) return;
      if (!res || !res.ok || !res.data) {
        setError(res?.error ?? res?.code ?? 'could not load off-plan map');
        setPoints([]);
      } else {
        setPoints(res.data.points ?? []);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const byId = useMemo(() => new Map(points.map((p) => [p.externalId, p])), [points]);
  const clusters: OffplanDistrictCluster[] = useMemo(() => groupPointsByDistrict(points), [points]);

  return { points, byId, clusters, loading, error };
}
