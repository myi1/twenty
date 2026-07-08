import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Drawer,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconCheck,
  IconEye,
  IconPencil,
  IconRefresh,
  IconSparkles,
  IconTag,
  IconWorld,
  IconX,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { PlanReviewPanel } from '@/propel/components/marketingHero/PlanReviewPanel';
import { type PreflightCheck } from '@/propel/lib/landingPagesCrm';
import {
  type CampaignDetailPayload,
  type SpineArm,
  type SpineGates,
  type SpinePermitPost,
  approveCampaign,
  dismissCampaign,
  generateCampaign,
  getCampaign,
} from '@/propel/lib/campaignSpineCrm';

// Campaign Spine v1 (CS4) — the campaign review drawer. Loads a campaign in
// REVIEW plus its two linked arms (getCampaign) and gives the founder ONE surface
// to curate + approve the whole multi-channel push:
//   • narrative + UTM chip + window;
//   • the LP arm card ("Open in editor" deep-links to the Website tab's landing
//     editor via ?tab=website&sub=landing-pages&edit=<id>);
//   • the social arm card ("Review posts" opens the existing PlanReviewPanel —
//     the 4S-A review, zIndex 4000, stacked over this drawer's 3500);
//   • Approve campaign → the per-channel gates; GATES_FAILED renders each
//     channel's failures inline (LP pre-flight rows / permit-blocked posts) and
//     offers per-arm partial approve for the channel whose gate passed;
//   • Regenerate campaign — an honest whole-redo (v1): re-runs BOTH channels from
//     the same brief as a NEW campaign and archives this one;
//   • Dismiss with confirm → campaign ARCHIVED.

const statusColor = (s: string): string =>
  s === 'LIVE' || s === 'APPROVED' || s === 'SCHEDULED'
    ? 'teal'
    : s === 'REVIEW' || s === 'PROPOSED'
      ? 'yellow'
      : s === 'ARCHIVED'
        ? 'orange'
        : s === 'DRAFTING' || s === 'GENERATING'
          ? 'blue'
          : 'gray';

const fmtDay = (iso: string | null): string | null => {
  if (iso === null) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// Humanize a pre-flight check key ("leadForm" → "Lead form") — same tolerant
// labeling as LandingPagesTab's checklist modal; the server's `detail` is truth.
const checkLabel = (key: string): string => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// ── the LP channel's inline gate failures (pre-flight rows) ───────────────────
const LpGateRows = ({ checks }: { checks: PreflightCheck[] }) => (
  <Stack gap={4} mt="xs">
    {checks.map((c) => {
      const hardFail = !c.ok && c.level === 'HARD';
      const warn = !c.ok && c.level === 'SOFT';
      return (
        <Group
          key={c.key}
          gap="sm"
          align="flex-start"
          wrap="nowrap"
          p="xs"
          style={
            hardFail
              ? { background: 'var(--mantine-color-red-light)', borderRadius: 6 }
              : undefined
          }
        >
          <ThemeIcon
            size="sm"
            radius="xl"
            variant="light"
            color={c.ok ? 'teal' : hardFail ? 'red' : 'yellow'}
          >
            {c.ok ? (
              <IconCheck size={12} />
            ) : hardFail ? (
              <IconX size={12} />
            ) : (
              <IconAlertTriangle size={12} />
            )}
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Group gap={6} wrap="nowrap">
              <Text size="sm" fw={hardFail ? 600 : 500}>
                {checkLabel(c.key)}
              </Text>
              {warn ? (
                <Badge size="xs" color="yellow" variant="light">
                  warning
                </Badge>
              ) : null}
            </Group>
            {c.detail ? (
              <Text size="xs" c={hardFail ? 'red' : 'dimmed'}>
                {c.detail}
              </Text>
            ) : null}
          </Box>
        </Group>
      );
    })}
  </Stack>
);

// ── the social channel's inline gate failures (permit-blocked posts) ──────────
const SocialGateRows = ({ posts }: { posts: SpinePermitPost[] }) => (
  <Stack gap={4} mt="xs">
    {posts.map((p) => (
      <Group
        key={p.id}
        gap="sm"
        wrap="nowrap"
        p="xs"
        style={{ background: 'var(--mantine-color-red-light)', borderRadius: 6 }}
      >
        <ThemeIcon size="sm" radius="xl" variant="light" color="red">
          <IconAlertTriangle size={12} />
        </ThemeIcon>
        <Text size="sm" fw={500}>
          {p.platform
            ? p.platform.charAt(0) + p.platform.slice(1).toLowerCase()
            : 'Property'}{' '}
          post — permit required
        </Text>
      </Group>
    ))}
    {posts.length > 0 ? (
      <Text size="xs" c="dimmed">
        Open “Review posts” to attach permits, then approve again.
      </Text>
    ) : null}
  </Stack>
);

interface CampaignReviewPanelProps {
  // null → the drawer is closed. A non-null id opens the drawer and loads it.
  campaignId: string | null;
  // Arms the generate call reported as failed (`partial:true`) — their card is
  // marked "generation failed" instead of pretending the arm never existed.
  failedArms: SpineArm[];
  onClose: () => void;
  // Called after any mutation (approve/dismiss/regenerate) so the parent reloads.
  onChanged: () => void;
  // Regenerate is a whole-redo that mints a NEW campaign — the parent swaps the
  // review over to it (this one is archived best-effort).
  onRegenerated: (newCampaignId: string, failedArms: SpineArm[]) => void;
}

export const CampaignReviewPanel = ({
  campaignId,
  failedArms,
  onClose,
  onChanged,
  onRegenerated,
}: CampaignReviewPanelProps) => {
  const notify = usePropelToast();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<CampaignDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  // Which partial-approve button is in flight (null = the full approve, if any).
  const [approvingArm, setApprovingArm] = useState<SpineArm | null>(null);
  // The per-channel failure payloads from the last GATES_FAILED response.
  const [gates, setGates] = useState<SpineGates | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [confirmDismissOpen, setConfirmDismissOpen] = useState(false);
  // Non-null → the nested 4S-A PlanReviewPanel is open on the social arm.
  const [planReviewId, setPlanReviewId] = useState<string | null>(null);

  const busy = approving || regenerating || dismissing;

  const load = useCallback(async () => {
    if (campaignId === null) return;
    setLoading(true);
    setError(null);
    const res = await getCampaign(campaignId);
    setLoading(false);
    if (res.ok) {
      setDetail(res.data);
    } else {
      setDetail(null);
      setError(res.error);
    }
  }, [campaignId]);

  useEffect(() => {
    if (campaignId === null) {
      setDetail(null);
      setError(null);
      setGates(null);
      setPlanReviewId(null);
      setConfirmDismissOpen(false);
      return;
    }
    setGates(null);
    void load();
  }, [campaignId, load]);

  const campaign = detail?.campaign ?? null;
  const lpArm = detail?.arms.landingPage ?? null;
  const socialArm = detail?.arms.socialPlan ?? null;
  const lpFailed = failedArms.includes('lp') && lpArm === null;
  const socialFailed = failedArms.includes('social') && socialArm === null;

  const windowLabel =
    campaign !== null
      ? [fmtDay(campaign.windowStart), fmtDay(campaign.windowEnd)]
          .filter((v): v is string => v !== null)
          .join(' → ')
      : '';

  // ── actions ──────────────────────────────────────────────────────────────────

  const openLpEditor = () => {
    if (lpArm === null) return;
    // The Website tab's landing editor has no standalone route — the whole hero
    // is URL-synced via search params, so we deep-link the landing-pages sub-tab
    // with an ?edit=<id> param that LandingPagesTab consumes on mount (CS4).
    onClose();
    navigate(
      `${AppPath.MarketingHub}?tab=website&sub=landing-pages&edit=${encodeURIComponent(lpArm.id)}`,
    );
  };

  const approve = async (arms?: SpineArm[]) => {
    if (campaignId === null || busy) return;
    setApproving(true);
    setApprovingArm(arms && arms.length === 1 ? arms[0] : null);
    const res = await approveCampaign(campaignId, arms);
    setApproving(false);
    setApprovingArm(null);
    if (res.ok) {
      notify(
        arms && arms.length === 1
          ? arms[0] === 'lp'
            ? 'Landing page approved — it is going live.'
            : 'Social plan approved — posts are scheduling.'
          : 'Campaign approved — both channels are shipping.',
        'success',
      );
      setGates(null);
      onChanged();
      if (arms && arms.length === 1) {
        // A partial approve keeps the review open on the remaining channel.
        void load();
      } else {
        onClose();
      }
      return;
    }
    if (res.gatesFailed) {
      setGates(res.gates);
      notify(
        'Approval blocked — fix the flagged checks below, or approve the passing channel on its own.',
        'error',
      );
      return;
    }
    notify(res.error, 'error');
  };

  // v1 whole-redo, labeled honestly: re-runs BOTH channels from the same brief
  // as a NEW campaign; this one is archived (best-effort) once the redo lands.
  const regenerate = async () => {
    if (campaignId === null || campaign === null || busy) return;
    setRegenerating(true);
    const window =
      campaign.windowStart !== null && campaign.windowEnd !== null
        ? { start: campaign.windowStart, end: campaign.windowEnd }
        : undefined;
    const res = await generateCampaign(campaign.brief, undefined, window);
    if (!res.ok) {
      setRegenerating(false);
      notify(res.error, 'error');
      return;
    }
    // Archive the superseded campaign; a failure here is non-fatal (the founder
    // can still dismiss it from the review later).
    await dismissCampaign(campaignId);
    setRegenerating(false);
    notify('Campaign regenerated — reviewing the new draft.', 'success');
    onChanged();
    onRegenerated(res.campaignId, res.partial ? res.failed : []);
  };

  const dismiss = async () => {
    if (campaignId === null || busy) return;
    setDismissing(true);
    const res = await dismissCampaign(campaignId);
    setDismissing(false);
    setConfirmDismissOpen(false);
    if (res.ok) {
      notify('Campaign dismissed.', 'info');
      onChanged();
      onClose();
    } else {
      notify(res.error, 'error');
    }
  };

  // Partial approve is offered per arm once gates came back: an arm whose channel
  // is ABSENT from `gates` passed its gate and can ship on its own.
  const lpCanPartialApprove =
    gates !== null && gates.lp === null && lpArm !== null;
  const socialCanPartialApprove =
    gates !== null && gates.social === null && socialArm !== null;

  // ── arm cards ────────────────────────────────────────────────────────────────

  const lpCard = (
    <Paper
      withBorder
      radius="md"
      p="sm"
      style={
        lpFailed || (gates?.lp?.some((c) => !c.ok && c.level === 'HARD') ?? false)
          ? { borderColor: 'var(--mantine-color-red-5)', borderWidth: 2 }
          : undefined
      }
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon size="md" variant="light" color="blue">
            <IconWorld size={15} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} truncate>
              {lpArm !== null ? lpArm.name || 'Landing page' : 'Landing page'}
            </Text>
            {lpArm !== null && lpArm.slug !== '' ? (
              <Text size="xs" c="dimmed" truncate>
                /lp/{lpArm.slug}
              </Text>
            ) : null}
          </Box>
        </Group>
        {lpArm !== null ? (
          <Badge size="sm" variant="light" color={statusColor(lpArm.status)}>
            {lpArm.status || '—'}
          </Badge>
        ) : null}
      </Group>

      {lpFailed ? (
        <Alert
          color="red"
          variant="light"
          mt="xs"
          icon={<IconAlertTriangle size={16} />}
        >
          Landing page generation failed — “Regenerate campaign” below re-runs
          both channels.
        </Alert>
      ) : lpArm === null ? (
        <Text size="xs" c="dimmed" mt="xs">
          No landing page is linked to this campaign.
        </Text>
      ) : (
        <>
          {gates?.lp ? <LpGateRows checks={gates.lp} /> : null}
          <Group gap="xs" mt="sm">
            <Button
              size="compact-sm"
              variant="light"
              color="blue"
              leftSection={<IconPencil size={14} />}
              onClick={openLpEditor}
              disabled={busy}
            >
              Open in editor
            </Button>
            {lpCanPartialApprove ? (
              <Button
                size="compact-sm"
                variant="light"
                color="teal"
                leftSection={<IconCheck size={14} />}
                loading={approving && approvingArm === 'lp'}
                disabled={busy && approvingArm !== 'lp'}
                onClick={() => void approve(['lp'])}
              >
                Approve landing page only
              </Button>
            ) : null}
          </Group>
        </>
      )}
    </Paper>
  );

  const socialCard = (
    <Paper
      withBorder
      radius="md"
      p="sm"
      style={
        socialFailed || (gates?.social?.length ?? 0) > 0
          ? { borderColor: 'var(--mantine-color-red-5)', borderWidth: 2 }
          : undefined
      }
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon size="md" variant="light" color="grape">
            <IconCalendarEvent size={15} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} truncate>
              {socialArm !== null ? socialArm.name || 'Social plan' : 'Social plan'}
            </Text>
            {socialArm !== null ? (
              <Text size="xs" c="dimmed">
                {socialArm.postCount} post{socialArm.postCount === 1 ? '' : 's'}
              </Text>
            ) : null}
          </Box>
        </Group>
        {socialArm !== null ? (
          <Badge size="sm" variant="light" color={statusColor(socialArm.status)}>
            {socialArm.status || '—'}
          </Badge>
        ) : null}
      </Group>

      {socialFailed ? (
        <Alert
          color="red"
          variant="light"
          mt="xs"
          icon={<IconAlertTriangle size={16} />}
        >
          Social plan generation failed — “Regenerate campaign” below re-runs
          both channels.
        </Alert>
      ) : socialArm === null ? (
        <Text size="xs" c="dimmed" mt="xs">
          No social plan is linked to this campaign.
        </Text>
      ) : (
        <>
          {gates?.social ? <SocialGateRows posts={gates.social} /> : null}
          <Group gap="xs" mt="sm">
            <Button
              size="compact-sm"
              variant="light"
              color="grape"
              leftSection={<IconEye size={14} />}
              onClick={() => setPlanReviewId(socialArm.id)}
              disabled={busy}
            >
              Review posts
            </Button>
            {socialCanPartialApprove ? (
              <Button
                size="compact-sm"
                variant="light"
                color="teal"
                leftSection={<IconCheck size={14} />}
                loading={approving && approvingArm === 'social'}
                disabled={busy && approvingArm !== 'social'}
                onClick={() => void approve(['social'])}
              >
                Approve social only
              </Button>
            ) : null}
          </Group>
        </>
      )}
    </Paper>
  );

  return (
    <>
      <Drawer
        opened={campaignId !== null}
        onClose={busy ? () => undefined : onClose}
        position="right"
        size="min(680px, 96vw)"
        padding={0}
        withCloseButton={false}
        // Below the nested PlanReviewPanel (4000) so "Review posts" stacks on top.
        zIndex={3500}
        styles={{
          body: { height: '100%', padding: 0 },
          content: { display: 'flex', flexDirection: 'column' },
        }}
      >
        {/* header */}
        <Group
          justify="space-between"
          align="flex-start"
          wrap="nowrap"
          px="lg"
          py="md"
          style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
        >
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <ThemeIcon size="lg" variant="light" color="red">
              <IconSparkles size={18} />
            </ThemeIcon>
            <Box style={{ minWidth: 0 }}>
              <Group gap={6} wrap="nowrap">
                <Text fw={700} truncate>
                  {campaign?.name || 'Multi-channel campaign'}
                </Text>
                {campaign !== null ? (
                  <Badge
                    size="sm"
                    variant="light"
                    color={statusColor(campaign.status)}
                  >
                    {campaign.status}
                  </Badge>
                ) : null}
              </Group>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {detail !== null
                  ? 'One story across both channels · review, then approve'
                  : 'Loading…'}
              </Text>
            </Box>
          </Group>
          <Button variant="default" size="sm" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </Group>

        {/* body */}
        <Box style={{ flex: 1, minHeight: 0, overflowY: 'auto' }} p="lg">
          {loading ? (
            <Center h={240}>
              <Loader color="red" />
            </Center>
          ) : error !== null ? (
            <Alert
              color="red"
              variant="light"
              icon={<IconAlertTriangle size={16} />}
            >
              {error}
            </Alert>
          ) : campaign === null ? (
            <Paper withBorder p="xl" radius="md" style={{ borderStyle: 'dashed' }}>
              <Stack align="center" gap="xs">
                <IconSparkles size={28} />
                <Text c="dimmed" size="sm" ta="center">
                  This campaign could not be loaded.
                </Text>
              </Stack>
            </Paper>
          ) : (
            <Stack gap="lg">
              {/* narrative + UTM + window */}
              <Box>
                {campaign.narrative !== '' ? (
                  <Text size="sm" mb="xs" style={{ whiteSpace: 'pre-wrap' }}>
                    {campaign.narrative}
                  </Text>
                ) : campaign.brief !== '' ? (
                  <Text size="sm" c="dimmed" mb="xs">
                    {campaign.brief}
                  </Text>
                ) : null}
                <Group gap="xs" wrap="wrap">
                  {campaign.utmCampaign !== '' ? (
                    <Badge
                      size="sm"
                      variant="light"
                      color="grape"
                      leftSection={<IconTag size={12} />}
                      styles={{
                        label: { textTransform: 'none', fontWeight: 500 },
                      }}
                    >
                      utm_campaign={campaign.utmCampaign}
                    </Badge>
                  ) : null}
                  {windowLabel !== '' ? (
                    <Badge
                      size="sm"
                      variant="light"
                      color="gray"
                      leftSection={<IconCalendarEvent size={12} />}
                      styles={{
                        label: { textTransform: 'none', fontWeight: 500 },
                      }}
                    >
                      {windowLabel}
                    </Badge>
                  ) : null}
                </Group>
              </Box>

              {lpCard}
              {socialCard}

              {regenerating ? (
                <Alert
                  color="blue"
                  variant="light"
                  icon={<IconRefresh size={16} />}
                >
                  Re-running both channels from the same brief — this takes about
                  a minute…
                </Alert>
              ) : null}
            </Stack>
          )}
        </Box>

        {/* footer actions */}
        {campaign !== null ? (
          <Group
            justify="space-between"
            wrap="nowrap"
            px="lg"
            py="md"
            style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
          >
            <Group gap="xs" wrap="nowrap">
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => setConfirmDismissOpen(true)}
                disabled={busy}
              >
                Dismiss
              </Button>
              <Button
                variant="default"
                size="sm"
                leftSection={<IconRefresh size={14} />}
                loading={regenerating}
                disabled={busy && !regenerating}
                onClick={() => void regenerate()}
                title="Re-runs BOTH channels from the same brief as a new campaign; this one is archived."
              >
                Regenerate campaign
              </Button>
            </Group>
            <Button
              color="teal"
              size="sm"
              leftSection={<IconCheck size={16} />}
              loading={approving && approvingArm === null}
              disabled={
                (busy && !(approving && approvingArm === null)) ||
                (lpArm === null && socialArm === null)
              }
              onClick={() => void approve()}
            >
              Approve campaign
            </Button>
          </Group>
        ) : null}
      </Drawer>

      {/* dismiss confirm */}
      <Modal
        opened={confirmDismissOpen}
        onClose={() => setConfirmDismissOpen(false)}
        title="Dismiss this campaign?"
        centered
        zIndex={6000}
      >
        <Text size="sm" c="dimmed" mb="md">
          The campaign is archived and its channels are dismissed on their own
          paths — nothing ships. This can’t be undone from here.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button
            variant="default"
            size="sm"
            onClick={() => setConfirmDismissOpen(false)}
            disabled={dismissing}
          >
            Keep reviewing
          </Button>
          <Button
            color="red"
            size="sm"
            loading={dismissing}
            onClick={() => void dismiss()}
          >
            Dismiss campaign
          </Button>
        </Group>
      </Modal>

      {/* the social arm's post review — the existing 4S-A drawer, stacked above */}
      <PlanReviewPanel
        planId={planReviewId}
        onClose={() => setPlanReviewId(null)}
        onApproved={() => {
          void load();
          onChanged();
        }}
      />
    </>
  );
};

export default CampaignReviewPanel;
