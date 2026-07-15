import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Anchor,
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  ScrollArea,
  Stack,
  Table,
  Tabs,
  Text,
  Tooltip,
} from '@mantine/core';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { formatAed } from '@/propel/lib/formatMoney';
import { OffplanHeroImage } from './OffplanHeroImage';
import { OffplanGalleryLightbox } from './OffplanGalleryLightbox';
import { isoToQuarterLabel } from './handover';
import type {
  OffplanMapPoint,
  OffplanProjectDetail,
  OffplanSearchResult,
  OffplanUnit,
  RouteEnvelope,
} from './types';

const BRASS = '#d4af37';

// Scannable rounded AED (shared standard). Off-plan figures are estimates
// (many unit "prices" are derived pricePerSqft × size upstream), so we never
// show a fake-exact to-the-dirham number in this client-facing drawer.
const aed = (n: number | null | undefined) => formatAed(n);

type TabKey = 'overview' | 'payment' | 'area' | 'units' | 'documents' | 'amenities';

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
  const [tab, setTab] = useState<string | null>(null);
  // Index into `galleryImages` of the render shown full-screen; null = closed.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setDetail(null); setUnits(null); setArea(null); setAnchorUnitId(undefined); setTab(null); setLightboxIndex(null);
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

  // ── Derived facts ────────────────────────────────────────────────────
  const sortedUnits = useMemo(
    () => (units ? [...units].sort((a, b) => a.price - b.price) : []),
    [units],
  );
  const anchorUnit = sortedUnits.find((u) => u.externalId === anchorUnitId) ?? sortedUnits[0];
  const hasUnits = sortedUnits.length > 0;

  const developerName = point.developerName ?? detail?.developer?.name ?? null;
  const developerSlug = point.developerSlug ?? detail?.developer?.slug ?? null;
  const handoverLabel = isoToQuarterLabel(point.handover ?? detail?.handover ?? undefined);
  const fromPrice = detail?.minPriceAed ?? point.priceFromAed;
  const pricePerSqft = anchorUnit?.pricePerSqft ?? null;
  const firstPlan = detail?.paymentPlans?.[0];
  const downPct = firstPlan?.downPaymentPct ?? null;

  const heroSrc = detail?.renders?.primary ?? point.heroImageUrl ?? null;
  // The full browsable render set: primary first, then the gallery, de-duped and
  // limited to absolute URLs (a bare B2 key isn't browser-resolvable — same guard
  // as OffplanHeroImage). This backs both the thumbnail strip and the lightbox.
  const galleryImages = useMemo(() => {
    const isRenderable = (s: string | null | undefined): s is string =>
      !!s && /^(https?:)?\/\//i.test(s);
    const ordered = [heroSrc, ...(detail?.renders?.gallery ?? [])].filter(isRenderable);
    return Array.from(new Set(ordered));
  }, [heroSrc, detail?.renders?.gallery]);
  const hasGallery = galleryImages.length > 0;

  const y = area?.signals?.yield?.value;
  const areaRent = area?.signals?.rent?.value;
  const areaSupply = area?.offplan?.totalActiveProjects;
  const hasArea = y != null || areaRent != null || areaSupply != null;

  const hasAmenities = (detail?.amenities?.filter((a) => a.name || a.code).length ?? 0) > 0;
  const hasPayment = (detail?.paymentPlans?.length ?? 0) > 0;
  const documents = detail?.documents ?? [];
  const hasDocuments = documents.length > 0;

  const overviewFacts = detail
    ? [
        detail.ownershipType != null && { k: 'Ownership', v: detail.ownershipType },
        detail.serviceCharge != null && { k: 'Service charge', v: `AED ${detail.serviceCharge}/ft²` },
        detail.eoiAed != null && { k: 'EOI', v: aed(detail.eoiAed) },
        detail.nocPct != null && { k: 'NOC', v: `${detail.nocPct}%` },
        (detail.minSquareFt != null || detail.maxSquareFt != null) && {
          k: 'Size range',
          v: `${detail.minSquareFt != null ? Math.round(detail.minSquareFt) : '—'}–${detail.maxSquareFt != null ? Math.round(detail.maxSquareFt) : '—'} sqft`,
        },
        detail.startOfSales != null && { k: 'Sales start', v: isoToQuarterLabel(detail.startOfSales) ?? detail.startOfSales },
      ].filter(Boolean as unknown as (x: any) => x is { k: string; v: string })
    : [];
  const description = detail?.description ?? detail?.developer?.description ?? null;
  const hasOverview = !!detail && (!!description || overviewFacts.length > 0);

  const estCommissionAed =
    detail?.commissionMinPct != null && fromPrice != null
      ? (fromPrice * detail.commissionMinPct) / 100
      : null;

  // First tab with content — never land on an empty "Units (0)".
  const activeTab: TabKey =
    hasOverview ? 'overview'
    : hasPayment ? 'payment'
    : hasArea ? 'area'
    : hasUnits ? 'units'
    : hasDocuments ? 'documents'
    : hasAmenities ? 'amenities'
    : 'overview';

  return (
    <>
    <Drawer
      opened
      position="right"
      size={620}
      onClose={onClose}
      title={<Text fw={700} lineClamp={1}>{point.name}</Text>}
      styles={{ body: { padding: 0, height: '100%', display: 'flex', flexDirection: 'column' } }}
    >
      <ScrollArea style={{ flex: 1 }}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <Box style={{ position: 'relative' }}>
          <Box
            onClick={() => hasGallery && setLightboxIndex(0)}
            style={{ cursor: hasGallery ? 'zoom-in' : 'default', position: 'relative' }}
          >
            <OffplanHeroImage src={heroSrc} h={210} radius={0} alt={point.name} />
            {hasGallery && galleryImages.length > 1 && (
              <Box
                style={{
                  position: 'absolute', bottom: 10, left: 12,
                  background: 'rgba(6,10,18,.72)', color: '#fff',
                  borderRadius: 14, padding: '3px 10px',
                  font: '600 11px system-ui', letterSpacing: .3, pointerEvents: 'none',
                }}
              >⤢ {galleryImages.length} photos</Box>
            )}
          </Box>
          <Group gap={6} style={{ position: 'absolute', top: 12, right: 12 }}>
            {point.isLaunch && (
              <Badge size="sm" style={{ background: BRASS, color: '#1a1408' }}>New launch</Badge>
            )}
          </Group>
          {hasGallery && galleryImages.length > 1 && (
            <Group gap={6} px="md" py={8} wrap="nowrap" style={{ overflowX: 'auto' }}>
              {galleryImages.map((g, i) => (
                <Box
                  key={`${g}-${i}`}
                  onClick={() => setLightboxIndex(i)}
                  style={{ flex: 'none', cursor: 'pointer', borderRadius: 6, overflow: 'hidden', transition: 'opacity 160ms ease-out' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '0.82'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
                >
                  <OffplanHeroImage src={g} w={92} h={60} radius={6} alt={`${point.name} render ${i + 1}`} />
                </Box>
              ))}
            </Group>
          )}
        </Box>

        {/* ── Title + price ────────────────────────────────────── */}
        <Box px="md" pt="md">
          <Text fw={800} size="xl" lh={1.15}>{point.name}</Text>

          <Group align="baseline" gap="xs" mt={8}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>From</Text>
            <Text fw={800} size="xl" c="red">{aed(fromPrice) ?? 'Price on request'}</Text>
            {pricePerSqft != null && (
              <Text size="sm" c="dimmed">· AED {Math.round(pricePerSqft).toLocaleString('en-US')}/sqft</Text>
            )}
          </Group>

          {/* ── Brass-ruled labeled key-facts strip ─────────────── */}
          <Group
            gap={0}
            mt="md"
            wrap="wrap"
            style={{ borderTop: `2px solid ${BRASS}`, borderBottom: '1px solid var(--mantine-color-default-border)' }}
          >
            {developerName && (
              <Fact k="Developer">
                {onOpenDeveloper && developerSlug ? (
                  <Anchor fw={600} onClick={() => onOpenDeveloper(developerSlug)}>{developerName}</Anchor>
                ) : (
                  <Text fw={600} size="sm" lineClamp={1}>{developerName}</Text>
                )}
              </Fact>
            )}
            <Fact k="District"><Text fw={600} size="sm" lineClamp={1}>{point.districtName}</Text></Fact>
            {handoverLabel && <Fact k="Handover"><Text fw={600} size="sm">{handoverLabel}</Text></Fact>}
            {hasUnits && <Fact k="Availability"><Text fw={600} size="sm">{sortedUnits.length} units</Text></Fact>}
            {downPct != null && (
              <Fact k="Payment">
                <Group gap={6}><Text fw={600} size="sm">{downPct}% down</Text>{firstPlan?.postHandover && <Badge size="xs" variant="light" color="yellow">Post-HO</Badge>}</Group>
              </Fact>
            )}
          </Group>
        </Box>

        {/* ── Tabs (only those with content) ───────────────────── */}
        <Box px="md" pt="md" pb="md">
          <Tabs value={tab ?? activeTab} onChange={setTab} keepMounted={false}>
            <Tabs.List>
              {hasOverview && <Tabs.Tab value="overview">Overview</Tabs.Tab>}
              {hasPayment && <Tabs.Tab value="payment">Payment plan</Tabs.Tab>}
              {hasArea && <Tabs.Tab value="area">Area</Tabs.Tab>}
              {hasUnits && <Tabs.Tab value="units">Units ({sortedUnits.length})</Tabs.Tab>}
              {hasDocuments && <Tabs.Tab value="documents">Documents</Tabs.Tab>}
              {hasAmenities && <Tabs.Tab value="amenities">Amenities</Tabs.Tab>}
            </Tabs.List>

            {hasOverview && (
              <Tabs.Panel value="overview" pt="md">
                <Stack gap="md">
                  {description && <Text size="sm" c="dimmed" lh={1.5} lineClamp={7}>{description}</Text>}
                  {overviewFacts.length > 0 && (
                    <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                      {overviewFacts.map((f) => <Stat key={f.k} k={f.k} v={f.v} />)}
                    </Box>
                  )}
                </Stack>
              </Tabs.Panel>
            )}

            {hasPayment && (
              <Tabs.Panel value="payment" pt="md">
                <Stack gap="lg">
                  {detail!.paymentPlans.map((plan) => {
                    const items = [...plan.items].sort((a, b) => a.order - b.order);
                    return (
                      <Box key={plan.id}>
                        <Group gap="xs" mb="xs">
                          <Text fw={700} size="sm">{plan.name}</Text>
                          {plan.downPaymentPct != null && <Badge variant="light" size="xs">{plan.downPaymentPct}% down</Badge>}
                          {plan.postHandover && <Badge variant="light" color="yellow" size="xs">Post-handover</Badge>}
                        </Group>
                        {/* Milestone strip — proportional to instalment % when known */}
                        <Group gap={2} mb="xs" wrap="nowrap">
                          {items.map((it, i) => (
                            <Tooltip key={`${plan.id}-bar-${i}`} label={`${it.rawName}${it.installmentPct != null ? ` — ${it.installmentPct}%` : ''}`} withArrow>
                              <Box style={{ flex: it.installmentPct != null ? Math.max(it.installmentPct, 3) : 6, height: 8, borderRadius: 3, background: i === 0 ? BRASS : 'var(--mantine-color-red-4)', opacity: i === 0 ? 1 : 0.55 + Math.min(0.4, (it.installmentPct ?? 6) / 60) }} />
                            </Tooltip>
                          ))}
                        </Group>
                        <Table striped withRowBorders={false} verticalSpacing={4}>
                          <Table.Tbody>
                            {items.map((it, i) => (
                              <Table.Tr key={`${plan.id}-${i}`}>
                                <Table.Td><Text size="sm">{it.rawName}</Text></Table.Td>
                                <Table.Td ta="right"><Text size="sm" fw={600}>{it.installmentPct != null ? `${it.installmentPct}%` : '—'}</Text></Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Box>
                    );
                  })}
                </Stack>
              </Tabs.Panel>
            )}

            {hasArea && (
              <Tabs.Panel value="area" pt="md">
                <Text size="xs" c="dimmed" mb="xs">{point.districtName} · off-plan market</Text>
                <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {y != null && <Stat k="Gross yield" v={`${y.toFixed(1)}%`} accent />}
                  {areaRent != null && <Stat k="Avg rent" v={aed(areaRent) ?? '—'} />}
                  {areaSupply != null && <Stat k="Off-plan supply" v={`${areaSupply} projects`} />}
                </Box>
              </Tabs.Panel>
            )}

            {hasUnits && (
              <Tabs.Panel value="units" pt="md">
                <Text size="xs" c="dimmed" mb="xs">Prices are estimates (price/sqft × size). Tap a unit to anchor the pitch.</Text>
                <Table striped highlightOnHover verticalSpacing={6}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Unit</Table.Th><Table.Th>Type</Table.Th>
                      <Table.Th ta="right">Size</Table.Th><Table.Th ta="right">Price</Table.Th><Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {sortedUnits.map((u) => (
                      <Table.Tr key={u.externalId} bg={u.externalId === anchorUnitId ? 'var(--mantine-color-red-light)' : undefined} onClick={() => setAnchorUnitId(u.externalId)} style={{ cursor: 'pointer' }}>
                        <Table.Td><Text size="sm">{u.floor ? `${u.floor}·` : ''}{u.number ?? u.layoutName}</Text></Table.Td>
                        <Table.Td><Text size="sm">{u.layoutName}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm">{Math.round(u.squareFt)} sqft</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={600}>{formatAed(u.price, { approx: true }) ?? '—'}</Text></Table.Td>
                        <Table.Td>{u.status === 'available' && <Badge color="green" size="xs">avail</Badge>}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Tabs.Panel>
            )}

            {hasDocuments && (
              <Tabs.Panel value="documents" pt="md">
                <Stack gap="xs">
                  {documents.map((d, i) => (
                    <Anchor key={`${d.url}-${i}`} href={d.url} target="_blank" rel="noopener noreferrer" size="sm">
                      {d.label || d.kind} ↗
                    </Anchor>
                  ))}
                </Stack>
              </Tabs.Panel>
            )}

            {hasAmenities && (
              <Tabs.Panel value="amenities" pt="md">
                <Group gap="xs">
                  {detail!.amenities.filter((a) => a.name || a.code).map((a, i) => (
                    <Badge key={`${a.code ?? a.name}-${i}`} variant="light" color="gray">{a.name ?? a.code}</Badge>
                  ))}
                </Group>
              </Tabs.Panel>
            )}
          </Tabs>
        </Box>
      </ScrollArea>

      {/* ── Pinned action bar ──────────────────────────────────── */}
      <Group
        justify="space-between"
        px="md" py="sm"
        style={{ borderTop: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-body)' }}
      >
        {estCommissionAed != null ? (
          <Box>
            <Text size="10px" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>Est. commission</Text>
            <Text size="sm" fw={800} style={{ color: BRASS }}>{formatAed(estCommissionAed, { approx: true })}</Text>
          </Box>
        ) : (
          <Text size="xs" c="dimmed">Commission shown when available</Text>
        )}
        <Group gap="xs">
          <Tooltip label="Attach to a client — coming in P1"><Button variant="default" size="xs" disabled>Attach</Button></Tooltip>
          <Button variant={shortlisted ? 'filled' : 'default'} size="xs" onClick={() => onShortlist(point.externalId)}>{shortlisted ? '✓ Shortlisted' : '＋ Shortlist'}</Button>
          <Button color="red" size="xs" onClick={() => onPitch(point.externalId, anchorUnitId)}>Pitch this →</Button>
        </Group>
      </Group>
    </Drawer>
    {lightboxIndex !== null && hasGallery && (
      <OffplanGalleryLightbox
        images={galleryImages}
        index={lightboxIndex}
        alt={point.name}
        onIndex={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    )}
    </>
  );
}

/** A labeled cell in the brass-ruled key-facts strip. */
function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <Box style={{ flex: '1 1 30%', minWidth: 96, padding: '8px 12px 8px 0' }}>
      <Text size="10px" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>{k}</Text>
      <Box mt={2}>{children}</Box>
    </Box>
  );
}

/** A boxed stat used in Overview / Area grids. */
function Stat({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <Box style={{ padding: '8px 12px', border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}>
      <Text size="10px" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>{k}</Text>
      <Text fw={700} size="sm" style={accent ? { color: BRASS } : undefined}>{v}</Text>
    </Box>
  );
}
