import { useMemo, useState } from 'react';
import { Group, TextInput, RangeSlider, MultiSelect, Select, Switch, Box, Text } from '@mantine/core';
import { quarterCutoffIso } from './handover';
import type { OffplanMapPoint, OffplanBrowseFilters } from './types';

const uniq = (pairs: Array<[string, string]>) => {
  const m = new Map<string, string>();
  for (const [v, l] of pairs) if (v && !m.has(v)) m.set(v, l);
  return [...m].map(([value, label]) => ({ value, label }));
};

export function OffplanFilters({
  points, filters, onChange, onBedChange,
}: {
  points: OffplanMapPoint[];
  filters: OffplanBrowseFilters;
  onChange: (patch: Partial<OffplanBrowseFilters>) => void;
  onBedChange: (min?: number, max?: number) => void;
}) {
  const districtOptions = useMemo(() => uniq(points.map((p) => [p.districtId, p.districtName])), [points]);
  const developerOptions = useMemo(() => uniq(points.map((p) => [p.developerSlug ?? '', p.developerName ?? ''])), [points]);
  const years = ['2026', '2027', '2028', '2029', '2030'];

  // Handover is a "before Q<q> <year>" cutoff; emit handoverBeforeIso only when BOTH
  // quarter and year are set (kept in local state so either dropdown can lead).
  const [hq, setHq] = useState<string | null>(null);
  const [hy, setHy] = useState<string | null>(null);
  const setHandover = (q: string | null, y: string | null) => {
    setHq(q);
    setHy(y);
    if (q && y) onChange({ handoverBeforeIso: quarterCutoffIso(Number(q), Number(y)) });
    else onChange({ handoverBeforeIso: undefined });
  };

  return (
    <Box style={{ padding: '8px 12px', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
      <Group gap="xs" wrap="wrap">
        <TextInput placeholder="Search project, developer, area…" value={filters.q}
          onChange={(e) => onChange({ q: e.currentTarget.value })} style={{ flex: 1, minWidth: 220 }} />
        <MultiSelect placeholder="District" data={districtOptions} value={filters.districtIds}
          onChange={(v) => onChange({ districtIds: v })} searchable clearable maw={200} />
        <MultiSelect placeholder="Developer" data={developerOptions} value={filters.developerSlugs}
          onChange={(v) => onChange({ developerSlugs: v })} searchable clearable maw={200} />
        <Select placeholder="Handover before Q" data={['1', '2', '3', '4'].map((q) => ({ value: q, label: `Q${q}` }))}
          value={hq} onChange={(q) => setHandover(q, hy)} maw={130} clearable />
        <Select placeholder="Year" data={years} value={hy} maw={100} clearable
          onChange={(y) => setHandover(hq, y)} />
        <Select placeholder="Beds" data={[{ value: '0', label: 'Studio' }, { value: '1', label: '1 BR' }, { value: '2', label: '2 BR' }, { value: '3', label: '3+ BR' }]}
          onChange={(v) => onBedChange(v == null ? undefined : Number(v), undefined)} maw={110} clearable />
        <Switch label="New launches" checked={filters.newLaunchOnly} onChange={(e) => onChange({ newLaunchOnly: e.currentTarget.checked })} />
      </Group>
      <Group gap="xs" mt={8} align="center">
        <Text size="xs" c="dimmed">Price</Text>
        <RangeSlider min={0} max={20_000_000} step={100_000} style={{ flex: 1, maxWidth: 360 }}
          defaultValue={[0, 20_000_000]} label={(v) => `${Math.round(v / 1000)}k`}
          onChangeEnd={([min, max]) => onChange({ minPriceAed: min || undefined, maxPriceAed: max >= 20_000_000 ? undefined : max })} />
      </Group>
    </Box>
  );
}
