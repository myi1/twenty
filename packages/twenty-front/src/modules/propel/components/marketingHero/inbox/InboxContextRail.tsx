import { useEffect, useState } from 'react';
import { Anchor, Badge, Box, Group, Stack, Text } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import {
  IconArrowRight,
  IconBuildingSkyscraper,
  IconMail,
  IconPhone,
  IconSparkles,
  IconUser,
} from 'twenty-ui/display';
import {
  type InboxChannel,
  type InboxAiInsightsPayload,
  type InboxThreadPayload,
} from '@/propel/types/inbox';
import { fetchInboxAi } from '@/propel/lib/inboxApi';
import { channelLabel, humanizeEnum } from '@/propel/components/marketingHero/inbox/InboxBits';

const RailLine = ({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) => (
  <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
    <Box style={{ flex: 'none', color: 'var(--mantine-color-dimmed)' }}>{icon}</Box>
    <Text
      size="sm"
      c="dimmed"
      title={text}
      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
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
    <Box p="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
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

// Context rail — the conversation's contact + linked deal at a glance, read from
// the SAME thread payload (no extra fetch). Strictly presence-aware: a row/card
// renders only when its data is real, and the deal card is omitted entirely when
// there's no deal — never an empty "Phone: —" row or a placeholder deal.
export const InboxContextRail = ({
  thread,
}: {
  thread: InboxThreadPayload;
}) => {
  const navigate = useNavigate();
  const c = thread.contact;
  const d = thread.deal;
  const initial =
    (thread.contactName || thread.title || '?').trim().charAt(0).toUpperCase() ||
    '?';
  const hasMethod = Boolean(c?.phone || c?.email);

  return (
    <Box
      w={272}
      style={{
        flex: 'none',
        borderLeft: '1px solid var(--mantine-color-default-border)',
        overflowY: 'auto',
        minHeight: 0,
      }}
    >
      {/* contact card */}
      <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group gap={11} wrap="nowrap" mb={hasMethod ? 'sm' : 'md'} align="center">
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
            {c?.phone ? <RailLine icon={<IconPhone size={14} />} text={c.phone} /> : null}
            {c?.email ? <RailLine icon={<IconMail size={14} />} text={c.email} /> : null}
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

      {/* a footnote so the channel context is always visible at the rail bottom */}
      <Box px="md" pb="md">
        <Text size="xs" c="dimmed">
          {channelLabel(thread.channel)} · {humanizeEnum(thread.status)}
        </Text>
      </Box>
    </Box>
  );
};
