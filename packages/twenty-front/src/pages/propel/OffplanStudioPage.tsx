import { Box, Drawer, LoadingOverlay, Text } from '@mantine/core';
import { IconMap } from 'twenty-ui/display';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { useOffplanBrowse } from '@/propel/offplan/useOffplanBrowse';
import { OffplanFilters } from '@/propel/offplan/OffplanFilters';
import { OffplanMap } from '@/propel/offplan/OffplanMap';
import { OffplanCardRail } from '@/propel/offplan/OffplanCardRail';

export const OffplanStudioPage = () => {
  const b = useOffplanBrowse();
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
                <Box style={{ width: '60%', minWidth: 0 }}>
                  <OffplanMap
                    visiblePoints={b.visible} clusters={b.clusters}
                    selectedId={b.selectedId} hoveredId={b.hoveredId} viewedIds={b.viewedIds}
                    onViewportChange={(bounds, zoom) => { b.setBounds(bounds); b.setZoom(zoom); }}
                    onPinClick={b.openProject} onPinHover={b.setHoveredId} />
                </Box>
                <Box style={{ width: '40%', minWidth: 0, borderLeft: '1px solid var(--mantine-color-default-border)' }}>
                  <OffplanCardRail visible={b.visible} total={b.points.length}
                    hoveredId={b.hoveredId} onHover={b.setHoveredId} onOpen={b.openProject}
                    onShortlist={b.openProject} onPitch={b.openProject} />
                </Box>
              </>
            )}
          </Box>
        </Box>
        {b.selectedId != null && b.byId.get(b.selectedId) && (
          <Drawer opened position="right" size={640} onClose={() => b.setSelectedId(null)}
            title={<div><Text fw={700}>{b.byId.get(b.selectedId)!.name}</Text><Text size="xs" c="dimmed">{b.byId.get(b.selectedId)!.developerName} · {b.byId.get(b.selectedId)!.districtName}</Text></div>}>
            <Text fw={700} c="red">from AED {b.byId.get(b.selectedId)!.priceFromAed?.toLocaleString('en-US') ?? '—'} · {b.byId.get(b.selectedId)!.unitCount} units</Text>
            <Text size="sm" c="dimmed" mt="md">Full project detail (units, payment plan, area, documents) lands in the next batch.</Text>
          </Drawer>
        )}
      </PageContainer>
    </PropelMantineProvider>
  );
};
