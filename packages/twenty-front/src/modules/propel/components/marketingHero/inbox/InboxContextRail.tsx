import { useCallback, useEffect, useState } from 'react';
import {
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  Timeline,
} from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import {
  IconArrowRight,
  IconBolt,
  IconBuildingSkyscraper,
  IconCheck,
  IconHistory,
  IconMail,
  IconPhone,
  IconPlus,
  IconSparkles,
  IconUser,
  IconUserPlus,
} from 'twenty-ui/display';
import {
  type InboxAgentOption,
  type InboxChannel,
  type InboxAiInsightsPayload,
  type InboxThreadPayload,
  type InboxThreadRow,
  type InboxTriageClass,
  type InboxViewerRole,
} from '@/propel/types/inbox';
import {
  assignLead,
  createLeadOpportunity,
  fetchInboxAi,
  fetchLeadEvents,
  listInboxAgents,
  sendFollowUpPing,
} from '@/propel/lib/inboxApi';
import { effectiveTriage } from '@/propel/lib/inboxTriage';
import {
  type LeadEventRow,
  leadEventDescriptor,
  leadEventDetail,
  relativeTimeLabel,
} from '@/propel/lib/leadEvents';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  channelLabel,
  humanizeEnum,
} from '@/propel/components/marketingHero/inbox/InboxBits';
import { ClassifyCard } from '@/propel/components/marketingHero/inbox/ClassifyCard';

// ── Lead Engine S1 — triage primitives ──────────────────────────────────────
// The right-rail triage surface: class badge, SLA heat, owner/suggested agent, and
// the gated quick actions (Assign / Create opportunity / Follow-up ping). Founder
// placement: the RIGHT SIDEBAR, not inline above the messages. The component never
// mutates — each action calls a gated /lead/* route that enforces policy + logs the
// leadEvent. Ported from the app-sandbox marketing-cloud-inbox.tsx into Mantine.

const TRIAGE_CLASS_META: Record<
  InboxTriageClass,
  { label: string; color: string }
> = {
  OPPORTUNITY: { label: 'opportunity', color: 'red' },
  LEAD: { label: 'lead', color: 'yellow' },
  BROWSER: { label: 'browser', color: 'gray' },
  SPAM: { label: 'spam', color: 'gray' },
  UNKNOWN: { label: 'unclassified', color: 'gray' },
};

// SLA heat: an age label that warms past ~8 min and reddens on a hard breach.
// ageMs/slaBreached are pre-derived server-side — the client only colors them.
const slaAgeLabel = (ageMs: number | null): string => {
  if (ageMs == null) return '';
  const m = Math.floor(ageMs / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

// "Create opportunity in lane" taxonomy — keys match the /lead/create-opportunity
// route's LANE map.
const OPP_LANES: { key: string; label: string }[] = [
  { key: 'secondary', label: 'Secondary' },
  { key: 'sell', label: 'Sell' },
  { key: 'offplan', label: 'Off-plan' },
  { key: 'institutional', label: 'Institutional' },
  { key: 'rcbi', label: 'RCBI' },
];

// The triage card: class · SLA · owner · suggested agent. Read-only summary of the
// enriched queue row — the confirm actions live in the action panel below it.
const TriageRailCard = ({ row }: { row: InboxThreadRow }) => {
  // Effective class folds in the fork-side FB/IG derivation when the server left a
  // social row UNKNOWN; `derived` + `derivedReason` let the card show the heuristic
  // why-string when the server carried none.
  const eff = effectiveTriage(row);
  const meta = TRIAGE_CLASS_META[eff.triageClass] ?? TRIAGE_CLASS_META.UNKNOWN;
  const owned = Boolean(row.assignedAgentId);
  const ageLabel = slaAgeLabel(row.ageMs);
  // Prefer a server-provided reason; fall back to the derived FB/IG why-string.
  const reasonText = row.triageReason || eff.derivedReason;
  return (
    <Box
      p="md"
      style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
    >
      <Box
        style={{
          border: '1px solid var(--mantine-color-red-light)',
          borderRadius: 12,
          background:
            'linear-gradient(180deg, var(--mantine-color-red-light), transparent 70%)',
          padding: '12px 13px',
        }}
      >
        <Group gap={7} mb="sm" wrap="nowrap">
          <IconSparkles size={14} color="var(--mantine-color-red-6)" />
          <Text size="sm" fw={700}>
            Triage
          </Text>
          {row.slaBreached ? (
            <Badge size="xs" color="red" variant="filled" ml="auto">
              SLA breach
            </Badge>
          ) : ageLabel ? (
            <Text
              size="xs"
              fw={700}
              ml="auto"
              c={
                row.ageMs != null && row.ageMs > 8 * 60_000
                  ? 'yellow.7'
                  : 'dimmed'
              }
            >
              {ageLabel}
            </Text>
          ) : null}
        </Group>
        <Group gap={8} mb={7}>
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Class
          </Text>
          <Badge size="sm" variant="light" color={meta.color}>
            {meta.label}
          </Badge>
        </Group>
        {reasonText ? (
          <Text
            size="xs"
            c="dimmed"
            style={{
              background: 'var(--mantine-color-default-hover)',
              borderRadius: 8,
              padding: '7px 9px',
              margin: '7px 0',
            }}
          >
            {reasonText}
          </Text>
        ) : null}
        {row.leadSource ? (
          <Group gap={8} mb={5}>
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Source
            </Text>
            <Text size="xs">{humanizeEnum(row.leadSource)}</Text>
          </Group>
        ) : null}
        <Group gap={8}>
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Owner
          </Text>
          <Text size="xs" c={owned ? undefined : 'dimmed'}>
            {owned ? row.assignedAgentName || 'Assigned' : 'Unassigned'}
          </Text>
        </Group>
        {!owned && row.suggestedAgentName ? (
          <Text size="xs" c="dimmed" mt={9} lh={1.45}>
            <Text span fw={700} c="var(--mantine-color-text)">
              Suggested:
            </Text>{' '}
            {row.suggestedAgentName}
            {row.suggestedReason ? ` — ${row.suggestedReason}` : ''}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
};

// The gated quick actions. Manager/Admin see Assign + Create-opportunity (the pool
// triage); anyone who can reply sees Follow-up ping. Panels expand inline. Each
// action calls a /lead/* route; on success we toast + call onActed (list refresh).
type ActionPanel = 'assign' | 'opp' | null;

const TriageActions = ({
  thread,
  row,
  viewerRole,
  onActed,
}: {
  thread: InboxThreadPayload;
  row: InboxThreadRow | null;
  viewerRole: InboxViewerRole;
  onActed: () => void;
}) => {
  const notify = usePropelToast();
  const [panel, setPanel] = useState<ActionPanel>(null);
  const [agents, setAgents] = useState<InboxAgentOption[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinging, setPinging] = useState(false);

  const isManager = viewerRole === 'MANAGER' || viewerRole === 'ADMIN';
  const personId = thread.personId;

  const ensureAgents = useCallback(() => {
    if (agentsLoaded) return;
    setAgentsLoaded(true);
    void listInboxAgents().then(setAgents);
  }, [agentsLoaded]);

  const openPanel = (p: Exclude<ActionPanel, null>) => {
    setPanel((cur) => (cur === p ? null : p));
    ensureAgents();
  };

  const doAssign = async (agentId: string) => {
    if (!personId || busy) return;
    setBusy(true);
    const res = await assignLead({
      personId,
      agentWorkspaceMemberId: agentId,
    });
    setBusy(false);
    if (res?.ok) {
      const who = agents.find((a) => a.id === agentId)?.name ?? 'the agent';
      notify(
        `Assigned to ${who}. SLA clock + first-response task started.`,
        'success',
      );
      setPanel(null);
      onActed();
    } else {
      notify(
        res?.operatorAction ||
          res?.error ||
          'Couldn’t assign — you may not have permission.',
        'error',
      );
    }
  };

  const doCreateOpp = async (lane: string) => {
    if (!personId || busy) return;
    setBusy(true);
    const res = await createLeadOpportunity({
      lane,
      contactId: personId,
      name: thread.contactName || thread.title || 'New opportunity',
    });
    setBusy(false);
    if (res?.ok) {
      notify(
        `Opportunity created in ${lane}. The lead is now in the pipeline.`,
        'success',
      );
      setPanel(null);
      onActed();
    } else {
      notify(
        res?.operatorAction || res?.error || 'Couldn’t create the opportunity.',
        'error',
      );
    }
  };

  const doPing = async () => {
    if (pinging || !thread.canReply) return;
    setPinging(true);
    const res = await sendFollowUpPing(thread.id, thread.channel);
    setPinging(false);
    if (res?.ok) {
      notify('Follow-up sent.', 'success');
      onActed();
    } else {
      notify(
        res?.operatorAction || res?.error || 'Couldn’t send the follow-up.',
        'error',
      );
    }
  };

  // No matched contact → assign/create-opp can't key off a Person. Show a hint, not
  // dead buttons. (Follow-up ping still needs canReply, handled below.)
  if (!personId && !thread.canReply) {
    return (
      <Box
        p="md"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Text size="xs" c="dimmed">
          Attach this thread to a contact to assign it or create an opportunity.
        </Text>
      </Box>
    );
  }

  return (
    <Box
      p="md"
      style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
    >
      <Stack gap={8}>
        {isManager && personId ? (
          <>
            <Button
              size="xs"
              variant={panel === 'assign' ? 'filled' : 'light'}
              color="red"
              fullWidth
              leftSection={<IconUserPlus size={14} />}
              onClick={() => openPanel('assign')}
            >
              {row?.assignedAgentId ? 'Reassign agent' : 'Assign agent'}
            </Button>
            {panel === 'assign' ? (
              <Box
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 8,
                  padding: 6,
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                {!agentsLoaded ? (
                  <Group gap={6} p={6}>
                    <Loader size="xs" color="red" />
                    <Text size="xs" c="dimmed">
                      Loading agents…
                    </Text>
                  </Group>
                ) : agents.length === 0 ? (
                  <Text size="xs" c="dimmed" p={6}>
                    No agents found.
                  </Text>
                ) : (
                  <Stack gap={2}>
                    {agents.map((a) => {
                      const isSuggested = a.id === row?.suggestedAgentId;
                      const isCurrent = a.id === row?.assignedAgentId;
                      return (
                        <Button
                          key={a.id}
                          size="compact-xs"
                          variant="subtle"
                          color="gray"
                          justify="flex-start"
                          fullWidth
                          disabled={busy || isCurrent}
                          onClick={() => void doAssign(a.id)}
                          styles={{ label: { width: '100%' } }}
                        >
                          <Group
                            gap={6}
                            wrap="nowrap"
                            style={{ width: '100%' }}
                          >
                            <Text
                              size="xs"
                              style={{ flex: 1, textAlign: 'left' }}
                              truncate
                            >
                              {a.name}
                            </Text>
                            {isCurrent ? (
                              <Badge size="xs" variant="light" color="gray">
                                current
                              </Badge>
                            ) : isSuggested ? (
                              <Badge size="xs" variant="light" color="red">
                                suggested
                              </Badge>
                            ) : null}
                            {!a.available ? (
                              <Badge size="xs" variant="default" color="gray">
                                away
                              </Badge>
                            ) : null}
                          </Group>
                        </Button>
                      );
                    })}
                  </Stack>
                )}
              </Box>
            ) : null}

            <Button
              size="xs"
              variant={panel === 'opp' ? 'filled' : 'light'}
              color="red"
              fullWidth
              leftSection={<IconPlus size={14} />}
              onClick={() => openPanel('opp')}
            >
              Create opportunity
            </Button>
            {panel === 'opp' ? (
              <Group gap={6} style={{ flexWrap: 'wrap' }}>
                {OPP_LANES.map((l) => (
                  <Button
                    key={l.key}
                    size="compact-xs"
                    variant="default"
                    disabled={busy}
                    onClick={() => void doCreateOpp(l.key)}
                  >
                    {l.label}
                  </Button>
                ))}
              </Group>
            ) : null}
          </>
        ) : null}

        {thread.canReply ? (
          <Button
            size="xs"
            variant="default"
            fullWidth
            leftSection={<IconBolt size={14} />}
            loading={pinging}
            onClick={() => void doPing()}
          >
            Follow-up ping
          </Button>
        ) : null}

        {!isManager && personId ? (
          <Text size="xs" c="dimmed">
            <IconCheck size={11} style={{ verticalAlign: -1 }} /> This thread is
            yours — managers handle pool assignment.
          </Text>
        ) : null}
      </Stack>
    </Box>
  );
};

// ── Lead-events timeline (Lead Engine #62, surface 1) ────────────────────────
// The selected lead's leadEvent history (assigned, first-response, SLA-breach,
// opportunity-created, stage-changed, won/lost …) as a compact timeline. Reads the
// MANAGER/ADMIN-gated /lead/events route keyed on the matched Person — so it's shown
// ONLY to MANAGER/ADMIN (an AGENT gets NOT_FOUND; gating client-side avoids a
// guaranteed-empty round-trip). Keyed on personId so switching threads refetches.
const LeadEventsTimeline = ({ personId }: { personId: string }) => {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'empty'>('loading');
  const [events, setEvents] = useState<LeadEventRow[]>([]);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let live = true;
    setPhase('loading');
    setEvents([]);
    setReason('');
    fetchLeadEvents({ subjectObjectType: 'PERSON', subjectRecordId: personId, limit: 30 })
      .then((res) => {
        if (!live) return;
        const list = Array.isArray(res?.events) ? res!.events! : [];
        if (res?.ok && list.length > 0) {
          setEvents(list);
          setPhase('ready');
        } else {
          setReason(
            res?.operatorAction ||
              res?.error ||
              'No lead activity recorded yet.',
          );
          setPhase('empty');
        }
      })
      .catch(() => {
        if (!live) return;
        setReason('Couldn’t load the lead activity.');
        setPhase('empty');
      });
    return () => {
      live = false;
    };
  }, [personId]);

  return (
    <Box
      p="md"
      style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
    >
      <Group gap={6} mb="sm">
        <IconHistory size={13} color="var(--mantine-color-red-6)" />
        <Text size="xs" tt="uppercase" fw={700} c="dimmed">
          Lead activity
        </Text>
      </Group>
      {phase === 'loading' ? (
        <Group gap={7}>
          <Loader size="xs" color="red" />
          <Text size="xs" c="dimmed">
            Loading activity…
          </Text>
        </Group>
      ) : phase === 'ready' ? (
        <Timeline
          active={-1}
          bulletSize={20}
          lineWidth={2}
          color="red"
          styles={{ itemBody: { paddingBottom: 4 } }}
        >
          {events.map((ev) => {
            const d = leadEventDescriptor(ev.eventType);
            const when = relativeTimeLabel(ev.occurredAt);
            const detail = leadEventDetail(ev.payload);
            const Icon = d.Icon;
            return (
              <Timeline.Item
                key={ev.id}
                bullet={<Icon size={11} />}
                color={d.color}
                title={
                  <Group gap={6} wrap="nowrap" justify="space-between">
                    <Text size="xs" fw={600}>
                      {d.label}
                    </Text>
                    {when ? (
                      <Text size="xs" c="dimmed" style={{ flex: 'none' }}>
                        {when}
                      </Text>
                    ) : null}
                  </Group>
                }
              >
                {detail ? (
                  <Text size="xs" c="dimmed" mt={1}>
                    {detail}
                  </Text>
                ) : null}
              </Timeline.Item>
            );
          })}
        </Timeline>
      ) : (
        <Text size="xs" c="dimmed">
          {reason || 'No lead activity recorded yet.'}
        </Text>
      )}
    </Box>
  );
};

const RailLine = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
    <Box style={{ flex: 'none', color: 'var(--mantine-color-dimmed)' }}>
      {icon}
    </Box>
    <Text
      size="sm"
      c="dimmed"
      title={text}
      style={{
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {text}
    </Text>
  </Group>
);

const SENTIMENT_COLOR: Record<string, string> = {
  POSITIVE: 'green',
  NEGATIVE: 'red',
  NEUTRAL: 'gray',
};

// AI insights card — one read of /marketing/inbox-ai (insights mode) per open
// thread. Keyed on thread id + channel so switching threads refetches. Strictly
// honest: a missing LLM key or a parse failure shows a one-line reason, never a
// fabricated summary.
const InboxAiInsightsCard = ({
  threadId,
  channel,
  hasMessages,
}: {
  threadId: string;
  channel: InboxChannel;
  hasMessages: boolean;
}) => {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'empty'>('loading');
  const [insights, setInsights] = useState<InboxAiInsightsPayload | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let live = true;
    if (!hasMessages) {
      setPhase('empty');
      setInsights(null);
      setReason('Insights appear once the thread has messages.');
      return;
    }
    setPhase('loading');
    setInsights(null);
    setReason('');
    fetchInboxAi({ mode: 'insights', conversationId: threadId, channel })
      .then((res) => {
        if (!live) return;
        if (res && res.ok && res.insights) {
          setInsights(res.insights);
          setPhase('ready');
        } else {
          setReason(
            res?.operatorAction ||
              res?.error ||
              'Insights aren’t available for this thread.',
          );
          setPhase('empty');
        }
      })
      .catch(() => {
        if (!live) return;
        setReason('Insights aren’t available right now.');
        setPhase('empty');
      });
    return () => {
      live = false;
    };
  }, [threadId, channel, hasMessages]);

  const sentimentColor = insights
    ? (SENTIMENT_COLOR[insights.sentiment] ?? 'gray')
    : 'gray';

  return (
    <Box
      p="md"
      style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
    >
      <Group gap={6} mb="sm">
        <IconSparkles size={13} color="var(--mantine-color-red-6)" />
        <Text size="xs" tt="uppercase" fw={700} c="dimmed">
          AI insights
        </Text>
      </Group>
      <Box
        style={{
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 12,
          padding: '12px 13px',
        }}
      >
        {phase === 'loading' ? (
          <Group gap={7}>
            <IconSparkles size={14} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed">
              Reading the thread…
            </Text>
          </Group>
        ) : phase === 'ready' && insights ? (
          <Stack gap={11}>
            <div>
              <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb={4}>
                Summary
              </Text>
              <Text size="sm">{insights.summary}</Text>
            </div>
            <Group gap={8}>
              <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                Sentiment
              </Text>
              <Badge size="sm" variant="light" color={sentimentColor}>
                {humanizeEnum(insights.sentiment)}
              </Badge>
            </Group>
            <div>
              <Group gap={5} mb={4}>
                <IconArrowRight size={12} color="var(--mantine-color-red-6)" />
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                  Next step
                </Text>
              </Group>
              <Text size="sm">{insights.nextStep}</Text>
            </div>
          </Stack>
        ) : (
          <Text size="xs" c="dimmed">
            {reason || 'No insights available.'}
          </Text>
        )}
      </Box>
    </Box>
  );
};

// Context rail — the conversation's triage card + quick actions, contact + linked
// deal at a glance, and AI insights. The triage card + actions read the enriched
// queue `row` (the thread payload carries no triage fields). Strictly presence-
// aware: a card renders only when its data is real. `viewerRole` gates the pool
// actions; `onActed` refreshes the list after an assign/create-opp/ping.
export const InboxContextRail = ({
  thread,
  row,
  viewerRole,
  onActed,
}: {
  thread: InboxThreadPayload;
  row: InboxThreadRow | null;
  viewerRole: InboxViewerRole;
  onActed: () => void;
}) => {
  const navigate = useNavigate();
  const c = thread.contact;
  const d = thread.deal;
  const initial =
    (thread.contactName || thread.title || '?')
      .trim()
      .charAt(0)
      .toUpperCase() || '?';
  const hasMethod = Boolean(c?.phone || c?.email);

  return (
    <Box
      w={288}
      style={{
        flex: 'none',
        borderLeft: '1px solid var(--mantine-color-default-border)',
        overflowY: 'auto',
        minHeight: 0,
      }}
    >
      {/* Lead-engine triage card + quick actions — TOP of the rail (right sidebar,
          per founder placement). The card omits when there's no enriched row. */}
      {row ? <TriageRailCard row={row} /> : null}
      <TriageActions
        thread={thread}
        row={row}
        viewerRole={viewerRole}
        onActed={onActed}
      />

      {/* Contact-tagging (Phase B) — the "Classify" card, directly under triage. Sets
          the durable who-is-this tag / note / team-member link via the gated
          /contact/classify route; a non-prospect tag filters the contact out of the
          lead pipeline (the card shows that consequence). onActed refreshes the list
          so a regrouped thread moves to "Known / internal". */}
      <ClassifyCard
        personId={thread.personId}
        contact={thread.contact}
        onActed={onActed}
      />

      {/* contact card */}
      <Box
        p="md"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Group
          gap={11}
          wrap="nowrap"
          mb={hasMethod ? 'sm' : 'md'}
          align="center"
        >
          <Box
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              flex: 'none',
              display: 'grid',
              placeItems: 'center',
              background: 'var(--mantine-color-red-light)',
              color: 'var(--mantine-color-red-7)',
              fontWeight: 700,
              fontSize: 17,
              lineHeight: 1,
            }}
          >
            {initial}
          </Box>
          <Box style={{ minWidth: 0 }}>
            <Text
              fw={700}
              size="sm"
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {thread.contactName || thread.title}
            </Text>
            <Group gap={5} mt={5} style={{ flexWrap: 'wrap' }}>
              {c?.contactType ? (
                <Badge size="xs" variant="default" color="gray">
                  {humanizeEnum(c.contactType)}
                </Badge>
              ) : null}
              {c?.leadSource ? (
                <Badge size="xs" variant="default" color="gray">
                  {humanizeEnum(c.leadSource)}
                </Badge>
              ) : null}
            </Group>
          </Box>
        </Group>
        {hasMethod ? (
          <Stack gap={7} mb="sm">
            {c?.phone ? (
              <RailLine icon={<IconPhone size={14} />} text={c.phone} />
            ) : null}
            {c?.email ? (
              <RailLine icon={<IconMail size={14} />} text={c.email} />
            ) : null}
          </Stack>
        ) : null}
        {thread.personId ? (
          <Anchor
            component="button"
            type="button"
            onClick={() => navigate(`/object/person/${thread.personId}`)}
            style={{
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            <IconUser size={14} /> Open contact
          </Anchor>
        ) : null}
      </Box>

      {/* linked deal card — only when a deal exists */}
      {d ? (
        <Box p="md">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb="sm">
            Linked deal
          </Text>
          <Box
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 12,
              padding: '12px 13px',
            }}
          >
            <Group gap={9} wrap="nowrap" align="flex-start" mb="sm">
              <Box
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  flex: 'none',
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--mantine-color-red-light)',
                  color: 'var(--mantine-color-red-7)',
                }}
              >
                <IconBuildingSkyscraper size={15} />
              </Box>
              <Box style={{ minWidth: 0 }}>
                <Text size="sm" fw={700} lh={1.35}>
                  {d.name}
                </Text>
                <Text size="xs" c="dimmed" mt={3}>
                  {[humanizeEnum(d.stage), d.side ? humanizeEnum(d.side) : '']
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Box>
            </Group>
            <Anchor
              component="button"
              type="button"
              onClick={() => navigate(`/object/secondaryOpportunity/${d.id}`)}
              style={{
                width: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              <IconArrowRight size={14} /> Open deal
            </Anchor>
          </Box>
        </Box>
      ) : null}

      <InboxAiInsightsCard
        threadId={thread.id}
        channel={thread.channel}
        hasMessages={thread.messages.length > 0}
      />

      {/* Lead-events timeline — the matched lead's lifecycle history. Manager/Admin
          only (the /lead/events route is role-gated; an agent would get NOT_FOUND).
          Needs a matched Person to key on. */}
      {thread.personId &&
      (viewerRole === 'MANAGER' || viewerRole === 'ADMIN') ? (
        <LeadEventsTimeline personId={thread.personId} />
      ) : null}

      {/* a footnote so the channel context is always visible at the rail bottom */}
      <Box px="md" pb="md">
        <Text size="xs" c="dimmed">
          {channelLabel(thread.channel)} · {humanizeEnum(thread.status)}
        </Text>
      </Box>
    </Box>
  );
};
