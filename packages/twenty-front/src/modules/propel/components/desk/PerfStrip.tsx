import { Group, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { formatPerfValue, type PerfKind } from './deskLogic';

export interface PerfItem {
  label: string;
  value: number | null | undefined;
  kind: PerfKind;
}

// The outcome micro-read — visits→conv (LP), sent→open%→click%→revenue
// (campaign), impressions→engagement (social). One component, per-surface data.
export const PerfStrip = ({
  items,
  currency = 'AED',
}: {
  items: PerfItem[];
  currency?: string;
}): ReactNode => (
  <Group gap="lg" wrap="nowrap">
    {items.map((it) => (
      <div key={it.label}>
        <Text fz={10} fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.08em' }}>
          {it.label}
        </Text>
        <Text fz="sm" fw={600}>
          {formatPerfValue(it.value, it.kind, currency)}
        </Text>
      </div>
    ))}
  </Group>
);
