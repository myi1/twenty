import { useCallback, useMemo, useState } from 'react';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { useOffplanMapData } from './useOffplanMapData';
import { useOffplanMapAreas } from './useOffplanMapAreas';
import { applyFilters, selectVisibleProjects } from './browseSelect';
import type { OffplanBrowseFilters, MapBounds, OffplanSearchResult, RouteEnvelope } from './types';

const EMPTY_FILTERS: OffplanBrowseFilters = { q: '', districtIds: [], developerSlugs: [], newLaunchOnly: false, stockedOnly: false };

export function useOffplanBrowse() {
  const { points, byId, clusters, loading, error } = useOffplanMapData();
  // Decorative district shading — loads independently; never blocks the browse.
  const { areas } = useOffplanMapAreas();
  const [filters, setFilters] = useState<OffplanBrowseFilters>(EMPTY_FILTERS);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [zoom, setZoom] = useState(9);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [viewedIds, setViewedIds] = useState<Set<number>>(new Set());

  // Unit-level filters (beds/layout) can't be answered by the point feed — fetch the
  // matching projectId set from unit_search and expose it as an allowlist on filters.
  const applyBedFilter = useCallback(async (minBedrooms?: number, maxBedrooms?: number) => {
    if (minBedrooms == null && maxBedrooms == null) {
      setFilters((f) => ({ ...f, projectIdAllowlist: undefined }));
      return;
    }
    const params: Record<string, unknown> = { limit: 100 };
    if (minBedrooms != null) params.minBedrooms = minBedrooms;
    if (maxBedrooms != null) params.maxBedrooms = maxBedrooms;
    const res = await callPropelRoute<RouteEnvelope<OffplanSearchResult>>('/offplan/browse', { action: 'search', params });
    // On a failed/null response, leave the prior filter state untouched — DON'T wipe the
    // view. Only a genuine `ok` response (even with zero units) sets the allowlist.
    if (!res || !res.ok) {
      return;
    }
    const ids = new Set<number>((res.data?.units ?? []).map((u) => Number(u.projectId)).filter(Number.isFinite));
    setFilters((f) => ({ ...f, projectIdAllowlist: ids }));
  }, []);

  const matched = useMemo(() => applyFilters(points, filters), [points, filters]);
  const visible = useMemo(() => (bounds ? selectVisibleProjects(matched, bounds) : matched), [matched, bounds]);

  const openProject = useCallback((id: number) => {
    setSelectedId(id);
    setViewedIds((s) => (s.has(id) ? s : new Set(s).add(id)));
  }, []);

  return {
    points, byId, clusters, areas, loading, error,
    filters, setFilters, applyBedFilter,
    bounds, setBounds, zoom, setZoom,
    matched, visible, visibleCount: visible.length,
    selectedId, openProject, setSelectedId,
    hoveredId, setHoveredId, viewedIds,
  };
}
