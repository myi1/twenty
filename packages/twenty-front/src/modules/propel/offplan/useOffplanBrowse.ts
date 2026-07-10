import { useCallback, useMemo, useState } from 'react';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import type {
  OffplanSearchResult, OffplanFiltersState, RouteEnvelope, OffplanUnit,
  OffplanProject, OffplanPin, OffplanMapsResult,
} from './types';

// Cap how many per-project map lookups we fan out per search. The search returns up
// to `limit` units, which collapse to far fewer projects; we fetch coords for each
// unique project (one /v1/media/maps call each), in parallel, bounded by this cap.
const MAX_PIN_LOOKUPS = 48;

// Collapse the flat unit list into one entry per project. The catalog returns every
// UNIT as a row (the same tower appears N times); the browse rail must show ONE card
// per project with a from-price + unit count (design §3a).
function groupByProject(units: OffplanUnit[]): OffplanProject[] {
  const byProject = new Map<string, OffplanUnit[]>();
  for (const u of units) {
    if (!u.projectId) continue;
    const list = byProject.get(u.projectId);
    if (list) list.push(u);
    else byProject.set(u.projectId, [u]);
  }
  const projects: OffplanProject[] = [];
  for (const list of byProject.values()) {
    const sorted = [...list].sort((a, b) => a.price - b.price);
    const anchor = sorted[0];
    const layouts = [...new Set(list.map((u) => u.layoutName).filter(Boolean))];
    const sqfts = list.map((u) => u.squareFt).filter((n) => n > 0);
    projects.push({
      projectId: anchor.projectId,
      projectName: anchor.projectName,
      developerName: anchor.developerName,
      districtId: anchor.districtId,
      districtName: anchor.districtName,
      fromPriceAed: anchor.price,
      unitCount: list.length,
      layouts,
      minSquareFt: sqfts.length ? Math.min(...sqfts) : 0,
      maxSquareFt: sqfts.length ? Math.max(...sqfts) : 0,
      anchorUnit: anchor,
    });
  }
  return projects.sort((a, b) => a.fromPriceAed - b.fromPriceAed);
}

export function useOffplanBrowse() {
  const [allUnits, setAllUnits] = useState<OffplanUnit[]>([]);
  const [allPins, setAllPins] = useState<OffplanPin[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (f: OffplanFiltersState) => {
    setLoading(true); setError(null); setQ(f.q ?? '');
    try {
      // Structured filters go server-side to /v1/units/search (which has no
      // free-text param — the `q` box is applied client-side over the loaded set).
      const params: Record<string, unknown> = { limit: 60 };
      if (f.districtIds.length) params.districtIds = f.districtIds;
      if (f.minPriceAed) params.minPriceAed = f.minPriceAed;
      if (f.maxPriceAed) params.maxPriceAed = f.maxPriceAed;
      if (f.minBedrooms != null) params.minBedrooms = f.minBedrooms;
      if (f.maxBedrooms != null) params.maxBedrooms = f.maxBedrooms;

      const res = await callPropelRoute<RouteEnvelope<OffplanSearchResult>>(
        '/offplan/browse', { action: 'search', params },
      );
      if (!res || !res.ok || !res.data) {
        setError(res?.error ?? res?.code ?? 'search failed');
        setAllUnits([]); setAllPins([]); setTotal(0);
        return;
      }
      const units = res.data.units ?? [];
      setAllUnits(units); setTotal(res.data.total ?? 0);

      // Resolve one pin per unique project (units carry no lat/lon). Fetch coords in
      // parallel, bounded; drop projects without coordinates. Never let a failed
      // lookup break the browse — degrade to fewer pins.
      const uniqueIds: string[] = [];
      const seen = new Set<string>();
      const labelById = new Map<string, string>();
      for (const u of units) {
        if (!u.projectId || seen.has(u.projectId)) continue;
        seen.add(u.projectId);
        labelById.set(u.projectId, u.projectName);
        if (uniqueIds.length < MAX_PIN_LOOKUPS) uniqueIds.push(u.projectId);
      }
      const pinResults = await Promise.all(uniqueIds.map(async (pid) => {
        const projectExternalId = Number(pid);
        if (!Number.isFinite(projectExternalId)) return null;
        const m = await callPropelRoute<RouteEnvelope<OffplanMapsResult>>(
          '/offplan/browse', { action: 'maps', params: { projectExternalId } },
        );
        const loc = m?.ok ? m.data?.location : undefined;
        if (loc && typeof loc.lat === 'number' && typeof loc.lon === 'number') {
          return {
            projectId: pid, lat: loc.lat, lon: loc.lon,
            label: m?.data?.project?.name ?? labelById.get(pid) ?? '',
          } as OffplanPin;
        }
        return null;
      }));
      setAllPins(pinResults.filter((p): p is OffplanPin => p !== null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Group by project, then apply the free-text `q` filter (project / developer /
  // district substring) client-side over the loaded set.
  const projects = useMemo(() => {
    const grouped = groupByProject(allUnits);
    const needle = q.trim().toLowerCase();
    if (!needle) return grouped;
    return grouped.filter((p) =>
      p.projectName.toLowerCase().includes(needle) ||
      p.developerName.toLowerCase().includes(needle) ||
      p.districtName.toLowerCase().includes(needle));
  }, [allUnits, q]);

  // Only pin projects that survive the current `q` filter.
  const pins = useMemo(() => {
    const ids = new Set(projects.map((p) => p.projectId));
    return allPins.filter((p) => ids.has(p.projectId));
  }, [allPins, projects]);

  return { projects, pins, total, loading, error, search };
}
