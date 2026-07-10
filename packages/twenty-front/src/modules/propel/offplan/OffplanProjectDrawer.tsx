import { useEffect, useState } from 'react';
import {
  Anchor,
  Badge,
  Box,
  Button,
  Drawer,
  Grid,
  Group,
  Image,
  Stack,
  Table,
  Tabs,
  Text,
  Tooltip,
} from '@mantine/core';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { isoToQuarterLabel } from './handover';
import type {
  OffplanMapPoint,
  OffplanProjectDetail,
  OffplanSearchResult,
  OffplanUnit,
  RouteEnvelope,
} from './types';

const aed = (n: number | null | undefined) => (n == null ? '—' : `AED ${Math.round(n).toLocaleString('en-US')}`);

export function OffplanProjectDrawer({
  point, shortlisted, onClose, onShortlist, onPitch, onOpenDeveloper,
}: {
  point: OffplanMapPoint;
  shortlisted: boolean;
  onClose: () => void;
  onShortlist: (id: number) => void;
  onPitch: (id: number, anchorUnitExternalId?: number) => void;
  onOpenDeveloper?: (slug: string) => void;
}) {
  const [units, setUnits] = useState<OffplanUnit[] | null>(null);
  const [area, setArea] = useState<any | null>(null);
  const [detail, setDetail] = useState<OffplanProjectDetail | null>(null);
  const [anchorUnitId, setAnchorUnitId] = useState<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    (async () => {
      const u = await callPropelRoute<RouteEnvelope<OffplanSearchResult>>('/offplan/browse', { action: 'search', params: { projectExternalId: point.externalId, limit: 100 } });
      if (alive) { const list = u?.ok ? u.data?.units ?? [] : []; setUnits(list); setAnchorUnitId([...list].sort((a, b) => a.price - b.price)[0]?.externalId); }
      const d = await callPropelRoute<RouteEnvelope<{ project: OffplanProjectDetail }>>('/offplan/browse', { action: 'projectDetail', params: { projectExternalId: point.externalId } });
      if (alive) setDetail(d?.ok ? (d.data as any)?.project ?? null : null);
      const a = await callPropelRoute<RouteEnvelope<any>>('/offplan/browse', { action: 'area', params: { area: point.districtName } });
      if (alive) setArea(a?.ok ? a.data : null);
    })();
    return () => { alive = false; };
  }, [point.externalId, point.districtName]);

  const y = area?.signals?.yield?.value;
  const hasAmenities = (detail?.amenities?.length ?? 0) > 0;
  const hasPayment = (detail?.paymentPlans?.length ?? 0) > 0;
  const commissionBase = detail?.minPriceAed ?? point.priceFromAed;
  const estCommissionK =
    detail?.commissionMinPct != null && commissionBase != null
      ? Math.round((commissionBase * detail.commissionMinPct) / 100 / 1000)
      : null;

  const sizeRange =
    detail?.minSquareFt != null || detail?.maxSquareFt != null
      ? `${detail?.minSquareFt != null ? Math.round(detail.minSquareFt) : '—'}–${detail?.maxSquareFt != null ? Math.round(detail.maxSquareFt) : '—'} sqft`
      : null;

  return (
    <Drawer opened position="right" size={640} onClose={onClose}
      title={<div>
        <Text fw={700}>{point.name}</Text>
        <Text size="xs" c="dimmed">
          {onOpenDeveloper && point.developerSlug ? (
            <Anchor size="xs" onClick={() => onOpenDeveloper(point.developerSlug!)}>{point.developerName ?? point.developerSlug}</Anchor>
          ) : (
            point.developerName
          )}
          {' · '}{point.districtName} · Handover {isoToQuarterLabel(point.handover ?? undefined) ?? '—'}
        </Text>
      </div>}>
      {detail?.renders?.primary && (
        <Image src={detail.renders.primary} h={140} fit="cover" radius="sm" mb="sm" />
      )}
      <Text fw={700} c="red" mb="sm">from {aed(point.priceFromAed)} · {point.unitCount} units{point.isLaunch ? ' · New launch' : ''}</Text>
      <Tabs defaultValue="units">
        <Tabs.List>
          <Tabs.Tab value="units">Units{units ? ` (${units.length})` : ''}</Tabs.Tab>
          {detail && <Tabs.Tab value="overview">Overview</Tabs.Tab>}
          {area && <Tabs.Tab value="area">Area</Tabs.Tab>}
          {hasAmenities ? (
            <Tabs.Tab value="amenities">Amenities</Tabs.Tab>
          ) : (
            <Tooltip label="No amenity data for this project"><Tabs.Tab value="amenities" disabled>Amenities</Tabs.Tab></Tooltip>
          )}
          {hasPayment && <Tabs.Tab value="payment">Payment</Tabs.Tab>}
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

        {detail && (
          <Tabs.Panel value="overview" pt="sm">
            <Stack gap="sm">
              {detail.description && <Text size="sm" lineClamp={6}>{detail.description}</Text>}
              <Grid gutter="xs">
                {detail.ownershipType != null && <Grid.Col span={4}><Stat k="Ownership" v={detail.ownershipType} /></Grid.Col>}
                {detail.serviceCharge != null && <Grid.Col span={4}><Stat k="Service charge" v={`AED ${detail.serviceCharge}/ft²`} /></Grid.Col>}
                {detail.eoiAed != null && <Grid.Col span={4}><Stat k="EOI" v={aed(detail.eoiAed)} /></Grid.Col>}
                {detail.nocPct != null && <Grid.Col span={4}><Stat k="NOC" v={`${detail.nocPct}%`} /></Grid.Col>}
                {sizeRange != null && <Grid.Col span={4}><Stat k="Size range" v={sizeRange} /></Grid.Col>}
                {detail.startOfSales != null && <Grid.Col span={4}><Stat k="Sales start" v={isoToQuarterLabel(detail.startOfSales) ?? detail.startOfSales} /></Grid.Col>}
              </Grid>
            </Stack>
          </Tabs.Panel>
        )}

        {area && (
          <Tabs.Panel value="area" pt="sm">
            <Group>
              {y != null && <Stat k="Median yield" v={`${y.toFixed(1)}%`} />}
              {area?.signals?.rent?.value != null && <Stat k="Avg rent" v={aed(area.signals.rent.value)} />}
              {area?.offplan?.totalActiveProjects != null && <Stat k="Off-plan supply" v={`${area.offplan.totalActiveProjects} proj`} />}
            </Group>
          </Tabs.Panel>
        )}

        {hasAmenities && (
          <Tabs.Panel value="amenities" pt="sm">
            <Group gap="xs">
              {detail!.amenities
                .filter((a) => a.name || a.code)
                .map((a, i) => (
                  <Badge key={`${a.code ?? a.name}-${i}`} variant="light" color="gray">{a.name ?? a.code}</Badge>
                ))}
            </Group>
          </Tabs.Panel>
        )}

        {hasPayment && (
          <Tabs.Panel value="payment" pt="sm">
            <Stack gap="md">
              {detail!.paymentPlans.map((plan) => (
                <Box key={plan.id}>
                  <Group gap="xs" mb={4}>
                    <Text fw={700} size="sm">{plan.name}</Text>
                    {plan.downPaymentPct != null && <Badge variant="light" size="xs">{plan.downPaymentPct}% down</Badge>}
                    {plan.postHandover && <Badge variant="light" color="yellow" size="xs">Post-handover</Badge>}
                  </Group>
                  <Table striped>
                    <Table.Thead><Table.Tr><Table.Th>Milestone</Table.Th><Table.Th>Instalment</Table.Th><Table.Th>Order</Table.Th></Table.Tr></Table.Thead>
                    <Table.Tbody>
                      {[...plan.items].sort((a, b) => a.order - b.order).map((it, i) => (
                        <Table.Tr key={`${plan.id}-${i}`}>
                          <Table.Td>{it.rawName}</Table.Td>
                          <Table.Td>{it.installmentPct != null ? `${it.installmentPct}%` : '—'}</Table.Td>
                          <Table.Td>{it.order}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Box>
              ))}
            </Stack>
          </Tabs.Panel>
        )}
      </Tabs>

      <Group mt="lg" justify="space-between">
        {estCommissionK != null ? (
          <Text size="xs" fw={700}>Est. commission ~AED {estCommissionK.toLocaleString('en-US')}k</Text>
        ) : (
          <Text size="xs" c="dimmed">Est. commission — shown when available</Text>
        )}
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
