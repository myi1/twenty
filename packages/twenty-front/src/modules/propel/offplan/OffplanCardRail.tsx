import { useEffect, useRef } from 'react';
import { ScrollArea, Card, Text, Badge, Stack, Group } from '@mantine/core';
import type { OffplanProject } from './types';

const aed = (n: number) => 'AED ' + Math.round(n).toLocaleString('en-US');

export function OffplanCardRail({
  projects, onOpen, highlightedProjectId,
}: {
  projects: OffplanProject[];
  onOpen: (p: OffplanProject) => void;
  highlightedProjectId?: string | null;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Scroll the highlighted card (e.g. after a map pin click) into view.
  useEffect(() => {
    if (!highlightedProjectId) return;
    const el = cardRefs.current.get(highlightedProjectId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedProjectId]);

  return (
    <ScrollArea style={{ height: '100%' }} viewportRef={viewportRef}>
      <Stack p="sm" gap="sm">
        <Text size="sm" c="dimmed" px={4}>
          {projects.length} {projects.length === 1 ? 'project' : 'projects'}
        </Text>
        {projects.map((p) => {
          const active = p.projectId === highlightedProjectId;
          const sizeRange = p.minSquareFt
            ? p.minSquareFt === p.maxSquareFt
              ? `${Math.round(p.minSquareFt)} sqft`
              : `${Math.round(p.minSquareFt)}–${Math.round(p.maxSquareFt)} sqft`
            : null;
          return (
            <Card
              key={p.projectId}
              ref={(el) => { if (el) cardRefs.current.set(p.projectId, el); }}
              withBorder
              shadow={active ? 'md' : 'sm'}
              padding="sm"
              onClick={() => onOpen(p)}
              style={{
                cursor: 'pointer',
                borderColor: active ? 'var(--mantine-color-blue-5)' : undefined,
                borderWidth: active ? 2 : undefined,
              }}
            >
              <Text fw={600}>{p.projectName}</Text>
              <Text size="sm" c="dimmed">{p.developerName} · {p.districtName}</Text>
              <Group mt={6} justify="space-between" wrap="nowrap">
                <Badge variant="light">
                  {p.unitCount} {p.unitCount === 1 ? 'unit' : 'units'}
                  {p.layouts.length ? ` · ${p.layouts.slice(0, 3).join(', ')}` : ''}
                </Badge>
                <Text fw={600} style={{ whiteSpace: 'nowrap' }}>from {aed(p.fromPriceAed)}</Text>
              </Group>
              {sizeRange && <Text size="xs" c="dimmed" mt={4}>{sizeRange}</Text>}
            </Card>
          );
        })}
      </Stack>
    </ScrollArea>
  );
}
