import {
  Accordion,
  Anchor,
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import {
  IconArrowRight,
  IconChevronRight,
  IconMessage,
  IconPencil,
  IconPhoto,
  IconRefresh,
  IconSparkles,
  IconWorld,
} from 'twenty-ui/display';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
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
} from '@/propel/components/marketingHero/deskShared';
import { composeAgentBrief } from '@/propel/lib/composeAgentBrief';
import { type SpineArm } from '@/propel/lib/campaignSpineCrm';
import {
  type MarketingWorkItem,
  type MarketingWorkKind,
  type MyWorkBuckets,
  type MyWorkCounts,
  getMyWork,
} from '@/propel/lib/marketingMyWork';

// ─────────────────────────────────────────────────────────────────────────────
// The Marketing home for a NON-publisher agent — "My Desk" (maker-checker Phase 2,
// docs/superpowers/specs/2026-07-09-marketing-publish-approval-gate.md §Phase 2).
//
// A maker's home, not a control tower. The agent keeps FULL create/edit/draft use;
// only the go-live control differs (a manager signs off). Three parts:
//   1. A deterministic agent brief (composeAgentBrief) reading the SAME my-work
//      counts the pipeline shows — sentence and pipeline can't disagree.
//   2. A prominent "Make something" band — making is the agent's job: the campaign
//      brief-box (reusing CampaignSpinePanel/CampaignReviewPanel, hosted here) plus
//      Landing page / Social / Media Studio create entries into their surfaces.
//   3. The "My work" pipeline (accordion, from marketing/my-work): Came back to you
//      (red), In progress (grey), Waiting on a manager (brass, read-only), Went live
//      (green). A "Your month" rail = the agent's OWN published count + leads their
//      work drew. NO cost block, NO sign-off queue, NO overnight report.
//
// Theme-aware: reuses the shared brass/seal hooks (no hardcoded dark hex).
// ─────────────────────────────────────────────────────────────────────────────

const MY_DESK_GRID_CSS = `
.propel-my-desk-grid {
  display: grid;
  grid-template-columns: minmax(300px, 1.7fr) minmax(220px, 1fr);
  gap: 20px;
  align-items: start;
}
@media (max-width: 780px) {
  .propel-my-desk-grid { grid-template-columns: 1fr; }
}`;

// Where each kind's editor lives — the "Continue" / "Revise" / "View" target.
// Landing pages + blog open their tab surface; social plans + campaigns open the
// shared review drawer hosted in this component (so the agent can edit in place).
type OpenTarget =
  | { kind: 'route'; path: string }
  | { kind: 'plan'; id: string }
  | { kind: 'campaign'; id: string };

const openTargetFor = (item: MarketingWorkItem): OpenTarget => {
  switch (item.kind) {
    case 'LANDING_PAGE':
      return {
        kind: 'route',
        path: `${AppPath.MarketingHub}?tab=website&sub=landing-pages&edit=${encodeURIComponent(
          item.id,
        )}`,
      };
    case 'BLOG':
      return { kind: 'route', path: `${AppPath.MarketingHub}?tab=website&sub=blog` };
    case 'SOCIAL_PLAN':
      return { kind: 'plan', id: item.id };
    case 'CAMPAIGN':
      return { kind: 'campaign', id: item.id };
    default:
      return { kind: 'route', path: AppPath.MarketingHub };
  }
};

const KIND_LABEL: Record<MarketingWorkKind, string> = {
  LANDING_PAGE: 'Landing page',
  SOCIAL_PLAN: 'Social plan',
  CAMPAIGN: 'Campaign',
  BLOG: 'Blog post',
};

// ── One "Make something" create tile ─────────────────────────────────────────
const CreateTile = ({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) => {
  const brass = useBrass();
  return (
    <UnstyledButton onClick={onClick} style={{ flex: 1, minWidth: 160 }}>
      <Paper
        withBorder
        radius="md"
        p="md"
        style={{ height: '100%', transition: 'border-color 120ms ease' }}
      >
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon size="lg" radius="md" variant="light" color="gray">
            <Box style={{ color: brass, display: 'flex' }}>{icon}</Box>
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={600} size="sm">
              {title}
            </Text>
            <Text size="xs" c="dimmed">
              {hint}
            </Text>
          </Box>
        </Group>
      </Paper>
    </UnstyledButton>
  );
};

// ── One "My work" pipeline item ──────────────────────────────────────────────
const WorkItemRow = ({
  item,
  variant,
  onOpen,
}: {
  item: MarketingWorkItem;
  variant: 'cameBack' | 'inProgress' | 'waiting' | 'live';
  onOpen: (item: MarketingWorkItem) => void;
}) => {
  // The action word matches the state: revise a sent-back draft, continue a WIP,
  // view (read-only) a submitted one, view a live one.
  const cta =
    variant === 'cameBack'
      ? 'Revise'
      : variant === 'inProgress'
        ? 'Continue'
        : 'View';
  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
        <Box style={{ minWidth: 0 }}>
          <Text fw={600} size="sm" truncate>
            {item.title || 'Untitled'}
          </Text>
          <Text size="xs" c="dimmed">
            {KIND_LABEL[item.kind]}
            {variant === 'waiting' ? ' · awaiting a manager' : ''}
            {variant === 'live' ? ' · live' : ''}
          </Text>
        </Box>
        <Button
          size="xs"
          variant={variant === 'cameBack' ? 'light' : 'subtle'}
          color={variant === 'cameBack' ? 'red' : 'gray'}
          leftSection={
            variant === 'live' ? (
              <IconChevronRight size={13} />
            ) : (
              <IconPencil size={13} />
            )
          }
          onClick={() => onOpen(item)}
          style={{ flexShrink: 0 }}
        >
          {cta}
        </Button>
      </Group>
      {/* The manager's send-back note — only on came-back items. */}
      {variant === 'cameBack' && item.note !== null ? (
        <Paper
          radius="sm"
          p="xs"
          mt="xs"
          style={{
            background: 'var(--mantine-color-red-light)',
            border: '1px solid var(--mantine-color-red-light-color)',
          }}
        >
          <Text size="xs" c="var(--mantine-color-text)">
            <Text span fw={700}>
              Note:{' '}
            </Text>
            {item.note}
          </Text>
        </Paper>
      ) : null}
    </Paper>
  );
};

export const MyDeskHome = () => {
  const navigate = useNavigate();
  const member = useAtomStateValue(currentWorkspaceMemberState);
  const firstName = member?.name?.firstName ?? null;

  const [showSpine, setShowSpine] = useState(false);
  const [campaignReview, setCampaignReview] = useState<{
    id: string;
    failed: SpineArm[];
  } | null>(null);
  const [planReviewId, setPlanReviewId] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // ── The caller's OWN work, bucketed (fail-closed to empty) ──────────────────
  const [work, setWork] = useState<{
    buckets: MyWorkBuckets;
    counts: MyWorkCounts;
    available: boolean;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void getMyWork().then((res) => {
      if (!live) return;
      if (res.ok) {
        setWork({ buckets: res.buckets, counts: res.counts, available: true });
      } else {
        setWork({
          buckets: { cameBack: [], inProgress: [], waiting: [], live: [] },
          counts: {
            cameBack: 0,
            inProgress: 0,
            waiting: 0,
            live: 0,
            published: null,
            leads: null,
          },
          available: false,
        });
      }
    });
    return () => {
      live = false;
    };
  }, [needsRefresh]);

  const reload = () => setNeedsRefresh((n) => n + 1);

  const buckets = work?.buckets ?? {
    cameBack: [],
    inProgress: [],
    waiting: [],
    live: [],
  };
  const counts = work?.counts ?? {
    cameBack: 0,
    inProgress: 0,
    waiting: 0,
    live: 0,
    published: null,
    leads: null,
  };

  const brief = useMemo(
    () =>
      composeAgentBrief({
        hour: new Date(now).getHours(),
        firstName,
        cameBack: counts.cameBack,
        waiting: counts.waiting,
        inProgress: counts.inProgress,
        live: counts.live,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, firstName, counts.cameBack, counts.waiting, counts.inProgress, counts.live],
  );

  const openItem = (item: MarketingWorkItem) => {
    const target = openTargetFor(item);
    if (target.kind === 'route') navigate(target.path);
    else if (target.kind === 'plan') setPlanReviewId(target.id);
    else setCampaignReview({ id: target.id, failed: [] });
  };

  // The pipeline rows, in maker priority. A bucket with no items is omitted (an
  // empty "In progress" is normal, not a to-do), and if every bucket is empty the
  // whole pipeline collapses to one honest empty state.
  interface PipeRow {
    key: 'cameBack' | 'inProgress' | 'waiting' | 'live';
    seal: SealKind;
    label: string;
    items: MarketingWorkItem[];
  }
  const allPipeRows: PipeRow[] = [
    { key: 'cameBack', seal: 'red', label: 'Came back to you', items: buckets.cameBack },
    { key: 'inProgress', seal: 'grey', label: 'In progress', items: buckets.inProgress },
    { key: 'waiting', seal: 'brass', label: 'Waiting on a manager', items: buckets.waiting },
    { key: 'live', seal: 'green', label: 'Went live', items: buckets.live },
  ];
  const pipeRows: PipeRow[] = allPipeRows.filter((r) => r.items.length > 0);

  const totalItems =
    counts.cameBack + counts.inProgress + counts.waiting + counts.live;

  const published = counts.published;
  const leads = counts.leads;

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
      <style>{MY_DESK_GRID_CSS}</style>

      {/* ── Brief band ──────────────────────────────────────────────────────── */}
      <Paper
        radius="md"
        p="lg"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.06))',
          border: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Group gap={8} mb={6}>
          <ThemeIcon size="sm" radius="xl" variant="light" color="teal">
            <IconSparkles size={13} />
          </ThemeIcon>
          <Eyebrow>My desk</Eyebrow>
        </Group>
        <Text fz={22} fw={600} lh={1.35} c="var(--mantine-color-text)" style={{ maxWidth: 720 }}>
          {brief}
        </Text>
      </Paper>

      {/* ── Make something (the agent's job — prominent) ────────────────────── */}
      <Paper
        radius="md"
        p="lg"
        style={{ background: BRASS_TINT_BG, border: `1px solid ${BRASS_TINT_BORDER}` }}
      >
        <Group justify="space-between" align="center" mb="md" wrap="wrap" gap="sm">
          <Eyebrow>Make something</Eyebrow>
          <Button
            variant="filled"
            color="teal"
            size="sm"
            leftSection={<IconSparkles size={15} />}
            rightSection={
              <IconArrowRight
                size={14}
                style={{
                  transform: showSpine ? 'rotate(90deg)' : undefined,
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
          <Box mb="md">
            <CampaignSpinePanel
              onCampaignCreated={(id, failed) => {
                setCampaignReview({ id, failed });
                setShowSpine(false);
              }}
            />
          </Box>
        </Collapse>
        <Group gap="sm" align="stretch" wrap="wrap">
          <CreateTile
            icon={<IconWorld size={18} />}
            title="Landing page"
            hint="Build a page for a listing or campaign"
            onClick={() => navigate(`${AppPath.MarketingHub}?tab=website&sub=landing-pages`)}
          />
          <CreateTile
            icon={<IconMessage size={18} />}
            title="Social post"
            hint="Draft posts for the calendar"
            onClick={() => navigate(`${AppPath.MarketingHub}?tab=social`)}
          />
          <CreateTile
            icon={<IconPhoto size={18} />}
            title="Media Studio"
            hint="Generate & edit images"
            onClick={() => navigate(`${AppPath.MarketingHub}?tab=media-studio`)}
          />
        </Group>
      </Paper>

      {/* Shared review drawers, hosted here so the agent edits in place. */}
      <CampaignReviewPanel
        campaignId={campaignReview?.id ?? null}
        failedArms={campaignReview?.failed ?? []}
        onClose={() => setCampaignReview(null)}
        onChanged={reload}
        onRegenerated={(id, failed) => setCampaignReview({ id, failed })}
      />
      <PlanReviewPanel
        planId={planReviewId}
        onClose={() => setPlanReviewId(null)}
        onApproved={reload}
      />

      {/* ── My work + Your month ────────────────────────────────────────────── */}
      <div className="propel-my-desk-grid">
        {/* Left — the pipeline */}
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Eyebrow>My work · {totalItems}</Eyebrow>
            <UnstyledButton onClick={reload}>
              <Group gap={4} c="dimmed">
                <IconRefresh size={13} />
                <Text size="xs">Refresh</Text>
              </Group>
            </UnstyledButton>
          </Group>

          {pipeRows.length === 0 ? (
            <Paper withBorder radius="md" p="xl" style={{ borderStyle: 'dashed' }}>
              <Text size="sm" c="dimmed" ta="center">
                {work?.available === false
                  ? 'Your work will appear here once the desk is connected.'
                  : 'Nothing on your desk yet — start something above.'}
              </Text>
            </Paper>
          ) : (
            <Accordion
              multiple
              variant="separated"
              radius="md"
              chevronPosition="right"
              defaultValue={pipeRows.map((r) => r.key)}
            >
              {pipeRows.map((row) => (
                <Accordion.Item key={row.key} value={row.key}>
                  <Accordion.Control>
                    <Group gap="sm" wrap="nowrap">
                      <Seal kind={row.seal} />
                      <Group gap={8} wrap="nowrap">
                        <Text fw={600} size="sm">
                          {row.label}
                        </Text>
                        <Badge size="sm" variant="light" radius="sm" color="gray">
                          {row.items.length}
                        </Badge>
                      </Group>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="xs">
                      {row.items.map((it) => (
                        <WorkItemRow
                          key={it.id}
                          item={it}
                          variant={row.key}
                          onOpen={openItem}
                        />
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          )}
        </Stack>

        {/* Right — Your month (personal + motivating) */}
        <Box
          style={{
            background: BRASS_TINT_BG,
            border: `1px solid ${BRASS_TINT_BORDER}`,
            borderRadius: 'var(--mantine-radius-md)',
            padding: 16,
          }}
        >
          <Stack gap="lg">
            <Eyebrow>Your month</Eyebrow>
            <Box>
              <Text size="xs" c="dimmed">
                Published
              </Text>
              <Text fw={700} fz={30} lh={1.05}>
                {typeof published === 'number' ? published.toLocaleString('en-US') : '—'}
              </Text>
              <Text size="xs" c="dimmed">
                {typeof published === 'number'
                  ? `${plural('piece', published)} of your work live`
                  : 'once your work goes live'}
              </Text>
            </Box>
            <Box
              style={{
                borderTop: '1px solid var(--mantine-color-default-border)',
                paddingTop: 12,
              }}
            >
              <Text size="xs" c="dimmed">
                Leads your work drew
              </Text>
              <Text fw={700} fz={30} lh={1.05}>
                {typeof leads === 'number' ? leads.toLocaleString('en-US') : '—'}
              </Text>
              <Text size="xs" c="dimmed">
                {typeof leads === 'number'
                  ? 'attributed to what you made'
                  : 'attribution appears as leads close'}
              </Text>
            </Box>
            <Anchor
              size="xs"
              c="dimmed"
              onClick={() => navigate(`${AppPath.MarketingHub}?tab=numbers`)}
            >
              See the full numbers →
            </Anchor>
          </Stack>
        </Box>
      </div>
    </Box>
  );
};

export default MyDeskHome;
