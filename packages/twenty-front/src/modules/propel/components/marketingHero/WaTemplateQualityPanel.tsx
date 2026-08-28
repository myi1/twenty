import { Alert, Badge, Box, Group, List, Paper, Stack, Text } from '@mantine/core';
import { useMemo } from 'react';
import { IconAlertTriangle, IconCheck, IconInfoCircle } from 'twenty-ui/display';
import {
  scoreTemplateQuality,
  type WaQualityBasis,
  type WaQualityGrade,
  type WaQualitySignal,
} from '@/propel/lib/waTemplateQuality';
import { type WaTemplateCreateInput } from '@/propel/lib/waTemplate';

// Live spam-risk panel for the WhatsApp template editor.
//
// WHY IT EXISTS: on 2026-08-28 a 1,485-recipient blast drew a Meta spam notice
// and pushed +971 50 210 4130 to quality_rating RED (0.47% reply rate). Nobody
// could have known before sending, because nothing showed them. This panel is
// the "before" — it grades the draft as the author types, so a high-risk message
// gets rewritten instead of discovered as a RED rating weeks later.
//
// ADVISORY, NEVER A BLOCKER. The submit button is gated by validateCreateInput
// (Meta's hard caps + the mandatory opt-out) and by nothing here. A grade E
// template with no validation problems is still submittable — that is deliberate,
// and the copy says so, so nobody reads a bad grade as "the system won't let me".
//
// CONTRACT: `input` must be the input AS IT WILL BE SUBMITTED — i.e. already
// ensureOptOut-normalized. The modal's `createInput` memo is exactly that, so
// this panel deliberately does NOT normalize again. Two reasons that is the right
// split rather than defensive double-normalisation:
//   1. re-running ensureOptOut here happens to be a no-op today only because its
//      first line short-circuits on hasOptOutAffordance. That is true by accident
//      of the guard, not by contract, and would stop being true the moment the
//      cascade changes — a panel that silently added a SECOND opt-out button
//      would be scoring a message nobody is sending.
//   2. the grade must describe what actually goes out. Normalizing here would let
//      the panel and the submit path disagree the day they diverge.
// So the modal owns normalization, this owns judgement, and the server scores the
// same normalized input on submit.

const GRADE_COLOR: Record<WaQualityGrade, string> = {
  A: 'green',
  B: 'teal',
  C: 'yellow',
  D: 'orange',
  E: 'red',
};

// Plain-language provenance. A non-technical reader must be able to tell "Meta
// says so" apart from "Propel thinks so" at a glance — presenting our own
// judgement as Meta policy would be the one genuinely damaging thing this panel
// could do.
const BASIS_LABEL: Record<WaQualityBasis, string> = {
  META_POLICY: "Meta's rule",
  META_QUALITY: 'Counts toward Meta’s rating',
  OUR_HISTORY: 'From our own send history',
  OUR_HEURISTIC: 'Our judgement, not Meta’s',
};

const BASIS_COLOR: Record<WaQualityBasis, string> = {
  META_POLICY: 'blue',
  META_QUALITY: 'blue',
  OUR_HISTORY: 'grape',
  OUR_HEURISTIC: 'gray',
};

type Props = {
  /** the create-input AS IT WILL BE SUBMITTED — already ensureOptOut-normalized
   * by the caller (WaTemplateModal's `createInput`). Do NOT pass a raw draft:
   * the grade is meant to describe the sent message, opt-out included. */
  input: WaTemplateCreateInput;
  /** Meta's OWN post-send verdict for this template, when we have one
   * (whatsappTemplate.metaQualityScore, pulled by template sync). Absent for a
   * template that has never been sent — which is the normal case at authoring
   * time, and is shown as such rather than hidden. */
  metaQualityScore?: string | null;
};

const SignalRow = ({ signal }: { signal: WaQualitySignal }) => (
  <List.Item
    icon={
      signal.kind === 'GOOD' ? (
        <IconCheck size={14} color="var(--mantine-color-green-6)" />
      ) : signal.penalty === 0 ? (
        <IconInfoCircle size={14} color="var(--mantine-color-blue-6)" />
      ) : (
        <IconAlertTriangle size={14} color="var(--mantine-color-orange-6)" />
      )
    }
  >
    <Group gap={6} wrap="nowrap" align="baseline">
      <Text size="sm" fw={600}>
        {signal.label}
      </Text>
      {signal.penalty > 0 && (
        <Text size="xs" c="dimmed" fw={600}>
          −{signal.penalty}
        </Text>
      )}
      <Badge size="xs" variant="light" color={BASIS_COLOR[signal.basis]}>
        {BASIS_LABEL[signal.basis]}
      </Badge>
    </Group>
    <Text size="xs" c="dimmed">
      {signal.detail}
    </Text>
  </List.Item>
);

export const WaTemplateQualityPanel = ({ input, metaQualityScore }: Props) => {
  // Pure and cheap, but memoized because it runs on every keystroke of the body.
  const quality = useMemo(() => scoreTemplateQuality(input), [input]);

  const risks = quality.signals.filter((s) => s.kind === 'RISK');
  const good = quality.signals.filter((s) => s.kind === 'GOOD');

  // Meta only issues a real verdict once a template has been sent at volume;
  // until then it reports UNKNOWN. Say that plainly instead of showing an empty
  // box or, worse, implying our predicted grade is Meta's.
  const metaVerdict = (metaQualityScore ?? '').trim().toUpperCase();
  const hasMetaVerdict = metaVerdict !== '' && metaVerdict !== 'UNKNOWN';

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Box>
            <Text size="sm" fw={700}>
              Spam-risk check
            </Text>
            <Text size="xs" c="dimmed">
              How this message is likely to land before you send it
            </Text>
          </Box>
          <Group gap="xs" wrap="nowrap">
            <Badge size="lg" color={GRADE_COLOR[quality.grade]} variant="filled">
              {quality.grade}
            </Badge>
            <Text size="sm" fw={700} c="dimmed">
              {quality.score}/100
            </Text>
          </Group>
        </Group>

        <Text size="sm">{quality.verdict}</Text>

        {/* The single most important sentence on the panel: this is advice, and
            a low grade does not stop anyone shipping a message they stand behind. */}
        <Text size="xs" c="dimmed" fs="italic">
          This is guidance, not a gate — you can still submit a low-scoring
          template. Meta does not publish a content rubric, so items tagged “our
          judgement” are Propel’s own reading of what got our number flagged, not
          Meta policy.
        </Text>

        {risks.length > 0 && (
          <List spacing={6} size="sm" center={false}>
            {risks.map((s) => (
              <SignalRow key={s.id} signal={s} />
            ))}
          </List>
        )}

        {good.length > 0 && (
          <List spacing={4} size="sm" center={false}>
            {good.map((s) => (
              <SignalRow key={s.id} signal={s} />
            ))}
          </List>
        )}

        {/* Meta's REAL, after-the-fact verdict beside our prediction. Showing both
            is what stops this panel being a theory: over time the two can be
            compared, and the prediction corrected against the outcome. */}
        <Alert
          variant="light"
          color={hasMetaVerdict ? (metaVerdict === 'GREEN' ? 'green' : metaVerdict === 'YELLOW' ? 'yellow' : 'red') : 'gray'}
          icon={<IconInfoCircle size={16} />}
          p="xs"
        >
          <Text size="xs">
            {hasMetaVerdict ? (
              <>
                <b>Meta’s own rating for this template: {metaVerdict}.</b> That is
                Meta’s verdict after real people received it — our {quality.grade}{' '}
                above is only a prediction made before sending.
              </>
            ) : (
              <>
                <b>Meta has not rated this template yet.</b> Meta only issues a
                quality rating once a template has been sent enough times, so the
                grade above is our prediction, not Meta’s verdict.
              </>
            )}
          </Text>
        </Alert>
      </Stack>
    </Paper>
  );
};
