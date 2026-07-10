import { useEffect, useState } from 'react';
import { Drawer, Tabs, Table, Text, Group, Badge, Button, Box, Stack, Tooltip } from '@mantine/core';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { isoToQuarterLabel } from './handover';
import type { OffplanMapPoint, OffplanUnit, RouteEnvelope, OffplanSearchResult } from './types';

const aed = (n: number | null | undefined) => (n == null ? '—' : `AED ${Math.round(n).toLocaleString('en-US')}`);

export function OffplanProjectDrawer({
  point, shortlisted, onClose, onShortlist, onPitch,
}: {
  point: OffplanMapPoint;
  shortlisted: boolean;
  onClose: () => void;
  onShortlist: (id: number) => void;
  onPitch: (id: number, anchorUnitExternalId?: number) => void;
}) {
  const [units, setUnits] = useState<OffplanUnit[] | null>(null);
  const [area, setArea] = useState<any | null>(null);
  const [anchorUnitId, setAnchorUnitId] = useState<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    (async () => {
      const u = await callPropelRoute<RouteEnvelope<OffplanSearchResult>>('/offplan/browse', { action: 'search', params: { projectExternalId: point.externalId, limit: 100 } });
      if (alive) { const list = u?.ok ? u.data?.units ?? [] : []; setUnits(list); setAnchorUnitId([...list].sort((a, b) => a.price - b.price)[0]?.externalId); }
      const a = await callPropelRoute<RouteEnvelope<any>>('/offplan/browse', { action: 'area', params: { area: point.districtName } });
      if (alive) setArea(a?.ok ? a.data : null);
    })();
    return () => { alive = false; };
  }, [point.externalId, point.districtName]);

  const y = area?.signals?.yield?.value;
  return (
    <Drawer opened position="right" size={640} onClose={onClose}
      title={<div><Text fw={700}>{point.name}</Text><Text size="xs" c="dimmed">{point.developerName} · {point.districtName} · Handover {isoToQuarterLabel(point.handover ?? undefined) ?? '—'}</Text></div>}>
      <Text fw={700} c="red" mb="sm">from {aed(point.priceFromAed)} · {point.unitCount} units{point.isLaunch ? ' · New launch' : ''}</Text>
      <Tabs defaultValue="units">
        <Tabs.List>
          <Tabs.Tab value="units">Units{units ? ` (${units.length})` : ''}</Tabs.Tab>
          {area && <Tabs.Tab value="area">Area</Tabs.Tab>}
          <Tooltip label="Data available soon — no endpoint yet"><Tabs.Tab value="amenities" disabled>Amenities</Tabs.Tab></Tooltip>
        </Tabs.List>

        <Tabs.Panel value="units" pt="sm">
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Unit</Table.Th><Table.Th>Type</Table.Th><Table.Th>Size</Table.Th><Table.Th>Price</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {(units ?? []).map((u) => (
                <Table.Tr key={u.externalId} bg={u.externalId === anchorUnitId ? 'var(--mantine-color-red-light)' : undefined} onClick={() => setAnchorUnitId(u.externalId)} style={{ cursor: 'pointer' }}>
                  <Table.Td>{u.floor ? `${u.floor}·` : ''}{u.layoutName}</Table.Td><Table.Td>{u.layoutName}</Table.Td>
                  <Table.Td>{Math.round(u.squareFt)} sqft</Table.Td><Table.Td>{aed(u.price)}</Table.Td>
                  <Table.Td>{u.status === 'available' && <Badge color="green" size="xs">avail</Badge>}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        {area && (
          <Tabs.Panel value="area" pt="sm">
            <Group>
              {y != null && <Stat k="Median yield" v={`${y.toFixed(1)}%`} />}
              {area?.signals?.rent?.value != null && <Stat k="Avg rent" v={aed(area.signals.rent.value)} />}
              {area?.offplan?.totalActiveProjects != null && <Stat k="Off-plan supply" v={`${area.offplan.totalActiveProjects} proj`} />}
            </Group>
          </Tabs.Panel>
        )}
      </Tabs>

      <Group mt="lg" justify="space-between">
        <Text size="xs" c="dimmed">Est. commission — shown when available</Text>
        <Group gap="xs">
          <Tooltip label="Attach to a client — coming in P1"><Button variant="default" size="xs" disabled>Attach to client</Button></Tooltip>
          <Button variant={shortlisted ? 'filled' : 'default'} size="xs" onClick={() => onShortlist(point.externalId)}>{shortlisted ? '✓ Shortlisted' : '＋ Shortlist'}</Button>
          <Button color="red" size="xs" onClick={() => onPitch(point.externalId, anchorUnitId)}>Pitch this →</Button>
        </Group>
      </Group>
    </Drawer>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return <Box style={{ padding: '8px 12px', border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}><Text size="xs" c="dimmed">{k}</Text><Text fw={700}>{v}</Text></Box>;
}
