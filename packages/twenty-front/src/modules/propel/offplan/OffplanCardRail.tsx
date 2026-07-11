import { ScrollArea, Card, Text, Group, Badge, Button, Box, Anchor } from '@mantine/core';
import { useEffect, useRef } from 'react';
import { OffplanHeroImage } from './OffplanHeroImage';
import { isoToQuarterLabel } from './handover';
import { formatAed } from '@/propel/lib/formatMoney';
import type { OffplanMapPoint } from './types';

const WINDOW = 60; // cap DOM cards (no virtualization lib available)

export function OffplanCardRail({
  visible, total, hoveredId, onHover, onOpen, onShortlist, onPitch, onOpenDeveloper,
}: {
  visible: OffplanMapPoint[];
  total: number;
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  onOpen: (id: number) => void;
  onShortlist: (id: number) => void;
  onPitch: (id: number) => void;
  onOpenDeveloper?: (slug: string) => void;
}) {
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  useEffect(() => {
    if (hoveredId != null) rowRefs.current.get(hoveredId)?.scrollIntoView({ block: 'nearest' });
  }, [hoveredId]);

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Group justify="space-between" p="xs">
        <Text fw={700} size="sm">{visible.length} projects in view</Text>
        <Text size="xs" c="dimmed">of {total} total</Text>
      </Group>
      <ScrollArea style={{ flex: 1 }}>
        <Box p="xs" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.slice(0, WINDOW).map((p) => (
            <Card key={p.externalId} withBorder padding="sm" radius="md"
              ref={(el) => { if (el) rowRefs.current.set(p.externalId, el); else rowRefs.current.delete(p.externalId); }}
              onMouseEnter={() => onHover(p.externalId)} onMouseLeave={() => onHover(null)}
              onClick={() => onOpen(p.externalId)}
              style={{ cursor: 'pointer', outline: hoveredId === p.externalId ? '1px solid var(--mantine-color-red-6)' : undefined }}>
              <Group wrap="nowrap" gap="sm" align="flex-start">
                <Box style={{ flex: 'none' }}>
                  <OffplanHeroImage src={p.heroImageUrl} w={84} h={68} radius={6} alt={p.name} />
                </Box>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Group justify="space-between" wrap="nowrap">
                    <Text fw={600} size="sm" lineClamp={1}>{p.name}</Text>
                    {p.isLaunch && <Badge color="green" size="xs">New launch</Badge>}
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {onOpenDeveloper && p.developerSlug ? (
                      <Anchor size="xs" onClick={(e) => { e.stopPropagation(); onOpenDeveloper(p.developerSlug!); }}>
                        {p.developerName ?? p.developerSlug}
                      </Anchor>
                    ) : (
                      p.developerName
                    )}
                    {' · '}{p.districtName}
                  </Text>
                  <Group gap="md" mt={6}>
                    <Text fw={700} size="sm" c="red">{formatAed(p.priceFromAed, { from: true }) ?? 'Price on request'}</Text>
                    {p.unitCount > 0 && <Text size="xs" c="dimmed">{p.unitCount} units</Text>}
                    {p.handover && <Text size="xs" c="dimmed">Handover {isoToQuarterLabel(p.handover)}</Text>}
                  </Group>
                  <Group gap="xs" mt={8}>
                    <Button size="compact-xs" variant="default" onClick={(e) => { e.stopPropagation(); onShortlist(p.externalId); }}>＋ Shortlist</Button>
                    <Button size="compact-xs" color="red" onClick={(e) => { e.stopPropagation(); onPitch(p.externalId); }}>Pitch</Button>
                  </Group>
                </Box>
              </Group>
            </Card>
          ))}
          {visible.length > WINDOW && <Text size="xs" c="dimmed" ta="center">Showing first {WINDOW} of {visible.length} — zoom/pan or filter to narrow.</Text>}
        </Box>
      </ScrollArea>
    </Box>
  );
}
