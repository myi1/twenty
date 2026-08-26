import { useEffect, useMemo, useState } from 'react';
import { Box, LoadingOverlay, Tabs, Text } from '@mantine/core';
import { IconMap } from 'twenty-ui/display';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import type { OffplanDrawerPoint, PitchClient } from '@/propel/offplan/types';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { useOffplanBrowse } from '@/propel/offplan/useOffplanBrowse';
import { useOffplanShortlist } from '@/propel/offplan/useOffplanShortlist';
import { OffplanFilters } from '@/propel/offplan/OffplanFilters';
import { OffplanMap } from '@/propel/offplan/OffplanMap';
import { OffplanCardRail } from '@/propel/offplan/OffplanCardRail';
import { OffplanProjectDrawer } from '@/propel/offplan/OffplanProjectDrawer';
import { OffplanDeveloperDrawer } from '@/propel/offplan/OffplanDeveloperDrawer';
import { OffplanShortlistTray } from '@/propel/offplan/OffplanShortlistTray';
import { OffplanPitchWizard } from '@/propel/offplan/OffplanPitchWizard';
import { OffplanCalendarTab } from '@/propel/offplan/calendar/OffplanCalendarTab';
import type { CalendarLaunchItem } from '@/propel/offplan/calendar/types';

export type OffplanStudioTab = 'browse' | 'calendar';

export const OffplanStudioPage = ({
  clientId,
  initialTab = 'browse',
}: {
  clientId?: string;
  initialTab?: OffplanStudioTab;
}) => {
  const [tab, setTab] = useState<OffplanStudioTab>(initialTab);
  // The Browse data (full map-catalog pull, ~a dozen route calls) starts the FIRST
  // time Browse is active and then sticks — a ?tab=calendar deep link costs zero
  // map calls (Launch Calendar refactor; the map/area hooks are gated on this).
  const [browseStarted, setBrowseStarted] = useState(initialTab === 'browse');
  useEffect(() => {
    if (tab === 'browse') setBrowseStarted(true);
  }, [tab]);

  const b = useOffplanBrowse(browseStarted);
  const sl = useOffplanShortlist();
  const [wizard, setWizard] = useState<{
    ids: number[];
    anchor?: { projectId: number; unitId?: number };
  } | null>(null);
  const [selectedDeveloperSlug, setSelectedDeveloperSlug] = useState<string | null>(null);
  // Calendar-launched drawer: a SNAPSHOT point (new launches are often absent from
  // the map feed — the drawer self-fetches detail by externalId).
  const [calendarDrawer, setCalendarDrawer] = useState<OffplanDrawerPoint | null>(null);

  // "Find off-plan for this client" entry point: the Studio was opened from a Person
  // record with only the opaque person id in the URL (?client=<uuid>). Resolve the
  // client (name + phone) server-side once, then pre-attach it to every pitch built
  // this session — so the agent never re-searches the client in the wizard. A failed
  // lookup just leaves the normal in-Studio flow intact (pick a client in step 2).
  const [client, setClient] = useState<PitchClient | null>(null);
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    void callPropelRoute<{ ok?: boolean; person?: PitchClient }>(
      '/offplan/assist',
      { action: 'personById', personId: clientId },
    )
      .then((res) => {
        if (!cancelled && res?.ok && res.person) setClient(res.person);
      })
      .catch(() => {
        /* non-fatal: fall back to the normal client-search step */
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // Gold-ring a district bubble when any of its projects is shortlisted.
  const favoritedDistrictIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of sl.ids) {
      const d = b.byId.get(id)?.districtId;
      if (d) set.add(d);
    }
    return set;
  }, [sl.ids, b.byId]);

  // EVERY browse-side open goes through this wrapper (review fix: the calendar
  // snapshot drawer state competed with b.selectedId — opening project B from the
  // developer drawer or the map while a calendar drawer was set kept showing A).
  const openProject = (id: number) => {
    setCalendarDrawer(null);
    b.openProject(id);
  };

  const openFromCalendar = (item: CalendarLaunchItem) => {
    // Prefer the real map point when the catalog has it (and is loaded); fall back
    // to a snapshot built from the launch row — the drawer fills the rest itself.
    b.setSelectedId(null);
    const mapPoint = b.byId.get(item.projectExternalId);
    setCalendarDrawer(
      mapPoint ?? {
        externalId: item.projectExternalId,
        name: item.name,
        districtName: item.districtName,
        priceFromAed: item.minPrice,
        isLaunch: true,
        handover: null,
        developerName: item.developerName,
        developerSlug: null,
        heroImageUrl: item.heroImageUrl,
      },
    );
  };

  const drawerPoint: OffplanDrawerPoint | null =
    calendarDrawer ?? (b.selectedId != null ? b.byId.get(b.selectedId) ?? null : null);

  return (
    <PropelMantineProvider>
      <PageContainer style={{ flex: 1, minHeight: 0 }}>
        <PageHeader
          title={client ? `Off-Plan Studio — for ${client.name}` : 'Off-Plan Studio'}
          Icon={IconMap}
        />
        <Tabs
          value={tab}
          onChange={(v) => v && setTab(v as OffplanStudioTab)}
          keepMounted={false}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        >
          <Tabs.List px="md">
            <Tabs.Tab value="browse">Browse</Tabs.Tab>
            <Tabs.Tab value="calendar">Calendar</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="browse" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <Box style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <OffplanFilters points={b.points} filters={b.filters}
                onChange={(patch) => b.setFilters((f) => ({ ...f, ...patch }))}
                onBedChange={b.applyBedFilter} />
              <Box style={{ position: 'relative', display: 'flex', flex: 1, minHeight: 0 }}>
                <LoadingOverlay visible={b.loading} />
                {b.error ? (
                  <Text c="dimmed" m="md">{b.error}</Text>
                ) : (
                  <>
                    <Box style={{ position: 'relative', width: '60%', minWidth: 0 }}>
                      <OffplanMap
                        visiblePoints={b.visible} clusters={b.clusters} areas={b.areas}
                        selectedId={b.selectedId} hoveredId={b.hoveredId} viewedIds={b.viewedIds}
                        favoritedIds={sl.favoritedIds} favoritedDistrictIds={favoritedDistrictIds}
                        onViewportChange={(bounds, zoom) => { b.setBounds(bounds); b.setZoom(zoom); }}
                        onPinClick={openProject} onPinHover={b.setHoveredId} />
                      <OffplanShortlistTray count={sl.count} onBuild={() => sl.ids.length > 0 && setWizard({ ids: sl.ids })} />
                    </Box>
                    <Box style={{ width: '40%', minWidth: 0, borderLeft: '1px solid var(--mantine-color-default-border)' }}>
                      <OffplanCardRail visible={b.visible} total={b.points.length}
                        hoveredId={b.hoveredId} onHover={b.setHoveredId} onOpen={openProject}
                        onShortlist={sl.toggle} onPitch={(id) => setWizard({ ids: [id] })}
                        onOpenDeveloper={setSelectedDeveloperSlug} />
                    </Box>
                  </>
                )}
              </Box>
            </Box>
          </Tabs.Panel>
          <Tabs.Panel value="calendar" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <OffplanCalendarTab active={tab === 'calendar'} onOpenProject={openFromCalendar} />
          </Tabs.Panel>
        </Tabs>
        {drawerPoint && (
          <OffplanProjectDrawer
            point={drawerPoint}
            shortlisted={sl.favoritedIds.has(drawerPoint.externalId)}
            onClose={() => { setCalendarDrawer(null); b.setSelectedId(null); }}
            onShortlist={sl.toggle}
            onPitch={(p, u) => setWizard({ ids: [p], anchor: { projectId: p, unitId: u } })}
            onOpenDeveloper={setSelectedDeveloperSlug} />
        )}
        {selectedDeveloperSlug != null && (
          <OffplanDeveloperDrawer
            slug={selectedDeveloperSlug}
            onClose={() => setSelectedDeveloperSlug(null)}
            onOpenProject={(id) => { setSelectedDeveloperSlug(null); openProject(id); }}
            onShowOnMap={(slug) => {
              setTab('browse');
              b.setFilters((f) => ({ ...f, developerSlugs: [slug] }));
              setSelectedDeveloperSlug(null);
              b.setSelectedId(null);
              setCalendarDrawer(null);
            }} />
        )}
        {wizard && (
          <OffplanPitchWizard initialProjectIds={wizard.ids} initialAnchor={wizard.anchor}
            initialClient={client} byId={b.byId} onClose={() => setWizard(null)} />
        )}
      </PageContainer>
    </PropelMantineProvider>
  );
};
