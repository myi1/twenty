import { Tabs } from '@mantine/core';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  IconBrandGoogle,
  IconFileText,
  IconLayoutGrid,
  IconLayoutDashboard,
  IconUsers,
} from 'twenty-ui/display';

// Sub-tab router for the Website tab of the unified Marketing hero (see
// CONVENTIONS.md in this directory). Mirrors MarketingHero.tsx's own Tabs
// structure one level down: a second, nested Mantine <Tabs> for the 5 Website
// sub-tabs, URL-synced via a second query param (?tab=website&sub=overview).
//
// Each sub-tab panel follows the same `activeSubTab === 'x' ? <XTab /> : null`
// conditional-mount idiom the hero-level tabs use, so an inactive sub-tab pays
// no render/fetch cost (keepMounted={false} below reinforces this).
//
// Website is NOT role-gated (unlike Lead Routing) — see CONVENTIONS.md
// "Manager-gating pattern" section for why, and the pattern to reach for if a
// later sub-surface (e.g. SEO/AI automation toggles) needs Manager-only gating.
//
// This wave is mock-data only — no new CRM objects/routes exist yet (see
// propel-crm-integration CLAUDE.md scope note + CONVENTIONS.md "Data-fetching
// pattern"). Each sub-tab component owns its own mock data import.
import { OverviewTab } from '@/propel/components/website/OverviewTab';
import { BlogTab } from '@/propel/components/website/BlogTab';
import { LandingPagesTab } from '@/propel/components/website/LandingPagesTab';
import { SiteLeadsTab } from '@/propel/components/website/SiteLeadsTab';
import { SeoAiTab } from '@/propel/components/website/SeoAiTab';

type WebsiteSubTab =
  | 'overview'
  | 'blog'
  | 'landing-pages'
  | 'site-leads'
  | 'seo-ai';

const SUB_TAB_VALUES: WebsiteSubTab[] = [
  'overview',
  'blog',
  'landing-pages',
  'site-leads',
  'seo-ai',
];

const isWebsiteSubTab = (v: string | null): v is WebsiteSubTab =>
  v !== null && (SUB_TAB_VALUES as string[]).includes(v);

export const WebsiteTab = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSubTab = searchParams.get('sub');

  const activeSubTab: WebsiteSubTab = isWebsiteSubTab(rawSubTab)
    ? rawSubTab
    : 'overview';

  const setSubTab = useCallback(
    (value: string | null) => {
      if (value === null) return;
      const next = new URLSearchParams(searchParams);
      if (value === 'overview') {
        next.delete('sub');
      } else {
        next.set('sub', value);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const subTabPanels = useMemo(
    () => (
      <>
        <Tabs.Panel value="overview">
          {activeSubTab === 'overview' ? <OverviewTab /> : null}
        </Tabs.Panel>
        <Tabs.Panel value="blog">
          {activeSubTab === 'blog' ? <BlogTab /> : null}
        </Tabs.Panel>
        <Tabs.Panel value="landing-pages">
          {activeSubTab === 'landing-pages' ? <LandingPagesTab /> : null}
        </Tabs.Panel>
        <Tabs.Panel value="site-leads">
          {activeSubTab === 'site-leads' ? <SiteLeadsTab /> : null}
        </Tabs.Panel>
        <Tabs.Panel value="seo-ai">
          {activeSubTab === 'seo-ai' ? <SeoAiTab /> : null}
        </Tabs.Panel>
      </>
    ),
    [activeSubTab],
  );

  return (
    <Tabs
      value={activeSubTab}
      onChange={setSubTab}
      color="red"
      keepMounted={false}
      styles={{
        root: {
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        },
        // The parent (hero-level) Tabs.Panel already owns the single scroll
        // region for the whole Website tab (see MarketingHero.tsx's "SHARED
        // SCROLL FIX" comment) — this nested Tabs.List sits at natural height
        // and the nested panel does NOT add a second overflow:auto region.
        panel: { flex: 1, minHeight: 0 },
      }}
    >
      <Tabs.List px="md">
        <Tabs.Tab value="overview" leftSection={<IconLayoutDashboard size={15} />}>
          Overview
        </Tabs.Tab>
        <Tabs.Tab value="blog" leftSection={<IconFileText size={15} />}>
          Blog
        </Tabs.Tab>
        <Tabs.Tab value="landing-pages" leftSection={<IconLayoutGrid size={15} />}>
          Landing pages
        </Tabs.Tab>
        <Tabs.Tab value="site-leads" leftSection={<IconUsers size={15} />}>
          Site leads
        </Tabs.Tab>
        <Tabs.Tab value="seo-ai" leftSection={<IconBrandGoogle size={15} />}>
          SEO and AI
        </Tabs.Tab>
      </Tabs.List>

      {subTabPanels}
    </Tabs>
  );
};
