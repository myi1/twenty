import { Box, Group, Text, UnstyledButton } from '@mantine/core';
import { type InboxThreadRow as InboxThreadRowData } from '@/propel/types/inbox';
import {
  ChannelBadge,
  SurfaceBadge,
} from '@/propel/components/marketingHero/inbox/InboxBits';

// One row in the thread list: channel mark, contact name + surface badge + time,
// last-message preview, and an unread count pill. The whole row is a button that
// opens the thread.
export const InboxThreadRow = ({
  row,
  active,
  onClick,
}: {
  row: InboxThreadRowData;
  active: boolean;
  onClick: () => void;
}) => (
  <UnstyledButton
    onClick={onClick}
    style={{
      width: '100%',
      textAlign: 'left',
      borderBottom: '1px solid var(--mantine-color-default-border)',
      background: active ? 'var(--mantine-color-red-light)' : 'transparent',
      padding: '12px 14px',
      display: 'flex',
      gap: 11,
      alignItems: 'flex-start',
    }}
  >
    <ChannelBadge channel={row.channel} />
    <Box style={{ flex: 1, minWidth: 0 }}>
      <Group gap={6} wrap="nowrap">
        <Text
          size="sm"
          fw={600}
          style={{
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {row.title}
        </Text>
        <SurfaceBadge channel={row.channel} surface={row.surface} />
        {row.whenLabel ? (
          <Text size="xs" c="dimmed" style={{ flex: 'none' }}>
            {row.whenLabel}
          </Text>
        ) : null}
      </Group>
      <Group gap={6} wrap="nowrap" mt={2}>
        <Text
          size="sm"
          c="dimmed"
          style={{
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {row.preview || '—'}
        </Text>
        {row.unreadCount > 0 ? (
          <Box
            style={{
              flex: 'none',
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 999,
              background: 'var(--mantine-color-red-6)',
              color: '#fff',
              fontSize: 10.5,
              fontWeight: 700,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {row.unreadCount}
          </Box>
        ) : null}
      </Group>
    </Box>
  </UnstyledButton>
);
