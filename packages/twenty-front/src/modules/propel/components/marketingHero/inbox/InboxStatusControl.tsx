import { useState } from 'react';
import {
  Button,
  Divider,
  Group,
  Popover,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconCheck, IconClock, IconArrowBackUp } from 'twenty-ui/display';
import { type InboxStatusAction } from '@/propel/types/inbox';
import {
  SNOOZE_PRESETS,
  resolveSnoozePreset,
  snoozeUntilLabel,
  tabForStatus,
  validateSnoozeInstant,
} from '@/propel/lib/inboxStatusCore';

// The per-thread status control in the conversation header: Done / Snooze / Reopen.
// Renders the affordances that make sense for the thread's current tab:
//   • Open    → [Snooze ▾] [Done]
//   • Snoozed → "Snoozed · <when>"  [Reopen] [Done]
//   • Done    → "Resolved"          [Reopen]
// The Snooze popover offers presets (Later today / Tomorrow / Next week) plus a
// pick-a-date input; every action is optimistic upstream, so this component only
// fires the intent and shows a busy state.
export const InboxStatusControl = ({
  status,
  snoozeUntil,
  busy,
  onAction,
}: {
  status: string;
  snoozeUntil: string | null;
  busy: boolean;
  onAction: (action: InboxStatusAction, snoozeUntil?: string) => void;
}) => {
  const tab = tabForStatus(status, snoozeUntil);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  // datetime-local string ("YYYY-MM-DDTHH:mm", local tz) for the pick-a-date path.
  const [customWhen, setCustomWhen] = useState('');
  const [customErr, setCustomErr] = useState<string | null>(null);

  const doSnooze = (iso: string) => {
    setSnoozeOpen(false);
    setCustomErr(null);
    onAction('snooze', iso);
  };

  const confirmCustom = () => {
    // datetime-local has no timezone — interpret as local, which new Date() does.
    const v = validateSnoozeInstant(customWhen ? new Date(customWhen) : null);
    if (!v.ok) {
      setCustomErr(v.reason);
      return;
    }
    doSnooze(v.iso);
    setCustomWhen('');
  };

  const SnoozeMenu = (
    <Popover
      opened={snoozeOpen}
      onChange={setSnoozeOpen}
      position="bottom-end"
      offset={6}
      shadow="md"
      width={240}
      withinPortal
      trapFocus
    >
      <Popover.Target>
        <Button
          size="compact-sm"
          variant="default"
          leftSection={<IconClock size={14} />}
          disabled={busy}
          onClick={() => setSnoozeOpen((o) => !o)}
        >
          Snooze
        </Button>
      </Popover.Target>
      <Popover.Dropdown p={8}>
        <Stack gap={4}>
          {SNOOZE_PRESETS.map((p) => (
            <Button
              key={p.id}
              size="compact-sm"
              variant="subtle"
              color="gray"
              justify="space-between"
              rightSection={
                <Text size="xs" c="dimmed">
                  {p.hint}
                </Text>
              }
              onClick={() => doSnooze(resolveSnoozePreset(p.id))}
              styles={{ inner: { justifyContent: 'space-between', width: '100%' } }}
            >
              {p.label}
            </Button>
          ))}
          <Divider my={2} />
          <Text size="xs" c="dimmed" fw={600}>
            Pick a date &amp; time
          </Text>
          <TextInput
            type="datetime-local"
            size="xs"
            value={customWhen}
            onChange={(e) => {
              setCustomWhen(e.currentTarget.value);
              if (customErr) setCustomErr(null);
            }}
            aria-label="Snooze until date and time"
          />
          {customErr ? (
            <Text size="xs" c="red">
              {customErr}
            </Text>
          ) : null}
          <Button
            size="compact-sm"
            color="red"
            disabled={!customWhen}
            onClick={confirmCustom}
          >
            Snooze until this
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );

  if (tab === 'DONE') {
    return (
      <Group gap={7} wrap="nowrap" style={{ flex: 'none' }}>
        <Text size="xs" c="green" fw={600} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconCheck size={13} /> Resolved
        </Text>
        <Button
          size="compact-sm"
          variant="default"
          leftSection={<IconArrowBackUp size={14} />}
          disabled={busy}
          loading={busy}
          onClick={() => onAction('reopen')}
        >
          Reopen
        </Button>
      </Group>
    );
  }

  if (tab === 'SNOOZED') {
    return (
      <Group gap={7} wrap="nowrap" style={{ flex: 'none' }}>
        <Text
          size="xs"
          c="dimmed"
          fw={600}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
          title={snoozeUntilLabel(snoozeUntil)}
        >
          <IconClock size={13} /> Snoozed · {snoozeUntilLabel(snoozeUntil) || 'later'}
        </Text>
        <Button
          size="compact-sm"
          variant="default"
          leftSection={<IconArrowBackUp size={14} />}
          disabled={busy}
          onClick={() => onAction('reopen')}
        >
          Reopen
        </Button>
        <Button
          size="compact-sm"
          color="red"
          leftSection={<IconCheck size={14} />}
          disabled={busy}
          onClick={() => onAction('done')}
        >
          Done
        </Button>
      </Group>
    );
  }

  // OPEN (NEW / OPEN / WAITING / overdue-snooze)
  return (
    <Group gap={7} wrap="nowrap" style={{ flex: 'none' }}>
      {SnoozeMenu}
      <Button
        size="compact-sm"
        color="red"
        leftSection={<IconCheck size={14} />}
        disabled={busy}
        loading={busy}
        onClick={() => onAction('done')}
      >
        Done
      </Button>
    </Group>
  );
};
