import { useCallback, useEffect, useRef, useState } from 'react';
import { listLandingPages, type LandingPageSummary } from '@/propel/lib/landingPagesCrm';
import { getLandingPages as getMockLandingPages } from '@/propel/mocks/websiteMockData';

// Fetch hook for the Landing tab's page list. Same return shape as the other
// live hero hooks (useWebsiteSeo / useSiteLeads): { phase, error, data, reload }.
//
// Graceful degrade (mirrors SeoAiTab's "real route + honest preview" split): the
// landingPage OBJECT ships behind the gated CRM deploy, so before it lands the
// route returns null. Rather than a dead screen, we fall back to the shared mock
// seed and flag `usingMock` so the tab can dogfood the assembler UX now and the
// list becomes real automatically once the object is deployed. `error` still
// carries the reason so it's never a silent fake.

export type LandingPhase = 'loading' | 'ready' | 'error';

export type UseLandingPagesResult = {
  phase: LandingPhase;
  error: string | null;
  data: LandingPageSummary[];
  usingMock: boolean;
  reload: () => void;
};

const mockToSummary = (): LandingPageSummary[] =>
  getMockLandingPages().map((m) => ({
    id: m.id,
    title: m.title,
    slug: m.slug,
    status: m.status,
    theme: m.theme,
    headline: '',
    metaDescription: '',
    ogImageUrl: '',
    visits: m.visits,
    leads: m.leads,
    publishedAt: null,
    updatedAt: null,
  }));

export const useLandingPages = (): UseLandingPagesResult => {
  const [phase, setPhase] = useState<LandingPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LandingPageSummary[]>([]);
  const [usingMock, setUsingMock] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    const result = await listLandingPages();
    if (!mounted.current) return;
    if (result.ok) {
      setData(result.data);
      setUsingMock(false);
      setPhase('ready');
    } else {
      // route unavailable (not deployed / not a Manager) → mock preview, honest error
      setData(mockToSummary());
      setUsingMock(true);
      setError(result.error);
      setPhase('ready');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  return { phase, error, data, usingMock, reload: () => void load() };
};
