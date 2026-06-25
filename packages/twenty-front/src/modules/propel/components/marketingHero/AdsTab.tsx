import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Drawer,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconAlertTriangle,
  IconCoins,
  IconCopy,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconTargetArrow,
} from 'twenty-ui/display';

import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  type ActionResp,
  type AdSetLite,
  type AdsCampaignRow,
  type AdsRange,
  type ListAdSetsResp,
  type MetaAdsDetailPayload,
  type MetaAdsMonitorPayload,
  type MetaBudgetKind,
} from '@/propel/types/metaAds';

// Ads tab of the unified Marketing hero — the Meta Ads monitor + light actions,
// graduated from the legacy in-sandbox Marketing Cloud "Ads" tab
// (src/shared/marketing-cloud-ads.tsx) into a Mantine surface. It shows the
// agency's live Meta ad campaigns (spend / impressions / leads / CPL) SIDE-BY-SIDE
// with the CRM-side leads / opps / attributed-revenue / ROI, joined by
// externalId = Meta campaign_id; a 7/30/90d range toggle; a per-campaign detail
// drawer (daily series); and the Phase-2 write actions (pause / resume, edit
// budget [CBO campaign or ad-set], duplicate → forced PAUSED).
//
// All data + currency formatting + the Meta token live SERVER-SIDE. The tab calls
// two LIVE logic-function routes via callPropelRoute (flat body — the route reads
// event.body.<field> directly):
//   • POST /marketing/meta-ads-monitor — range read + { detail, campaignId } drill-in
//   • POST /marketing/meta-ads-action  — pause/resume/budget/duplicate (+ listAdSets)
// The tab renders the route's pre-formatted strings and never re-does currency math
// (the only client-side money math is the budget-input AED↔fils conversion, which
// the route re-validates).
//
// GATING: the monitor route is MANAGER/ADMIN-gated server-side (resolveActingMember
// → agents get a VIEWER_BLOCKED empty shape, never data). The hero ALSO hides this
// whole tab from agents via useViewerRole (see MarketingHero) — so the tab only
// mounts for managers/admins, and the route is the fail-closed backstop. `canAct`
// (the write controls) keys off the monitor payload's COORDINATOR tier.

const num = (n: number | null): string =>
  n == null ? '—' : n.toLocaleString('en-US');

// AED ↔ minor-unit (fils) — the tab's only currency math (input UX only; the route
// re-validates bounds server-side).
const minorToAedInput = (minor: number | null): string =>
  minor == null ? '' : String(minor / 100);
const aedInputToMinor = (aed: string): number | null => {
  const n = Number(String(aed).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
};
const aedLabel = (minor: number | null): string =>
  minor == null
    ? '—'
    : `AED ${(minor / 100).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}`;

const ACTION_ROUTE = '/marketing/meta-ads-action';
const MONITOR_ROUTE = '/marketing/meta-ads-monitor';

const isPaused = (r: AdsCampaignRow): boolean =>
  r.statusLabel.toLowerCase().includes('paus');

const TONE_COLOR: Record<AdsCampaignRow['statusTone'], string> = {
  good: 'green',
  warn: 'yellow',
  bad: 'red',
  mute: 'gray',
};

// ── KPI tile ─────────────────────────────────────────────────────────────────
const Kpi = ({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) => (
  <Card withBorder radius="md" padding="md">
    <Text size="xs" tt="uppercase" fw={700} c="dimmed">
      {label}
    </Text>
    <Text size="xl" fw={700} mt={4} ff="monospace" style={{ lineHeight: 1.1 }}>
      {value}
    </Text>
    {sub ? (
      <Text size="xs" c="dimmed" mt={2}>
        {sub}
      </Text>
    ) : null}
  </Card>
);

// ── per-campaign detail drawer: daily spend & leads ──────────────────────────
const DetailDrawer = ({
  row,
  range,
  onClose,
}: {
  row: AdsCampaignRow;
  range: AdsRange;
  onClose: () => void;
}) => {
  const [detail, setDetail] = useState<MetaAdsDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      const res = await callPropelRoute<MetaAdsDetailPayload>(MONITOR_ROUTE, {
        detail: true,
        campaignId: row.campaignId,
        range,
      });
      if (alive) {
        setDetail(res);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [row.campaignId, range]);

  const series = detail?.series ?? [];
  const maxSpend = series.reduce((m, p) => Math.max(m, p.spendMinor), 0) || 1;

  return (
    <Drawer
      opened
      onClose={onClose}
      position="right"
      size={560}
      zIndex={5000}
      title={
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <IconTargetArrow size={18} color="var(--mantine-color-red-6)" />
          <Text fw={700} truncate>
            {row.name}
          </Text>
        </Group>
      }
    >
      <Group gap="xs" mb="md" wrap="wrap">
        <Badge variant="light" color={TONE_COLOR[row.statusTone]}>
          {row.statusLabel}
        </Badge>
        {row.objectiveLabel ? (
          <Badge variant="light" color="gray">
            {row.objectiveLabel}
          </Badge>
        ) : null}
        {row.budgetLabel !== '—' ? (
          <Badge variant="light" color="gray">
            {row.budgetLabel}
          </Badge>
        ) : null}
      </Group>

      <SimpleGrid cols={2} spacing="sm" mb="lg">
        <MiniStat label="Spend" value={row.spendLabel} />
        <MiniStat label="Meta leads" value={num(row.metaLeads)} />
        <MiniStat label="Cost / lead" value={row.cplLabel} />
        <MiniStat label="Impressions" value={num(row.impressions)} />
        <MiniStat
          label="CRM leads"
          value={row.crmLinked ? num(row.crmLeads) : '—'}
          dim={!row.crmLinked}
        />
        <MiniStat
          label="CRM opps"
          value={row.crmLinked ? num(row.crmOpps) : '—'}
          dim={!row.crmLinked}
        />
        <MiniStat
          label="Attributed revenue"
          value={row.attributedRevenueLabel}
        />
        <MiniStat
          label="ROI (revenue ÷ spend)"
          value={row.roiLabel}
          dim={row.roi == null}
        />
      </SimpleGrid>

      <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb="sm">
        Daily spend &amp; leads
      </Text>

      {loading ? (
        <Center mih={120}>
          <Loader size="sm" color="red" />
        </Center>
      ) : detail && detail.available !== 'OK' ? (
        <Text size="sm" c="dimmed">
          {detail.notice || 'No daily data available.'}
        </Text>
      ) : series.length === 0 ? (
        <Text size="sm" c="dimmed">
          No daily activity in this window.
        </Text>
      ) : (
        <Stack gap={6}>
          {series.map((p) => (
            <Group key={p.dayKey} gap="sm" wrap="nowrap" align="center">
              <Text
                size="xs"
                c="dimmed"
                ff="monospace"
                ta="right"
                style={{ flex: '0 0 52px' }}
              >
                {p.label}
              </Text>
              <Box
                style={{
                  flex: '1 1 0',
                  height: 16,
                  background: 'var(--mantine-color-default-hover)',
                  borderRadius: 5,
                  overflow: 'hidden',
                }}
              >
                <Box
                  style={{
                    height: '100%',
                    width: `${Math.max(2, Math.round((p.spendMinor / maxSpend) * 100))}%`,
                    background:
                      'linear-gradient(90deg, var(--mantine-color-red-6), var(--mantine-color-blue-6))',
                    borderRadius: 5,
                  }}
                />
              </Box>
              <Text
                size="xs"
                ff="monospace"
                ta="right"
                style={{ flex: '0 0 92px' }}
              >
                {p.spendLabel}
              </Text>
              <Text
                size="xs"
                ff="monospace"
                ta="right"
                c={p.leads > 0 ? 'green' : 'dimmed'}
                style={{ flex: '0 0 52px' }}
              >
                {p.leads > 0 ? `${p.leads} ld` : '—'}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Drawer>
  );
};

const MiniStat = ({
  label,
  value,
  dim,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) => (
  <Card withBorder radius="md" padding="xs">
    <Text size="xs" tt="uppercase" fw={600} c="dimmed">
      {label}
    </Text>
    <Text size="md" fw={700} ff="monospace" c={dim ? 'dimmed' : undefined} mt={2}>
      {value}
    </Text>
  </Card>
);

// ── confirm modal (pause / resume / duplicate) ───────────────────────────────
const ConfirmModal = ({
  row,
  kind,
  working,
  onConfirm,
  onClose,
}: {
  row: AdsCampaignRow;
  kind: 'pauseResume' | 'duplicate';
  working: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) => {
  const paused = isPaused(row);
  const title =
    kind === 'duplicate'
      ? 'Duplicate campaign'
      : paused
        ? 'Resume campaign'
        : 'Pause campaign';
  const confirmLabel =
    kind === 'duplicate' ? 'Duplicate (paused)' : paused ? 'Resume' : 'Pause';
  const danger = kind === 'pauseResume' && !paused;

  return (
    <Modal
      opened
      onClose={working ? () => {} : onClose}
      title={title}
      centered
      zIndex={5000}
    >
      <Text size="sm" c="dimmed" style={{ lineHeight: 1.55 }}>
        {kind === 'duplicate' ? (
          <>
            Make a full copy of <strong>{row.name}</strong> (including its ad sets
            and ads). The copy is created <strong>paused</strong>, so it won’t spend
            until you review and turn it on in Ads Manager.
          </>
        ) : paused ? (
          <>
            Resume <strong>{row.name}</strong>? Meta will start delivering it again
            and it will resume spending against its budget.
          </>
        ) : (
          <>
            Pause <strong>{row.name}</strong>? Delivery stops and it won’t spend
            until you resume it.
          </>
        )}
      </Text>
      <Group justify="flex-end" mt="lg">
        <Button variant="default" disabled={working} onClick={onClose}>
          Cancel
        </Button>
        <Button
          color={danger ? 'red' : 'blue'}
          loading={working}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  );
};

// ── budget modal — AED input, AD-SET-AWARE (campaign CBO vs ad-set) ───────────
// On open it asks the route for the campaign's ad sets (listAdSets). If ANY ad set
// carries a budget the campaign is non-CBO → the edit targets an AD SET (operator
// picks which when there's more than one). Otherwise it's CBO → the edit targets the
// CAMPAIGN. The level is shown explicitly. Save is the write gate.
const BudgetModal = ({
  row,
  onClose,
  onSaved,
}: {
  row: AdsCampaignRow;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const notify = usePropelToast();
  const [phase, setPhase] = useState<'discover' | 'ready' | 'error'>('discover');
  const [adSets, setAdSets] = useState<AdSetLite[]>([]);
  const [cbo, setCbo] = useState(true);
  const [notice, setNotice] = useState('');
  const [targetAdSetId, setTargetAdSetId] = useState<string>('');
  const [kind, setKind] = useState<MetaBudgetKind>('daily');
  const [aed, setAed] = useState('');
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    setPhase('discover');
    void (async () => {
      const res = await callPropelRoute<ListAdSetsResp>(ACTION_ROUTE, {
        listAdSets: true,
        campaignId: row.campaignId,
      });
      if (!alive) return;
      if (!res || res.error || res.ok !== true) {
        setNotice(
          res?.operatorAction ||
            res?.error ||
            'Couldn’t read this campaign’s budget setup.',
        );
        setPhase('error');
        return;
      }
      const list = Array.isArray(res.adSets) ? res.adSets : [];
      setAdSets(list);
      setCbo(res.cboBudget !== false);
      // Non-CBO with a single ad set → seed the input from its current budget.
      if (res.cboBudget === false && list.length === 1) {
        setTargetAdSetId(list[0].id);
        const b =
          list[0].dailyBudgetMinor != null
            ? 'daily'
            : list[0].lifetimeBudgetMinor != null
              ? 'lifetime'
              : 'daily';
        setKind(b);
        setAed(
          minorToAedInput(
            b === 'daily'
              ? list[0].dailyBudgetMinor
              : list[0].lifetimeBudgetMinor,
          ),
        );
      }
      setPhase('ready');
    })();
    return () => {
      alive = false;
    };
  }, [row.campaignId]);

  const minor = aedInputToMinor(aed);
  const needAdSet = !cbo && adSets.length > 1;
  const canSave =
    !saving && phase === 'ready' && minor != null && (!needAdSet || targetAdSetId !== '');

  const save = useCallback(async () => {
    if (submittingRef.current || !canSave || minor == null) return;
    submittingRef.current = true;
    setSaving(true);
    try {
      const targetType = cbo ? 'campaign' : 'adset';
      const targetId = cbo ? row.campaignId : targetAdSetId || adSets[0]?.id || '';
      if (!targetId) {
        notify('No budget target found for this campaign.', 'error');
        return;
      }
      const res = await callPropelRoute<ActionResp>(ACTION_ROUTE, {
        action: 'budget',
        targetType,
        targetId,
        value: { kind, amountMinor: minor },
      });
      if (!res || res.error || res.ok !== true) {
        notify(
          res?.operatorAction || res?.error || 'Couldn’t update the budget.',
          'error',
        );
        return;
      }
      notify(
        `Budget updated to ${aedLabel(minor)}${kind === 'daily' ? '/day' : ' total'}.`,
        'success',
      );
      onSaved();
      onClose();
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }, [
    canSave,
    minor,
    cbo,
    row.campaignId,
    targetAdSetId,
    adSets,
    kind,
    notify,
    onSaved,
    onClose,
  ]);

  const levelLabel = cbo
    ? 'Campaign budget (Advantage / CBO)'
    : 'Ad-set budget';

  return (
    <Modal
      opened
      onClose={saving ? () => {} : onClose}
      title="Adjust budget"
      centered
      zIndex={5000}
    >
      <Text size="sm" c="dimmed" mb="md">
        {row.name}
      </Text>

      {phase === 'discover' ? (
        <Center mih={120}>
          <Loader size="sm" color="red" />
        </Center>
      ) : phase === 'error' ? (
        <Text size="sm" c="red" style={{ lineHeight: 1.5 }}>
          {notice}
        </Text>
      ) : (
        <Stack gap="md">
          <Card withBorder radius="md" padding="sm" bg="var(--mantine-color-default-hover)">
            <Text size="sm" fw={700}>
              {levelLabel}
            </Text>
            <Text size="xs" c="dimmed" mt={2} style={{ lineHeight: 1.5 }}>
              {cbo
                ? 'This campaign’s budget is set at the campaign level — the change applies to the whole campaign.'
                : adSets.length > 1
                  ? 'This campaign budgets per ad set — pick which ad set to change.'
                  : 'This campaign budgets at the ad-set level — the change applies to its ad set.'}
            </Text>
          </Card>

          {needAdSet ? (
            <Select
              label="Ad set"
              placeholder="Select an ad set…"
              data={adSets.map((s) => ({
                value: s.id,
                label: `${s.name} (${aedLabel(s.dailyBudgetMinor ?? s.lifetimeBudgetMinor)}${s.dailyBudgetMinor != null ? '/day' : ''})`,
              }))}
              value={targetAdSetId}
              onChange={(id) => {
                if (id === null) return;
                setTargetAdSetId(id);
                const s = adSets.find((x) => x.id === id);
                if (s) {
                  const k: MetaBudgetKind =
                    s.dailyBudgetMinor != null
                      ? 'daily'
                      : s.lifetimeBudgetMinor != null
                        ? 'lifetime'
                        : 'daily';
                  setKind(k);
                  setAed(
                    minorToAedInput(
                      k === 'daily' ? s.dailyBudgetMinor : s.lifetimeBudgetMinor,
                    ),
                  );
                }
              }}
            />
          ) : null}

          <Box>
            <Text size="sm" fw={500} mb={4}>
              Budget type
            </Text>
            <SegmentedControl
              fullWidth
              value={kind}
              onChange={(v) => setKind(v as MetaBudgetKind)}
              data={[
                { value: 'daily', label: 'Daily' },
                { value: 'lifetime', label: 'Lifetime' },
              ]}
            />
          </Box>

          <TextInput
            label={`Amount (AED${kind === 'daily' ? ' / day' : ' total'})`}
            type="number"
            inputMode="decimal"
            min={1}
            step={1}
            value={aed}
            placeholder="e.g. 150"
            onChange={(e) => setAed(e.currentTarget.value)}
            error={
              aed.trim() !== '' && minor == null
                ? 'Enter a positive amount in AED.'
                : undefined
            }
            description="Saved to Meta in fils; Meta enforces its own per-objective minimum."
          />

          <Group justify="flex-end" mt="xs">
            <Button variant="default" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button
              color="red"
              disabled={!canSave}
              loading={saving}
              onClick={() => void save()}
            >
              {minor != null
                ? `Set ${aedLabel(minor)}${kind === 'daily' ? '/day' : ''}`
                : 'Save'}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
};

// ── row action cluster (coordinators only) ───────────────────────────────────
const RowActions = ({
  r,
  busy,
  onPauseResume,
  onBudget,
  onDuplicate,
}: {
  r: AdsCampaignRow;
  busy: boolean;
  onPauseResume: (r: AdsCampaignRow) => void;
  onBudget: (r: AdsCampaignRow) => void;
  onDuplicate: (r: AdsCampaignRow) => void;
}) => {
  const paused = isPaused(r);
  return (
    <Group gap={4} justify="flex-end" wrap="nowrap">
      <Tooltip label={paused ? 'Resume campaign' : 'Pause campaign'} withinPortal>
        <ActionIcon
          variant="default"
          disabled={busy}
          aria-label={paused ? 'Resume campaign' : 'Pause campaign'}
          onClick={(e) => {
            e.stopPropagation();
            onPauseResume(r);
          }}
        >
          {paused ? <IconPlayerPlay size={15} /> : <IconPlayerPause size={15} />}
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Adjust budget" withinPortal>
        <ActionIcon
          variant="default"
          disabled={busy}
          aria-label="Adjust budget"
          onClick={(e) => {
            e.stopPropagation();
            onBudget(r);
          }}
        >
          <IconCoins size={15} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Duplicate (lands paused)" withinPortal>
        <ActionIcon
          variant="default"
          disabled={busy}
          aria-label="Duplicate campaign"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(r);
          }}
        >
          <IconCopy size={15} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
};

// ── empty / notice states ────────────────────────────────────────────────────
const AdsEmpty = ({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) => (
  <Center mih={320} p="xl">
    <Stack align="center" gap={8} maw={460}>
      {icon}
      <Title order={4}>{title}</Title>
      <Text size="sm" c="dimmed" ta="center" style={{ lineHeight: 1.5 }}>
        {hint}
      </Text>
    </Stack>
  </Center>
);

// ═══════════════════════════════════════════════════════════════════════════
// ADS TAB
// ═══════════════════════════════════════════════════════════════════════════
export const AdsTab = () => {
  const notify = usePropelToast();
  const [range, setRange] = useState<AdsRange>('30d');
  const [payload, setPayload] = useState<MetaAdsMonitorPayload | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');

  const [openRow, setOpenRow] = useState<AdsCampaignRow | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: 'pauseResume' | 'duplicate';
    row: AdsCampaignRow;
  } | null>(null);
  const [budgetRow, setBudgetRow] = useState<AdsCampaignRow | null>(null);
  const [busy, setBusy] = useState(false);
  const writingRef = useRef(false);

  const load = useCallback(async (r: AdsRange) => {
    setPhase('loading');
    const res = await callPropelRoute<MetaAdsMonitorPayload>(MONITOR_ROUTE, {
      range: r,
    });
    if (!res || !res.tier) {
      setPhase('error');
      return;
    }
    setPayload(res);
    setPhase('ready');
  }, []);

  useEffect(() => {
    void load(range);
  }, [range, load]);

  const refresh = useCallback(() => {
    void load(range);
  }, [load, range]);

  // pause / resume / duplicate (confirmed in ConfirmModal).
  const runConfirmed = useCallback(async () => {
    if (!confirm || writingRef.current) return;
    writingRef.current = true;
    setBusy(true);
    const { kind, row } = confirm;
    try {
      const action =
        kind === 'duplicate'
          ? 'duplicate'
          : isPaused(row)
            ? 'resume'
            : 'pause';
      const res = await callPropelRoute<ActionResp>(ACTION_ROUTE, {
        action,
        targetType: 'campaign',
        targetId: row.campaignId,
      });
      if (!res || res.error || res.ok !== true) {
        notify(
          res?.operatorAction ||
            res?.error ||
            'The action couldn’t be completed.',
          'error',
        );
        return;
      }
      notify(
        action === 'duplicate'
          ? 'Campaign duplicated — the copy is paused so it won’t spend until you review it.'
          : action === 'resume'
            ? 'Campaign resumed.'
            : 'Campaign paused.',
        'success',
      );
      setConfirm(null);
      refresh();
    } finally {
      writingRef.current = false;
      setBusy(false);
    }
  }, [confirm, notify, refresh]);

  const canAct = payload?.tier === 'COORDINATOR';
  const t = payload?.totals;

  return (
    <Box p="md">
      {/* header */}
      <Group justify="space-between" align="center" mb="md" wrap="wrap">
        <Group gap="xs" align="center" wrap="wrap">
          <Title order={4}>Meta Ads</Title>
          {payload?.adAccountId ? (
            <Badge variant="light" color="gray" ff="monospace">
              {payload.adAccountId}
            </Badge>
          ) : null}
          {payload?.generatedAtLabel ? (
            <Text size="xs" c="dimmed" ff="monospace">
              updated {payload.generatedAtLabel} GST
            </Text>
          ) : null}
        </Group>
        <Group gap="sm" align="center">
          <SegmentedControl
            size="xs"
            value={range}
            onChange={(v) => setRange(v as AdsRange)}
            data={[
              { value: '7d', label: '7d' },
              { value: '30d', label: '30d' },
              { value: '90d', label: '90d' },
            ]}
          />
          <Tooltip label="Refresh" withinPortal>
            <ActionIcon
              variant="default"
              aria-label="Refresh"
              onClick={refresh}
              loading={phase === 'loading' && payload !== null}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {phase === 'loading' && payload === null ? (
        <Center mih={320}>
          <Loader color="red" />
        </Center>
      ) : phase === 'error' ? (
        <Center mih={320}>
          <Stack align="center" gap={8} maw={360}>
            <Text size="sm" c="dimmed">
              Couldn’t load the Meta Ads monitor.
            </Text>
            <Button variant="default" onClick={refresh}>
              Try again
            </Button>
          </Stack>
        </Center>
      ) : payload && payload.available === 'NOT_CONFIGURED' ? (
        <AdsEmpty
          icon={<IconTargetArrow size={28} color="var(--mantine-color-dimmed)" />}
          title="Meta Ads isn’t connected yet"
          hint={
            payload.notice ||
            'Add the Meta system-user token to this server to see live ad campaigns and lead attribution here.'
          }
        />
      ) : payload && payload.available === 'NO_CAMPAIGNS' ? (
        <AdsEmpty
          icon={<IconTargetArrow size={28} color="var(--mantine-color-dimmed)" />}
          title="No ad campaigns yet"
          hint={
            payload.notice ||
            'This Meta ad account has no campaigns. They’ll appear here once they’re created.'
          }
        />
      ) : payload &&
        payload.available === 'META_ERROR' &&
        payload.rows.length === 0 ? (
        <AdsEmpty
          icon={
            <IconAlertTriangle size={28} color="var(--mantine-color-yellow-6)" />
          }
          title="Meta is temporarily unavailable"
          hint={
            payload.notice ||
            'Couldn’t reach Meta right now. Try the date range again in a moment.'
          }
        />
      ) : payload && t ? (
        <>
          {/* non-fatal insights warning still shows the list */}
          {payload.available === 'META_ERROR' && payload.notice ? (
            <Card
              withBorder
              radius="md"
              padding="sm"
              mb="md"
              bg="var(--mantine-color-yellow-light)"
            >
              <Text size="sm" c="yellow.8">
                {payload.notice}
              </Text>
            </Card>
          ) : null}

          {/* totals strip */}
          <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm" mb="lg">
            <Kpi
              label="Spend"
              value={t.spendLabel}
              sub={`${t.activeCampaigns} active · ${t.campaigns} total`}
            />
            <Kpi
              label="Meta leads"
              value={num(t.metaLeads)}
              sub={
                t.blendedCplLabel !== '—'
                  ? `${t.blendedCplLabel} / lead`
                  : undefined
              }
            />
            <Kpi
              label="CRM leads"
              value={num(t.crmLeads)}
              sub={`${t.linkedCampaigns} linked · ${num(t.crmOpps)} opps`}
            />
            <Kpi
              label="Attributed revenue"
              value={t.attributedRevenueLabel}
              sub={
                t.blendedRoiLabel !== '—'
                  ? `${t.blendedRoiLabel} ROI`
                  : undefined
              }
            />
          </SimpleGrid>

          {/* monitor table */}
          <Table.ScrollContainer minWidth={860}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Campaign</Table.Th>
                  <Table.Th ta="right" c="red.6">
                    Spend
                  </Table.Th>
                  <Table.Th ta="right" c="red.6">
                    Impr.
                  </Table.Th>
                  <Table.Th ta="right" c="red.6">
                    Leads
                  </Table.Th>
                  <Table.Th ta="right" c="red.6">
                    CPL
                  </Table.Th>
                  <Table.Th ta="right" c="blue.6">
                    Leads
                  </Table.Th>
                  <Table.Th ta="right" c="blue.6">
                    Opps
                  </Table.Th>
                  <Table.Th ta="right" c="blue.6">
                    Revenue
                  </Table.Th>
                  <Table.Th ta="right" c="blue.6">
                    ROI
                  </Table.Th>
                  {canAct ? <Table.Th ta="right">Actions</Table.Th> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {payload.rows.map((r) => (
                  <Table.Tr
                    key={r.campaignId}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setOpenRow(r)}
                  >
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                        <Stack gap={2} style={{ minWidth: 0 }}>
                          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                            <Text size="sm" fw={600} truncate>
                              {r.name}
                            </Text>
                            <Badge
                              size="xs"
                              variant="light"
                              color={TONE_COLOR[r.statusTone]}
                            >
                              {r.statusLabel}
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed" truncate>
                            {[
                              r.objectiveLabel || null,
                              r.budgetLabel !== '—' ? r.budgetLabel : null,
                              !r.crmLinked ? 'Meta only' : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        </Stack>
                      </Group>
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {r.spendLabel}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {num(r.impressions)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {num(r.metaLeads)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {r.cplLabel}
                    </Table.Td>
                    <Table.Td
                      ta="right"
                      ff="monospace"
                      c={r.crmLinked ? undefined : 'dimmed'}
                    >
                      {r.crmLinked ? num(r.crmLeads) : '—'}
                    </Table.Td>
                    <Table.Td
                      ta="right"
                      ff="monospace"
                      c={r.crmLinked ? undefined : 'dimmed'}
                    >
                      {r.crmLinked ? num(r.crmOpps) : '—'}
                    </Table.Td>
                    <Table.Td
                      ta="right"
                      ff="monospace"
                      c={r.crmLinked ? undefined : 'dimmed'}
                    >
                      {r.attributedRevenueLabel}
                    </Table.Td>
                    <Table.Td
                      ta="right"
                      ff="monospace"
                      c={r.roi == null ? 'dimmed' : undefined}
                    >
                      {r.roiLabel}
                    </Table.Td>
                    {canAct ? (
                      <Table.Td
                        ta="right"
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: 'default' }}
                      >
                        <RowActions
                          r={r}
                          busy={busy}
                          onPauseResume={(row) =>
                            setConfirm({ kind: 'pauseResume', row })
                          }
                          onBudget={(row) => setBudgetRow(row)}
                          onDuplicate={(row) =>
                            setConfirm({ kind: 'duplicate', row })
                          }
                        />
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      ) : null}

      {openRow ? (
        <DetailDrawer
          row={openRow}
          range={range}
          onClose={() => setOpenRow(null)}
        />
      ) : null}

      {confirm ? (
        <ConfirmModal
          row={confirm.row}
          kind={confirm.kind}
          working={busy}
          onConfirm={() => void runConfirmed()}
          onClose={() => (busy ? undefined : setConfirm(null))}
        />
      ) : null}

      {budgetRow ? (
        <BudgetModal
          row={budgetRow}
          onClose={() => setBudgetRow(null)}
          onSaved={refresh}
        />
      ) : null}
    </Box>
  );
};
