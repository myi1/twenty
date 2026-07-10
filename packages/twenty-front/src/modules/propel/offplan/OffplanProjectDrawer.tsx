import { Drawer, Tabs, Text, Stack, Title } from '@mantine/core';
import { OffplanGeneratePanel } from './OffplanGeneratePanel';
import type { OffplanUnit } from './types';

const aed = (n: number) => 'AED ' + Math.round(n).toLocaleString('en-US');

export function OffplanProjectDrawer({ unit, onClose }: { unit: OffplanUnit | null; onClose: () => void }) {
  return (
    <Drawer opened={!!unit} onClose={onClose} position="right" size={640} title={unit?.projectName ?? ''}>
      {unit && (
        <Tabs defaultValue="info">
          <Tabs.List>
            <Tabs.Tab value="info">Information</Tabs.Tab>
            <Tabs.Tab value="generate">Generate pitch</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="info" pt="sm">
            <Stack gap={4}>
              <Title order={4}>{unit.projectName}</Title>
              <Text c="dimmed">{unit.developerName} · {unit.districtName}</Text>
              <Text>{unit.layoutName} · {Math.round(unit.squareFt)} sqft · {aed(unit.price)}</Text>
              <Text size="sm" c="dimmed">{aed(unit.pricePerSqft)} / sqft</Text>
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="generate" pt="sm">
            <OffplanGeneratePanel unit={unit} />
          </Tabs.Panel>
        </Tabs>
      )}
    </Drawer>
  );
}
