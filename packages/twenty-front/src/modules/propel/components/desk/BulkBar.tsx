import { Button, Group, Paper, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export interface BulkAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

// Appears on selection. Common verbs (compare/export/archive) are passed by
// each surface; shown only when count > 0.
export const BulkBar = ({
  count,
  actions,
  onClear,
}: {
  count: number;
  actions: BulkAction[];
  onClear: () => void;
}): ReactNode => {
  if (count === 0) return null;
  return (
    <Paper withBorder p="xs" radius="md" mb="sm">
      <Group justify="space-between">
        <Text fz="sm" fw={600}>
          {count} selected
        </Text>
        <Group gap="xs">
          {actions.map((a) => (
            <Button
              key={a.label}
              size="xs"
              variant="light"
              color={a.danger === true ? 'red' : 'gray'}
              onClick={a.onClick}
            >
              {a.label}
            </Button>
          ))}
          <Button size="xs" variant="subtle" onClick={onClear}>
            Clear
          </Button>
        </Group>
      </Group>
    </Paper>
  );
};
