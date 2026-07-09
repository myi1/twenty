import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconRefresh,
  IconUsers,
} from 'twenty-ui/icon';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  type EnrollmentRow,
  type EnrollmentStatus,
  type SequenceEnrollmentsResponse,
} from '@/propel/types/sequenceEditor';

// S4 — sequence-enrollment read surface (design critique (f) / decision D-4,
// read-only v1). Once a sequence is RUNNING (or PAUSED) there was NO way to see
// WHO is in it, at which step, what's next, or who is stuck on a cap — the data
// all lives on `sequenceEnrollment` but was never rendered. This panel is the
// sequence analog of the campaign's recipient-activity: a read-only list of the
// active enrollments, each with its current step, next-action time, and a
// stuck-on-cap flag.
//
// ── BACKEND TODO ─────────────────────────────────────────────────────────────
// TODO(S4-backend): /marketing/sequence-enrollments does NOT exist yet. The
// /marketing/hub route returns only aggregate enrolledCount/activeCount totals,
// not the per-enrollment rows. A thin Manager/Admin-gated read route is needed
// (propel-crm-integration: src/logic-functions/marketing-sequence-enrollments-route.ts):
//   body  : { sequenceId, status?: 'ACTIVE' (default), limit?: 100 }
//   query : sequenceEnrollments filter sequenceId=eq, ordered by nextActionAt asc,
//           selecting id, status, capRetries, stepEnteredAt, nextActionAt,
//           person { id, name }, currentStep { name, stepOrder }
//   return: { ok, enrollments: EnrollmentRow[], activeCount, enrolledCount }
// Until that lands this panel renders its honest "couldn't load" / empty states
// (the route call returns null → error state), so it ships dark-safe.
const ENROLLMENTS_ROUTE = '/marketing/sequence-enrollments';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'loaded';
      rows: EnrollmentRow[];
      activeCount: number | null;
      enrolledCount: number | null;
    };

const STATUS_META: Record<
  EnrollmentStatus,
  { label: string; color: string }
> = {
  ACTIVE: { label: 'Active', color: 'green' },
  DONE: { label: 'Done', color: 'blue' },
  EXITED_REPLY: { label: 'Replied — exited', color: 'teal' },
  EXITED_OPTOUT: { label: 'Opted out', color: 'red' },
  EXITED_MANUAL: { label: 'Removed', color: 'gray' },
  EXITED_COLD: { label: 'Went cold', color: 'orange' },
  EXITED_THROTTLED: { label: 'Stopped by caps', color: 'yellow' },
  BLOCKED_CONFIG: { label: 'Blocked (config)', color: 'red' },
};

// Asia/Dubai relative time, honest about both directions: a past nextActionAt is
// "overdue" (the tick cron will pick it up), a future one is "in N". Absolute
// fallback for anything beyond a week so the read stays meaningful.
const TZ = 'Asia/Dubai';
const relativeTime = (iso: string | null): string => {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const diffMs = t - Date.now();
  const past = diffMs < 0;
  const mins = Math.round(Math.abs(diffMs) / 60000);
  if (mins < 1) return past ? 'now' : 'any moment';
  const hours = Math.round(mins / 60);
  const days = Math.round(hours / 24);
  let span: string;
  if (mins < 60) span = `${mins}m`;
  else if (hours < 24) span = `${hours}h`;
  else if (days <= 7) span = `${days}d`;
  else
    return new Date(t).toLocaleDateString('en-GB', {
      timeZone: TZ,
      day: 'numeric',
      month: 'short',
    });
  return past ? `${span} overdue` : `in ${span}`;
};

export const EnrollmentList = ({ sequenceId }: { sequenceId: string }) => {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const res = await callPropelRoute<SequenceEnrollmentsResponse>(
      ENROLLMENTS_ROUTE,
      { sequenceId, status: 'ACTIVE' },
    );
    // Honest: a null/errored response (incl. the not-yet-built route) → 'error'
    // ("couldn't load"), never a fabricated empty list. Only a well-formed ok
    // payload with an enrollments array is trusted.
    if (res && res.ok === true && Array.isArray(res.enrollments)) {
      setState({
        kind: 'loaded',
        rows: res.enrollments,
        activeCount:
          typeof res.activeCount === 'number' ? res.activeCount : null,
        enrolledCount:
          typeof res.enrolledCount === 'number' ? res.enrolledCount : null,
      });
    } else {
      setState({ kind: 'error' });
    }
  }, [sequenceId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" align="center" mb="sm" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <IconUsers size={16} style={{ color: 'var(--mantine-color-red-6)' }} />
          <Text size="sm" fw={700} c="var(--mantine-color-text)">
            Who&rsquo;s enrolled
          </Text>
          {state.kind === 'loaded' && state.activeCount != null && (
            <Badge size="sm" variant="light" color="gray">
              {state.activeCount} active
              {state.enrolledCount != null
                ? ` / ${state.enrolledCount} total`
                : ''}
            </Badge>
          )}
        </Group>
        <Button
          size="compact-xs"
          variant="default"
          leftSection={<IconRefresh size={13} />}
          loading={state.kind === 'loading'}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </Group>

      {state.kind === 'loading' && (
        <Center py="lg">
          <Group gap="xs">
            <Loader size="xs" color="gray" />
            <Text size="xs" c="dimmed">
              Loading who&rsquo;s in this sequence…
            </Text>
          </Group>
        </Center>
      )}

      {state.kind === 'error' && (
        <Group gap="xs" wrap="nowrap" align="flex-start" py="sm">
          <IconAlertTriangle
            size={16}
            color="var(--mantine-color-yellow-7)"
            style={{ flex: 'none', marginTop: 1 }}
          />
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              Couldn&rsquo;t load the enrollment list right now. The sequence is
              still running — its steps fire on schedule regardless.
            </Text>
            <Anchor component="button" type="button" size="xs" c="red" onClick={() => void load()}>
              Try again
            </Anchor>
          </Stack>
        </Group>
      )}

      {state.kind === 'loaded' && state.rows.length === 0 && (
        <Group gap="xs" wrap="nowrap" py="sm">
          <IconUsers size={16} color="var(--mantine-color-dimmed)" />
          <Text size="xs" c="dimmed">
            No one is actively enrolled right now. People enter as the entry rule
            matches them; anyone who replied or finished has already left.
          </Text>
        </Group>
      )}

      {state.kind === 'loaded' && state.rows.length > 0 && (
        <Box style={{ overflowX: 'auto' }}>
          <Table fz="xs" verticalSpacing={6} highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Person</Table.Th>
                <Table.Th>Current step</Table.Th>
                <Table.Th>Next action</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {state.rows.map((r) => (
                <EnrollmentRowView
                  key={r.id}
                  row={r}
                  onOpenPerson={(pid) => navigate(`/object/person/${pid}`)}
                />
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}
    </Card>
  );
};

const EnrollmentRowView = ({
  row,
  onOpenPerson,
}: {
  row: EnrollmentRow;
  onOpenPerson: (personId: string) => void;
}) => {
  const meta = STATUS_META[row.status] ?? { label: row.status, color: 'gray' };
  // "Stuck" = the SEND step has been held by the weekly cap at least once. The
  // object exits at 3 retries (EXITED_THROTTLED); before that it's still ACTIVE
  // but worth flagging so the coordinator sees why it isn't advancing.
  const stuck = row.status === 'ACTIVE' && row.capRetries > 0;
  const personLabel =
    row.personName.trim() || (row.personId ? 'Unnamed contact' : '—');

  return (
    <Table.Tr>
      <Table.Td>
        {row.personId ? (
          <Anchor
            component="button"
            type="button"
            fz="xs"
            c="red"
            onClick={() => onOpenPerson(row.personId as string)}
            style={{ textAlign: 'left' }}
          >
            {personLabel}
          </Anchor>
        ) : (
          <Text fz="xs" c="dimmed">
            {personLabel}
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        {row.currentStepName ? (
          <Text fz="xs" c="var(--mantine-color-text)">
            {row.currentStepOrder != null ? `${row.currentStepOrder}. ` : ''}
            {row.currentStepName}
          </Text>
        ) : (
          <Text fz="xs" c="dimmed">
            —
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          <Text
            fz="xs"
            c={
              row.nextActionAt && Date.parse(row.nextActionAt) < Date.now()
                ? 'var(--mantine-color-yellow-7)'
                : 'dimmed'
            }
          >
            {relativeTime(row.nextActionAt)}
          </Text>
          {stuck && (
            <Badge
              size="xs"
              variant="light"
              color="yellow"
              leftSection={<IconAlertTriangle size={10} />}
              title={`Held by the weekly cap ${row.capRetries} time${
                row.capRetries === 1 ? '' : 's'
              }`}
            >
              stuck
            </Badge>
          )}
        </Group>
      </Table.Td>
      <Table.Td>
        <Badge size="xs" variant="light" color={meta.color}>
          {meta.label}
        </Badge>
      </Table.Td>
    </Table.Tr>
  );
};
