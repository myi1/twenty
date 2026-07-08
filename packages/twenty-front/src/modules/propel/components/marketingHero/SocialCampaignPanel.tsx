import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { IconCheck, IconSparkles } from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  type GeneratePlanWindow,
  generatePlan,
} from '@/propel/lib/socialCrm';
import { type SocialNetwork } from '@/propel/types/socialCalendar';

// Social Bench 4S-A — the "Create campaign" brief box. A brief → the bench
// (Strategist → Copywriter → Designer → Scheduler) → a PROPOSED plan of bespoke
// per-platform draft posts the founder reviews and one-click approves onto the
// Social calendar. Mirrors the Landing tab's Stage-3A box (brief + optimistic
// agent strip during the single synchronous ~30–45s await; on {ok, planId} the
// parent opens the plan review). Nothing publishes here — approval is a separate
// gated step in PlanReviewPanel.

const ALL_NETWORKS: SocialNetwork[] = [
  'FACEBOOK',
  'INSTAGRAM',
  'LINKEDIN',
  'TIKTOK',
];

const NETWORK_LABEL: Record<SocialNetwork, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
  TIKTOK: 'TikTok',
};

// The four bench agents, in run order. The strip ticks each to "done" as the
// synchronous route progresses (optimistic timed progression — one pill is
// "active" with a spinner, earlier pills are "done"; on the single await
// resolving we mark all four done, then open the fresh plan in review).
const AGENT_STAGES = ['Strategist', 'Copywriter', 'Designer', 'Scheduler'] as const;

const AgentStrip = ({ stage }: { stage: number }) => (
  <Group gap="xs" mt="sm" wrap="wrap">
    {AGENT_STAGES.map((name, i) => {
      const done = i < stage;
      const active = i === stage;
      return (
        <Badge
          key={name}
          size="sm"
          variant={active ? 'filled' : done ? 'light' : 'outline'}
          color={done ? 'teal' : active ? 'red' : 'gray'}
          leftSection={
            done ? (
              <IconCheck size={12} />
            ) : active ? (
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

interface SocialCampaignPanelProps {
  opened: boolean;
  onClose: () => void;
  // Handed the new plan's id on a successful generate → parent opens the review.
  onPlanCreated: (planId: string) => void;
}

export const SocialCampaignPanel = ({
  opened,
  onClose,
  onPlanCreated,
}: SocialCampaignPanelProps) => {
  const notify = usePropelToast();

  const [brief, setBrief] = useState('');
  const [networks, setNetworks] = useState<SocialNetwork[]>(ALL_NETWORKS);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Bench run state. `generating` = a run is in flight; `stage` (0–4) drives the
  // agent strip; `featureOff` dims the box when the route reports the LLM key unset.
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState(0);
  const [featureOff, setFeatureOff] = useState(false);

  const reset = () => {
    setBrief('');
    setNetworks(ALL_NETWORKS);
    setStartDate('');
    setEndDate('');
    setStage(0);
  };

  const close = () => {
    if (generating) return;
    reset();
    onClose();
  };

  const run = async () => {
    const trimmed = brief.trim();
    if (trimmed === '') return;
    if (networks.length === 0) {
      notify('Pick at least one network for the campaign.', 'error');
      return;
    }

    const startIso = dateToIso(startDate);
    const endIso = dateToIso(endDate);
    let campaignWindow: GeneratePlanWindow | undefined;
    if (startIso !== null && endIso !== null) {
      if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
        notify('The campaign end date is before the start date.', 'error');
        return;
      }
      campaignWindow = { start: startIso, end: endIso };
    }

    setGenerating(true);
    setStage(0);
    // Optimistic progression: tick to the next agent every ~10s (cap at the last
    // one) so the strip reads as forward motion during the synchronous await.
    const timer = window.setInterval(() => {
      setStage((s) => (s < AGENT_STAGES.length - 1 ? s + 1 : s));
    }, 10_000);

    const res = await generatePlan(trimmed, networks, campaignWindow);
    window.clearInterval(timer);
    setStage(AGENT_STAGES.length); // all four done

    if (res.ok) {
      setGenerating(false);
      reset();
      onClose();
      onPlanCreated(res.planId);
      return;
    }

    setGenerating(false);
    setStage(0);
    if (res.featureOff) {
      setFeatureOff(true);
      return;
    }
    notify(res.error, 'error');
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={
        <Group gap="xs">
          <ThemeIcon size="md" variant="light" color="red">
            <IconSparkles size={16} />
          </ThemeIcon>
          <Text fw={700}>Create campaign</Text>
          <Badge size="xs" variant="light" color="grape">
            AI bench
          </Badge>
        </Group>
      }
      size="lg"
      centered
      zIndex={5000}
      closeOnClickOutside={!generating}
      withCloseButton={!generating}
    >
      <Stack gap="md" style={featureOff ? { opacity: 0.55 } : undefined}>
        <Text size="sm" c="dimmed">
          Describe the campaign. The bench drafts bespoke per-platform posts across
          your window; you review and approve them onto the calendar. Nothing
          publishes until you approve.
        </Text>

        <Textarea
          label="Campaign brief"
          placeholder="e.g. Palm Jumeirah 2-bed launch, flexible payment plan — a 2-week awareness push."
          autosize
          minRows={3}
          maxRows={8}
          value={brief}
          onChange={(e) => setBrief(e.currentTarget.value)}
          disabled={generating || featureOff}
        />

        <MultiSelect
          label="Networks"
          description="Bespoke per-platform drafts are written for each selected network."
          data={ALL_NETWORKS.map((n) => ({ value: n, label: NETWORK_LABEL[n] }))}
          value={networks}
          onChange={(v) => setNetworks(v as SocialNetwork[])}
          disabled={generating || featureOff}
          clearable={false}
          comboboxProps={{ zIndex: 5000 }}
        />

        <Group gap="sm" grow align="flex-start">
          <TextInput
            type="date"
            label="Window start"
            description="Optional — defaults to the next 14 days."
            value={startDate}
            onChange={(e) => setStartDate(e.currentTarget.value)}
            disabled={generating || featureOff}
          />
          <TextInput
            type="date"
            label="Window end"
            description="Optional."
            value={endDate}
            onChange={(e) => setEndDate(e.currentTarget.value)}
            disabled={generating || featureOff}
          />
        </Group>

        {generating ? (
          <Box>
            <Text size="sm" fw={500}>
              The bench is drafting your campaign…
            </Text>
            <AgentStrip stage={stage} />
          </Box>
        ) : null}

        {featureOff ? (
          <Text size="xs" c="dimmed">
            AI campaign drafting isn’t configured yet.
          </Text>
        ) : null}

        <Group justify="flex-end" gap="xs">
          <Button variant="default" size="sm" onClick={close} disabled={generating}>
            Cancel
          </Button>
          <Button
            color="red"
            size="sm"
            leftSection={<IconSparkles size={16} />}
            onClick={run}
            loading={generating}
            disabled={brief.trim() === '' || networks.length === 0 || featureOff}
          >
            Generate
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default SocialCampaignPanel;
