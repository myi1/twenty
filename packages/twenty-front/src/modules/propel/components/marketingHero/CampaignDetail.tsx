import {
  Alert,
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Center,
  Code,
  Divider,
  Group,
  Loader,
  Paper,
  Popover,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { ResponsiveLine } from '@nivo/line';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconChartBar,
  IconClock,
  IconFlask,
  IconMail,
  IconMessage,
  IconPhone,
  IconRefresh,
  IconTargetArrow,
} from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  type CampaignConvertResponse,
  CONVERT_LANE_OPTIONS,
  type ConvertLane,
} from '@/propel/lib/campaignConvert';
import { runMarketingRoute } from '@/propel/lib/marketingHubActions';
import { propelNivoTheme } from '@/propel/lib/nivoTheme';
import {
  type CampaignDetailPayload,
  type RecipientActivityRow,
} from '@/propel/types/marketingHome';

// ─────────────────────────────────────────────────────────────────────────────
// CampaignDetail — the rich, graduated drill-in for a live/sent campaign,
// replacing the lightweight read-only summary drawer the Campaigns tab used to
// show. Ports the legacy Pulse PulseCampaignDetail (marketing-cloud-campaigns.tsx)
// into Mantine, fed by the SAME backend route (POST /marketing/campaign-detail —
// marketing-campaign-detail-route.ts) with no new backend.
//
// Renders, honestly (presence contract — never zero-fill):
//   • header (channel glyph, name, status pill, status line + audience)
//   • KPI tiles (sent / opened / clicked / replied / failed / skipped / queued) —
//     only once the campaign has actually sent
//   • conversion funnel (sent → opened → clicked → replied), scaled to the head
//   • send timeline (Nivo line) when ≥2 timeline points, plus the labelled list
//   • recipient activity list with reply→Call deep-link to the Person
//   • A/B result summary when abEnabled
//   • problem/issue box with the retry-failed action wired to /marketing/retry-failed
//   • message preview
//
// All states are explicit: loading skeleton, load-failure error with an operator
// action, and "not sent yet" for a campaign with no results.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n: number): string => n.toLocaleString('en-US');

const ChannelGlyph = ({
  channel,
  size = 18,
}: {
  channel: CampaignDetailPayload['channel'];
  size?: number;
}) =>
  channel === 'WHATSAPP' ? (
    <IconMessage size={size} color="var(--mantine-color-green-6)" />
  ) : (
    <IconMail size={size} color="var(--mantine-color-blue-6)" />
  );

// Maps the campaign status string to a Mantine badge color, mirroring the legacy
// detailStatusTone (good / warn / bad / mute).
const statusColor = (status: string): string => {
  if (status === 'SENT') return 'green';
  if (status === 'FAILED' || status === 'CANCELLED') return 'red';
  if (
    ['SENDING', 'SEND_REQUESTED', 'MATERIALIZING', 'SCHEDULED'].includes(status)
  ) {
    return 'yellow';
  }
  return 'gray';
};

const titleCaseStatus = (status: string): string =>
  (status.charAt(0) + status.slice(1).toLowerCase()).replace(/_/g, ' ');

const KpiTile = ({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) => (
  <Paper withBorder radius="md" p="sm">
    <Text size="xs" tt="uppercase" fw={700} c="dimmed">
      {label}
    </Text>
    <Text fz={24} fw={700} mt={4} c={color}>
      {value}
    </Text>
    {sub !== undefined ? (
      <Text size="xs" c="dimmed" mt={1}>
        {sub}
      </Text>
    ) : null}
  </Paper>
);

// Conversion funnel — sent → opened → clicked → replied as horizontal bars each
// scaled to the funnel head. Reuses the hero's existing FunnelCard convention
// (Mantine Progress, theme-aware) rather than a Nivo funnel (the fork ships
// @nivo/{core,line,pie,radial-bar} — no @nivo/bar or @nivo/funnel — and adding a
// dependency is out of scope for this lane). Counts can exceed the head (opens /
// clicks are event counts, not unique recipients), so the bar value is clamped.
const ConversionFunnel = ({ detail }: { detail: CampaignDetailPayload }) => {
  const stages = [
    { label: 'Sent', v: detail.sentCount, color: 'blue' },
    { label: 'Opened', v: detail.openCount, color: 'cyan' },
    { label: 'Clicked', v: detail.clickCount, color: 'grape' },
    { label: 'Replied', v: detail.replyCount, color: 'green' },
  ];
  const head = stages[0].v || 1;
  return (
    <Stack gap="sm">
      {stages.map((s) => {
        const pct = Math.min(100, Math.max(s.v > 0 ? 4 : 0, (s.v / head) * 100));
        return (
          <Stack key={s.label} gap={2}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">
                {s.label}
              </Text>
              <Text size="xs" fw={600} c="var(--mantine-color-text)">
                {fmt(s.v)}
              </Text>
            </Group>
            <Progress value={pct} color={s.color} size="md" radius="sm" />
          </Stack>
        );
      })}
    </Stack>
  );
};

// Send timeline as a Nivo line — only when the route gives ≥2 dated points that
// parse to real times (the labels are pre-formatted Asia/Dubai strings, but the
// route also carries the ordered event list, so we plot the index as the x-axis
// and show the labels along the bottom). When <2 plottable points we skip the
// chart and rely on the labelled list beside it.
const TimelineChart = ({
  timeline,
}: {
  timeline: CampaignDetailPayload['timeline'];
}) => {
  if (timeline.length < 2) return null;
  const data = [
    {
      id: 'Lifecycle',
      color: themeCssVariables.color.red,
      data: timeline.map((t, i) => ({ x: t.label, y: i + 1 })),
    },
  ];
  return (
    <Box h={150}>
      <ResponsiveLine
        data={data}
        theme={propelNivoTheme}
        colors={(serie) => (serie as { color: string }).color}
        margin={{ top: 12, right: 16, bottom: 48, left: 16 }}
        xScale={{ type: 'point' }}
        yScale={{ type: 'linear', min: 0, max: timeline.length + 1 }}
        curve="monotoneX"
        enableArea
        areaOpacity={0.08}
        enableGridX={false}
        enableGridY={false}
        lineWidth={2}
        pointSize={8}
        pointBorderWidth={2}
        pointBorderColor={{ from: 'serieColor' }}
        pointColor={themeCssVariables.background.primary}
        axisLeft={null}
        axisBottom={{
          tickSize: 0,
          tickPadding: 8,
          tickRotation: timeline.length > 3 ? -25 : 0,
        }}
        useMesh
        animate={false}
      />
    </Box>
  );
};

const RecipientRow = ({
  r,
  onCall,
  onConvert,
  converting,
}: {
  r: RecipientActivityRow;
  onCall: (personId: string) => void;
  // Pull an engaged lead back to a lane (POST /lead/campaign-convert). Resolves
  // true on success so the popover can close.
  onConvert: (personId: string, lane: ConvertLane) => Promise<boolean>;
  // The personId currently being converted (a spinner gate), or null.
  converting: string | null;
}) => (
  <Group gap="sm" wrap="nowrap" py="xs" px="sm">
    <Avatar color="gray" radius="xl" size={30}>
      {r.displayName.charAt(0).toUpperCase()}
    </Avatar>
    <Box style={{ flex: 1, minWidth: 0 }}>
      <Text size="sm" fw={600} truncate>
        {r.displayName}
      </Text>
      <Text size="xs" c="dimmed" ff="monospace" truncate>
        {r.contactLabel}
      </Text>
    </Box>
    <Badge
      variant="light"
      color={r.isReplied ? 'green' : r.state === 'CLICKED' ? 'yellow' : 'gray'}
    >
      {r.activityLabel}
    </Badge>
    <Text
      size="xs"
      c="dimmed"
      ff="monospace"
      ta="right"
      style={{ minWidth: 56, flex: 'none' }}
    >
      {r.whenLabel}
    </Text>
    {/* The CONVERSION action — close the marketing↔sales loop on an engaged lead.
        Available for any engaged recipient with a known person (a reply is the
        strongest signal, but a click is intent too). The popover picks the lane;
        convert attributes the campaign + creates the lane opportunity + flips the
        lead out of its pool. */}
    {r.personId !== null ? (
      <ConvertControl
        personId={r.personId}
        busy={converting === r.personId}
        onConvert={onConvert}
      />
    ) : null}
    {r.isReplied && r.personId !== null ? (
      <Button
        size="compact-xs"
        variant="subtle"
        color="gray"
        leftSection={<IconPhone size={13} />}
        onClick={() => onCall(r.personId as string)}
      >
        Open
      </Button>
    ) : null}
  </Group>
);

// The per-recipient "Convert" popover: pick a lane, then pull the engaged lead
// into it. Local lane state so each row is independent; the parent owns the
// network call + the busy gate (so only one convert runs at a time and the list
// reloads after).
const ConvertControl = ({
  personId,
  busy,
  onConvert,
}: {
  personId: string;
  busy: boolean;
  onConvert: (personId: string, lane: ConvertLane) => Promise<boolean>;
}) => {
  const [opened, setOpened] = useState(false);
  const [lane, setLane] = useState<ConvertLane>('secondary');

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      width={240}
      position="bottom-end"
      withArrow
      shadow="md"
      zIndex={6000}
    >
      <Popover.Target>
        <Button
          size="compact-xs"
          variant="light"
          color="red"
          leftSection={<IconTargetArrow size={13} />}
          loading={busy}
          onClick={() => setOpened((o) => !o)}
        >
          Convert
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            Pull this lead into a lane and attribute the conversion to this
            campaign.
          </Text>
          <Select
            size="xs"
            label="Lane"
            value={lane}
            onChange={(v) => v && setLane(v as ConvertLane)}
            data={CONVERT_LANE_OPTIONS}
            comboboxProps={{ withinPortal: true, zIndex: 6100 }}
            allowDeselect={false}
          />
          <Button
            size="compact-sm"
            color="red"
            loading={busy}
            onClick={async () => {
              const ok = await onConvert(personId, lane);
              if (ok) setOpened(false);
            }}
          >
            Convert to lane
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};

export const CampaignDetail = ({
  campaignId,
  onBack,
}: {
  campaignId: string;
  // changed=true when a mutation (retry) altered campaign state — caller reloads
  // the list before re-rendering it.
  onBack: (changed?: boolean) => void;
}) => {
  const navigate = useNavigate();
  const notify = usePropelToast();
  const [detail, setDetail] = useState<CampaignDetailPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [showTech, setShowTech] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // The personId currently being converted (a per-row busy gate), or null.
  const [converting, setConverting] = useState<string | null>(null);
  // Tracks whether anything mutated this campaign while open, so onBack reloads
  // the list even if the user navigates back after a successful retry.
  const [didMutate, setDidMutate] = useState(false);

  const fetchDetail = useCallback(async () => {
    const res = await callPropelRoute<CampaignDetailPayload>(
      '/marketing/campaign-detail',
      { campaignId },
    );
    if (res !== null && res.ok === true) {
      setDetail(res);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, [campaignId]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    const outcome = await runMarketingRoute('/marketing/retry-failed', {
      campaignId,
    });
    setRetrying(false);
    if (outcome.ok) {
      notify('Retry queued — failed recipients reset to pending.', 'success');
      setDidMutate(true);
      void fetchDetail();
    } else {
      notify(outcome.message, 'error');
    }
  };

  // The CONVERSION action — POST /lead/campaign-convert. Pulls the engaged lead
  // into the chosen lane, attributes the campaign, and flips it out of its pool.
  // On success we deep-link to the new opportunity (the natural next stop) and
  // mark the campaign mutated so the list reloads. Returns true so the row's
  // popover closes; false leaves it open with the error toast shown.
  const convert = useCallback(
    async (personId: string, lane: ConvertLane): Promise<boolean> => {
      if (converting !== null) return false;
      setConverting(personId);
      try {
        const res = await callPropelRoute<CampaignConvertResponse>(
          '/lead/campaign-convert',
          { personId, campaignId, lane, createOpportunity: true },
        );
        if (res !== null && res.ok === true) {
          setDidMutate(true);
          notify(
            'Converted — lead pulled into the lane and attributed to this campaign.',
            'success',
          );
          if (typeof res.opportunityId === 'string' && res.opportunityId) {
            navigate(`/object/opportunity/${res.opportunityId}`);
          } else {
            navigate(`/object/person/${personId}`);
          }
          return true;
        }
        notify(
          res?.operatorAction ||
            res?.error ||
            'Could not convert this lead — try again.',
          'error',
        );
        return false;
      } catch {
        notify('Could not convert — check your connection.', 'error');
        return false;
      } finally {
        setConverting(null);
      }
    },
    [converting, campaignId, navigate, notify],
  );

  const back = (
    <Button
      variant="subtle"
      color="gray"
      size="compact-sm"
      leftSection={<IconArrowLeft size={14} />}
      onClick={() => onBack(didMutate)}
      px={0}
    >
      Back to campaigns
    </Button>
  );

  if (detail === null && !failed) {
    return (
      <Box p="md">
        {back}
        <Center mih={320}>
          <Loader color="red" />
        </Center>
      </Box>
    );
  }

  if (detail === null) {
    return (
      <Box p="md">
        {back}
        <Alert
          mt="md"
          color="red"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
          title="Couldn't load this campaign"
        >
          Go back to the list and open it again. If it keeps failing, the
          campaign may have been removed.
        </Alert>
      </Box>
    );
  }

  const d = detail;
  const isSent = d.sentCount > 0 || d.status === 'SENDING' || d.status === 'SENT';
  const canRetry =
    (d.status === 'FAILED' || d.status === 'SENT') && d.failedCount > 0;

  return (
    <Box p="md" style={{ overflowY: 'auto', height: '100%' }}>
      {back}

      {/* header */}
      <Group gap="sm" wrap="nowrap" mt="xs" mb="md" align="flex-start">
        <Box pt={2}>
          <ChannelGlyph channel={d.channel} size={26} />
        </Box>
        <Box style={{ minWidth: 0 }}>
          <Group gap="xs" wrap="wrap">
            <Title order={4}>{d.name}</Title>
            <Badge variant="light" color={statusColor(d.status)}>
              {titleCaseStatus(d.status)}
            </Badge>
            {d.statsSettling ? (
              <Badge variant="light" color="yellow" size="sm">
                stats settling
              </Badge>
            ) : null}
          </Group>
          <Text size="sm" c="dimmed" mt={2}>
            {d.statusLine}
            {d.audienceLabel !== '' ? ` · to ${d.audienceLabel}` : ''}
          </Text>
        </Box>
      </Group>

      {/* KPI tiles — never empty stats on a draft */}
      {isSent ? (
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="sm" mb="lg">
          <KpiTile
            label="Sent"
            value={fmt(d.sentCount)}
            sub={`of ${fmt(d.targetCount)} targeted`}
            color="red"
          />
          <KpiTile
            label="Opened"
            value={d.openRate === null ? '—' : `${d.openRate}%`}
            sub={`${fmt(d.openCount)} opens`}
            color="blue"
          />
          <KpiTile
            label="Clicked"
            value={d.clickRate === null ? '—' : `${d.clickRate}%`}
            sub={`${fmt(d.clickCount)} clicks`}
            color="blue"
          />
          <KpiTile
            label="Replied"
            value={fmt(d.replyCount)}
            sub={
              d.replyCount > 0
                ? `${fmt(d.replyCount)} call task${d.replyCount === 1 ? '' : 's'}`
                : 'no replies yet'
            }
            color="green"
          />
          {d.failedCount > 0 ? (
            <KpiTile
              label="Failed"
              value={fmt(d.failedCount)}
              sub="send failures"
              color="red"
            />
          ) : null}
          {d.skippedCount > 0 ? (
            <KpiTile
              label="Skipped"
              value={fmt(d.skippedCount)}
              sub="caps / opt-out"
            />
          ) : null}
          {d.pendingCount > 0 ? (
            <KpiTile
              label="Queued"
              value={fmt(d.pendingCount)}
              sub="still sending"
            />
          ) : null}
        </SimpleGrid>
      ) : (
        <Paper withBorder radius="md" p="md" mb="lg">
          <Text size="sm" c="dimmed">
            Not sent yet — results appear once this campaign goes out.
          </Text>
        </Paper>
      )}

      {/* funnel + timeline */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mb="lg">
        {isSent ? (
          <Paper withBorder radius="md" p="md">
            <Group gap={6} mb="sm">
              <IconChartBar size={15} color="var(--mantine-color-dimmed)" />
              <Text size="sm" fw={700}>
                Conversion funnel
              </Text>
            </Group>
            <ConversionFunnel detail={d} />
          </Paper>
        ) : (
          <Box />
        )}
        {d.timeline.length > 0 ? (
          <Paper withBorder radius="md" p="md">
            <Group gap={6} mb="sm">
              <IconClock size={15} color="var(--mantine-color-dimmed)" />
              <Text size="sm" fw={700}>
                Timeline
              </Text>
            </Group>
            <TimelineChart timeline={d.timeline} />
            <Stack gap={0} mt={d.timeline.length >= 2 ? 'sm' : 0}>
              {d.timeline.map((t, i) => (
                <Group
                  key={`${t.label}-${i}`}
                  justify="space-between"
                  py={6}
                  style={{
                    borderTop:
                      i > 0
                        ? '1px solid var(--mantine-color-default-border)'
                        : 'none',
                  }}
                >
                  <Text size="xs" c="dimmed">
                    {t.label}
                  </Text>
                  <Text size="xs" ff="monospace">
                    {t.whenLabel}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Paper>
        ) : null}
      </SimpleGrid>

      {/* Recipient activity — engaged recipients only; hidden when none */}
      {d.recipientActivity.length > 0 ? (
        <Box mb="lg">
          <Text size="sm" fw={700} mb="xs">
            Recipient activity
          </Text>
          <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
            {d.recipientActivity.map((r, i) => (
              <Box
                key={r.recipientId}
                style={{
                  borderTop:
                    i > 0
                      ? '1px solid var(--mantine-color-default-border)'
                      : 'none',
                }}
              >
                <RecipientRow
                  r={r}
                  onCall={(personId) => navigate(`/object/person/${personId}`)}
                  onConvert={convert}
                  converting={converting}
                />
              </Box>
            ))}
          </Paper>
          {d.recipientActivityTotal > d.recipientActivity.length ? (
            <Text size="xs" c="dimmed" mt="xs">
              +{fmt(d.recipientActivityTotal - d.recipientActivity.length)} more
              engaged.
            </Text>
          ) : null}
        </Box>
      ) : null}

      {/* A/B test summary */}
      {d.ab !== null ? (
        <Paper withBorder radius="md" p="md" mb="lg">
          <Group gap={6} mb={6}>
            <IconFlask size={15} color="var(--mantine-color-dimmed)" />
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              A/B test
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            {d.ab.winner !== null ? (
              <>
                Version{' '}
                <Text component="span" fw={700} c="var(--mantine-color-text)">
                  {d.ab.winner}
                </Text>{' '}
                won — opens A {fmt(d.ab.openA)} vs B {fmt(d.ab.openB)}, replies A{' '}
                {fmt(d.ab.replyA)} vs B {fmt(d.ab.replyB)}.
              </>
            ) : (
              <>
                Still measuring — opens A {fmt(d.ab.openA)} vs B {fmt(d.ab.openB)}
                .
              </>
            )}
          </Text>
        </Paper>
      ) : null}

      {/* problem / issue box + retry-failed */}
      {d.problem !== null ? (
        <Alert
          color="red"
          variant="light"
          radius="md"
          mb="lg"
          icon={<IconAlertTriangle size={16} />}
          title={d.problem}
        >
          {d.problemAction !== null ? (
            <Text size="sm" c="dimmed">
              {d.problemAction}
            </Text>
          ) : null}
          <Group gap="md" mt="sm" align="center">
            {canRetry ? (
              <Button
                size="compact-sm"
                variant="default"
                leftSection={<IconRefresh size={14} />}
                loading={retrying}
                onClick={() => void retry()}
              >
                Retry failed
              </Button>
            ) : null}
            {d.techDetail !== null ? (
              <Anchor
                component="button"
                type="button"
                size="sm"
                onClick={() => setShowTech((v) => !v)}
              >
                {showTech ? 'Hide technical detail' : 'Show technical detail'}
              </Anchor>
            ) : null}
          </Group>
          {showTech && d.techDetail !== null ? (
            <Code block mt="sm" style={{ wordBreak: 'break-word' }}>
              {d.techDetail}
            </Code>
          ) : null}
        </Alert>
      ) : null}

      {/* message preview */}
      {d.subject !== null || d.bodyPreview !== '' ? (
        <Box>
          <Text size="sm" fw={700} mb="xs">
            Message
          </Text>
          <Paper withBorder radius="md" p="md">
            {d.subject !== null && d.subject !== '' ? (
              <>
                <Text size="sm" fw={700}>
                  {d.subject}
                </Text>
                <Divider my="sm" />
              </>
            ) : null}
            <Text
              size="xs"
              ff="monospace"
              c="dimmed"
              style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
            >
              {d.bodyPreview}
              {d.bodyPreview.length >= 600 ? '…' : ''}
            </Text>
          </Paper>
        </Box>
      ) : null}
    </Box>
  );
};
