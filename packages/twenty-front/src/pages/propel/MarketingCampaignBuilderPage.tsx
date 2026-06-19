import {
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Stack,
  Text,
} from '@mantine/core';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import {
  IconAdjustments,
  IconArrowLeft,
  IconArrowsSplit2,
  IconBroadcast,
  IconMessage,
  IconSparkles,
} from 'twenty-ui/display';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import { AiBuilderPanel } from '@/propel/components/campaign/AiBuilderPanel';
import { ManualWizard } from '@/propel/components/campaign/ManualWizard';
import { SendRulesModal } from '@/propel/components/campaign/SendRulesModal';
import { useCampaignBuilderData } from '@/propel/hooks/useCampaignBuilderData';
import { type AiPlan } from '@/propel/types/campaignBuilder';

// S1 — Unified "Create" entry (design decision D-1, founder-locked 2026-06-18).
//
// The mental model is ONE coherent Create flow, expressed as a what × how matrix:
//   • WHAT  — "One message" (a single campaign) vs "Follow-up sequence" (a
//             multi-step nurture).
//   • HOW   — author it "Manually" (step the wizard) or "With AI" (describe it,
//             the co-pilot proposes a verified plan).
//
// Both "one message" paths land in the SAME ManualWizard (manual = blank,
// AI = the conversational panel that hands off into the wizard with fields
// pre-filled). "Follow-up sequence" routes to the existing graduated Sequence
// editor — the structure stays two destinations (per D-1: "the unified part is
// the MENTAL MODEL/entry, not one literal page"), but the entry makes them read
// as one product, not a fork the user has to pre-classify before they know what
// they want.
//
// Rides Twenty's DefaultLayout (nav + top bar come from the router <Outlet/>);
// this page owns the header, the entry matrix, and either the manual Mantine
// wizard or the conversational AI builder — all in its own Mantine scope. The
// whole point of graduating it is REAL modals/dropdowns/focus that the
// front-component sandbox forbade.

// The authoring stage once the user has picked a "one message" path. The
// sequence path leaves this page entirely (navigates to the Sequence editor),
// so it is intentionally NOT a stage here.
type Stage = 'entry' | 'manual' | 'ai';

export const MarketingCampaignBuilderPage = () => {
  const navigate = useNavigate();
  const { isLoading, refetch, ...hub } = useCampaignBuilderData();
  const [stage, setStage] = useState<Stage>('entry');
  const [handoffPlan, setHandoffPlan] = useState<AiPlan | null>(null);
  // S3 / Gap B — the graduated Send-Rules editor, opened from the Review
  // guardrails "Edit rules" link as a modal (no more round-trip to the hub).
  const [rulesOpen, setRulesOpen] = useState(false);

  const goHome = useCallback(() => {
    navigate(AppPath.MarketingHub);
  }, [navigate]);

  const goSequences = useCallback(() => {
    navigate(AppPath.MarketingSequenceEditor);
  }, [navigate]);

  // Gap B — open the graduated send-rules editor in place. The card only shows
  // "Edit rules" when sendRules is present, so the modal always has a singleton
  // to seed from; guard anyway so a missing payload is a no-op rather than a
  // crash.
  const goEditRules = useCallback(() => {
    if (hub.sendRules) setRulesOpen(true);
  }, [hub.sendRules]);

  // On a successful save, refetch the hub so the Review guardrails summary picks
  // up the new caps/quiet-hours/Friday-pause live, without leaving Review.
  const handleRulesClose = useCallback(
    (changed: boolean) => {
      setRulesOpen(false);
      if (changed) void refetch();
    },
    [refetch],
  );

  const startManual = useCallback(() => {
    setHandoffPlan(null);
    setStage('manual');
  }, []);

  const startAi = useCallback(() => {
    setHandoffPlan(null);
    setStage('ai');
  }, []);

  const handoffToManual = useCallback((plan: AiPlan) => {
    setHandoffPlan(plan);
    setStage('manual');
  }, []);

  return (
    <PropelMantineProvider>
      <PageContainer>
        <PageHeader title="Create" Icon={IconBroadcast}>
          {stage === 'entry' ? (
            <Button
              size="xs"
              variant="default"
              leftSection={<IconArrowLeft size={14} />}
              onClick={goHome}
            >
              Marketing
            </Button>
          ) : (
            <Button
              size="xs"
              variant="default"
              leftSection={<IconArrowLeft size={14} />}
              onClick={() => setStage('entry')}
            >
              Start over
            </Button>
          )}
        </PageHeader>

        <div
          style={{
            padding: '8px 16px 24px',
            minHeight: 0,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {isLoading ? (
            <Center h={320}>
              <Loader color="red" />
            </Center>
          ) : stage === 'entry' ? (
            <CreateEntry
              onManual={startManual}
              onAi={startAi}
              onSequence={goSequences}
            />
          ) : stage === 'manual' ? (
            <ManualWizard
              hub={hub}
              initialPlan={handoffPlan}
              onDone={goHome}
              onEditRules={goEditRules}
            />
          ) : (
            <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Describe what you want to send — every number is verified against
                  your real data before it&rsquo;s shown.
                </Text>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="gray"
                  onClick={() => setStage('entry')}
                >
                  Back to start
                </Button>
              </Group>
              <AiBuilderPanel onHandoff={handoffToManual} />
            </Stack>
          )}
        </div>
      </PageContainer>

      {rulesOpen && hub.sendRules && (
        <SendRulesModal rules={hub.sendRules} onClose={handleRulesClose} />
      )}
    </PropelMantineProvider>
  );
};

// ── The unified Create entry — what × how ────────────────────────────────────
const CreateEntry = ({
  onManual,
  onAi,
  onSequence,
}: {
  onManual: () => void;
  onAi: () => void;
  onSequence: () => void;
}) => (
  <Center style={{ flex: 1, minHeight: 320 }}>
    <Stack gap="lg" maw={680} w="100%">
      <Stack gap={4} align="center">
        <Text fw={700} size="lg" c="var(--mantine-color-text)">
          What do you want to create?
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          One message goes out once. A follow-up sequence keeps nurturing over
          days — you can always add steps later.
        </Text>
      </Stack>

      {/* WHAT — one message vs a follow-up sequence */}
      <Stack gap="sm">
        <ChoiceCard
          icon={<IconMessage size={22} />}
          title="One message"
          description="A single email or WhatsApp campaign to an audience."
          onClick={onManual}
          footer={
            <Group gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">
                How:
              </Text>
              <MethodChip
                icon={<IconAdjustments size={13} />}
                label="Manually"
                onClick={onManual}
              />
              <MethodChip
                icon={<IconSparkles size={13} />}
                label="With AI"
                accent
                onClick={onAi}
              />
            </Group>
          }
        />
        <ChoiceCard
          icon={<IconArrowsSplit2 size={22} />}
          title="Follow-up sequence"
          description="A multi-step nurture — send, wait, branch on opens or replies."
          onClick={onSequence}
          footer={
            <Badge size="sm" variant="light" color="gray">
              Opens the sequence editor
            </Badge>
          }
        />
      </Stack>

      <Text size="xs" c="dimmed" ta="center">
        Both reach the same contacts by email or WhatsApp — pick the shape that
        fits the goal.
      </Text>
    </Stack>
  </Center>
);

const MethodChip = ({
  icon,
  label,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
  onClick: () => void;
}) => (
  <Button
    size="compact-xs"
    variant={accent ? 'light' : 'default'}
    color={accent ? 'red' : 'gray'}
    leftSection={icon}
    onClick={(e) => {
      // The card's own onClick is the "manual" default; a method chip is a more
      // specific intent, so stop it from also firing the card.
      e.stopPropagation();
      onClick();
    }}
  >
    {label}
  </Button>
);

const ChoiceCard = ({
  icon,
  title,
  description,
  footer,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  footer?: React.ReactNode;
  onClick: () => void;
}) => (
  <Card
    withBorder
    radius="md"
    padding="md"
    onClick={onClick}
    style={{
      cursor: 'pointer',
      background: 'var(--mantine-color-body)',
      borderColor: 'var(--mantine-color-default-border)',
    }}
  >
    <Group gap="md" wrap="nowrap" align="flex-start">
      <Center
        style={{
          width: 44,
          height: 44,
          flex: 'none',
          borderRadius: 12,
          background: 'var(--mantine-color-default-hover)',
          color: 'var(--mantine-color-dimmed)',
        }}
      >
        {icon}
      </Center>
      <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text fw={700} size="sm" c="var(--mantine-color-text)">
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        </Stack>
        {footer}
      </Stack>
    </Group>
  </Card>
);

// TODO(S8 — detail graduation): when the campaign DETAIL view graduates to a
// Mantine + Nivo hero, this entry can also surface a "recent drafts" rail so the
// user resumes an in-flight campaign without round-tripping through the board.
