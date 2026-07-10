import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import {
  IconExternalLink,
  IconMessage,
  IconShield,
  IconTags,
  IconUser,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { friendlyError } from '@/propel/lib/friendlyError';
import {
  getTemplatesChannel,
  getTemplatesView,
  setTemplatesChannel,
  setTemplatesView,
  type TemplatesChannel,
  type TemplatesView,
} from '@/propel/lib/marketingPrefs';
import { type MarketingHubPayload } from '@/propel/types/marketingHome';
import { type SendRulesPayload } from '@/propel/types/campaignBuilder';
import { SurfaceIntro } from '@/propel/components/desk';
import { useCanPublish } from '@/propel/lib/canPublish';
import { isManagerRole, useViewerRole } from '@/propel/hooks/useViewerRole';
import { MergeTagsView } from './MergeTagsView';

// Marketing Settings tab of the unified hero (TM#70) — the ONE place the brokerage
// GOVERNS the engine (the funnel tabs are where you RUN it). It consolidates the
// config surfaces that were scattered: Send rules (was orphaned inside campaign
// Review), Merge tags (was a 4th filter chip on Templates), Publishing (the
// maker-checker capability, previously only a probe), and each agent's own display
// preferences.
//
// A LEFT VERTICAL rail (Mantine Tabs orientation="vertical") holds the sections,
// URL-synced via ?sub= so a section is linkable / survives reload. The vertical
// list visually distinguishes "governance" from the horizontal funnel tabs.
//
// Section role-gating (fail-closed, mirrors NumbersTab / LeadRoutingTab):
//   • Send rules · Merge tags · Publishing — Manager/Admin only (the rail item is
//     hidden for agents; every WRITE route is independently server-gated too).
//   • My preferences — everyone (self; client-only display prefs).
// An agent therefore sees only "My preferences" in the rail. Lead Routing and
// Numbers deliberately STAY as top-level funnel tabs this wave (moving them is a
// separate founder decision — spec §5 open question 1), so they are NOT sections
// here.

// Mirrors src/shared/marketing-hub-types DEFAULT_SEND_RULES_PAYLOAD — used when the
// hub payload omits the singleton (first run / route soft-fail).
const DEFAULT_SEND_RULES: SendRulesPayload = {
  id: null,
  capPerWeek: 2,
  capPerWeekWhatsapp: 1,
  quietEnabled: true,
  quietStart: '21:00',
  quietEnd: '09:00',
  fridayPauseEnabled: false,
  fridayPauseUntil: '14:00',
};

// The 30-minute grid the legacy send-rules sheet used; a saved value off the grid
// (e.g. 09:15) is prepended so it stays selectable.
const TIME_OPTS = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++)
    for (const m of [0, 30])
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  return out;
})();
const timeOptions = (value: string): string[] =>
  TIME_OPTS.includes(value) ? TIME_OPTS : [value, ...TIME_OPTS];

interface SaveRulesResponse {
  ok?: boolean;
  id?: string;
  error?: string;
  operatorAction?: string;
}

// ── Send rules section — the send governance the drain enforces on EVERY send.
// Rebuilt INLINE (the campaign-Review SendRulesModal, promoted to a full section).
// Reads the current singleton from the shared hub payload; saves the same
// field-for-field body via POST /marketing/save-rules and reloads the hub so the
// campaign Review guardrails summary reflects it. Coordinator-gated server-side. ──
const SendRulesSection = ({
  rules,
  reload,
}: {
  rules: SendRulesPayload;
  reload: () => void;
}) => {
  const notify = usePropelToast();
  const [capPerWeek, setCapPerWeek] = useState(rules.capPerWeek);
  const [capPerWeekWa, setCapPerWeekWa] = useState(rules.capPerWeekWhatsapp);
  const [quietEnabled, setQuietEnabled] = useState(rules.quietEnabled);
  const [quietStart, setQuietStart] = useState(rules.quietStart);
  const [quietEnd, setQuietEnd] = useState(rules.quietEnd);
  const [fridayPause, setFridayPause] = useState(rules.fridayPauseEnabled);
  const [fridayUntil, setFridayUntil] = useState(rules.fridayPauseUntil);
  const [saving, setSaving] = useState(false);

  const dirty =
    capPerWeek !== rules.capPerWeek ||
    capPerWeekWa !== rules.capPerWeekWhatsapp ||
    quietEnabled !== rules.quietEnabled ||
    quietStart !== rules.quietStart ||
    quietEnd !== rules.quietEnd ||
    fridayPause !== rules.fridayPauseEnabled ||
    fridayUntil !== rules.fridayPauseUntil;

  const quietStartOpts = useMemo(() => timeOptions(quietStart), [quietStart]);
  const quietEndOpts = useMemo(() => timeOptions(quietEnd), [quietEnd]);
  const fridayUntilOpts = useMemo(() => timeOptions(fridayUntil), [fridayUntil]);

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    const res = await callPropelRoute<SaveRulesResponse>(
      '/marketing/save-rules',
      {
        capPerWeek,
        capPerWeekWhatsapp: capPerWeekWa,
        quietEnabled,
        quietStart,
        quietEnd,
        fridayPauseEnabled: fridayPause,
        fridayPauseUntil: fridayUntil,
      },
    );
    setSaving(false);
    if (res === null || res.error !== undefined || res.ok !== true) {
      notify(
        res?.operatorAction || friendlyError(res?.error, 'save'),
        'error',
      );
      return;
    }
    notify('Send rules saved.', 'success');
    reload();
  };

  return (
    <Stack gap="lg" maw={640}>
      <SurfaceIntro
        eyebrow="The rulebook"
        title="Send rules"
        icon={<IconMessage size={20} />}
      />
      <Text size="sm" c="dimmed" style={{ lineHeight: 1.55 }}>
        These protect your contacts from over-messaging. Caps count messages
        queued + sent per person over a rolling 7-day window; the quiet window
        pauses all marketing sends (they resume after it). All times are
        Asia/Dubai.
      </Text>

      <Box>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb="sm">
          Weekly caps per person
        </Text>
        <Group grow align="flex-start">
          <NumberInput
            label="All channels"
            description="messages / week"
            min={0}
            max={50}
            clampBehavior="strict"
            allowDecimal={false}
            value={capPerWeek}
            onChange={(v) =>
              setCapPerWeek(typeof v === 'number' ? v : capPerWeek)
            }
          />
          <NumberInput
            label="WhatsApp"
            description="messages / week"
            min={0}
            max={50}
            clampBehavior="strict"
            allowDecimal={false}
            value={capPerWeekWa}
            onChange={(v) =>
              setCapPerWeekWa(typeof v === 'number' ? v : capPerWeekWa)
            }
          />
        </Group>
        <Text size="xs" c="dimmed" mt={6}>
          A person at or over the cap is skipped at send time; the nightly
          reconcile repairs drift.
        </Text>
      </Box>

      <Divider />

      <Box>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb="sm">
          Quiet window
        </Text>
        <Switch
          color="red"
          checked={quietEnabled}
          onChange={(e) => setQuietEnabled(e.currentTarget.checked)}
          label="Enable quiet hours"
          description="Marketing sends pause inside the window."
        />
        {quietEnabled && (
          <Group grow mt="sm">
            <Select
              label="Quiet from"
              value={quietStart}
              onChange={(v) => v && setQuietStart(v)}
              data={quietStartOpts}
              allowDeselect={false}
            />
            <Select
              label="Quiet until"
              value={quietEnd}
              onChange={(v) => v && setQuietEnd(v)}
              data={quietEndOpts}
              allowDeselect={false}
            />
          </Group>
        )}
      </Box>

      <Divider />

      <Box>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb="sm">
          Friday pause
        </Text>
        <Switch
          color="red"
          checked={fridayPause}
          onChange={(e) => setFridayPause(e.currentTarget.checked)}
          label="Pause on Friday mornings"
          description="Holds marketing sends until the set time on Fridays (the UAE weekend start)."
        />
        {fridayPause && (
          <Box mt="sm" maw={200}>
            <Select
              label="Resume after"
              value={fridayUntil}
              onChange={(v) => v && setFridayUntil(v)}
              data={fridayUntilOpts}
              allowDeselect={false}
            />
          </Box>
        )}
      </Box>

      <Group justify="flex-end">
        <Button
          color="red"
          onClick={() => void save()}
          loading={saving}
          disabled={!dirty || saving}
        >
          Save rules
        </Button>
      </Group>
    </Stack>
  );
};

// ── Publishing & approvals — READ-ONLY. Explains the maker-checker model and
// shows the VIEWER's own publish capability (via useCanPublish). Listing every
// publisher member needs a widened metadata query (spec §4 — deferred), so this
// wave shows the model + a deep-link into Twenty Settings → Roles, where the
// PROPEL_MARKETING_PUBLISH flag is actually assigned. ──────────────────────────
const PublishingSection = () => {
  const navigate = useNavigate();
  const { canPublish, loading } = useCanPublish();

  return (
    <Stack gap="lg" maw={640}>
      <SurfaceIntro
        eyebrow="Governance"
        title="Publishing & approvals"
        icon={<IconShield size={20} />}
      />
      <Text size="sm" c="dimmed" style={{ lineHeight: 1.55 }}>
        Marketing runs maker-checker. Agents draft campaigns and submit them for
        approval; publishers review and send. This keeps every outbound message
        accountable without slowing agents down.
      </Text>

      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" wrap="nowrap">
          <Box style={{ minWidth: 0 }}>
            <Text size="sm" fw={600}>
              Your capability
            </Text>
            <Text size="xs" c="dimmed">
              What you can do with a finished campaign right now.
            </Text>
          </Box>
          {loading ? (
            <Loader size="xs" color="red" />
          ) : (
            <Badge
              size="lg"
              variant="light"
              color={canPublish ? 'teal' : 'gray'}
            >
              {canPublish ? 'Can publish & send' : 'Submits for approval'}
            </Badge>
          )}
        </Group>
      </Paper>

      <Alert variant="light" color="gray" icon={<IconShield size={16} />}>
        <Text size="sm">
          Publishers are members holding the{' '}
          <Text span ff="monospace" fz="xs">
            PROPEL_MARKETING_PUBLISH
          </Text>{' '}
          permission, plus workspace admins. That flag is assigned per role in
          Twenty’s role settings.
        </Text>
      </Alert>

      <Group>
        <Button
          variant="default"
          leftSection={<IconExternalLink size={14} />}
          onClick={() => navigate(getSettingsPath(SettingsPath.Roles))}
        >
          Manage in Roles
        </Button>
      </Group>
    </Stack>
  );
};

// ── My preferences — CLIENT-ONLY display prefs (localStorage). Everyone sees
// this. Persists which Templates view/channel to open on; a real per-member prefs
// backend field (signature, notification routing) is a deferred change (§4). ────
const MyPreferencesSection = () => {
  const [view, setView] = useState<TemplatesView>(() => getTemplatesView());
  const [channel, setChannel] = useState<TemplatesChannel>(() =>
    getTemplatesChannel(),
  );

  return (
    <Stack gap="lg" maw={640}>
      <SurfaceIntro
        eyebrow="Just for you"
        title="My preferences"
        icon={<IconUser size={20} />}
      />
      <Text size="sm" c="dimmed" style={{ lineHeight: 1.55 }}>
        These only change how the hub looks for you on this device — nothing is
        sent, nothing is shared.
      </Text>

      <Box>
        <Text size="sm" fw={600}>
          Templates open on
        </Text>
        <Text size="xs" c="dimmed" mb="sm">
          The default layout when you open the Templates tab.
        </Text>
        <SegmentedControl
          value={view}
          onChange={(v) => {
            const next = v as TemplatesView;
            setView(next);
            setTemplatesView(next);
          }}
          data={[
            { label: 'Table', value: 'TABLE' },
            { label: 'Cards', value: 'CARDS' },
            { label: 'Board', value: 'BOARD' },
          ]}
        />
      </Box>

      <Box>
        <Text size="sm" fw={600}>
          Templates channel
        </Text>
        <Text size="xs" c="dimmed" mb="sm">
          Which channel’s templates to show first.
        </Text>
        <SegmentedControl
          value={channel}
          onChange={(v) => {
            const next = v as TemplatesChannel;
            setChannel(next);
            setTemplatesChannel(next);
          }}
          data={[
            { label: 'All', value: 'ALL' },
            { label: 'Email', value: 'EMAIL' },
            { label: 'WhatsApp', value: 'WHATSAPP' },
          ]}
        />
      </Box>

      <Text size="xs" c="dimmed" fs="italic">
        Account preferences — email signature, notification routing — are coming.
        They’ll save to your profile once that lands.
      </Text>
    </Stack>
  );
};

type SettingsSection =
  | 'send-rules'
  | 'merge-tags'
  | 'publishing'
  | 'my-preferences';

export const SettingsTab = ({
  payload,
  isLoading,
  reload,
}: {
  payload: MarketingHubPayload | null;
  isLoading: boolean;
  reload: () => void;
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { role: viewerRole, phase: rolePhase } = useViewerRole();
  const canGovern = isManagerRole(viewerRole);

  // Sections visible to THIS viewer. Governance sections are manager/admin-only;
  // My preferences is for everyone (built last so it's the agent's landing).
  const sections = useMemo<
    { value: SettingsSection; label: string; icon: React.ReactNode }[]
  >(() => {
    const rail: {
      value: SettingsSection;
      label: string;
      icon: React.ReactNode;
    }[] = [];
    if (canGovern) {
      rail.push({
        value: 'send-rules',
        label: 'Send rules',
        icon: <IconMessage size={16} />,
      });
      rail.push({
        value: 'merge-tags',
        label: 'Merge tags',
        icon: <IconTags size={16} />,
      });
      rail.push({
        value: 'publishing',
        label: 'Publishing',
        icon: <IconShield size={16} />,
      });
    }
    rail.push({
      value: 'my-preferences',
      label: 'My preferences',
      icon: <IconUser size={16} />,
    });
    return rail;
  }, [canGovern]);

  const rawSub = searchParams.get('sub');
  const isSection = (v: string | null): v is SettingsSection =>
    v !== null && sections.some((s) => s.value === v);
  // Default to the first visible section (managers → Send rules, agents → prefs).
  const activeSub: SettingsSection = isSection(rawSub)
    ? rawSub
    : (sections[0]?.value ?? 'my-preferences');

  const setSub = (value: string | null) => {
    if (value === null) return;
    const next = new URLSearchParams(searchParams);
    next.set('sub', value);
    setSearchParams(next, { replace: true });
  };

  // While the role probe is in flight the rail composition is unknown — show a
  // neutral spinner rather than flash the agent-only rail then add sections.
  if (rolePhase === 'loading') {
    return (
      <Center mih={320}>
        <Loader color="red" />
      </Center>
    );
  }

  const rules = payload?.sendRules ?? DEFAULT_SEND_RULES;

  return (
    <Box p="md">
      <Tabs
        value={activeSub}
        onChange={setSub}
        orientation="vertical"
        variant="pills"
        color="red"
        keepMounted={false}
      >
        <Tabs.List style={{ minWidth: 190 }} mr="lg">
          {sections.map((s) => (
            <Tabs.Tab key={s.value} value={s.value} leftSection={s.icon}>
              {s.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {canGovern ? (
          <>
            <Tabs.Panel value="send-rules">
              {activeSub === 'send-rules' ? (
                isLoading && payload === null ? (
                  <Center mih={240}>
                    <Loader color="red" />
                  </Center>
                ) : (
                  // key forces a fresh form when the hub reloads with new rules
                  <SendRulesSection
                    key={rules.id ?? 'default'}
                    rules={rules}
                    reload={reload}
                  />
                )
              ) : null}
            </Tabs.Panel>
            <Tabs.Panel value="merge-tags">
              {activeSub === 'merge-tags' ? (
                <Box maw={720}>
                  <SurfaceIntro
                    eyebrow="The rulebook"
                    title="Merge tags & snippets"
                    icon={<IconTags size={20} />}
                  />
                  <MergeTagsView payload={payload ?? {}} reload={reload} />
                </Box>
              ) : null}
            </Tabs.Panel>
            <Tabs.Panel value="publishing">
              {activeSub === 'publishing' ? <PublishingSection /> : null}
            </Tabs.Panel>
          </>
        ) : null}

        <Tabs.Panel value="my-preferences">
          {activeSub === 'my-preferences' ? <MyPreferencesSection /> : null}
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
};
