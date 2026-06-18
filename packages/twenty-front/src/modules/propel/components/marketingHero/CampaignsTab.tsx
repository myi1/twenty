import {
  Badge,
  Box,
  Button,
  Center,
  Drawer,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import {
  IconMail,
  IconMessage,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  type CampaignFilter,
  type ChannelKey,
  type UnifiedRow,
  buildCampaignRows,
  seqStatusTone,
  statusTone,
  titleCase,
} from '@/propel/lib/campaignRows';
import { runMarketingRoute } from '@/propel/lib/marketingHubActions';
import { type MarketingHubPayload } from '@/propel/types/marketingHome';

const ChannelGlyph = ({ channel }: { channel: ChannelKey }) =>
  channel === 'whatsapp' ? (
    <IconMessage size={16} color="var(--mantine-color-green-6)" />
  ) : (
    <IconMail size={16} color="var(--mantine-color-blue-6)" />
  );

const FILTERS: { id: CampaignFilter; label: string }[] = [
  { id: 'all', label: 'Recent' },
  { id: 'draft', label: 'Drafts' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'sending', label: 'Sending' },
  { id: 'sent', label: 'Sent' },
];

// Campaigns tab of the unified Marketing hero — the LIST only, ported from the
// legacy Marketing Cloud CampaignsView (marketing-cloud-campaigns.tsx) into a
// Mantine table. One filterable table across every status (drafts / scheduled /
// sending / sent + sequences), with status pills and per-row sequence
// pause/activate via /marketing/activate-sequence.
//
// DEFERRED: the heavy ~300-LOC campaign detail drill-in (PulseCampaignDetail —
// KPI tiles, funnel, timeline, recipient activity, send/schedule-from-detail,
// retry-failed) is NOT ported in this lane. Instead, a row click:
//   • draft (no listing)  → opens the editable campaign builder page
//   • sequence            → opens the sequence editor page
//   • everything else      → opens a lightweight read-only summary drawer built
//                            from the row data we already have (no extra fetch)
// The full detail port is the FOLLOW-UP needed to retire the legacy. See the TODO
// at the bottom of this file.
export const CampaignsTab = ({
  payload,
  isLoading,
  reload,
}: {
  payload: MarketingHubPayload | null;
  isLoading: boolean;
  reload: () => void;
}) => {
  const navigate = useNavigate();
  const notify = usePropelToast();
  const [filter, setFilter] = useState<CampaignFilter>('all');
  const [seqBusy, setSeqBusy] = useState<string | null>(null);
  const [summaryRow, setSummaryRow] = useState<UnifiedRow | null>(null);

  const rows = useMemo(
    () => (payload ? buildCampaignRows(payload) : []),
    [payload],
  );
  const counts = useMemo(() => {
    const c: Record<CampaignFilter, number> = {
      all: rows.length,
      draft: 0,
      scheduled: 0,
      sending: 0,
      sent: 0,
    };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);
  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  const runSeqAction = async (id: string, action: 'activate' | 'pause') => {
    if (seqBusy !== null) return;
    setSeqBusy(id);
    const outcome = await runMarketingRoute('/marketing/activate-sequence', {
      sequenceId: id,
      action,
    });
    setSeqBusy(null);
    if (outcome.ok) {
      notify(action === 'activate' ? 'Sequence activated.' : 'Sequence paused.', 'success');
      reload();
    } else {
      notify(outcome.message, 'error');
    }
  };

  // A draft (no listing) opens the editable builder; a sequence opens its editor;
  // everything live/sent opens the lightweight read-only summary drawer.
  const openRow = (r: UnifiedRow) => {
    if (r.kind === 'sequence') {
      navigate(AppPath.MarketingSequenceEditor);
    } else if (r.status === 'draft' && r.hasListing !== true) {
      navigate(AppPath.MarketingCampaignBuilder);
    } else {
      setSummaryRow(r);
    }
  };

  const newCampaign = () => navigate(AppPath.MarketingCampaignBuilder);

  if (isLoading && payload === null) {
    return (
      <Center mih={320}>
        <Loader color="red" />
      </Center>
    );
  }

  return (
    <Box p="md">
      <Stack gap={2} mb="sm">
        <Title order={4}>Campaigns</Title>
        <Text size="sm" c="dimmed">
          Recent activity across every status — drafts, scheduled, sending, sent,
          and sequences.
        </Text>
      </Stack>

      <Group justify="space-between" align="center" mb="md" wrap="wrap">
        <Group gap="xs" wrap="wrap">
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              size="compact-sm"
              variant={filter === f.id ? 'filled' : 'default'}
              color={filter === f.id ? 'red' : undefined}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <Text component="span" size="xs" ml={6} style={{ opacity: 0.7 }}>
                {counts[f.id]}
              </Text>
            </Button>
          ))}
        </Group>
        <Button
          color="red"
          size="compact-sm"
          leftSection={<IconPlus size={14} />}
          onClick={newCampaign}
        >
          New campaign
        </Button>
      </Group>

      {rows.length === 0 ? (
        <Center mih={220}>
          <Stack align="center" gap={6} maw={360}>
            <Title order={5}>No campaigns yet</Title>
            <Text size="sm" c="dimmed" ta="center">
              Create your first campaign to reach your contacts by email or
              WhatsApp.
            </Text>
            <Button
              mt="xs"
              color="red"
              leftSection={<IconPlus size={14} />}
              onClick={newCampaign}
            >
              New campaign
            </Button>
          </Stack>
        </Center>
      ) : shown.length === 0 ? (
        <Text size="sm" c="dimmed" py="lg">
          No campaigns match this filter.
        </Text>
      ) : (
        <Table highlightOnHover verticalSpacing="sm" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Audience</Table.Th>
              <Table.Th ta="right">Performance</Table.Th>
              <Table.Th>When</Table.Th>
              <Table.Th ta="right">Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shown.map((r) => {
              const isDraftEditable =
                r.kind === 'campaign' &&
                r.status === 'draft' &&
                r.hasListing !== true;
              const seq = r.seq;
              return (
                <Table.Tr
                  key={`${r.status}-${r.id}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => openRow(r)}
                >
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                      <ChannelGlyph channel={r.channel} />
                      <Text size="sm" fw={600} truncate>
                        {r.name}
                      </Text>
                      {r.kind === 'sequence' ? (
                        <Badge size="xs" variant="light" color="gray">
                          Sequence
                        </Badge>
                      ) : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {r.audience}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" c="dimmed" ff="monospace">
                      {r.perf}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed" ff="monospace">
                      {r.when || '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="sm" justify="flex-end" wrap="nowrap">
                      {r.kind === 'sequence' &&
                      seq?.status === 'RUNNING' ? (
                        <Button
                          size="compact-xs"
                          variant="default"
                          leftSection={<IconPlayerPause size={13} />}
                          loading={seqBusy === r.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void runSeqAction(r.id, 'pause');
                          }}
                        >
                          Pause
                        </Button>
                      ) : r.kind === 'sequence' &&
                        (seq?.status === 'DRAFT' ||
                          seq?.status === 'PAUSED') ? (
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="red"
                          leftSection={<IconPlayerPlay size={13} />}
                          loading={seqBusy === r.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void runSeqAction(r.id, 'activate');
                          }}
                        >
                          Activate
                        </Button>
                      ) : isDraftEditable ? (
                        <Group gap={4} c="blue">
                          <IconPencil size={13} />
                          <Text size="xs" fw={600}>
                            Edit
                          </Text>
                        </Group>
                      ) : null}
                      {r.kind === 'sequence' ? (
                        <Badge
                          variant="light"
                          color={seqStatusTone(seq?.status ?? '')}
                        >
                          {titleCase(seq?.status ?? '')}
                        </Badge>
                      ) : (
                        <Badge variant="light" color={statusTone(r.status)}>
                          {r.statusLabel}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}

      {/* Lightweight read-only summary drawer (live/sent/scheduled rows) — built
          from the row we already have; the full detail drill-in is deferred. */}
      <Drawer
        opened={summaryRow !== null}
        onClose={() => setSummaryRow(null)}
        position="right"
        size="md"
        title={summaryRow?.name ?? ''}
        zIndex={5000}
      >
        {summaryRow ? (
          <Stack gap="md">
            <Group gap="xs">
              <ChannelGlyph channel={summaryRow.channel} />
              <Badge variant="light" color={statusTone(summaryRow.status)}>
                {summaryRow.statusLabel}
              </Badge>
            </Group>
            <SummaryField label="Audience" value={summaryRow.audience} />
            <SummaryField label="Performance" value={summaryRow.perf} />
            <SummaryField label="When" value={summaryRow.when || '—'} />
            <Text size="xs" c="dimmed">
              Full campaign analytics (funnel, recipient activity, retry, send /
              schedule) are coming with the detail view port.
            </Text>
          </Stack>
        ) : null}
      </Drawer>
    </Box>
  );
};

const SummaryField = ({ label, value }: { label: string; value: string }) => (
  <Box>
    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
      {label}
    </Text>
    <Text size="sm">{value}</Text>
  </Box>
);

// TODO(campaign-detail-port): port the legacy PulseCampaignDetail
// (marketing-cloud-campaigns.tsx) — POST /marketing/campaign-detail drill-in with
// KPI tiles, conversion funnel, timeline, recipient activity (reply→Call
// deep-link), A/B summary, problem box + /marketing/retry-failed, and the
// send/schedule-from-detail controls (/marketing/send-request,
// /marketing/save-campaign) that un-strand a listing-promo draft. Needed for full
// parity before the legacy Campaigns surface can be retired.
