import {
  Alert,
  Box,
  Button,
  Card,
  Center,
  Divider,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { IconAlertTriangle, IconClock, IconMoon } from 'twenty-ui/icon';

import { useSendRules } from '@/propel/hooks/useSendRules';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { type SendRulesPayload } from '@/propel/types/campaignBuilder';

// The Quiet Hours tab — the marketing send governance the drain enforces on EVERY
// send (weekly per-person caps + the nightly quiet window + the Friday pause),
// folded into the Settings hub. Reuses /marketing/hub (read) + /marketing/save-rules
// (write), both UNCHANGED. Unlike the per-field-optimistic tabs, this one batches
// into a single explicit Save (the route logs one RULES_CHANGED audit event per
// save and re-derives the singleton), matching the marketing Send-Rules modal.

// 30-minute grid for the time selects; a saved off-grid value is prepended.
const TIME_OPTS = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++)
    for (const m of [0, 30])
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  return out;
})();
const timeOptions = (value: string): string[] =>
  TIME_OPTS.includes(value) ? TIME_OPTS : [value, ...TIME_OPTS];

export const SettingsQuietHoursTab = () => {
  const { phase, error, rules, canEdit, saving, save } = useSendRules();
  const notify = usePropelToast();

  // Local draft, seeded from the loaded rules; reset whenever the server rules change.
  const [draft, setDraft] = useState<SendRulesPayload>(rules);
  useEffect(() => setDraft(rules), [rules]);

  const set = <K extends keyof SendRulesPayload>(
    key: K,
    value: SendRulesPayload[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const dirty =
    draft.capPerWeek !== rules.capPerWeek ||
    draft.capPerWeekWhatsapp !== rules.capPerWeekWhatsapp ||
    draft.quietEnabled !== rules.quietEnabled ||
    draft.quietStart !== rules.quietStart ||
    draft.quietEnd !== rules.quietEnd ||
    draft.fridayPauseEnabled !== rules.fridayPauseEnabled ||
    draft.fridayPauseUntil !== rules.fridayPauseUntil;

  const quietStartOpts = useMemo(
    () => timeOptions(draft.quietStart),
    [draft.quietStart],
  );
  const quietEndOpts = useMemo(
    () => timeOptions(draft.quietEnd),
    [draft.quietEnd],
  );
  const fridayUntilOpts = useMemo(
    () => timeOptions(draft.fridayPauseUntil),
    [draft.fridayPauseUntil],
  );

  const onSave = async () => {
    const err = await save(draft);
    if (err === null) notify('Send rules saved.', 'success');
    else notify(err, 'error');
  };

  const disabled = !canEdit || saving;

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed" style={{ lineHeight: 1.55 }}>
        These protect your contacts from over-messaging. Weekly caps count messages
        queued + sent per person over a rolling 7-day window; the quiet window pauses
        all marketing sends (they resume after it — paused, never lost).
      </Text>

      <Alert color="blue" variant="light" icon={<IconClock size={16} />}>
        Quiet hours and the Friday pause apply in <b>each recipient’s local
        timezone</b> (resolved from their phone’s country code; Asia/Dubai when the
        country is unknown). A 21:00 quiet start pauses a Dubai contact at 21:00
        Dubai time and a London contact at 21:00 London time.
      </Alert>

      {error !== null && (
        <Alert
          color="red"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
        >
          {error}
        </Alert>
      )}

      {!canEdit && phase !== 'loading' && (
        <Text size="xs" c="dimmed">
          A manager can change send rules here.
        </Text>
      )}

      {phase === 'loading' ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : (
        <Card withBorder radius="md" padding="lg">
          <Stack gap="md">
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
                  disabled={disabled}
                  value={draft.capPerWeek}
                  onChange={(v) =>
                    set('capPerWeek', typeof v === 'number' ? v : draft.capPerWeek)
                  }
                />
                <NumberInput
                  label="WhatsApp"
                  description="messages / week"
                  min={0}
                  max={50}
                  clampBehavior="strict"
                  allowDecimal={false}
                  disabled={disabled}
                  value={draft.capPerWeekWhatsapp}
                  onChange={(v) =>
                    set(
                      'capPerWeekWhatsapp',
                      typeof v === 'number' ? v : draft.capPerWeekWhatsapp,
                    )
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
              <Group gap={6} mb="sm">
                <IconMoon size={15} />
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                  Quiet window
                </Text>
              </Group>
              <Switch
                color="red"
                disabled={disabled}
                checked={draft.quietEnabled}
                onChange={(e) => set('quietEnabled', e.currentTarget.checked)}
                label="Enable quiet hours"
                description="Marketing sends pause inside the window."
              />
              {draft.quietEnabled && (
                <Group grow mt="sm">
                  <Select
                    label="Quiet from"
                    disabled={disabled}
                    value={draft.quietStart}
                    onChange={(v) => v && set('quietStart', v)}
                    data={quietStartOpts}
                    allowDeselect={false}
                    comboboxProps={{ zIndex: 5000 }}
                  />
                  <Select
                    label="Quiet until"
                    disabled={disabled}
                    value={draft.quietEnd}
                    onChange={(v) => v && set('quietEnd', v)}
                    data={quietEndOpts}
                    allowDeselect={false}
                    comboboxProps={{ zIndex: 5000 }}
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
                disabled={disabled}
                checked={draft.fridayPauseEnabled}
                onChange={(e) =>
                  set('fridayPauseEnabled', e.currentTarget.checked)
                }
                label="Pause on Friday mornings"
                description="Holds marketing sends until the set time on Fridays (the UAE weekend start)."
              />
              {draft.fridayPauseEnabled && (
                <Box mt="sm" maw={220}>
                  <Select
                    label="Resume after"
                    disabled={disabled}
                    value={draft.fridayPauseUntil}
                    onChange={(v) => v && set('fridayPauseUntil', v)}
                    data={fridayUntilOpts}
                    allowDeselect={false}
                    comboboxProps={{ zIndex: 5000 }}
                  />
                </Box>
              )}
            </Box>

            {canEdit && (
              <Group justify="flex-end">
                <Button
                  color="red"
                  loading={saving}
                  disabled={!dirty || saving}
                  onClick={() => void onSave()}
                >
                  Save rules
                </Button>
              </Group>
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  );
};
