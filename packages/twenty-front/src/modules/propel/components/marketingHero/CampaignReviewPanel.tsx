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
  IconFileText,
  IconMail,
  IconPencil,
  IconRefresh,
  IconSparkles,
  IconTag,
  IconTrendingUp,
  IconWorld,
  IconX,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { useCanPublish } from '@/propel/lib/canPublish';
import { PlanReviewPanel } from '@/propel/components/marketingHero/PlanReviewPanel';
import { SubmissionBadge } from '@/propel/components/marketingHero/deskShared';
import { SubmitForApprovalButton } from '@/propel/components/marketingHero/SubmitForApprovalButton';
import { type PreflightCheck } from '@/propel/lib/landingPagesCrm';
import {
  type CampaignDetailPayload,
  type SpineArm,
  type SpineGates,
  type SpinePermitPost,
  approveCampaign,
  dismissCampaign,
  generateArm,
  generateCampaign,
  getCampaign,
} from '@/propel/lib/campaignSpineCrm';

// Campaign Spine (CS4 v1 → V2 progressive review) — the campaign review drawer.
// Loads a campaign in REVIEW plus its linked arms (getCampaign) and gives the
// founder ONE surface to curate + approve the whole multi-channel push:
//   • narrative + UTM chip + window + the Roll-up strip (visits · leads · sent ·
//     opens · attributed AED — only the stats the route reported non-null);
//   • the LP arm card ("Open in editor" deep-links to the Website tab's landing
//     editor via ?tab=website&sub=landing-pages&edit=<id>);
//   • the social arm card ("Review posts" opens the existing PlanReviewPanel —
//     the 4S-A review, zIndex 4000, stacked over this drawer's 3500);
//   • the email arm card (V2 — a DRAFT marketingCampaign; "Open in Campaigns"
//     deep-links the campaign builder via ?edit=<id> while it's a draft);
//   • the blog arm card (V2 — a pipeline blogPost; "Open in Blog" deep-links the
//     Blog board via ?tab=website&sub=blog&post=<id>);
//   • Approve campaign → the per-channel gates; GATES_FAILED renders each
//     channel's failures inline (LP pre-flight rows / permit-blocked posts /
//     email + blog reasons) and offers per-arm partial approve for channels
//     whose gate passed;
//   • per-arm Regenerate (V2) — a planned-but-failed arm re-runs its OWN bench
//     via generateArm (idempotent-safe: an arm that actually landed answers
//     alreadyExists and simply reloads);
//   • Regenerate campaign — an honest whole-redo: re-runs the whole spine from
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
  // Maker-checker (Phase 2): a publisher keeps "Approve campaign"; an agent's same
  // click becomes "Submit for approval". The per-arm partial-approve buttons only
  // surface after a publisher's approve hits GATES_FAILED (an agent never reaches
  // that path), so only the primary go-live control needs to branch. Fails closed.
  const { canPublish, loading: publishLoading } = useCanPublish();

  const [detail, setDetail] = useState<CampaignDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  // Which partial-approve button is in flight (null = the full approve, if any).
  const [approvingArm, setApprovingArm] = useState<SpineArm | null>(null);
  // The per-channel failure payloads from the last GATES_FAILED response.
  const [gates, setGates] = useState<SpineGates | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  // Which arm's per-arm Regenerate (generateArm) is in flight (V2).
  const [armRegenBusy, setArmRegenBusy] = useState<SpineArm | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [confirmDismissOpen, setConfirmDismissOpen] = useState(false);
  // Non-null → the nested 4S-A PlanReviewPanel is open on the social arm.
  const [planReviewId, setPlanReviewId] = useState<string | null>(null);

  const busy = approving || regenerating || dismissing || armRegenBusy !== null;

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
  const emailArm = detail?.arms.email ?? null;
  const blogArm = detail?.arms.blog ?? null;
  const rollup = detail?.rollup ?? null;
  const lpFailed = failedArms.includes('lp') && lpArm === null;
  const socialFailed = failedArms.includes('social') && socialArm === null;
  const emailFailed = failedArms.includes('email') && emailArm === null;
  const blogFailed = failedArms.includes('blog') && blogArm === null;

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

  // The email arm is a marketingCampaign the Campaigns tab already lists. While
  // it's a DRAFT the builder edits it in place (the same ?edit=<id> deep-link
  // CampaignsTab.openRow uses); once it left draft, land on the Campaigns list.
  const openEmailArm = () => {
    if (emailArm === null) return;
    onClose();
    if (emailArm.status.toUpperCase() === 'DRAFT') {
      navigate(
        `${AppPath.MarketingCampaignBuilder}?edit=${encodeURIComponent(emailArm.id)}`,
      );
      return;
    }
    navigate(`${AppPath.MarketingHub}?tab=campaigns`);
  };

  // The blog arm rides the Blog board (Website tab, sub=blog). Same one-shot
  // deep-link pattern as ?edit= — BlogTab consumes ?post=<id> and opens the
  // post's detail drawer once the pipeline loads.
  const openBlogArm = () => {
    if (blogArm === null) return;
    onClose();
    navigate(
      `${AppPath.MarketingHub}?tab=website&sub=blog&post=${encodeURIComponent(blogArm.id)}`,
    );
  };

  // Per-arm Regenerate (V2) — re-run ONE planned-but-failed arm's bench via
  // generateArm. Idempotent-safe: the arm already existing (a client timeout on
  // a call that landed server-side) answers alreadyExists → just reload.
  const regenArm = async (arm: SpineArm) => {
    if (campaignId === null || busy) return;
    setArmRegenBusy(arm);
    const res = await generateArm(campaignId, arm);
    setArmRegenBusy(null);
    if (!res.ok) {
      notify(res.error, 'error');
      return;
    }
    notify(
      res.alreadyExists
        ? 'That channel already generated — reloading it.'
        : 'Channel regenerated.',
      'success',
    );
    onChanged();
    void load();
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
            : arms[0] === 'social'
              ? 'Social plan approved — posts are scheduling.'
              : arms[0] === 'email'
                ? 'Email campaign approved — ready in Campaigns (nothing sends until you send it).'
                : 'Blog post approved — it advances on the blog pipeline.'
          : 'Campaign approved — every channel is shipping.',
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

  // Whole-redo, labeled honestly: re-runs the whole spine (strategist + every
  // planned arm) from the same brief as a NEW campaign; this one is archived
  // (best-effort) once the redo lands. For ONE failed arm prefer regenArm above.
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
  const emailCanPartialApprove =
    gates !== null && gates.email === null && emailArm !== null;
  const blogCanPartialApprove =
    gates !== null && gates.blog === null && blogArm !== null;

  // ── arm cards ────────────────────────────────────────────────────────────────

  // The V2 per-arm redo for a planned-but-failed arm (generateArm; idempotent).
  const regenArmButton = (arm: SpineArm, label: string) => (
    <Button
      size="compact-sm"
      variant="light"
      color="red"
      leftSection={<IconRefresh size={14} />}
      loading={armRegenBusy === arm}
      disabled={busy && armRegenBusy !== arm}
      onClick={() => void regenArm(arm)}
    >
      {label}
    </Button>
  );

  // A partial-approve button for an arm whose gate passed while others failed.
  const partialApproveButton = (arm: SpineArm, label: string) => (
    <Button
      size="compact-sm"
      variant="light"
      color="teal"
      leftSection={<IconCheck size={14} />}
      loading={approving && approvingArm === arm}
      disabled={busy && approvingArm !== arm}
      onClick={() => void approve([arm])}
    >
      {label}
    </Button>
  );

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
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              Landing page generation failed — retry just this channel.
            </Text>
            {regenArmButton('lp', 'Regenerate landing page')}
          </Stack>
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
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              Social plan generation failed — retry just this channel.
            </Text>
            {regenArmButton('social', 'Regenerate social plan')}
          </Stack>
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

  // ── the email arm card (V2) — a DRAFT marketingCampaign, never auto-sent ─────
  const emailCard = (
    <Paper
      withBorder
      radius="md"
      p="sm"
      style={
        emailFailed || gates?.email
          ? { borderColor: 'var(--mantine-color-red-5)', borderWidth: 2 }
          : undefined
      }
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon size="md" variant="light" color="cyan">
            <IconMail size={15} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} truncate>
              {emailArm !== null ? emailArm.name || 'Email campaign' : 'Email campaign'}
            </Text>
            {emailArm !== null ? (
              <Text size="xs" c="dimmed">
                Drafted — you pick the recipients before anything sends.
              </Text>
            ) : null}
          </Box>
        </Group>
        {emailArm !== null ? (
          <Badge size="sm" variant="light" color={statusColor(emailArm.status)}>
            {emailArm.status || '—'}
          </Badge>
        ) : null}
      </Group>

      {emailFailed ? (
        <Alert
          color="red"
          variant="light"
          mt="xs"
          icon={<IconAlertTriangle size={16} />}
        >
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              Email draft generation failed — retry just this channel.
            </Text>
            {regenArmButton('email', 'Regenerate email draft')}
          </Stack>
        </Alert>
      ) : emailArm === null ? (
        <Text size="xs" c="dimmed" mt="xs">
          No email campaign is linked to this campaign.
        </Text>
      ) : (
        <>
          {gates?.email ? (
            <Alert
              color="red"
              variant="light"
              mt="xs"
              icon={<IconAlertTriangle size={16} />}
            >
              {gates.email}
            </Alert>
          ) : null}
          <Group gap="xs" mt="sm">
            <Button
              size="compact-sm"
              variant="light"
              color="cyan"
              leftSection={<IconPencil size={14} />}
              onClick={openEmailArm}
              disabled={busy}
            >
              Open in Campaigns
            </Button>
            {emailCanPartialApprove
              ? partialApproveButton('email', 'Approve email only')
              : null}
          </Group>
        </>
      )}
    </Paper>
  );

  // ── the blog arm card (V2) — a pipeline blogPost, never auto-published ───────
  const blogCard = (
    <Paper
      withBorder
      radius="md"
      p="sm"
      style={
        blogFailed || gates?.blog
          ? { borderColor: 'var(--mantine-color-red-5)', borderWidth: 2 }
          : undefined
      }
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon size="md" variant="light" color="orange">
            <IconFileText size={15} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} truncate>
              {blogArm !== null ? blogArm.title || 'Blog post' : 'Blog post'}
            </Text>
            {blogArm !== null ? (
              <Text size="xs" c="dimmed">
                Drafted into the blog pipeline — publishes only after approval.
              </Text>
            ) : null}
          </Box>
        </Group>
        {blogArm !== null ? (
          <Badge size="sm" variant="light" color={statusColor(blogArm.status)}>
            {blogArm.status || '—'}
          </Badge>
        ) : null}
      </Group>

      {blogFailed ? (
        <Alert
          color="red"
          variant="light"
          mt="xs"
          icon={<IconAlertTriangle size={16} />}
        >
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              Blog draft generation failed — retry just this channel.
            </Text>
            {regenArmButton('blog', 'Regenerate blog draft')}
          </Stack>
        </Alert>
      ) : blogArm === null ? (
        <Text size="xs" c="dimmed" mt="xs">
          No blog post is linked to this campaign.
        </Text>
      ) : (
        <>
          {gates?.blog ? (
            <Alert
              color="red"
              variant="light"
              mt="xs"
              icon={<IconAlertTriangle size={16} />}
            >
              {gates.blog}
            </Alert>
          ) : null}
          <Group gap="xs" mt="sm">
            <Button
              size="compact-sm"
              variant="light"
              color="orange"
              leftSection={<IconEye size={14} />}
              onClick={openBlogArm}
              disabled={busy}
            >
              Open in Blog
            </Button>
            {blogCanPartialApprove
              ? partialApproveButton('blog', 'Approve blog only')
              : null}
          </Group>
        </>
      )}
    </Paper>
  );

  // ── the Roll-up strip (V2) — arm metrics aggregated server-side on `get`.
  // Renders ONLY the stats the route reported (non-null); fully hidden when a
  // v1 route (no rollup) answered or nothing has numbers yet.
  const rollupStats: { label: string; value: string }[] = [];
  if (rollup !== null) {
    const pushStat = (label: string, value: number | null, prefix = '') => {
      if (value !== null) {
        rollupStats.push({ label, value: `${prefix}${value.toLocaleString()}` });
      }
    };
    pushStat('Visits', rollup.visits);
    pushStat('Leads', rollup.leads);
    pushStat('Sent', rollup.sent);
    pushStat('Opens', rollup.opens);
    pushStat('Attributed', rollup.attributedRevenue, 'AED ');
  }

  const rollupStrip =
    rollupStats.length > 0 ? (
      <Paper withBorder radius="md" p="sm">
        <Group gap={6} mb={6} wrap="nowrap">
          <IconTrendingUp
            size={14}
            style={{ color: 'var(--mantine-color-dimmed)' }}
          />
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
            Roll-up
          </Text>
        </Group>
        <Group gap="lg" wrap="wrap">
          {rollupStats.map((s) => (
            <Box key={s.label}>
              <Text size="lg" fw={700} ff="monospace">
                {s.value}
              </Text>
              <Text size="xs" c="dimmed">
                {s.label}
              </Text>
            </Box>
          ))}
        </Group>
      </Paper>
    ) : null;

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
                <SubmissionBadge
                  size="sm"
                  submittedForApprovalAt={campaign?.submittedForApprovalAt}
                  sentBackAt={campaign?.sentBackAt}
                  sentBackNote={campaign?.sentBackNote}
                />
              </Group>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {detail !== null
                  ? 'One story across every channel · review, then approve'
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

              {rollupStrip}

              {lpCard}
              {socialCard}
              {emailCard}
              {blogCard}

              {regenerating ? (
                <Alert
                  color="blue"
                  variant="light"
                  icon={<IconRefresh size={16} />}
                >
                  Re-running every channel from the same brief — this takes about
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
                title="Re-runs every channel from the same brief as a new campaign; this one is archived."
              >
                Regenerate campaign
              </Button>
            </Group>
            {(() => {
              const nothingToShip =
                lpArm === null &&
                socialArm === null &&
                emailArm === null &&
                blogArm === null;
              if (publishLoading) {
                return (
                  <Button
                    color="teal"
                    size="sm"
                    leftSection={<IconCheck size={16} />}
                    disabled
                  >
                    Approve campaign
                  </Button>
                );
              }
              if (canPublish) {
                return (
                  <Button
                    color="teal"
                    size="sm"
                    leftSection={<IconCheck size={16} />}
                    loading={approving && approvingArm === null}
                    disabled={
                      (busy && !(approving && approvingArm === null)) ||
                      nothingToShip
                    }
                    onClick={() => void approve()}
                  >
                    Approve campaign
                  </Button>
                );
              }
              return (
                <SubmitForApprovalButton
                  kind="CAMPAIGN"
                  id={campaignId}
                  alreadySubmitted={
                    campaign?.submittedForApprovalAt != null &&
                    campaign.submittedForApprovalAt !== ''
                  }
                  disabled={busy || nothingToShip}
                  onSubmitted={() => {
                    onChanged();
                    void load();
                  }}
                  iconSize={16}
                />
              );
            })()}
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
