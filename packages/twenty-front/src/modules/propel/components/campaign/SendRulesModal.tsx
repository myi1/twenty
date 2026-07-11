import {
  Box,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { friendlyError } from '@/propel/lib/friendlyError';
import {
  type RouteEnvelopeError,
  type SendRulesPayload,
} from '@/propel/types/campaignBuilder';

// Gap B — the graduated Send-Rules editor. A Mantine modal rebuild of the
// in-sandbox SendRulesSheet (marketing-cloud-nav.tsx): the send governance the
// drain enforces on EVERY send — weekly caps (all-channel + a stricter WhatsApp
// cap), a nightly quiet window, and a Friday pause. Reads the current singleton
// (passed in from /marketing/hub's sendRules) and SAVES the same field-for-field
// payload the legacy sheet did, via POST /marketing/save-rules. On a successful
// save it calls onClose(true) so the caller can refetch and the Review guardrails
// summary updates live, without leaving Review.
//
// The route is coordinator-gated (Manager/Admin); a non-coordinator gets a typed
// NOT_FOUND envelope back, surfaced as a plain toast rather than a thrown error.

// The save-rules body is FLAT (callPropelRoute sends event.body as-is). Shape
// matched 1:1 against marketing-save-rules-route.ts FIELD_MAP + validate():
//   capPerWeek · capPerWeekWhatsapp · quietEnabled · quietStart · quietEnd ·
//   fridayPauseEnabled · fridayPauseUntil
// Caps are integers 0–100 server-side; the legacy sheet capped the UI at 50, so
// we keep that ceiling. Times are "HH:MM" (24h, Asia/Dubai) — the route rejects
// anything parseHHMM can't read.
interface SaveRulesResponse extends RouteEnvelopeError {
  ok?: boolean;
  id?: string;
  rules?: SendRulesPayload;
}

// Same 30-minute grid the legacy RulesTime select used; a saved value off the
// grid (e.g. 09:15) is prepended so it stays selectable.
const TIME_OPTS = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++)
    for (const m of [0, 30])
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  return out;
})();

const timeOptions = (value: string): string[] =>
  TIME_OPTS.includes(value) ? TIME_OPTS : [value, ...TIME_OPTS];

export const SendRulesModal = ({
  rules,
  onClose,
}: {
  rules: SendRulesPayload;
  // changed === true → the singleton was saved; the caller should refetch.
  onClose: (changed: boolean) => void;
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
        friendlyError(
          res?.operatorAction || res?.error || 'Could not save your send rules.',
          'save',
        ),
        'error',
      );
      return;
    }
    notify('Send rules saved.', 'success');
    onClose(true);
  };

  return (
    <Modal
      opened
      onClose={() => onClose(false)}
      title="Send rules"
      size="md"
      zIndex={5000}
      closeOnClickOutside={!saving}
    >
      <Stack gap="md">
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
                comboboxProps={{ zIndex: 5000 }}
              />
              <Select
                label="Quiet until"
                value={quietEnd}
                onChange={(v) => v && setQuietEnd(v)}
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
                comboboxProps={{ zIndex: 5000 }}
              />
            </Box>
          )}
        </Box>

        <Group justify="space-between" mt="sm">
          <Button variant="default" onClick={() => onClose(false)} disabled={saving}>
            Cancel
          </Button>
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
    </Modal>
  );
};
