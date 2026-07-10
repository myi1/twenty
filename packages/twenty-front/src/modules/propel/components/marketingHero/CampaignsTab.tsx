import {
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconMail,
  IconMessage,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconSend,
  type IconComponent,
} from 'twenty-ui/display';
import {
  AttributionLink,
  clickableCard,
  InvitingEmpty,
  KanbanBoard,
  KanbanColumn,
  PerfStrip,
  Seal,
  statusSeal,
  stop,
  SurfaceIntro,
  type PerfItem,
} from '@/propel/components/desk';
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

// The board lanes — the campaign lifecycle as columns, keyed on the SAME
// UnifiedRow.status the old filter chips used (draft → scheduled → sending → sent).
// These four are the reachable states in the hub payload; the server's finer enum
// (SEND_REQUESTED / MATERIALIZING fold into "sending"; FAILED / CANCELLED surface
// in the drill-in) has no separate bucket here. Approval lives on the Spine side —
// the Proposed queue + review panel above the board — so there's no maker-checker
// column on the send list. Mirrors the Blog newsroom's column grammar.
const CAMPAIGN_LANES: {
  id: Exclude<CampaignFilter, 'all'>;
  title: string;
  Icon: IconComponent;
  emptyTitle: string;
  emptyMessage: string;
}[] = [
  {
    id: 'draft',
    title: 'Draft',
    Icon: IconPencil,
    emptyTitle: 'No drafts',
    emptyMessage: 'Start a campaign and it waits here until you send or schedule it.',
  },
  {
    id: 'scheduled',
    title: 'Scheduled',
    Icon: IconCalendar,
    emptyTitle: 'Nothing scheduled',
    emptyMessage: 'Campaigns queued for a future send land here.',
  },
  {
    id: 'sending',
    title: 'Sending',
    Icon: IconSend,
    emptyTitle: 'Nothing sending',
    emptyMessage: 'Live sends show here while they work through the audience.',
  },
  {
    id: 'sent',
    title: 'Sent',
    Icon: IconCheck,
    emptyTitle: 'No sends yet',
    emptyMessage: 'Completed campaigns settle here with their open / click / reply rates.',
  },
];

const perfItemsFor = (r: UnifiedRow): PerfItem[] => {
  const seq = r.seq;
  if (r.kind === 'sequence' && seq) {
    return [
      { label: 'Enrolled', value: seq.enrolledCount, kind: 'count' },
      { label: 'Active', value: seq.activeCount, kind: 'count' },
    ];
  }
  if (r.status === 'sent') {
    return [
      { label: 'Open', value: r.openRate ?? null, kind: 'pct' },
      { label: 'Click', value: r.clickRate ?? null, kind: 'pct' },
      { label: 'Reply', value: r.replies ?? null, kind: 'count' },
    ];
  }
  if (r.status === 'sending' && typeof r.sentCount === 'number') {
    return [{ label: 'Sent', value: r.sentCount, kind: 'count' }];
  }
  return [];
};

// One campaign/sequence card — the newsroom card grammar (Seal + stage label +
// title, then audience / perf / when, then the inline lifecycle action). Whole card
// opens the row (draft → builder w/ the AI copy+layout editor, sequence → editor,
// live/sent → CampaignDetail); inner Pause/Activate withhold that click via stop().
const CampaignCard = ({
  r,
  onOpen,
  onDrill,
  seqBusy,
  onSeqAction,
}: {
  r: UnifiedRow;
  onOpen: () => void;
  onDrill: (id: string) => void;
  seqBusy: string | null;
  onSeqAction: (id: string, action: 'activate' | 'pause') => void;
}) => {
  const seq = r.seq;
  const perfItems = perfItemsFor(r);
  const isDraftEditable = r.kind === 'campaign' && r.status === 'draft';
  const stageLabel =
    r.kind === 'sequence' ? titleCase(seq?.status ?? '') : r.statusLabel;
  return (
    <Paper withBorder radius="md" p="md" {...clickableCard(onOpen)}>
      <Stack gap="xs">
        <Group gap={8} wrap="nowrap" align="center">
          <Seal kind={statusSeal(r.kind === 'sequence' ? (seq?.status ?? '') : r.status)} />
          <ChannelGlyph channel={r.channel} />
          <Text
            size="xs"
            c="dimmed"
            fw={600}
            tt="uppercase"
            style={{ letterSpacing: '0.04em' }}
          >
            {stageLabel}
          </Text>
          {r.kind === 'sequence' ? (
            <Badge size="xs" variant="light" color="gray" ml="auto">
              Sequence
            </Badge>
          ) : null}
        </Group>

        <Text size="sm" fw={600} lineClamp={2}>
          {r.name}
        </Text>

        {r.audience ? (
          <Text size="xs" c="dimmed" lineClamp={1}>
            {r.audience}
          </Text>
        ) : null}

        {perfItems.length > 0 ? (
          <PerfStrip items={perfItems} />
        ) : r.perf ? (
          <Text size="xs" c="dimmed" ff="monospace">
            {r.perf}
          </Text>
        ) : null}

        {r.kind === 'campaign' ? (
          <AttributionLink
            attribution={{
              leads: r.leads ?? null,
              deals: r.attributedDealCount ?? null,
              revenue: r.attributedRevenue ?? null,
            }}
            onDrill={r.status === 'draft' ? undefined : () => onDrill(r.id)}
          />
        ) : null}

        <Group justify="space-between" gap="xs" wrap="nowrap" align="center" mt={4}>
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <IconClock size={13} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
            <Text size="xs" c="dimmed" ff="monospace" truncate>
              {r.when || '—'}
            </Text>
          </Group>
          {r.kind === 'sequence' && seq?.status === 'RUNNING' ? (
            <Button
              size="compact-xs"
              variant="default"
              leftSection={<IconPlayerPause size={13} />}
              loading={seqBusy === r.id}
              onClick={(e) => {
                stop(e);
                onSeqAction(r.id, 'pause');
              }}
            >
              Pause
            </Button>
          ) : r.kind === 'sequence' &&
            (seq?.status === 'DRAFT' || seq?.status === 'PAUSED') ? (
            <Button
              size="compact-xs"
              variant="light"
              color="red"
              leftSection={<IconPlayerPlay size={13} />}
              loading={seqBusy === r.id}
              onClick={(e) => {
                stop(e);
                onSeqAction(r.id, 'activate');
              }}
            >
              Activate
            </Button>
          ) : isDraftEditable ? (
            <Group gap={4} c="blue" wrap="nowrap">
              <IconPencil size={13} />
              <Text size="xs" fw={600}>
                Edit
              </Text>
            </Group>
          ) : null}
        </Group>
      </Stack>
    </Paper>
  );
};

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
  // Bucket every campaign/sequence row into its lifecycle lane for the board.
  const byLane = useMemo(() => {
    const lanes: Record<Exclude<CampaignFilter, 'all'>, UnifiedRow[]> = {
      draft: [],
      scheduled: [],
      sending: [],
      sent: [],
    };
    // r.status is a UnifiedRow lane ('all' is only the filter sentinel, never a row).
    for (const r of rows) {
      if (r.status !== 'all') lanes[r.status].push(r);
    }
    return lanes;
  }, [rows]);

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
      <SurfaceIntro
        eyebrow="The campaign desk"
        title="Every send, benched by stage — draft to delivered, at a glance."
        icon={<IconSend size={20} />}
        actions={
          <Button
            color="red"
            size="compact-sm"
            leftSection={<IconPlus size={14} />}
            onClick={newCampaign}
          >
            New campaign
          </Button>
        }
      />

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
      ) : (
        <KanbanBoard cols={{ base: 1, sm: 2, lg: 4 }}>
          {CAMPAIGN_LANES.map((lane) => {
            const laneRows = byLane[lane.id];
            return (
              <KanbanColumn
                key={lane.id}
                title={lane.title}
                count={laneRows.length}
                icon={
                  <lane.Icon size={15} style={{ color: 'var(--mantine-color-dimmed)' }} />
                }
                empty={
                  <InvitingEmpty
                    compact
                    title={lane.emptyTitle}
                    message={lane.emptyMessage}
                  />
                }
              >
                {laneRows.map((r) => (
                  <CampaignCard
                    key={`${r.status}-${r.id}`}
                    r={r}
                    onOpen={() => openRow(r)}
                    onDrill={setDetailId}
                    seqBusy={seqBusy}
                    onSeqAction={(id, action) => void runSeqAction(id, action)}
                  />
                ))}
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
      )}
    </Box>
  );
};
