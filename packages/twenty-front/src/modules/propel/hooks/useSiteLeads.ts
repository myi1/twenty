import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeSiteLeadsMetrics,
  fetchSiteLeads,
  type SiteLead,
  type SiteLeadsMetrics,
} from '@/propel/lib/websiteCrm';

// Shared fetch hook for the two real-data Website surfaces (Site leads queue +
// Overview metrics). Same return shape the other live hero hooks expose
// (useLeadRoutingConfig / useMarketingHub): `{ phase, error, leads, metrics,
// reload }`, so a call site never has to special-case loading vs error vs ready.
//
// Read-only: it fetches People where leadSource = WEBSITE with the agent's own
// token (propel-rls applies). No polling — the queue reloads on mount and on an
// explicit user Refresh, matching the rest of the hero (fetch-on-mount, manual
// refresh); a lead landing mid-session shows on the next refresh.

export type SiteLeadsPhase = 'loading' | 'ready' | 'error';

export type UseSiteLeadsResult = {
  phase: SiteLeadsPhase;
  error: string | null;
  leads: SiteLead[];
  metrics: SiteLeadsMetrics;
  reload: () => void;
};

const EMPTY_METRICS: SiteLeadsMetrics = {
  total: 0,
  thisWeek: 0,
  last7dVsPrior7dPct: null,
  unassigned: 0,
  slaBreaches: 0,
  medianAgeMinutesUnworked: null,
};

export const useSiteLeads = (limit = 200): UseSiteLeadsResult => {
  const [phase, setPhase] = useState<SiteLeadsPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<SiteLead[]>([]);
  const [metrics, setMetrics] = useState<SiteLeadsMetrics>(EMPTY_METRICS);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    const result = await fetchSiteLeads(limit);
    if (!mounted.current) return;
    if (result.ok) {
      setLeads(result.leads);
      setMetrics(computeSiteLeadsMetrics(result.leads));
      setPhase('ready');
    } else {
      setError(result.error);
      setPhase('error');
    }
  }, [limit]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { phase, error, leads, metrics, reload };
};
