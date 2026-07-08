import { Anchor, Box, Card, Divider, Group, Loader, Stack, Text } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCalendarX,
  IconClock,
  IconShield,
} from 'twenty-ui-deprecated/display';
import {
  type CapPreview,
  type SendRulesPayload,
} from '@/propel/types/campaignBuilder';

// S3 — the Review send-rules guardrail summary (design critique (h),
// founder-locked). Caps / quiet-hours / Friday-pause silently gate EVERY send,
// but the user only ever met them as a top-bar icon — never AT send time. This
// surfaces them, read-only, inline in Review with an "Edit rules" link, plus a
// live send-window check so the user understands BEFORE they launch why a blast
// might be throttled.
//
// Honesty rule: the per-contact weekly cap is enforced per recipient by the
// drain. The REAL skip count IS knowable — /marketing/segment-preview with
// rulesPreview:true runs the exact cap-exclusion pass the materializer applies
// at fire time over the resolved recipients and returns capReached. The wizard
// resolves it (keyed to the scheduled day) and hands it down as `capPreview`, so
// we show "{capReached} of {estimate} would be skipped" rather than fabricating a
// number — and stay honest when it's 0 ("none currently capped") or when the
// preview couldn't load ("couldn't check"). The other thing we check
// deterministically is the send WINDOW: a scheduled time inside quiet hours (or
// on a paused Friday) gets a concrete "begins at HH:MM" note.
export const GuardrailsCard = ({
  rules,
  channel,
  estimate,
  scheduledLocal,
  capPreview,
  onEditRules,
}: {
  rules: SendRulesPayload | undefined;
  channel: 'EMAIL' | 'WHATSAPP';
  estimate: number;
  // The Review "Schedule" datetime-local value ("YYYY-MM-DDTHH:mm"), or '' when
  // sending now. Only used for the send-window check.
  scheduledLocal: string;
  // The resolved cap-skip preview (idle/loading/loaded/error). Defaults to idle
  // so existing callers (and tests) that don't pass it still render the card.
  capPreview?: CapPreview;
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
  const preview = capPreview ?? { state: 'idle' };
  const msgWord = channel === 'WHATSAPP' ? 'WhatsApp message' : 'message';

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

      {/* Live cap-preview — the REAL skip count, resolved by the same pass the
          materializer runs at fire time. Honest across every state: a concrete
          number when loaded, "none currently capped" at 0, and "couldn't check"
          (never a fake 0) when the preview can't load. */}
      <Stack gap={4}>
        <CapPreviewLine
          preview={preview}
          estimate={estimate}
          cap={cap}
          msgWord={msgWord}
        />

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

// The cap-skip line — state-aware, honest. 'loaded' is the only state that
// shows a number; 'error' says plainly we couldn't check (never a fabricated 0);
// 'loading' shows a spinner; 'idle' falls back to stating the rule (the card can
// render before the preview resolves).
const CapPreviewLine = ({
  preview,
  estimate,
  cap,
  msgWord,
}: {
  preview: CapPreview;
  estimate: number;
  cap: number;
  msgWord: string;
}) => {
  const estLabel = estimate.toLocaleString('en-US');

  if (preview.state === 'loading') {
    return (
      <Group gap={6} wrap="nowrap" align="center">
        <Loader size={12} color="gray" />
        <Text size="xs" c="dimmed">
          Checking how many of your {estLabel} contacts already hit their weekly
          cap…
        </Text>
      </Group>
    );
  }

  if (preview.state === 'error') {
    return (
      <Group gap={6} wrap="nowrap" align="flex-start">
        <IconAlertTriangle
          size={14}
          color="var(--mantine-color-yellow-7)"
          style={{ flex: 'none', marginTop: 1 }}
        />
        <Text size="xs" c="dimmed">
          Couldn&rsquo;t check how many contacts already hit their weekly cap —
          already-capped contacts are still skipped automatically at send time.
        </Text>
      </Group>
    );
  }

  if (preview.state === 'loaded') {
    if (preview.capReached === 0) {
      return (
        <Text size="xs" c="dimmed">
          None of your{' '}
          <Text component="span" fw={700} c="var(--mantine-color-text)">
            {estLabel}
          </Text>{' '}
          contacts have hit their weekly cap — none currently capped.
        </Text>
      );
    }
    return (
      <Text size="xs" c="dimmed">
        <Text component="span" fw={700} c="var(--mantine-color-text)">
          {preview.capReached.toLocaleString('en-US')}
        </Text>{' '}
        of{' '}
        <Text component="span" fw={700} c="var(--mantine-color-text)">
          {estLabel}
        </Text>{' '}
        would be skipped — they already hit their weekly cap. The rest send
        normally.
      </Text>
    );
  }

  // idle — preview not resolved yet; state the rule rather than imply a count.
  return (
    <Text size="xs" c="dimmed">
      Of your{' '}
      <Text component="span" fw={700} c="var(--mantine-color-text)">
        {estLabel}
      </Text>{' '}
      contacts, anyone who already got {cap} {msgWord}
      {cap === 1 ? '' : 's'} this week is skipped automatically.
    </Text>
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
