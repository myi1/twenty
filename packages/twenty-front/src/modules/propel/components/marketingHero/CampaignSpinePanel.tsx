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
import { IconCheck, IconSparkles } from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  AddSourcesControl,
  type SelectedSource,
} from '@/propel/components/website/AddSourcesControl';
import {
  type CampaignWindow,
  type SpineArm,
  generateCampaign,
} from '@/propel/lib/campaignSpineCrm';

// Campaign Spine v1 (CS4) — the "New multi-channel campaign" brief box at the top
// of the Campaigns tab. One brief → the spine meta-bench (Strategist → parallel
// LP bench + Social bench) → a campaign in REVIEW with two linked arms sharing
// one narrative, destination, and UTM tag. Mirrors the 4S-A box (brief +
// optimistic agent strip over the single synchronous ~60s await); on
// {ok, campaignId} the parent opens the campaign review. Nothing ships here —
// approval is the gated step in CampaignReviewPanel.
//
// Graceful degrade: the route missing / FEATURE_OFF / "unknown action" (the CRM
// leg builds in parallel) → the box dims with "multi-channel campaigns aren't
// enabled yet" — never a dead-end toast loop.

// The spine strip differs from the linear bench strips: the Strategist runs
// FIRST, then the two arm benches run in PARALLEL — so after the strategist
// phase BOTH arm pills spin at once (honest visual of Promise.all).
const spinePhaseFor = (
  name: 'Strategist' | 'Landing page' | 'Social',
  phase: SpinePhase,
): 'pending' | 'active' | 'done' => {
  if (phase === 'done') return 'done';
  if (name === 'Strategist') return phase === 'strategist' ? 'active' : 'done';
  return phase === 'arms' ? 'active' : 'pending';
};

type SpinePhase = 'strategist' | 'arms' | 'done';

const SPINE_AGENTS = ['Strategist', 'Landing page', 'Social'] as const;

const AgentStrip = ({ phase }: { phase: SpinePhase }) => (
  <Group gap="xs" mt="sm" wrap="wrap">
    {SPINE_AGENTS.map((name) => {
      const state = spinePhaseFor(name, phase);
      return (
        <Badge
          key={name}
          size="sm"
          variant={
            state === 'active' ? 'filled' : state === 'done' ? 'light' : 'outline'
          }
          color={state === 'done' ? 'teal' : state === 'active' ? 'red' : 'gray'}
          leftSection={
            state === 'done' ? (
              <IconCheck size={12} />
            ) : state === 'active' ? (
              <Loader size={10} color="white" />
            ) : undefined
          }
        >
          {name}
        </Badge>
      );
    })}
  </Group>
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
  // Spine run state. `generating` = a run is in flight; `phase` drives the agent
  // strip; `featureOff` dims the box when the spine isn't live on this workspace.
  const [generating, setGenerating] = useState(false);
  const [phase, setPhase] = useState<SpinePhase>('strategist');
  const [featureOff, setFeatureOff] = useState(false);

  const run = async () => {
    const trimmed = brief.trim();
    if (trimmed === '' || generating) return;

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
    setPhase('strategist');
    // Optimistic progression: the strategist is one LLM call (~10s), then both
    // arm benches run in parallel for the remainder of the synchronous await.
    const tick = window.setTimeout(() => setPhase('arms'), 10_000);

    const res = await generateCampaign(
      trimmed,
      sources.length > 0 ? sources.map((s) => s.id) : undefined,
      campaignWindow,
    );
    window.clearTimeout(tick);
    setPhase('done');

    if (res.ok) {
      setGenerating(false);
      setBrief('');
      setSources([]);
      setStartDate('');
      setEndDate('');
      setPhase('strategist');
      onCampaignCreated(res.campaignId, res.partial ? res.failed : []);
      return;
    }

    setGenerating(false);
    setPhase('strategist');
    if (res.unavailable) {
      setFeatureOff(true);
      return;
    }
    notify(res.error, 'error');
  };

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
        One brief → a landing page + a social plan sharing one story, destination,
        and UTM tag. You review both channels before anything ships.
      </Text>

      <Stack gap="sm">
        <Textarea
          placeholder="e.g. Palm Jumeirah 2-bed launch, flexible payment plan — a 2-week push."
          autosize
          minRows={2}
          maxRows={6}
          value={brief}
          onChange={(e) => setBrief(e.currentTarget.value)}
          disabled={generating || featureOff}
        />

        <Group gap="sm" align="flex-end" wrap="wrap">
          <Box style={{ flex: 1, minWidth: 220 }}>
            <AddSourcesControl
              value={sources}
              onChange={setSources}
              disabled={generating || featureOff}
            />
          </Box>
          <TextInput
            type="date"
            label="Window start"
            size="xs"
            w={150}
            value={startDate}
            onChange={(e) => setStartDate(e.currentTarget.value)}
            disabled={generating || featureOff}
          />
          <TextInput
            type="date"
            label="Window end"
            size="xs"
            w={150}
            value={endDate}
            onChange={(e) => setEndDate(e.currentTarget.value)}
            disabled={generating || featureOff}
          />
          <Button
            color="red"
            size="sm"
            leftSection={<IconSparkles size={16} />}
            onClick={() => void run()}
            loading={generating}
            disabled={brief.trim() === '' || featureOff}
          >
            Generate
          </Button>
        </Group>

        {generating ? (
          <Box>
            <Text size="sm" fw={500}>
              The bench is drafting your campaign across both channels…
            </Text>
            <AgentStrip phase={phase} />
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
