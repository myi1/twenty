import { useCallback, useEffect, useState } from 'react';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import { Box, Alert } from '@mantine/core';
import { OffplanFilters } from '@/propel/offplan/OffplanFilters';
import { OffplanCardRail } from '@/propel/offplan/OffplanCardRail';
import { OffplanMap } from '@/propel/offplan/OffplanMap';
import { OffplanProjectDrawer } from '@/propel/offplan/OffplanProjectDrawer';
import { useOffplanBrowse } from '@/propel/offplan/useOffplanBrowse';
import type { OffplanUnit, OffplanProject } from '@/propel/offplan/types';

export function OffplanStudioPage() {
  const { projects, pins, error, search } = useOffplanBrowse();
  const [selected, setSelected] = useState<OffplanUnit | null>(null);
  const [highlightedProjectId, setHighlightedProjectId] = useState<string | null>(null);

  useEffect(() => { search({ q: '', districtIds: [] }); }, [search]);

  const openProject = useCallback((p: OffplanProject) => {
    setHighlightedProjectId(p.projectId);
    setSelected(p.anchorUnit);
  }, []);

  const handlePinClick = useCallback((projectId: string) => {
    setHighlightedProjectId(projectId);
  }, []);

  return (
    <PropelMantineProvider>
      <Box
        style={{
          display: 'flex', flexDirection: 'column',
          width: '100%', flex: 1, height: '100vh', minHeight: 0,
        }}
      >
        <OffplanFilters onSearch={search} />
        {error && <Alert color="red" m="sm">{error}</Alert>}
        <Box style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>
          <Box style={{ flex: '1 1 62%', minWidth: 0 }}>
            <OffplanMap points={pins} onPinClick={handlePinClick} />
          </Box>
          <Box
            style={{
              flex: '1 1 38%', minWidth: 320, maxWidth: 460,
              borderLeft: '1px solid var(--mantine-color-gray-3)', minHeight: 0,
            }}
          >
            <OffplanCardRail
              projects={projects}
              onOpen={openProject}
              highlightedProjectId={highlightedProjectId}
            />
          </Box>
        </Box>
      </Box>
      <OffplanProjectDrawer unit={selected} onClose={() => setSelected(null)} />
    </PropelMantineProvider>
  );
}
