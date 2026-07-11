import { useMemo, useState } from 'react';
import { Box, LoadingOverlay, Text } from '@mantine/core';
import { IconMap } from 'twenty-ui/display';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
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

export const OffplanStudioPage = () => {
  const b = useOffplanBrowse();
  const sl = useOffplanShortlist();
  const [wizard, setWizard] = useState<{
    ids: number[];
    anchor?: { projectId: number; unitId?: number };
  } | null>(null);
  const [selectedDeveloperSlug, setSelectedDeveloperSlug] = useState<string | null>(null);

  // Gold-ring a district bubble when any of its projects is shortlisted.
  const favoritedDistrictIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of sl.ids) {
      const d = b.byId.get(id)?.districtId;
      if (d) set.add(d);
    }
    return set;
  }, [sl.ids, b.byId]);

  return (
    <PropelMantineProvider>
      <PageContainer style={{ flex: 1, minHeight: 0 }}>
        <PageHeader title="Off-Plan Studio" Icon={IconMap} />
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
                    onPinClick={b.openProject} onPinHover={b.setHoveredId} />
                  <OffplanShortlistTray count={sl.count} onBuild={() => sl.ids.length > 0 && setWizard({ ids: sl.ids })} />
                </Box>
                <Box style={{ width: '40%', minWidth: 0, borderLeft: '1px solid var(--mantine-color-default-border)' }}>
                  <OffplanCardRail visible={b.visible} total={b.points.length}
                    hoveredId={b.hoveredId} onHover={b.setHoveredId} onOpen={b.openProject}
                    onShortlist={sl.toggle} onPitch={(id) => setWizard({ ids: [id] })}
                    onOpenDeveloper={setSelectedDeveloperSlug} />
                </Box>
              </>
            )}
          </Box>
        </Box>
        {b.selectedId != null && b.byId.get(b.selectedId) && (
          <OffplanProjectDrawer
            point={b.byId.get(b.selectedId)!}
            shortlisted={sl.favoritedIds.has(b.selectedId)}
            onClose={() => b.setSelectedId(null)}
            onShortlist={sl.toggle}
            onPitch={(p, u) => setWizard({ ids: [p], anchor: { projectId: p, unitId: u } })}
            onOpenDeveloper={setSelectedDeveloperSlug} />
        )}
        {selectedDeveloperSlug != null && (
          <OffplanDeveloperDrawer
            slug={selectedDeveloperSlug}
            onClose={() => setSelectedDeveloperSlug(null)}
            onOpenProject={(id) => { setSelectedDeveloperSlug(null); b.openProject(id); }}
            onShowOnMap={(slug) => {
              b.setFilters((f) => ({ ...f, developerSlugs: [slug] }));
              setSelectedDeveloperSlug(null);
              b.setSelectedId(null);
            }} />
        )}
        {wizard && (
          <OffplanPitchWizard initialProjectIds={wizard.ids} initialAnchor={wizard.anchor}
            byId={b.byId} onClose={() => setWizard(null)} />
        )}
      </PageContainer>
    </PropelMantineProvider>
  );
};
