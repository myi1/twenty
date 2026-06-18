import { Anchor, Box, Card, Divider, Group, Stack, Text } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCalendarX,
  IconClock,
  IconShield,
} from 'twenty-ui/display';
import { type SendRulesPayload } from '@/propel/types/campaignBuilder';

// S3 — the Review send-rules guardrail summary (design critique (h),
// founder-locked). Caps / quiet-hours / Friday-pause silently gate EVERY send,
// but the user only ever met them as a top-bar icon — never AT send time. This
// surfaces them, read-only, inline in Review with an "Edit rules" link, plus a
// live send-window check so the user understands BEFORE they launch why a blast
// might be throttled.
//
// Honesty rule: the per-contact weekly cap is enforced per recipient by the
// drain; the builder does NOT know how many of THIS audience already hit their
// cap this week (that needs a per-recipient resolve the materializer does at
// send time). So we never fabricate "12 of 340 capped" — we state the cap and
// say plainly that already-capped contacts are skipped. The one thing we CAN
// check deterministically is the send WINDOW: a scheduled time inside quiet
// hours (or on a paused Friday) gets a concrete "begins at HH:MM" note.
export const GuardrailsCard = ({
  rules,
  channel,
  estimate,
  scheduledLocal,
  onEditRules,
}: {
  rules: SendRulesPayload | undefined;
  channel: 'EMAIL' | 'WHATSAPP';
  estimate: number;
  // The Review "Schedule" datetime-local value ("YYYY-MM-DDTHH:mm"), or '' when
  // sending now. Only used for the send-window check.
  scheduledLocal: string;
  // Optional — when absent the "Edit rules" affordance is hidden (the card is
  // still a read-only summary).
  onEditRules?: () => void;
}) => {
  if (!rules) {
    return (
      <Card
        withBorder
        radius="md"
        padding="md"
        style={{ background: 'var(--mantine-color-body)' }}
      >
        <Group gap="xs" wrap="nowrap">
          <IconAlertTriangle size={16} color="var(--mantine-color-yellow-6)" />
          <Text size="sm" c="dimmed">
            Couldn&rsquo;t load your send rules — your caps and quiet hours still
            apply at send time.
          </Text>
        </Group>
      </Card>
    );
  }

  const cap = channel === 'WHATSAPP' ? rules.capPerWeekWhatsapp : rules.capPerWeek;
  const sendWindow = computeSendWindow(rules, channel, scheduledLocal);

  return (
    <Card
      withBorder
      radius="md"
      padding="md"
      style={{ background: 'var(--mantine-color-body)' }}
    >
      <Group justify="space-between" align="center" mb="sm" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <IconShield size={16} color="var(--mantine-color-red-6)" />
          <Text size="sm" fw={700} c="var(--mantine-color-text)">
            Send guardrails
          </Text>
        </Group>
        {onEditRules && (
          <Anchor
            component="button"
            type="button"
            size="xs"
            c="red"
            onClick={onEditRules}
          >
            Edit rules
          </Anchor>
        )}
      </Group>

      <Stack gap="xs">
        <GuardLine
          icon={<IconShield size={15} />}
          label="Weekly cap"
          value={
            channel === 'WHATSAPP'
              ? `${cap} WhatsApp message${cap === 1 ? '' : 's'} / contact / week`
              : `${cap} message${cap === 1 ? '' : 's'} / contact / week`
          }
        />
        <GuardLine
          icon={<IconClock size={15} />}
          label="Quiet hours"
          value={
            rules.quietEnabled
              ? `Paused ${rules.quietStart}–${rules.quietEnd} (Dubai)`
              : 'Off — sends any hour'
          }
          muted={!rules.quietEnabled}
        />
        <GuardLine
          icon={<IconCalendarX size={15} />}
          label="Friday pause"
          value={
            rules.fridayPauseEnabled
              ? `Held until ${rules.fridayPauseUntil} on Fridays`
              : 'Off'
          }
          muted={!rules.fridayPauseEnabled}
        />
      </Stack>

      <Divider my="sm" />

      {/* Live cap-preview — honest: we know the audience size and the cap, but
          NOT how many already hit it (that's a send-time per-recipient resolve),
          so we state the rule rather than fabricate a skipped count. */}
      <Stack gap={4}>
        <Text size="xs" c="dimmed">
          Of your{' '}
          <Text component="span" fw={700} c="var(--mantine-color-text)">
            {estimate.toLocaleString('en-US')}
          </Text>{' '}
          contacts, anyone who already got{' '}
          {cap} {channel === 'WHATSAPP' ? 'WhatsApp message' : 'message'}
          {cap === 1 ? '' : 's'} this week is skipped automatically — the exact
          count is resolved at send time.
        </Text>

        {/* Send-window check (deterministic from the schedule + rules). */}
        <Group gap={6} wrap="nowrap" align="flex-start" mt={4}>
          {sendWindow.throttled ? (
            <IconClock size={14} color="var(--mantine-color-yellow-7)" />
          ) : (
            <IconShield size={14} color="var(--mantine-color-green-6)" />
          )}
          <Text
            size="xs"
            c={sendWindow.throttled ? 'var(--mantine-color-yellow-7)' : 'dimmed'}
          >
            {sendWindow.message}
          </Text>
        </Group>
      </Stack>
    </Card>
  );
};

const GuardLine = ({
  icon,
  label,
  value,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) => (
  <Group justify="space-between" gap="md" wrap="nowrap">
    <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
      <Box c={muted ? 'dimmed' : 'var(--mantine-color-text)'} style={{ flex: 'none', display: 'flex' }}>
        {icon}
      </Box>
      <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ flex: 'none' }}>
        {label}
      </Text>
    </Group>
    <Text
      size="sm"
      c={muted ? 'dimmed' : 'var(--mantine-color-text)'}
      ta="right"
      style={{ wordBreak: 'break-word' }}
    >
      {value}
    </Text>
  </Group>
);

// ── send-window check ────────────────────────────────────────────────────────
// All times are Asia/Dubai (+04:00, no DST — same anchor the scheduler uses).
// "HH:MM" → minutes-since-midnight. A scheduled time inside an enabled quiet
// window (handles the wrap-around case, e.g. 21:00–09:00) is throttled: the
// drain will hold it until quiet ends. Friday-pause is reported when the
// scheduled day is a Friday and the pause is on. "Send now" (no schedule) is
// reported neutrally — the drain applies the same rules at the moment it runs.
const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
};

const computeSendWindow = (
  rules: SendRulesPayload,
  channel: 'EMAIL' | 'WHATSAPP',
  scheduledLocal: string,
): { throttled: boolean; message: string } => {
  if (!scheduledLocal) {
    const guards: string[] = [];
    if (rules.quietEnabled)
      guards.push(`outside ${rules.quietStart}–${rules.quietEnd}`);
    if (rules.fridayPauseEnabled) guards.push('not during the Friday pause');
    return {
      throttled: false,
      message:
        guards.length > 0
          ? `Sending now — the drain releases messages ${guards.join(' and ')}.`
          : 'Sending now — no quiet-hours or Friday restrictions are active.',
    };
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(scheduledLocal);
  if (!m) {
    return { throttled: false, message: 'Pick a valid date & time to preview the send window.' };
  }
  const [, yy, mm, dd, hh, mi] = m;
  const minute = Number(hh) * 60 + Number(mi);
  // getUTCDay on the Dubai-anchored instant gives the Dubai weekday (the offset
  // is fixed, so the calendar day matches local). 5 = Friday.
  const dubaiDate = new Date(`${yy}-${mm}-${dd}T${hh}:${mi}:00+04:00`);
  const isFriday = dubaiDate.getUTCDay() === 5;

  if (rules.fridayPauseEnabled && isFriday) {
    const until = toMinutes(rules.fridayPauseUntil);
    if (until !== null && minute < until) {
      return {
        throttled: true,
        message: `That time is during the Friday pause — it begins at ${rules.fridayPauseUntil}.`,
      };
    }
  }

  if (rules.quietEnabled) {
    const start = toMinutes(rules.quietStart);
    const end = toMinutes(rules.quietEnd);
    if (start !== null && end !== null) {
      // Wrap-around window (start > end, e.g. 21:00–09:00) spans midnight.
      const inQuiet =
        start <= end
          ? minute >= start && minute < end
          : minute >= start || minute < end;
      if (inQuiet) {
        return {
          throttled: true,
          message: `That time is inside quiet hours — it begins at ${rules.quietEnd}.`,
        };
      }
    }
  }

  return {
    throttled: false,
    message: `Sends at the scheduled time — clear of quiet hours${
      rules.fridayPauseEnabled ? ' and the Friday pause' : ''
    } (${channel === 'WHATSAPP' ? 'WhatsApp' : 'email'}).`,
  };
};
