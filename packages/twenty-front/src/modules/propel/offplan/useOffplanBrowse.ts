import { useCallback, useState } from 'react';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import type { OffplanSearchResult, OffplanFiltersState, RouteEnvelope, OffplanUnit } from './types';

export function useOffplanBrowse() {
  const [units, setUnits] = useState<OffplanUnit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (f: OffplanFiltersState) => {
    setLoading(true); setError(null);
    try {
      const params: Record<string, unknown> = { limit: 60 };
      if (f.districtIds.length) params.districtIds = f.districtIds;
      if (f.minPriceAed) params.minPriceAed = f.minPriceAed;
      if (f.maxPriceAed) params.maxPriceAed = f.maxPriceAed;
      if (f.minBedrooms != null) params.minBedrooms = f.minBedrooms;
      if (f.maxBedrooms != null) params.maxBedrooms = f.maxBedrooms;
      const res = await callPropelRoute<RouteEnvelope<OffplanSearchResult>>('/offplan/browse', { action: 'search', params });
      if (!res || !res.ok || !res.data) { setError(res?.error ?? res?.code ?? 'search failed'); setUnits([]); return; }
      setUnits(res.data.units ?? []); setTotal(res.data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { units, total, loading, error, search };
}
