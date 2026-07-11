import { useMemo, useState } from 'react';
import { ActionIcon, Group, Loader, TextInput, RangeSlider, MultiSelect, Select, Switch, Box, Text, Tooltip } from '@mantine/core';
import { IconSparkles } from 'twenty-ui/display';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { quarterCutoffIso } from './handover';
import type { OffplanMapPoint, OffplanBrowseFilters } from './types';

const GOLD = '#d4af37';

type AiFilters = {
  minPriceAed?: number | null;
  maxPriceAed?: number | null;
  bedrooms?: number | null;
  districtNames?: string[] | null;
  developerName?: string | null;
  handoverBeforeIso?: string | null;
  newLaunchOnly?: boolean | null;
  q?: string | null;
};

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

  // ✦ AI natural-language search: sends the free text to assist.aiSearch and
  // applies the STRUCTURED filters it extracts as hard client-side filters —
  // the AI never invents ids or numbers we don't map ourselves.
  const [aiBusy, setAiBusy] = useState(false);
  const [aiHidden, setAiHidden] = useState(false);
  const runAiSearch = async () => {
    const prompt = filters.q.trim();
    if (!prompt || aiBusy) return;
    setAiBusy(true);
    const districtNames = [...new Set(points.map((p) => p.districtName).filter(Boolean))].slice(0, 120);
    const res = await callPropelRoute<{ ok?: boolean; code?: string; filters?: AiFilters }>(
      '/offplan/assist',
      { action: 'aiSearch', prompt, districtNames },
    );
    setAiBusy(false);
    if (res?.ok && res.filters) {
      const f = res.filters;
      const wanted = new Set((f.districtNames ?? []).map((n) => n.toLowerCase()));
      const districtIds = [...new Set(
        points.filter((p) => wanted.has(p.districtName.toLowerCase())).map((p) => p.districtId),
      )];
      const devSlug = f.developerName
        ? points.find((p) => p.developerName?.toLowerCase() === f.developerName!.toLowerCase())?.developerSlug
        : null;
      onChange({
        q: f.q ?? '',
        districtIds,
        minPriceAed: f.minPriceAed ?? undefined,
        maxPriceAed: f.maxPriceAed ?? undefined,
        handoverBeforeIso: f.handoverBeforeIso ?? undefined,
        developerSlugs: devSlug ? [devSlug] : [],
        newLaunchOnly: f.newLaunchOnly === true,
      });
      onBedChange(f.bedrooms ?? undefined, undefined);
    } else if (res?.code === 'AI_UNAVAILABLE') {
      setAiHidden(true);
    }
    // AI_PARSE_FAILED / null → silent fallback: the plain q filter already applies as typed.
  };

  return (
    <Box style={{ padding: '8px 12px', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
      <Group gap="xs" wrap="wrap">
        <TextInput placeholder="Search project, developer, area…" value={filters.q}
          onChange={(e) => onChange({ q: e.currentTarget.value })} style={{ flex: 1, minWidth: 220 }}
          rightSection={
            aiBusy ? (
              <Loader size={14} />
            ) : !aiHidden && filters.q.trim() !== '' ? (
              <Tooltip label="Ask AI to turn this into filters">
                <ActionIcon variant="subtle" color="gray" onClick={() => void runAiSearch()}>
                  <IconSparkles size={14} color={GOLD} />
                </ActionIcon>
              </Tooltip>
            ) : undefined
          } />
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
        <Tooltip label="Only projects with available units (hides sold-out / not-yet-released)">
          <Switch label="Available stock" checked={filters.stockedOnly} onChange={(e) => onChange({ stockedOnly: e.currentTarget.checked })} />
        </Tooltip>
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
