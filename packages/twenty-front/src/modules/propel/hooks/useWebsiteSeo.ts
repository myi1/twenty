import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SEO_BASE_URL,
  fetchSeoAudit,
  type SeoAuditReport,
} from '@/propel/lib/websiteSeoCrm';

// Fetch hook for the SEO-audit half of the Website tab's "SEO and AI" sub-tab.
// Same return shape as the other live hero hooks (useSiteLeads / useMarketingHub):
// `{ phase, error, data, reload }`, so the call site never special-cases loading
// vs error vs ready.
//
// Unlike a plain read, each run is a LIVE crawl of `baseUrl` (the route fetches
// several remaxhub.ae pages server-side), so it runs on mount and on an explicit
// user action — Refresh, or changing the target and clicking "Run audit". The
// hook re-runs whenever `baseUrl` changes; the component decides when to commit a
// new target (edits to the URL input don't trigger a crawl per keystroke).

export type WebsiteSeoPhase = 'loading' | 'ready' | 'error';

export type UseWebsiteSeoResult = {
  phase: WebsiteSeoPhase;
  error: string | null;
  data: SeoAuditReport | null;
  reload: () => void;
};

export const useWebsiteSeo = (
  baseUrl: string = DEFAULT_SEO_BASE_URL,
): UseWebsiteSeoResult => {
  const [phase, setPhase] = useState<WebsiteSeoPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SeoAuditReport | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    const result = await fetchSeoAudit(baseUrl);
    if (!mounted.current) return;
    if (result.ok) {
      setData(result.report);
      setPhase('ready');
    } else {
      setError(result.error);
      setPhase('error');
    }
  }, [baseUrl]);

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

  return { phase, error, data, reload };
};
