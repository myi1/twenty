import {
  Badge,
  Box,
  Button,
  Center,
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
import { CampaignDetail } from '@/propel/components/marketingHero/CampaignDetail';
import { CampaignReviewPanel } from '@/propel/components/marketingHero/CampaignReviewPanel';
import { CampaignSpinePanel } from '@/propel/components/marketingHero/CampaignSpinePanel';
import { ProposedCampaignsQueue } from '@/propel/components/marketingHero/ProposedCampaignsQueue';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { type SpineArm } from '@/propel/lib/campaignSpineCrm';
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

// Campaigns tab of the unified Marketing hero — the LIST, ported from the legacy
// Marketing Cloud CampaignsView (marketing-cloud-campaigns.tsx) into a Mantine
// table. One filterable table across every status (drafts / scheduled / sending /
// sent + sequences), with status pills and per-row sequence pause/activate via
// /marketing/activate-sequence.
//
// A row click:
//   • draft (no listing)  → opens the editable campaign builder page
//   • sequence            → opens the sequence editor page
//   • everything live/sent → opens the rich CampaignDetail surface (full drill-in,
//                            replacing the old lightweight summary drawer) — KPI
//                            tiles, conversion funnel, send timeline, recipient
//                            activity (reply→Call), A/B summary, problem box, and
//                            the retry-failed action, fed by POST
//                            /marketing/campaign-detail.
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
  // When set, the tab swaps the list for the full CampaignDetail drill-in.
  const [detailId, setDetailId] = useState<string | null>(null);
  // Campaign Spine (CS4) — a fresh multi-channel campaign under review. `failed`
  // carries any arm the generate reported as partial-failed, so the review can
  // mark that card "generation failed" instead of silently omitting it.
  const [spineReview, setSpineReview] = useState<{
    id: string;
    failed: SpineArm[];
  } | null>(null);
  // V3 — bump to force the Proposed-by-Scout queue to re-fetch (after a review
  // changes a proposal or a manual campaign is created/reviewed).
  const [proposedRefresh, setProposedRefresh] = useState(0);

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

  // S6 — every DRAFT (listing-backed or not) opens the editable builder, deep-
  // linked to that draft via ?edit=<id> so its fields re-hydrate (a listing draft
  // re-runs the permit gate in place instead of the old read-only escape hatch).
  // A sequence opens its editor; everything live/sent opens the rich
  // CampaignDetail drill-in (replacing the old lightweight summary drawer).
  const openRow = (r: UnifiedRow) => {
    if (r.kind === 'sequence') {
      navigate(AppPath.MarketingSequenceEditor);
    } else if (r.status === 'draft') {
      navigate(`${AppPath.MarketingCampaignBuilder}?edit=${encodeURIComponent(r.id)}`);
    } else {
      setDetailId(r.id);
    }
  };

  const newCampaign = () => navigate(AppPath.MarketingCampaignBuilder);

  // The detail drill-in fully takes over the tab body (mirrors the legacy
  // CampaignsView, which swapped the list for PulseCampaignDetail). On back, a
  // mutation (retry) reloads the list before showing it again.
  if (detailId !== null) {
    return (
      <CampaignDetail
        campaignId={detailId}
        onBack={(changed) => {
          setDetailId(null);
          if (changed === true) reload();
        }}
      />
    );
  }

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

      {/* V3 — whole campaigns the landing-scout cron proposed, awaiting review */}
      <ProposedCampaignsQueue
        refreshSignal={proposedRefresh}
        onReview={(id) => setSpineReview({ id, failed: [] })}
      />

      {/* Campaign Spine v1 (CS4) — one brief → LP + social arms in review */}
      <CampaignSpinePanel
        onCampaignCreated={(id, failed) => setSpineReview({ id, failed })}
      />
      <CampaignReviewPanel
        campaignId={spineReview?.id ?? null}
        failedArms={spineReview?.failed ?? []}
        onClose={() => setSpineReview(null)}
        onChanged={() => {
          reload();
          setProposedRefresh((n) => n + 1);
        }}
        onRegenerated={(id, failed) => setSpineReview({ id, failed })}
      />

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
              // S6 — every draft is editable now (listing drafts re-edit in
              // place via the listing-aware builder), so the "Edit" affordance
              // shows for all campaign drafts regardless of a listing.
              const isDraftEditable =
                r.kind === 'campaign' && r.status === 'draft';
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
    </Box>
  );
};
