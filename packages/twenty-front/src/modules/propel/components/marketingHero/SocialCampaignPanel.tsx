import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Popover,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconCheck,
  IconChevronDown,
  IconRefresh,
  IconSparkles,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { friendlyError } from '@/propel/lib/friendlyError';
import {
  AddSourcesControl,
  type SelectedSource,
} from '@/propel/components/website/AddSourcesControl';
import {
  type GeneratePlanWindow,
  generatePlan,
} from '@/propel/lib/socialCrm';
import {
  getStyle,
  isColdStart,
  refreshStyle,
  type StyleProfile,
  type StylePlatform,
} from '@/propel/lib/socialStyleCrm';
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

const STYLE_PLATFORM_LABEL: Record<StylePlatform, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
};

// The style-learning note on the campaign box. Shows "Learning from your last N
// posts" (N = sampleSize) with a popover of the per-platform distilled voice, a
// Refresh (recompute) affordance, and the per-run "Use my style" toggle. Cold
// start (no history yet) degrades to an honest brand-default line. Renders only
// when a profile loaded — an unavailable/transient read hides the whole thing.
const StyleNote = ({
  profile,
  refreshing,
  onRefresh,
  useStyle,
  onUseStyleChange,
  disabled,
}: {
  profile: StyleProfile;
  refreshing: boolean;
  onRefresh: () => void;
  useStyle: boolean;
  onUseStyleChange: (value: boolean) => void;
  disabled: boolean;
}) => {
  const cold = isColdStart(profile);
  const platforms = Object.keys(profile.perPlatform) as StylePlatform[];

  return (
    <Box
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-sm)',
        padding: '6px 10px',
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon
            size="sm"
            variant="light"
            color={cold ? 'gray' : 'teal'}
            radius="xl"
          >
            <IconSparkles size={12} />
          </ThemeIcon>
          {cold ? (
            <Text size="xs" c="dimmed">
              Not enough post history yet — using brand defaults.
            </Text>
          ) : (
            <Popover
              width={340}
              position="bottom-start"
              withArrow
              shadow="md"
              zIndex={5000}
            >
              <Popover.Target>
                <UnstyledButton
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    minWidth: 0,
                  }}
                >
                  <Text size="xs" fw={500} truncate>
                    Learning from your last {profile.sampleSize}{' '}
                    {profile.sampleSize === 1 ? 'post' : 'posts'}
                  </Text>
                  <IconChevronDown size={12} />
                </UnstyledButton>
              </Popover.Target>
              <Popover.Dropdown>
                <Stack gap="sm">
                  <Text size="xs" c="dimmed">
                    Distilled from your Facebook &amp; Instagram history. The bench
                    drafts in this voice and leans toward what performs.
                  </Text>
                  {platforms.map((platform, idx) => {
                    const ps = profile.perPlatform[platform];
                    if (ps === undefined) return null;
                    return (
                      <Box key={platform}>
                        {idx > 0 ? <Divider mb="sm" /> : null}
                        <Text size="xs" fw={700}>
                          {STYLE_PLATFORM_LABEL[platform]}
                        </Text>
                        {ps.voice !== '' ? (
                          <Text size="xs" mt={2}>
                            {ps.voice}
                          </Text>
                        ) : null}
                        {ps.whatWorks.length > 0 ? (
                          <>
                            <Text size="xs" fw={600} c="teal" mt={6}>
                              What works
                            </Text>
                            <Stack gap={2} mt={2}>
                              {ps.whatWorks.slice(0, 3).map((item, j) => (
                                <Text key={j} size="xs" c="dimmed">
                                  • {item}
                                </Text>
                              ))}
                            </Stack>
                          </>
                        ) : null}
                        {ps.whatFlops.length > 0 ? (
                          <>
                            <Text size="xs" fw={600} c="orange" mt={6}>
                              What flops
                            </Text>
                            <Stack gap={2} mt={2}>
                              {ps.whatFlops.slice(0, 3).map((item, j) => (
                                <Text key={j} size="xs" c="dimmed">
                                  • {item}
                                </Text>
                              ))}
                            </Stack>
                          </>
                        ) : null}
                      </Box>
                    );
                  })}
                </Stack>
              </Popover.Dropdown>
            </Popover>
          )}
          <Tooltip label="Recompute from your latest posts" withArrow>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={onRefresh}
              loading={refreshing}
              disabled={disabled}
              aria-label="Refresh style profile"
            >
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Switch
          size="sm"
          label="Use my style"
          checked={useStyle}
          onChange={(e) => onUseStyleChange(e.currentTarget.checked)}
          disabled={disabled}
          styles={{
            label: {
              fontSize: 'var(--mantine-font-size-xs)',
              whiteSpace: 'nowrap',
            },
          }}
        />
      </Group>
    </Box>
  );
};

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
  // Sources grounding (SRC-1 / plan SM6): ≤8 library sources picked via the
  // "Add sources" popover; their ids ride the generatePlan call (SM3).
  const [planSources, setPlanSources] = useState<SelectedSource[]>([]);
  // Bench run state. `generating` = a run is in flight; `stage` (0–4) drives the
  // agent strip; `featureOff` dims the box when the route reports the LLM key unset.
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState(0);
  const [featureOff, setFeatureOff] = useState(false);
  // Style-learning: the cached Style Profile (null → the note hides, i.e. cold
  // read / unavailable), a refresh spinner, and the per-run "Use my style"
  // toggle (default ON — OFF sends useStyle:false for a neutral draft).
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  const [refreshingStyle, setRefreshingStyle] = useState(false);
  const [useStyle, setUseStyle] = useState(true);

  // Load the cached profile when the box opens (best-effort). unavailable /
  // transient → leave the note hidden; never toast on this passive read.
  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    void (async () => {
      const res = await getStyle();
      if (cancelled) return;
      setStyleProfile(res.ok ? res.profile : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [opened]);

  const doRefreshStyle = async () => {
    setRefreshingStyle(true);
    const res = await refreshStyle();
    if (res.ok) {
      // Re-get the freshly recomputed profile so the note reflects the cache.
      const cached = await getStyle();
      setStyleProfile(cached.ok ? cached.profile : res.profile);
    } else if (res.unavailable) {
      setStyleProfile(null);
    } else {
      notify('Could not refresh your style profile just now.', 'error');
    }
    setRefreshingStyle(false);
  };

  const reset = () => {
    setBrief('');
    setNetworks(ALL_NETWORKS);
    setStartDate('');
    setEndDate('');
    setPlanSources([]);
    setStage(0);
    setUseStyle(true);
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

    const res = await generatePlan(
      trimmed,
      networks,
      campaignWindow,
      planSources.length > 0 ? planSources.map((s) => s.id) : undefined,
      undefined,
      useStyle,
    );
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
    notify(friendlyError(res.error, 'generic'), 'error');
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

        {styleProfile !== null ? (
          <StyleNote
            profile={styleProfile}
            refreshing={refreshingStyle}
            onRefresh={doRefreshStyle}
            useStyle={useStyle}
            onUseStyleChange={setUseStyle}
            disabled={generating || featureOff}
          />
        ) : null}

        <AddSourcesControl
          value={planSources}
          onChange={setPlanSources}
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
