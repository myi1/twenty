import { useEffect, useState } from 'react';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import { Box, Alert } from '@mantine/core';
import { OffplanFilters } from '@/propel/offplan/OffplanFilters';
import { OffplanCardRail } from '@/propel/offplan/OffplanCardRail';
import { OffplanMap } from '@/propel/offplan/OffplanMap';
import { OffplanProjectDrawer } from '@/propel/offplan/OffplanProjectDrawer';
import { useOffplanBrowse } from '@/propel/offplan/useOffplanBrowse';
import type { OffplanUnit } from '@/propel/offplan/types';

export function OffplanStudioPage() {
  const { units, error, search } = useOffplanBrowse();
  const [selected, setSelected] = useState<OffplanUnit | null>(null);
  useEffect(() => { search({ q: '', districtIds: [] }); }, [search]);
  return (
    <PropelMantineProvider>
      <Box style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <OffplanFilters onSearch={search} />
        {error && <Alert color="red" m="sm">{error}</Alert>}
        <Box style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <Box style={{ flex: '0 0 60%' }}><OffplanMap points={[]} /></Box>
          <Box style={{ flex: '0 0 40%', borderLeft: '1px solid var(--mantine-color-gray-3)' }}>
            <OffplanCardRail units={units} onOpen={setSelected} />
          </Box>
        </Box>
      </Box>
      <OffplanProjectDrawer unit={selected} onClose={() => setSelected(null)} />
    </PropelMantineProvider>
  );
}
