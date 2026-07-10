import { Checkbox, Group, Paper, Stack } from '@mantine/core';
import type { ReactNode } from 'react';

// A row with explicit slots — the LP PageCard generalized. Each surface maps
// its item → these slots; selection is controlled by the parent.
export interface ControlRoomRowSlots {
  seal?: ReactNode; // a <Seal kind=…/>
  title: ReactNode;
  perf?: ReactNode; // a <PerfStrip/>
  freshness?: ReactNode; // a <FreshnessFlag/>
  badge?: ReactNode; // a <SubmissionBadge/>
  actions?: ReactNode; // the adaptive action menu
  onOpen?: () => void;
}

export const ControlRoomRow = ({
  slots,
  selected,
  onToggle,
}: {
  slots: ControlRoomRowSlots;
  selected: boolean;
  onToggle: () => void;
}): ReactNode => (
  <Paper withBorder p="sm" radius="md">
    <Group justify="space-between" wrap="nowrap">
      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
        <Checkbox checked={selected} onChange={onToggle} aria-label="Select row" />
        {slots.seal}
        <div
          style={{ minWidth: 0, cursor: slots.onOpen ? 'pointer' : undefined }}
          onClick={slots.onOpen}
        >
          <Group gap="xs">
            {slots.title}
            {slots.badge}
          </Group>
          {slots.freshness}
        </div>
      </Group>
      <Group gap="lg" wrap="nowrap">
        {slots.perf}
        {slots.actions}
      </Group>
    </Group>
  </Paper>
);

export interface ControlRoomListProps<T> {
  items: T[];
  getId: (item: T) => string;
  selected: Set<string>;
  onToggle: (id: string) => void;
  renderSlots: (item: T) => ControlRoomRowSlots;
  empty?: ReactNode; // an <InvitingEmpty/>
}

export const ControlRoomList = <T,>({
  items,
  getId,
  selected,
  onToggle,
  renderSlots,
  empty,
}: ControlRoomListProps<T>): ReactNode => {
  if (items.length === 0) return <>{empty}</>;
  return (
    <Stack gap="xs">
      {items.map((item) => {
        const id = getId(item);
        return (
          <ControlRoomRow
            key={id}
            slots={renderSlots(item)}
            selected={selected.has(id)}
            onToggle={() => onToggle(id)}
          />
        );
      })}
    </Stack>
  );
};
