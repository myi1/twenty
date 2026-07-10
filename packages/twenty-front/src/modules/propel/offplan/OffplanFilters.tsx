import { Group, TextInput, NumberInput, Button } from '@mantine/core';
import { useState } from 'react';
import type { OffplanFiltersState } from './types';

export function OffplanFilters({ onSearch }: { onSearch: (f: OffplanFiltersState) => void }) {
  const [q, setQ] = useState('');
  const [minPriceAed, setMin] = useState<number | undefined>();
  const [maxPriceAed, setMax] = useState<number | undefined>();
  const submit = () => onSearch({ q, districtIds: [], minPriceAed, maxPriceAed });
  return (
    <Group p="sm" wrap="nowrap">
      <TextInput placeholder="Search project / area" value={q} onChange={(e) => setQ(e.currentTarget.value)} style={{ flex: 1 }} />
      <NumberInput placeholder="Min AED" value={minPriceAed} onChange={(v) => setMin(typeof v === 'number' ? v : undefined)} w={130} />
      <NumberInput placeholder="Max AED" value={maxPriceAed} onChange={(v) => setMax(typeof v === 'number' ? v : undefined)} w={130} />
      <Button onClick={submit}>Search</Button>
    </Group>
  );
}
