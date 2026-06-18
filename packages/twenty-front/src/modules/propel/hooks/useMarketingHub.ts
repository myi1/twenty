import { useCallback, useEffect, useState } from 'react';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { type MarketingHubPayload } from '@/propel/types/marketingHome';

// Loads the full /marketing/hub payload that the Campaigns and Templates tabs of
// the unified Marketing hero share (campaigns drafts/scheduled/sending/sent +
// sequences, and the email/WhatsApp template catalog + custom fields). The Home
// tab reads the SUBSET it needs through useMarketingDashboardData (which fetches
// /marketing/hub and /marketing/analytics on its own); this hook is the wider
// read for the two list-heavy tabs and exposes a `reload` so a mutation (template
// delete, Meta sync, sequence pause/activate) can refresh the catalog.
//
// Fails soft: a null route response leaves `payload` null (the tab renders its
// empty/error state) and never throws.
export const useMarketingHub = () => {
  const [payload, setPayload] = useState<MarketingHubPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await callPropelRoute<MarketingHubPayload>('/marketing/hub', {});
    setPayload(res);
    setIsLoading(false);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { payload, isLoading, loaded, reload: load };
};
