import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconCheck, IconRefresh, IconSparkles, IconX } from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  AddSourcesControl,
  type SelectedSource,
} from '@/propel/components/website/AddSourcesControl';
import {
  type CampaignWindow,
  type SpineArm,
  generateArm,
  generateCampaign,
} from '@/propel/lib/campaignSpineCrm';

// Campaign Spine (CS4 v1 → V2 progressive review) — the "New multi-channel
// campaign" brief box at the top of the Campaigns tab. One brief → the spine
// meta-bench: the Strategist plans the channel mix (armsOnly generate), then the
// fork fires ONE generateArm call per planned channel in PARALLEL
// (Promise.allSettled inside generateCampaign) — so the agent strip is per-arm:
// Strategist ✓ → LP / Social / Email / Blog pills each spinning independently
// and ticking as their own call returns. A failed arm shows ✗ + a Retry that
// re-fires generateArm (idempotent-safe — an arm that actually landed answers
// alreadyExists, never a duplicate). Nothing ships here — approval is the gated
// step in CampaignReviewPanel.
//
// Graceful degrade: a v1 route ignores `armsOnly` and generates lp+social
// in-request — generateCampaign detects the full-shape response, skips the
// fan-out, and settles the pills from its result (no per-arm liveness; the 10s
// optimistic tick below covers the visual meanwhile). The route missing /
// FEATURE_OFF / "unknown action" → the box dims with "multi-channel campaigns
// aren't enabled yet" — never a dead-end toast loop.

type PillState = 'pending' | 'active' | 'done' | 'failed';

const ARM_ORDER: SpineArm[] = ['lp', 'social', 'email', 'blog'];

const ARM_LABEL: Record<SpineArm, string> = {
  lp: 'Landing page',
  social: 'Social',
  email: 'Email',
  blog: 'Blog',
};

const ArmPill = ({ label, state }: { label: string; state: PillState }) => (
  <Badge
    size="sm"
    variant={
      state === 'active' ? 'filled' : state === 'pending' ? 'outline' : 'light'
    }
    color={
      state === 'done'
        ? 'teal'
        : state === 'failed'
          ? 'red'
          : state === 'active'
            ? 'red'
            : 'gray'
    }
    leftSection={
      state === 'done' ? (
        <IconCheck size={12} />
      ) : state === 'failed' ? (
        <IconX size={12} />
      ) : state === 'active' ? (
        <Loader size={10} color="white" />
      ) : undefined
    }
  >
    {label}
  </Badge>
);

// Convert a <input type="date"> value (YYYY-MM-DD, local) to an ISO instant at the
// start of that day. Empty → null.
const dateToIso = (value: string): string | null => {
  if (value === '') return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

interface CampaignSpinePanelProps {
  // Handed the new campaign's id (+ any arm that failed to generate) on a
  // successful generate → the parent opens the campaign review.
  onCampaignCreated: (campaignId: string, failedArms: SpineArm[]) => void;
}

export const CampaignSpinePanel = ({
  onCampaignCreated,
}: CampaignSpinePanelProps) => {
  const notify = usePropelToast();

  const [brief, setBrief] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Sources grounding (SRC-1): ≤8 library sources picked via the "Add sources"
  // popover; their ids ride the generateCampaign call.
  const [sources, setSources] = useState<SelectedSource[]>([]);
  // Spine run state. `generating` = the fan-out is in flight; `featureOff` dims
  // the box when the spine isn't live on this workspace.
  const [generating, setGenerating] = useState(false);
  const [featureOff, setFeatureOff] = useState(false);
  // Per-arm pill states, written ONLY by real generateArm progress events (or
  // the v1-degrade settlement). Empty until the Strategist returns.
  const [armStates, setArmStates] = useState<
    Partial<Record<SpineArm, PillState>>
  >({});
  const [strategistDone, setStrategistDone] = useState(false);
  // Optimistic guess for the v1-degrade path (ONE synchronous ~60s call, no
  // per-arm events until the end): after ~10s with no real event, spin the two
  // v1 arms so the strip stays honest-ish. Cleared by the first real event.
  const [optimisticArms, setOptimisticArms] = useState(false);
  // Run finished but some arms failed → the strip stays up with per-arm Retry
  // buttons + a "Review campaign" escape (the review has the same affordance).
  const [settled, setSettled] = useState<{
    campaignId: string;
    failed: SpineArm[];
  } | null>(null);
  const [retryBusy, setRetryBusy] = useState<SpineArm | null>(null);

  const resetStrip = () => {
    setArmStates({});
    setStrategistDone(false);
    setOptimisticArms(false);
    setSettled(null);
  };

  const resetForm = () => {
    setBrief('');
    setSources([]);
    setStartDate('');
    setEndDate('');
  };

  const run = async () => {
    const trimmed = brief.trim();
    if (trimmed === '' || generating || settled !== null) return;

    const startIso = dateToIso(startDate);
    const endIso = dateToIso(endDate);
    let campaignWindow: CampaignWindow | undefined;
    if (startIso !== null && endIso !== null) {
      if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
        notify('The campaign end date is before the start date.', 'error');
        return;
      }
      campaignWindow = { start: startIso, end: endIso };
    }

    setGenerating(true);
    resetStrip();
    const tick = window.setTimeout(() => {
      setStrategistDone(true);
      setOptimisticArms(true);
    }, 10_000);

    const res = await generateCampaign(
      trimmed,
      sources.length > 0 ? sources.map((s) => s.id) : undefined,
      campaignWindow,
      (arm, state) => {
        // A real per-arm event → the Strategist phase is over and any
        // optimistic guess yields to truth.
        setStrategistDone(true);
        setOptimisticArms(false);
        setArmStates((prev) => ({ ...prev, [arm]: state }));
      },
    );
    window.clearTimeout(tick);
    setGenerating(false);

    if (res.ok) {
      setStrategistDone(true);
      setOptimisticArms(false);
      if (res.failed.length === 0) {
        resetStrip();
        resetForm();
        onCampaignCreated(res.campaignId, []);
        return;
      }
      // Some arms failed — keep the strip with ✗ pills + per-arm Retry.
      setSettled({ campaignId: res.campaignId, failed: res.failed });
      return;
    }

    resetStrip();
    if (res.unavailable) {
      setFeatureOff(true);
      return;
    }
    notify(res.error, 'error');
  };

  // Retry ONE failed arm via generateArm (idempotent-safe: alreadyExists is a
  // success — the arm landed after all, e.g. a client-side timeout on a call
  // that finished server-side).
  const retryArm = async (arm: SpineArm) => {
    if (settled === null || retryBusy !== null) return;
    setRetryBusy(arm);
    setArmStates((prev) => ({ ...prev, [arm]: 'active' }));
    const res = await generateArm(settled.campaignId, arm);
    setRetryBusy(null);
    if (!res.ok) {
      setArmStates((prev) => ({ ...prev, [arm]: 'failed' }));
      notify(res.error, 'error');
      return;
    }
    setArmStates((prev) => ({ ...prev, [arm]: 'done' }));
    const remaining = settled.failed.filter((a) => a !== arm);
    if (remaining.length === 0) {
      const campaignId = settled.campaignId;
      resetStrip();
      resetForm();
      onCampaignCreated(campaignId, []);
      return;
    }
    setSettled({ campaignId: settled.campaignId, failed: remaining });
  };

  const openReview = () => {
    if (settled === null) return;
    const { campaignId, failed } = settled;
    resetStrip();
    resetForm();
    onCampaignCreated(campaignId, failed);
  };

  // ── the per-arm strip ────────────────────────────────────────────────────────
  const realArms = ARM_ORDER.filter((a) => armStates[a] !== undefined);
  const stripVisible = generating || settled !== null;
  const busyStrip = generating || retryBusy !== null;

  const strip = (
    <Group gap="xs" mt="sm" wrap="wrap" align="center">
      <ArmPill label="Strategist" state={strategistDone ? 'done' : 'active'} />
      {realArms.length === 0
        ? // No real events yet: pending placeholders (or the v1 optimistic spin).
          ARM_ORDER.map((arm) => (
            <ArmPill
              key={arm}
              label={ARM_LABEL[arm]}
              state={
                optimisticArms && (arm === 'lp' || arm === 'social')
                  ? 'active'
                  : 'pending'
              }
            />
          ))
        : realArms.map((arm) => (
            <Group key={arm} gap={4} wrap="nowrap">
              <ArmPill label={ARM_LABEL[arm]} state={armStates[arm] ?? 'pending'} />
              {settled !== null &&
              settled.failed.includes(arm) &&
              armStates[arm] === 'failed' ? (
                <Button
                  size="compact-xs"
                  variant="light"
                  color="red"
                  leftSection={<IconRefresh size={12} />}
                  loading={retryBusy === arm}
                  disabled={busyStrip && retryBusy !== arm}
                  onClick={() => void retryArm(arm)}
                >
                  Retry
                </Button>
              ) : null}
            </Group>
          ))}
    </Group>
  );

  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      mb="md"
      style={featureOff ? { opacity: 0.55 } : undefined}
    >
      <Group gap="xs" mb="xs">
        <IconSparkles size={16} />
        <Text fw={600}>New multi-channel campaign</Text>
        <Badge size="xs" variant="light" color="grape">
          AI bench
        </Badge>
      </Group>
      <Text size="sm" c="dimmed" mb="sm">
        One brief → the strategist picks the channels (landing page, social,
        email, blog) and each arm drafts in parallel, sharing one story,
        destination, and UTM tag. You review everything before anything ships.
      </Text>

      <Stack gap="sm">
        <Textarea
          placeholder="e.g. Palm Jumeirah 2-bed launch, flexible payment plan — a 2-week push."
          autosize
          minRows={2}
          maxRows={6}
          value={brief}
          onChange={(e) => setBrief(e.currentTarget.value)}
          disabled={generating || featureOff || settled !== null}
        />

        <Group gap="sm" align="flex-end" wrap="wrap">
          <Box style={{ flex: 1, minWidth: 220 }}>
            <AddSourcesControl
              value={sources}
              onChange={setSources}
              disabled={generating || featureOff || settled !== null}
            />
          </Box>
          <TextInput
            type="date"
            label="Window start"
            size="xs"
            w={150}
            value={startDate}
            onChange={(e) => setStartDate(e.currentTarget.value)}
            disabled={generating || featureOff || settled !== null}
          />
          <TextInput
            type="date"
            label="Window end"
            size="xs"
            w={150}
            value={endDate}
            onChange={(e) => setEndDate(e.currentTarget.value)}
            disabled={generating || featureOff || settled !== null}
          />
          <Button
            color="red"
            size="sm"
            leftSection={<IconSparkles size={16} />}
            onClick={() => void run()}
            loading={generating}
            disabled={brief.trim() === '' || featureOff || settled !== null}
          >
            Generate
          </Button>
        </Group>

        {stripVisible ? (
          <Box>
            <Text size="sm" fw={500}>
              {generating
                ? 'The bench is drafting your campaign, one agent per channel…'
                : 'Some channels failed to draft — retry them, or review what landed.'}
            </Text>
            {strip}
            {settled !== null && !generating ? (
              <Button
                mt="sm"
                size="compact-sm"
                variant="light"
                color="red"
                disabled={retryBusy !== null}
                onClick={openReview}
              >
                Review campaign
              </Button>
            ) : null}
          </Box>
        ) : null}

        {featureOff ? (
          <Text size="xs" c="dimmed">
            Multi-channel campaigns aren’t enabled yet on this workspace.
          </Text>
        ) : null}
      </Stack>
    </Paper>
  );
};

export default CampaignSpinePanel;
