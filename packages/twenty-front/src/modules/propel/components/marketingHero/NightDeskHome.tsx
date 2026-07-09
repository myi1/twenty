import {
  Accordion,
  Anchor,
  Badge,
  Box,
  Button,
  Center,
  Collapse,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Layouts } from 'react-grid-layout';
import { AppPath } from 'twenty-shared/types';
import {
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconChevronDown,
  IconLayoutDashboard,
  IconMessage,
  IconPencil,
  IconRefresh,
  IconSend,
  IconSparkles,
  IconUserPlus,
} from 'twenty-ui/display';
import { MarketingDashboardGrid } from '@/propel/components/MarketingDashboardGrid';
import { CampaignReviewPanel } from '@/propel/components/marketingHero/CampaignReviewPanel';
import { CampaignSpinePanel } from '@/propel/components/marketingHero/CampaignSpinePanel';
import { PlanReviewPanel } from '@/propel/components/marketingHero/PlanReviewPanel';
import {
  BRASS_TINT_BG,
  BRASS_TINT_BORDER,
  Eyebrow,
  Seal,
  type SealKind,
  plural,
  useBrass,
  useSeal,
} from '@/propel/components/marketingHero/deskShared';
import { SlaAgeChip } from '@/propel/components/website/SlaAgeChip';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { useMarketingDashboardData } from '@/propel/hooks/useMarketingDashboardData';
import { useSiteLeads } from '@/propel/hooks/useSiteLeads';
import {
  type CampaignListItem,
  type SpineArm,
  dismissCampaign,
  listCampaigns,
} from '@/propel/lib/campaignSpineCrm';
import { composeDeskBrief } from '@/propel/lib/composeDeskBrief';
import {
  type PendingApprovalItem,
  approveWorkItem,
  getPendingApprovals,
  sendBackWorkItem,
} from '@/propel/lib/marketingApprovals';
import { assignLead, listInboxAgents } from '@/propel/lib/inboxApi';
import { type InboxAgentOption } from '@/propel/types/inbox';
import {
  type LandingPageSummary,
  type RefresherDiff,
  listLandingPages,
  readRefresherDiffs,
  refresherApply,
  refresherDismiss,
} from '@/propel/lib/landingPagesCrm';
import { getStyle } from '@/propel/lib/socialStyleCrm';
import {
  type AiCostSummary,
  getAiCostSummary,
} from '@/propel/lib/aiCostCrm';
import {
  type SocialPlanListItem,
  listSocialPlans,
} from '@/propel/lib/socialCrm';
import { ageMinutes, relativeAge, type SiteLead } from '@/propel/lib/websiteCrm';
import { type AnalyticsRange, type AttentionRow } from '@/propel/types/marketingHome';

// ─────────────────────────────────────────────────────────────────────────────
// The Marketing home — "The Night Desk" (approved spec
// docs/superpowers/specs/2026-07-09-marketing-home-night-desk-design.md).
//
// A night desk / control tower for the brokerage: the COO opens this to APPROVE
// what the machine drafted overnight and confirm nothing's dropping. Not a
// passive metric grid. Three anchored parts:
//   1. A full-width brief band — one deterministic plain-English sentence
//      (composeDeskBrief) + ONE quiet "Start a campaign" action (the Spine flow).
//   2. Left column — the accordion SIGN-OFF QUEUE ("Awaiting your sign-off · N"):
//      one row per the spec's row-by-row data map, each seal-coded (red=act /
//      amber=attention / brass=review / grey=routine). A row with no available
//      source is HIDDEN — never a fabricated count.
//   3. Right column — "Running for you": a soft brass-tinted monitoring zone —
//      the overnight engine report, "The month" pulse (+ the 7d/30d/90d control
//      that ALSO feeds the full dashboard behind "Full →"), and an honest
//      "What it cost" block.
//
// Honesty contract: every count is wired to its CORRECT source per the data map;
// an absent source hides the card (or shows "—" with a note); the brief reads the
// SAME counts the seals show, so sentence and queue can never disagree.
// ─────────────────────────────────────────────────────────────────────────────

// The brass/seal theme primitives (useBrass, useSeal, Eyebrow, Seal, plural) now
// live in ./deskShared so the agent "My Desk" reuses the exact same theme-aware
// hooks — no hardcoded dark hex is reintroduced here.

// Lead-system first-touch SLA (LEAD-SYSTEM-SPEC §2 = 10 minutes) — the same
// target SiteLeadsTab / SiteLeadDrawer use, so the clock reads identically.
const SLA_TARGET_MINUTES = 10;

const NIGHT_DESK_GRID_CSS = `
.propel-night-desk-grid {
  display: grid;
  grid-template-columns: minmax(300px, 1.55fr) minmax(240px, 1fr);
  gap: 20px;
  align-items: start;
}
@media (max-width: 780px) {
  .propel-night-desk-grid { grid-template-columns: 1fr; }
}`;

// ── Brass sparkline (trend) — pure SVG, no deps ──────────────────────────────
const Sparkline = ({ points }: { points: number[] }) => {
  const brass = useBrass();
  if (points.length < 2) return null;
  const w = 96;
  const h = 26;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / span) * (h - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }} aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={brass}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// ── One unassigned lead — live SLA clock + assign-to-agent (real /lead/assign) ─
const SlaLeadRow = ({
  lead,
  agents,
  now,
  onAssigned,
}: {
  lead: SiteLead;
  agents: InboxAgentOption[];
  now: number;
  onAssigned: () => void;
}) => {
  const navigate = useNavigate();
  const notify = usePropelToast();
  const [agentId, setAgentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const age = ageMinutes(lead.createdAt, new Date(now));

  const assign = async () => {
    if (agentId === null || busy) return;
    setBusy(true);
    const res = await assignLead({
      personId: lead.id,
      agentWorkspaceMemberId: agentId,
    });
    setBusy(false);
    if (res && res.ok === true) {
      notify(`Routed ${lead.name} to an agent.`, 'success');
      onAssigned();
    } else {
      notify(res?.error ?? 'Could not route this lead.', 'error');
    }
  };

  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
        <Box style={{ minWidth: 0 }}>
          <Group gap={8} wrap="nowrap">
            <Text fw={600} size="sm" truncate>
              {lead.name}
            </Text>
            <SlaAgeChip
              ageMinutes={age}
              breached={lead.slaBreached}
              targetMinutes={SLA_TARGET_MINUTES}
              ageLabel={relativeAge(lead.createdAt, new Date(now))}
            />
          </Group>
          <Text size="xs" c="dimmed" truncate>
            {lead.formTypeLabel}
            {lead.phone ? ` · ${lead.phone}` : lead.email ? ` · ${lead.email}` : ''}
          </Text>
        </Box>
      </Group>
      <Group gap="xs" mt="xs" wrap="nowrap">
        <Select
          size="xs"
          placeholder="Choose agent"
          searchable
          data={agents.map((a) => ({ value: a.id, label: a.name }))}
          value={agentId}
          onChange={setAgentId}
          comboboxProps={{ zIndex: 5000 }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button
          size="xs"
          color="red"
          variant="light"
          loading={busy}
          disabled={agentId === null}
          leftSection={<IconUserPlus size={13} />}
          onClick={() => void assign()}
        >
          Route
        </Button>
        <Anchor
          size="xs"
          c="dimmed"
          onClick={() => navigate(`/object/person/${lead.id}`)}
          style={{ whiteSpace: 'nowrap' }}
        >
          Open
        </Anchor>
      </Group>
    </Paper>
  );
};

// ── One campaign reply awaiting a reply-back (hub HOT_REPLY) ──────────────────
const ReplyRow = ({ row }: { row: AttentionRow }) => {
  const navigate = useNavigate();
  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
        <Box style={{ minWidth: 0 }}>
          <Text fw={600} size="sm" truncate>
            {row.title}
          </Text>
          {row.detail ? (
            <Text size="xs" c="dimmed" lineClamp={2}>
              {row.detail}
            </Text>
          ) : null}
          {row.whenLabel ? (
            <Text size="xs" c="dimmed" mt={2}>
              {row.whenLabel}
            </Text>
          ) : null}
        </Box>
        <Button
          size="xs"
          variant="light"
          color="yellow"
          leftSection={<IconMessage size={13} />}
          onClick={() => navigate(AppPath.Inbox)}
          style={{ flexShrink: 0 }}
        >
          Reply
        </Button>
      </Group>
    </Paper>
  );
};

// ── One Scout-proposed campaign (the `campaign` Spine object) ─────────────────
const ScoutRow = ({
  item,
  onReview,
  onChanged,
}: {
  item: CampaignListItem;
  onReview: (id: string) => void;
  onChanged: () => void;
}) => {
  const notify = usePropelToast();
  const brass = useBrass();
  const [busy, setBusy] = useState(false);
  const win =
    item.windowStart && item.windowEnd
      ? `${item.windowStart.slice(0, 10)} → ${item.windowEnd.slice(0, 10)}`
      : '';

  const dismiss = async () => {
    if (busy) return;
    setBusy(true);
    const res = await dismissCampaign(item.id);
    setBusy(false);
    if (res.ok) {
      notify('Campaign dismissed.', 'success');
      onChanged();
    } else {
      notify(res.error, 'error');
    }
  };

  return (
    <Paper withBorder radius="md" p="sm">
      <Box style={{ minWidth: 0 }}>
        <Text fw={600} size="sm" truncate>
          {item.name || 'Untitled campaign'}
        </Text>
        {item.brief ? (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {item.brief}
          </Text>
        ) : null}
        {win ? (
          <Text size="xs" c="dimmed" mt={2}>
            {win}
          </Text>
        ) : null}
      </Box>
      <Group gap="xs" mt="xs">
        <Button
          size="xs"
          variant="light"
          color="gray"
          leftSection={<IconSparkles size={13} color={brass} />}
          onClick={() => onReview(item.id)}
        >
          Review
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          loading={busy}
          onClick={() => void dismiss()}
        >
          Dismiss
        </Button>
      </Group>
    </Paper>
  );
};

// ── One landing-page draft to review (distinct object from Scout campaigns) ───
const DraftRow = ({ page }: { page: LandingPageSummary }) => {
  const navigate = useNavigate();
  const brass = useBrass();
  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Box style={{ minWidth: 0 }}>
          <Text fw={600} size="sm" truncate>
            {page.title || 'Untitled page'}
          </Text>
          <Text size="xs" c="dimmed" ff="monospace" truncate>
            /{page.slug}
          </Text>
        </Box>
        <Button
          size="xs"
          variant="light"
          color="gray"
          leftSection={<IconPencil size={13} color={brass} />}
          onClick={() =>
            navigate(
              `${AppPath.MarketingHub}?tab=website&sub=landing-pages&edit=${encodeURIComponent(
                page.id,
              )}`,
            )
          }
          style={{ flexShrink: 0 }}
        >
          Review
        </Button>
      </Group>
    </Paper>
  );
};

// ── One PROPOSED social plan to review (opens the shared PlanReviewPanel) ─────
const SocialPlanRow = ({
  plan,
  onReview,
}: {
  plan: SocialPlanListItem;
  onReview: (id: string) => void;
}) => {
  const brass = useBrass();
  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Box style={{ minWidth: 0 }}>
          <Text fw={600} size="sm" truncate>
            {plan.name || 'Untitled plan'}
          </Text>
          <Text size="xs" c="dimmed">
            Social plan
            {plan.createdAt ? ` · ${plan.createdAt.slice(0, 10)}` : ''}
          </Text>
        </Box>
        <Button
          size="xs"
          variant="light"
          color="gray"
          leftSection={<IconSparkles size={13} color={brass} />}
          onClick={() => onReview(plan.id)}
          style={{ flexShrink: 0 }}
        >
          Review
        </Button>
      </Group>
    </Paper>
  );
};

// ── One stale live page (the Refresher queue) ─────────────────────────────────
const StaleRow = ({
  page,
  diffs,
  onChanged,
}: {
  page: LandingPageSummary;
  diffs: RefresherDiff[];
  onChanged: () => void;
}) => {
  const notify = usePropelToast();
  const [busy, setBusy] = useState<'fix' | 'dismiss' | null>(null);

  const run = async (kind: 'fix' | 'dismiss') => {
    if (busy !== null) return;
    setBusy(kind);
    const res =
      kind === 'fix'
        ? await refresherApply(page.id)
        : await refresherDismiss(page.id);
    setBusy(null);
    if (res.ok) {
      notify(kind === 'fix' ? 'Applied the fix.' : 'Dismissed.', 'success');
      onChanged();
    } else {
      notify(res.error, 'error');
    }
  };

  return (
    <Paper withBorder radius="md" p="sm">
      <Box style={{ minWidth: 0 }}>
        <Text fw={600} size="sm" truncate>
          {page.title || 'Untitled page'}
        </Text>
        <Text size="xs" c="dimmed" lineClamp={2}>
          {diffs.length} {plural('change', diffs.length)} flagged
          {diffs[0]?.detail ? ` — ${diffs[0].detail}` : ''}
        </Text>
      </Box>
      <Group gap="xs" mt="xs">
        <Button
          size="xs"
          variant="light"
          color="gray"
          loading={busy === 'fix'}
          leftSection={<IconRefresh size={13} />}
          onClick={() => void run('fix')}
        >
          Fix
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          loading={busy === 'dismiss'}
          onClick={() => void run('dismiss')}
        >
          Dismiss
        </Button>
      </Group>
    </Paper>
  );
};

// ── One submitted-for-approval item (maker-checker Phase 2, manager side) ─────
// The publisher's two moves on a draft an agent submitted: Approve & publish (runs
// the REAL publish under the publisher's authority, so the permit/consent gate
// fires — reusing the per-kind approve fn) or Send back (a note → the agent sees it
// "came back to you"). Both degrade gracefully — a route that isn't live surfaces a
// plain-language toast, never a crash.
const KIND_LABEL: Record<PendingApprovalItem['kind'], string> = {
  LANDING_PAGE: 'Landing page',
  SOCIAL_PLAN: 'Social plan',
  CAMPAIGN: 'Campaign',
  BLOG: 'Blog post',
};

const SubmittedApprovalRow = ({
  item,
  onChanged,
}: {
  item: PendingApprovalItem;
  onChanged: () => void;
}) => {
  const notify = usePropelToast();
  const brass = useBrass();
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'sendBack' | null>(null);

  const approve = async () => {
    if (busy !== null) return;
    setBusy('approve');
    const res = await approveWorkItem(item.kind, item.id);
    setBusy(null);
    if (res.ok) {
      notify('Published.', 'success');
      onChanged();
    } else {
      notify(res.error, 'error');
    }
  };

  const sendBack = async () => {
    if (busy !== null) return;
    setBusy('sendBack');
    const res = await sendBackWorkItem(item.kind, item.id, note);
    setBusy(null);
    if (res.ok) {
      notify('Sent back to the agent.', 'info');
      onChanged();
    } else {
      notify(res.error, 'error');
    }
  };

  return (
    <Paper withBorder radius="md" p="sm">
      <Box style={{ minWidth: 0 }}>
        <Text fw={600} size="sm" truncate>
          {item.title || 'Untitled'}
        </Text>
        <Text size="xs" c="dimmed">
          {KIND_LABEL[item.kind]}
          {item.submittedForApprovalAt
            ? ` · submitted ${item.submittedForApprovalAt.slice(0, 10)}`
            : ''}
        </Text>
      </Box>
      <Group gap="xs" mt="xs">
        <Button
          size="xs"
          variant="light"
          color="teal"
          loading={busy === 'approve'}
          disabled={busy === 'sendBack'}
          leftSection={<IconCheck size={13} />}
          onClick={() => void approve()}
        >
          Approve &amp; publish
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          disabled={busy !== null}
          leftSection={<IconSend size={13} color={brass} />}
          onClick={() => setShowNote((v) => !v)}
        >
          Send back
        </Button>
      </Group>
      <Collapse in={showNote}>
        <Stack gap="xs" mt="xs">
          <Textarea
            size="xs"
            placeholder="Add a note for the agent (optional)…"
            autosize
            minRows={2}
            maxRows={5}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              size="compact-xs"
              variant="light"
              color="orange"
              loading={busy === 'sendBack'}
              onClick={() => void sendBack()}
            >
              Send back to agent
            </Button>
          </Group>
        </Stack>
      </Collapse>
    </Paper>
  );
};

// A cost line in "What it cost" — value + an optional honest note when unknown.
const CostLine = ({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: boolean;
}) => {
  const brass = useBrass();
  return (
    <Group justify="space-between" align="baseline" wrap="nowrap" gap="sm">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Box style={{ textAlign: 'right', minWidth: 0 }}>
        <Text
          size="sm"
          fw={accent ? 700 : 500}
          c={accent ? undefined : 'var(--mantine-color-text)'}
          style={accent ? { color: brass } : undefined}
        >
          {value}
        </Text>
        {note ? (
          <Text size="xs" c="dimmed">
            {note}
          </Text>
        ) : null}
      </Box>
    </Group>
  );
};

export const NightDeskHome = () => {
  const navigate = useNavigate();
  const brass = useBrass();
  const seal = useSeal();

  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [editMode, setEditMode] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showSpine, setShowSpine] = useState(false);
  // Campaign spine review — hosted at home level (mirrors CampaignsTab).
  const [spineReview, setSpineReview] = useState<{
    id: string;
    failed: SpineArm[];
  } | null>(null);
  // Social plan review — same home-level pattern (id → PlanReviewPanel drawer).
  const [planReviewId, setPlanReviewId] = useState<string | null>(null);
  // Bumped to re-fetch the queue sources after a mutation.
  const [needsRefresh, setNeedsRefresh] = useState(0);
  // Ticks so the SLA clocks + greeting recompute live (client-side).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const {
    analytics,
    hub,
    layouts,
    setLayouts,
    enabledWidgetIds,
    isLoading,
    layoutLoaded,
    persistLayout,
  } = useMarketingDashboardData(range);

  const {
    metrics: siteLeadMetrics,
    leads,
    phase: siteLeadsPhase,
    reload: reloadSiteLeads,
  } = useSiteLeads();

  // ── Scout campaigns (the `campaign` Spine object — NOT marketingCampaign) ────
  const [campaigns, setCampaigns] = useState<{
    available: boolean;
    scout: CampaignListItem[];
  } | null>(null);
  useEffect(() => {
    let live = true;
    void listCampaigns().then((res) => {
      if (!live) return;
      if (res.ok) {
        setCampaigns({
          available: true,
          scout: res.campaigns.filter(
            (c) =>
              c.sourceKind !== 'MANUAL' &&
              (c.status === 'DRAFTING' || c.status === 'REVIEW'),
          ),
        });
      } else {
        setCampaigns({ available: false, scout: [] });
      }
    });
    return () => {
      live = false;
    };
  }, [needsRefresh]);

  // ── Landing pages → BOTH drafts-to-review AND the stale/Refresher queue ──────
  const [landing, setLanding] = useState<{
    available: boolean;
    drafts: LandingPageSummary[];
    stale: { page: LandingPageSummary; diffs: RefresherDiff[] }[];
    liveCount: number;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void listLandingPages().then((res) => {
      if (!live) return;
      if (res.ok) {
        const pages = res.data.pages;
        setLanding({
          available: true,
          drafts: pages.filter((p) => p.status === 'DRAFT'),
          stale: pages
            .map((p) => ({ page: p, diffs: readRefresherDiffs(p.refresherJson) }))
            .filter((x) => x.diffs.length > 0),
          liveCount: pages.filter((p) => p.status === 'LIVE').length,
        });
      } else {
        setLanding({ available: false, drafts: [], stale: [], liveCount: 0 });
      }
    });
    return () => {
      live = false;
    };
  }, [needsRefresh]);

  // ── Style-learning (overnight report line only) ─────────────────────────────
  const [style, setStyle] = useState<{
    available: boolean;
    coldStart: boolean;
    sampleSize: number;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void getStyle().then((res) => {
      if (!live) return;
      if (res.ok) {
        setStyle({
          available: true,
          coldStart:
            res.profile.sampleSize <= 0 ||
            Object.keys(res.profile.perPlatform).length === 0,
          sampleSize: res.profile.sampleSize,
        });
      } else {
        setStyle({ available: false, coldStart: false, sampleSize: 0 });
      }
    });
    return () => {
      live = false;
    };
  }, []);

  // ── Social plans (PROPOSED) → the "Drafts to review" second half + Review ────
  const [socialPlans, setSocialPlans] = useState<{
    available: boolean;
    pending: SocialPlanListItem[];
  } | null>(null);
  useEffect(() => {
    let live = true;
    void listSocialPlans().then((res) => {
      if (!live) return;
      if (res.ok) {
        setSocialPlans({
          available: true,
          pending: res.plans.filter((p) => p.status === 'PROPOSED'),
        });
      } else {
        setSocialPlans({ available: false, pending: [] });
      }
    });
    return () => {
      live = false;
    };
  }, [needsRefresh]);

  // ── AI-cost ledger → the "What it cost" block (re-reads on the range change) ──
  const [aiCost, setAiCost] = useState<AiCostSummary | null>(null);
  useEffect(() => {
    let live = true;
    void getAiCostSummary(range).then((res) => {
      if (!live) return;
      // null = route unavailable / transient / non-Manager → cost lines show "—";
      // a live-but-idle ledger returns a real summary (totalAed:0) → "AED 0".
      setAiCost(res.ok ? res.summary : null);
    });
    return () => {
      live = false;
    };
  }, [range]);

  // ── Agent directory (for the lead-assign picker) ────────────────────────────
  const [agents, setAgents] = useState<InboxAgentOption[]>([]);
  useEffect(() => {
    let live = true;
    void listInboxAgents().then((list) => {
      if (live) setAgents(list);
    });
    return () => {
      live = false;
    };
  }, []);

  // ── Submitted-for-approval queue (maker-checker Phase 2, manager side) ───────
  // The items agents submitted, awaiting this publisher's sign-off. The route is
  // publisher-only server-side; on any failure it resolves `unavailable` and the
  // row simply hides (never a fabricated count). This home only renders for a
  // publisher, so we always attempt the fetch.
  const [pending, setPending] = useState<{
    available: boolean;
    items: PendingApprovalItem[];
  } | null>(null);
  useEffect(() => {
    let live = true;
    void getPendingApprovals().then((res) => {
      if (!live) return;
      setPending(
        res.ok
          ? { available: true, items: res.items }
          : { available: false, items: [] },
      );
    });
    return () => {
      live = false;
    };
  }, [needsRefresh]);

  const reloadQueue = useCallback(() => {
    setNeedsRefresh((n) => n + 1);
    reloadSiteLeads();
  }, [reloadSiteLeads]);

  // ── Derived queue data (each gated on its own source availability) ──────────
  const siteLeadsReady = siteLeadsPhase === 'ready';
  const unassignedLeads = useMemo(
    () =>
      leads
        .filter((l) => l.assigneeId === null)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [leads],
  );

  const repliesAvailable = hub !== null;
  const hotReplies = useMemo<AttentionRow[]>(
    () => (hub?.needsAttention ?? []).filter((a) => a.kind === 'HOT_REPLY'),
    [hub],
  );

  const campaignsAvailable = campaigns?.available === true;
  const scoutItems = campaigns?.scout ?? [];
  const landingAvailable = landing?.available === true;
  const draftPages = landing?.drafts ?? [];
  const stalePagesList = landing?.stale ?? [];
  const socialPlansAvailable = socialPlans?.available === true;
  const pendingPlans = socialPlans?.pending ?? [];
  const pendingApprovalsAvailable = pending?.available === true;
  const pendingApprovals = pending?.items ?? [];

  // Counts — the single source of truth the seals AND the brief both read.
  const counts = {
    slaLeads: siteLeadsReady ? unassignedLeads.length : 0,
    replies: repliesAvailable ? hotReplies.length : 0,
    scout: campaignsAvailable ? scoutItems.length : 0,
    drafts: landingAvailable ? draftPages.length : 0,
    // PROPOSED social plans — folded into the "Drafts to review" row (the second
    // half of the breakdown). Only counted when the list route is live.
    socialPlans: socialPlansAvailable ? pendingPlans.length : 0,
    stale: landingAvailable ? stalePagesList.length : 0,
  };
  // The "Drafts to review" row spans BOTH landing-page drafts and pending social
  // plans; the seal badge + the brief read this combined figure so they agree.
  const draftsToReview = counts.drafts + counts.socialPlans;
  // Items agents submitted for approval — a first-class sign-off row (Phase 2).
  const pendingApprovalCount = pendingApprovalsAvailable
    ? pendingApprovals.length
    : 0;
  const totalToSignOff =
    counts.slaLeads +
    counts.replies +
    pendingApprovalCount +
    counts.scout +
    draftsToReview +
    counts.stale;

  // The overnight engine "ran" if any of its report sources resolved.
  const engineRan =
    style?.available === true ||
    campaignsAvailable ||
    landingAvailable ||
    socialPlansAvailable;

  const brief = useMemo(
    () =>
      composeDeskBrief({
        hour: new Date(now).getHours(),
        slaLeads: counts.slaLeads,
        replies: counts.replies,
        scoutCampaigns: counts.scout,
        drafts: draftsToReview,
        stalePages: counts.stale,
        engineRan,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      now,
      counts.slaLeads,
      counts.replies,
      counts.scout,
      draftsToReview,
      counts.stale,
      engineRan,
    ],
  );

  // ── Sign-off rows, in seal priority; only rows WITH a source are pushed ─────
  interface QueueRow {
    key: string;
    seal: SealKind;
    label: string;
    count: number;
    summary: string;
    body: React.ReactNode;
  }
  const rows: QueueRow[] = [];
  if (siteLeadsReady) {
    rows.push({
      key: 'leads',
      seal: 'red',
      label: 'New lead, no agent',
      count: counts.slaLeads,
      summary:
        counts.slaLeads === 0
          ? 'Every website lead is routed'
          : `${counts.slaLeads} ${plural('lead', counts.slaLeads)} waiting to be routed${
              siteLeadMetrics.slaBreaches > 0
                ? ` · ${siteLeadMetrics.slaBreaches} past SLA`
                : ''
            }`,
      body:
        counts.slaLeads === 0 ? (
          <Text size="sm" c="dimmed">
            No unassigned website leads right now.
          </Text>
        ) : (
          <Stack gap="xs">
            {unassignedLeads.map((l) => (
              <SlaLeadRow
                key={l.id}
                lead={l}
                agents={agents}
                now={now}
                onAssigned={reloadQueue}
              />
            ))}
          </Stack>
        ),
    });
  }
  if (repliesAvailable) {
    rows.push({
      key: 'replies',
      seal: 'amber',
      label: 'Campaign replies',
      count: counts.replies,
      summary:
        counts.replies === 0
          ? 'No replies waiting'
          : `${counts.replies} ${plural('reply', counts.replies)} in the window`,
      body:
        counts.replies === 0 ? (
          <Text size="sm" c="dimmed">
            No campaign replies need you.
          </Text>
        ) : (
          <Stack gap="xs">
            {hotReplies.map((r) => (
              <ReplyRow key={r.id} row={r} />
            ))}
            <Anchor size="xs" onClick={() => navigate(AppPath.Inbox)}>
              Open inbox →
            </Anchor>
          </Stack>
        ),
    });
  }
  // ── Submitted for approval (maker-checker Phase 2) — agents' drafts awaiting
  // this publisher's sign-off, grouped by who submitted them. Only present when
  // the publisher-only route resolved AND there is something to sign off. ──────
  if (pendingApprovalsAvailable && pendingApprovalCount > 0) {
    const submitterName = (memberId: string | null): string => {
      if (memberId === null) return 'An agent';
      return agents.find((a) => a.id === memberId)?.name ?? 'An agent';
    };
    const grouped = new Map<string, PendingApprovalItem[]>();
    for (const it of pendingApprovals) {
      const key = it.submittedByMemberId ?? '';
      const arr = grouped.get(key) ?? [];
      arr.push(it);
      grouped.set(key, arr);
    }
    const kindTotals = pendingApprovals.reduce<Record<string, number>>(
      (acc, it) => {
        acc[it.kind] = (acc[it.kind] ?? 0) + 1;
        return acc;
      },
      {},
    );
    const breakdown = (
      [
        ['LANDING_PAGE', 'page'],
        ['SOCIAL_PLAN', 'social plan'],
        ['CAMPAIGN', 'campaign'],
        ['BLOG', 'post'],
      ] as const
    )
      .map(([k, noun]) =>
        kindTotals[k] ? `${kindTotals[k]} ${plural(noun, kindTotals[k])}` : null,
      )
      .filter((s): s is string => s !== null);
    const names = [...grouped.keys()]
      .map((k) => submitterName(k === '' ? null : k))
      .slice(0, 2);
    rows.push({
      key: 'submitted',
      seal: 'brass',
      label: 'Submitted for approval',
      count: pendingApprovalCount,
      summary:
        `${breakdown.join(' · ')}${names.length > 0 ? ` · from ${names.join(', ')}` : ''}` ||
        `${pendingApprovalCount} awaiting sign-off`,
      body: (
        <Stack gap="md">
          {[...grouped.entries()].map(([memberId, items]) => (
            <Box key={memberId || 'unknown'}>
              <Text size="xs" fw={600} c="dimmed" mb={4}>
                From {submitterName(memberId === '' ? null : memberId)}
              </Text>
              <Stack gap="xs">
                {items.map((it) => (
                  <SubmittedApprovalRow
                    key={it.id}
                    item={it}
                    onChanged={reloadQueue}
                  />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      ),
    });
  }
  if (campaignsAvailable) {
    rows.push({
      key: 'scout',
      seal: 'brass',
      label: 'Proposed by Scout',
      count: counts.scout,
      summary:
        counts.scout === 0
          ? 'The Scout has nothing new'
          : `${counts.scout} ${plural('campaign', counts.scout)} drafted for your sign-off`,
      body:
        counts.scout === 0 ? (
          <Text size="sm" c="dimmed">
            The Scout hasn’t proposed anything new.
          </Text>
        ) : (
          <Stack gap="xs">
            {scoutItems.map((c) => (
              <ScoutRow
                key={c.id}
                item={c}
                onReview={(id) => setSpineReview({ id, failed: [] })}
                onChanged={reloadQueue}
              />
            ))}
          </Stack>
        ),
    });
  }
  if (landingAvailable) {
    rows.push({
      key: 'drafts',
      seal: 'brass',
      label: 'Drafts to review',
      count: draftsToReview,
      // Full breakdown restored: landing-page drafts + PROPOSED social plans (the
      // latter only when the plan-bench list route is live; otherwise the row
      // stays at landing-pages-only rather than showing a fake 0).
      summary:
        draftsToReview === 0
          ? 'No drafts waiting'
          : [
              `${counts.drafts} landing ${plural('page', counts.drafts)}`,
              socialPlansAvailable
                ? `${counts.socialPlans} social ${plural('plan', counts.socialPlans)}`
                : null,
            ]
              .filter((s): s is string => s !== null)
              .join(' · '),
      body:
        draftsToReview === 0 ? (
          <Text size="sm" c="dimmed">
            {socialPlansAvailable
              ? 'No landing-page drafts or social plans to review.'
              : 'No landing-page drafts to review.'}
          </Text>
        ) : (
          <Stack gap="xs">
            {draftPages.map((p) => (
              <DraftRow key={p.id} page={p} />
            ))}
            {pendingPlans.map((p) => (
              <SocialPlanRow key={p.id} plan={p} onReview={setPlanReviewId} />
            ))}
          </Stack>
        ),
    });
    rows.push({
      key: 'stale',
      seal: 'grey',
      label: 'Stale live pages',
      count: counts.stale,
      summary:
        counts.stale === 0
          ? 'Live pages are current'
          : `${counts.stale} live ${plural('page', counts.stale)} drifted out of date`,
      body:
        counts.stale === 0 ? (
          <Text size="sm" c="dimmed">
            The Refresher found nothing stale.
          </Text>
        ) : (
          <Stack gap="xs">
            {stalePagesList.map((x) => (
              <StaleRow
                key={x.page.id}
                page={x.page}
                diffs={x.diffs}
                onChanged={reloadQueue}
              />
            ))}
          </Stack>
        ),
    });
  }

  // ── Rail: month pulse figures (from the analytics payload) ──────────────────
  const leadsMetric = analytics?.kpis?.replies;
  const openRate = analytics?.kpis?.openRate?.value;
  const sent = analytics?.kpis?.sent?.value;
  const replies = leadsMetric?.value;
  const repliedPct =
    typeof sent === 'number' && sent > 0 && typeof replies === 'number'
      ? Math.round((replies / sent) * 100)
      : null;
  const revenue = analytics?.kpis?.revenue;
  const earned =
    revenue && revenue.present === true
      ? `AED ${revenue.value.total.toLocaleString('en-US')}`
      : '— no closed deals yet';

  // ── "What it cost" — the AI-cost ledger is the ONLY priced source today ──────
  // aiCost === null → the ledger is unavailable (route missing / non-Manager /
  // transient) → the AI lines show "—", never a fabricated number. A live-but-idle
  // ledger returns a real summary with totalAed:0 → "AED 0" (a legitimate value).
  // The whole ledger is AI spend, so AI drafting AND Spent both read totalAed;
  // ads & sends are genuinely un-tracked and stay "—".
  const hasCost = aiCost !== null;
  const fmtAed = (n: number): string =>
    `AED ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const aiDraftingValue = hasCost
    ? fmtAed(aiCost.totalAed)
    : '— (tracking coming)';
  const spentValue = hasCost ? fmtAed(aiCost.totalAed) : '—';
  // Cost per lead = the AI total ÷ leads, only when we have both a real total and
  // a positive lead count (`replies` is the leads metric on this desk).
  const costPerLead =
    hasCost && typeof replies === 'number' && replies > 0
      ? fmtAed(aiCost.totalAed / replies)
      : '—';

  // ── Dashboard grid plumbing (unchanged — "Full →" reveals it intact) ────────
  const handleLayoutChange = useCallback(
    (allLayouts: Layouts) => {
      if (layoutLoaded) setLayouts(allLayouts);
    },
    [layoutLoaded, setLayouts],
  );
  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      const next = !prev;
      if (prev && !next) persistLayout(layouts, enabledWidgetIds);
      return next;
    });
  }, [layouts, enabledWidgetIds, persistLayout]);

  const overnightLines: { text: string }[] = [];
  if (campaignsAvailable) {
    overnightLines.push({
      text:
        counts.scout > 0
          ? `The Scout proposed ${counts.scout} ${plural('campaign', counts.scout)}.`
          : 'The Scout had a quiet night — nothing new proposed.',
    });
  }
  if (landingAvailable) {
    overnightLines.push({
      text: `The Refresher checked ${landing?.liveCount ?? 0} live ${plural(
        'page',
        landing?.liveCount ?? 0,
      )}${counts.stale > 0 ? `, flagged ${counts.stale}.` : ' — all current.'}`,
    });
  }
  if (style?.available === true) {
    overnightLines.push({
      text: style.coldStart
        ? 'Style-learning is still gathering your post history.'
        : `Style-learning studied ${style.sampleSize} of your posts — drafts sound like you.`,
    });
  }

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: '16px',
        gap: 20,
      }}
    >
      <style>{NIGHT_DESK_GRID_CSS}</style>

      {/* ── Brief band (full width) ─────────────────────────────────────────── */}
      <Paper
        radius="md"
        p="lg"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.06))',
          border: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Box style={{ flex: 1, minWidth: 240 }}>
            <Group gap={8} mb={6}>
              <ThemeIcon size="sm" radius="xl" variant="light" color="red">
                <IconBolt size={13} />
              </ThemeIcon>
              <Eyebrow>The night desk</Eyebrow>
            </Group>
            <Text
              fz={22}
              fw={600}
              lh={1.35}
              c="var(--mantine-color-text)"
              style={{ maxWidth: 720 }}
            >
              {brief}
            </Text>
          </Box>
          <Button
            variant="default"
            size="sm"
            leftSection={<IconSparkles size={15} color={brass} />}
            rightSection={
              <IconChevronDown
                size={14}
                style={{
                  transform: showSpine ? 'rotate(180deg)' : undefined,
                  transition: 'transform 150ms ease',
                }}
              />
            }
            onClick={() => setShowSpine((v) => !v)}
          >
            Start a campaign
          </Button>
        </Group>
        <Collapse in={showSpine}>
          <Box pt="md">
            <CampaignSpinePanel
              onCampaignCreated={(id, failed) => {
                setSpineReview({ id, failed });
                setShowSpine(false);
              }}
            />
          </Box>
        </Collapse>
      </Paper>

      {/* Shared campaign review drawer, hosted here (mirrors CampaignsTab). */}
      <CampaignReviewPanel
        campaignId={spineReview?.id ?? null}
        failedArms={spineReview?.failed ?? []}
        onClose={() => setSpineReview(null)}
        onChanged={reloadQueue}
        onRegenerated={(id, failed) => setSpineReview({ id, failed })}
      />

      {/* Shared social-plan review drawer — opened by a "Drafts to review" plan. */}
      <PlanReviewPanel
        planId={planReviewId}
        onClose={() => setPlanReviewId(null)}
        onApproved={reloadQueue}
      />

      {/* ── Two aligned columns ─────────────────────────────────────────────── */}
      <div className="propel-night-desk-grid">
        {/* Left — the sign-off queue */}
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Eyebrow>Awaiting your sign-off · {totalToSignOff}</Eyebrow>
            <UnstyledButton onClick={reloadQueue}>
              <Group gap={4} c="dimmed">
                <IconRefresh size={13} />
                <Text size="xs">Refresh</Text>
              </Group>
            </UnstyledButton>
          </Group>

          {rows.length === 0 ? (
            <Paper withBorder radius="md" p="xl" style={{ borderStyle: 'dashed' }}>
              <Text size="sm" c="dimmed" ta="center">
                Sign in as a Manager to see the sign-off queue.
              </Text>
            </Paper>
          ) : totalToSignOff === 0 ? (
            <Paper withBorder radius="md" p="xl">
              <Stack align="center" gap={6}>
                <ThemeIcon size="lg" radius="xl" variant="light" color="teal">
                  <IconCheck size={18} />
                </ThemeIcon>
                <Text fw={600} size="sm">
                  Nothing waiting on your sign-off.
                </Text>
                <Text size="xs" c="dimmed" ta="center">
                  The desk ran clean overnight.
                </Text>
              </Stack>
            </Paper>
          ) : (
            <Accordion
              multiple
              variant="separated"
              radius="md"
              chevronPosition="right"
            >
              {rows.map((row) => (
                <Accordion.Item key={row.key} value={row.key}>
                  <Accordion.Control>
                    <Group gap="sm" wrap="nowrap">
                      <Seal kind={row.seal} />
                      <Box style={{ minWidth: 0, flex: 1 }}>
                        <Group gap={8} wrap="nowrap">
                          <Text fw={600} size="sm">
                            {row.label}
                          </Text>
                          {row.count > 0 ? (
                            <Badge
                              size="sm"
                              variant="light"
                              radius="sm"
                              styles={{
                                root: {
                                  background: `${seal[row.seal]}1e`,
                                  color: seal[row.seal],
                                },
                              }}
                            >
                              {row.count}
                            </Badge>
                          ) : null}
                        </Group>
                        <Text size="xs" c="dimmed" truncate>
                          {row.summary}
                        </Text>
                      </Box>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>{row.body}</Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          )}
        </Stack>

        {/* Right — "Running for you" (soft brass-tinted monitoring zone) */}
        <Box
          style={{
            background: BRASS_TINT_BG,
            border: `1px solid ${BRASS_TINT_BORDER}`,
            borderRadius: 'var(--mantine-radius-md)',
            padding: 16,
          }}
        >
          <Stack gap="lg">
            <Eyebrow>Running for you</Eyebrow>

            {/* Overnight engine report */}
            <Stack gap={6}>
              {overnightLines.length === 0 ? (
                <Text size="sm" c="dimmed">
                  The overnight engine hasn’t reported yet.
                </Text>
              ) : (
                overnightLines.map((l, i) => (
                  <Group key={i} gap={8} wrap="nowrap" align="flex-start">
                    <Text style={{ color: brass, lineHeight: 1.5 }}>◆</Text>
                    <Text size="sm" c="var(--mantine-color-text)">
                      {l.text}
                    </Text>
                  </Group>
                ))
              )}
            </Stack>

            {/* The month */}
            <Box>
              <Group justify="space-between" align="center" mb="xs">
                <Eyebrow>The month</Eyebrow>
                <SegmentedControl
                  size="xs"
                  value={range}
                  onChange={(v) => setRange(v as AnalyticsRange)}
                  data={[
                    { label: '7d', value: '7d' },
                    { label: '30d', value: '30d' },
                    { label: '90d', value: '90d' },
                  ]}
                />
              </Group>
              <Paper
                radius="md"
                p="md"
                style={{
                  background: 'var(--mantine-color-body)',
                  border: '1px solid var(--mantine-color-default-border)',
                }}
              >
                <Group justify="space-between" align="flex-end" wrap="nowrap">
                  <Box>
                    <Text size="xs" c="dimmed">
                      Leads
                    </Text>
                    <Group gap={8} align="baseline">
                      <Text fw={700} fz={30} lh={1.05}>
                        {typeof replies === 'number'
                          ? replies.toLocaleString('en-US')
                          : '—'}
                      </Text>
                      {typeof leadsMetric?.deltaPct === 'number' ? (
                        <Text
                          size="xs"
                          fw={600}
                          c={leadsMetric.deltaPct >= 0 ? 'teal' : 'red'}
                        >
                          {leadsMetric.deltaPct >= 0 ? '+' : ''}
                          {leadsMetric.deltaPct}%
                        </Text>
                      ) : null}
                    </Group>
                  </Box>
                  {leadsMetric?.spark && leadsMetric.spark.length >= 2 ? (
                    <Sparkline points={leadsMetric.spark} />
                  ) : null}
                </Group>
                <Group gap="xl" mt="sm">
                  <Box>
                    <Text size="xs" c="dimmed">
                      Opened
                    </Text>
                    <Text fw={600} size="sm">
                      {typeof openRate === 'number' ? `${openRate}%` : '—'}
                    </Text>
                  </Box>
                  <Box>
                    <Text size="xs" c="dimmed">
                      Replied
                    </Text>
                    <Text fw={600} size="sm">
                      {repliedPct !== null ? `${repliedPct}%` : '—'}
                    </Text>
                  </Box>
                </Group>
                <Group justify="flex-end" mt="sm">
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    rightSection={<IconArrowRight size={13} />}
                    onClick={() => setShowDashboard((v) => !v)}
                  >
                    {showDashboard ? 'Hide dashboard' : 'Full'}
                  </Button>
                </Group>
              </Paper>
            </Box>

            {/* What it cost (honest) */}
            <Box>
              <Group gap={6} mb="xs">
                <IconLayoutDashboard size={13} color={brass} />
                <Eyebrow>What it cost</Eyebrow>
              </Group>
              <Paper
                radius="md"
                p="md"
                style={{
                  background: 'var(--mantine-color-body)',
                  border: '1px solid var(--mantine-color-default-border)',
                }}
              >
                <Stack gap="xs">
                  <CostLine
                    label="Ads"
                    value="—"
                    note="no ad spend connected"
                  />
                  <CostLine
                    label="Sends"
                    value="—"
                    note="no per-message rate set"
                  />
                  <CostLine label="AI drafting" value={aiDraftingValue} />
                  <Box
                    style={{
                      borderTop: '1px solid var(--mantine-color-default-border)',
                      paddingTop: 8,
                    }}
                  >
                    <CostLine
                      label="Spent"
                      value={spentValue}
                      accent
                      note={
                        hasCost
                          ? 'AI drafting only — ads & sends not tracked yet'
                          : 'no priced source yet'
                      }
                    />
                  </Box>
                  <CostLine label="Cost per lead" value={costPerLead} />
                  <CostLine label="Earned" value={earned} accent />
                </Stack>
              </Paper>
            </Box>
          </Stack>
        </Box>
      </div>

      {/* ── Full dashboard (revealed by "Full →" — the existing grid, intact) ── */}
      <Collapse in={showDashboard}>
        <Stack gap="sm" pt="xs">
          <Group justify="space-between" align="center">
            <Eyebrow>Full dashboard</Eyebrow>
            <Button
              size="xs"
              variant={editMode ? 'filled' : 'default'}
              color={editMode ? 'red' : undefined}
              leftSection={
                editMode ? <IconCheck size={14} /> : <IconPencil size={14} />
              }
              onClick={toggleEditMode}
            >
              {editMode ? 'Done' : 'Customize'}
            </Button>
          </Group>
          {isLoading && analytics === null ? (
            <Center h={320}>
              <Loader color="red" />
            </Center>
          ) : (
            <MarketingDashboardGrid
              analytics={analytics}
              hub={hub}
              layouts={layouts}
              enabledWidgetIds={enabledWidgetIds}
              editMode={editMode}
              onLayoutChange={handleLayoutChange}
            />
          )}
        </Stack>
      </Collapse>
    </Box>
  );
};
