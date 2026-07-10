import { ScrollArea, Card, Text, Badge, Stack, Group } from '@mantine/core';
import type { OffplanUnit } from './types';

const aed = (n: number) => 'AED ' + Math.round(n).toLocaleString('en-US');

export function OffplanCardRail({ units, onOpen }: { units: OffplanUnit[]; onOpen: (u: OffplanUnit) => void }) {
  return (
    <ScrollArea style={{ height: '100%' }}>
      <Stack p="sm" gap="sm">
        {units.map((u) => (
          <Card key={u.externalId} withBorder shadow="sm" padding="sm" onClick={() => onOpen(u)} style={{ cursor: 'pointer' }}>
            <Text fw={600}>{u.projectName}</Text>
            <Text size="sm" c="dimmed">{u.developerName} · {u.districtName}</Text>
            <Group mt={6} justify="space-between">
              <Badge variant="light">{u.layoutName} · {Math.round(u.squareFt)} sqft</Badge>
              <Text fw={600}>{aed(u.price)}</Text>
            </Group>
          </Card>
        ))}
      </Stack>
    </ScrollArea>
  );
}
