import { Badge, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconFlag,
} from 'twenty-ui/display';
import { type AgentActivityRow } from '@/propel/mocks/websiteMockData';

// "Agents at work" activity feed — Overview sub-tab (spec §6). One row per
// AgentActivityRow; status drives the icon/color per CONVENTIONS.md:
//   RUNNING = spinner, DONE = check, NEEDS_REVIEW = founder's action queue,
//   FAILED = red alert.

const STATUS_META: Record<
  AgentActivityRow['status'],
  { color: 'blue' | 'teal' | 'yellow' | 'red'; label: string }
> = {
  RUNNING: { color: 'blue', label: 'Running' },
  DONE: { color: 'teal', label: 'Done' },
  NEEDS_REVIEW: { color: 'yellow', label: 'Needs review' },
  FAILED: { color: 'red', label: 'Failed' },
};

const StatusIcon = ({ status }: { status: AgentActivityRow['status'] }) => {
  if (status === 'RUNNING') return <Loader size={14} color="blue" />;
  if (status === 'DONE') return <IconCheck size={16} color="var(--mantine-color-teal-6)" />;
  if (status === 'NEEDS_REVIEW')
    return <IconFlag size={16} color="var(--mantine-color-yellow-6)" />;
  return <IconAlertTriangle size={16} color="var(--mantine-color-red-6)" />;
};

export const AgentActivityFeed = ({ rows }: { rows: AgentActivityRow[] }) => {
  if (rows.length === 0) {
    return (
      <Paper withBorder p="xl" radius="md" style={{ borderStyle: 'dashed' }}>
        <Text c="dimmed" ta="center">
          No agent activity yet.
        </Text>
      </Paper>
    );
  }

  return (
    <Stack gap="xs">
      {rows.map((row) => {
        const meta = STATUS_META[row.status];
        return (
          <Paper key={row.id} withBorder radius="md" p="sm">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Group gap="sm" align="flex-start" wrap="nowrap">
                <StatusIcon status={row.status} />
                <Stack gap={2}>
                  <Group gap={6}>
                    <Text size="sm" fw={600}>
                      {row.agentLabel}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {row.action}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {row.detail}
                  </Text>
                </Stack>
              </Group>
              <Group gap={8} wrap="nowrap">
                <Badge color={meta.color} variant="light" radius="sm">
                  {meta.label}
                </Badge>
                <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                  {row.whenLabel}
                </Text>
              </Group>
            </Group>
          </Paper>
        );
      })}
    </Stack>
  );
};
