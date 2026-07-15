import { Badge, Box, Checkbox, Group, Text, UnstyledButton } from '@mantine/core';
import {
  type InboxThreadRow as InboxThreadRowData,
  type InboxTriageClass,
} from '@/propel/types/inbox';
import { effectiveTriage } from '@/propel/lib/inboxTriage';
import {
  ChannelBadge,
  SurfaceBadge,
} from '@/propel/components/marketingHero/inbox/InboxBits';

// Triage class → a small neutral data tag (red reserved for opportunity = "act").
const ROW_CLASS_META: Record<
  InboxTriageClass,
  { label: string; color: string }
> = {
  OPPORTUNITY: { label: 'opportunity', color: 'red' },
  LEAD: { label: 'lead', color: 'yellow' },
  BROWSER: { label: 'browser', color: 'gray' },
  SPAM: { label: 'spam', color: 'gray' },
  UNKNOWN: { label: '', color: 'gray' }, // unclassified → no badge (degrade quietly)
};

const rowSlaLabel = (ageMs: number | null): string => {
  if (ageMs == null) return '';
  const m = Math.floor(ageMs / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

// One row in the thread list: channel mark, contact name + surface badge + time,
// last-message preview, and an unread count pill. The whole row is a button that
// opens the thread.
export const InboxThreadRow = ({
  row,
  active,
  onClick,
  selected,
  onToggleSelect,
}: {
  row: InboxThreadRowData;
  active: boolean;
  onClick: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) => {
  // Effective class folds in the fork-side FB/IG derivation (DM→opportunity,
  // comment→browser) when the server left a social row UNKNOWN. WhatsApp + already-
  // classified rows pass through unchanged.
  const klass = effectiveTriage(row).triageClass;
  return (
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
      opacity: row.likelyJunk && !selected ? 0.6 : 1,
    }}
  >
    <Checkbox
      size="xs"
      checked={!!selected}
      onChange={() => onToggleSelect?.()}
      onClick={(e) => e.stopPropagation()}
      aria-label="Select conversation"
      style={{ marginTop: 2, flex: 'none' }}
    />
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
      {/* triage enrichment row — class badge · owner/suggested · SLA heat. Each
          token renders only when the row actually carries that signal. */}
      {klass !== 'UNKNOWN' ||
      row.assignedAgentName ||
      row.suggestedAgentName ||
      row.slaBreached ||
      row.ageMs != null ? (
        <Group gap={5} wrap="nowrap" mt={3} style={{ overflow: 'hidden' }}>
          {ROW_CLASS_META[klass].label ? (
            <Badge
              size="xs"
              variant="light"
              color={ROW_CLASS_META[klass].color}
              style={{ flex: 'none' }}
            >
              {ROW_CLASS_META[klass].label}
            </Badge>
          ) : null}
          {row.assignedAgentName ? (
            <Text size="xs" c="dimmed" truncate style={{ minWidth: 0 }}>
              {row.assignedAgentName}
            </Text>
          ) : row.suggestedAgentName ? (
            <Text size="xs" c="dimmed" truncate style={{ minWidth: 0 }}>
              → {row.suggestedAgentName}
            </Text>
          ) : null}
          {row.slaBreached ? (
            <Badge
              size="xs"
              variant="filled"
              color="red"
              style={{ flex: 'none', marginLeft: 'auto' }}
            >
              SLA {rowSlaLabel(row.ageMs)}
            </Badge>
          ) : row.ageMs != null ? (
            <Text
              size="xs"
              fw={700}
              style={{ flex: 'none', marginLeft: 'auto' }}
              c={row.ageMs > 8 * 60_000 ? 'yellow.7' : 'dimmed'}
            >
              {rowSlaLabel(row.ageMs)}
            </Text>
          ) : null}
        </Group>
      ) : null}
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
};
