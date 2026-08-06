import {
  Box,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconAlertCircle } from 'twenty-ui/display';
import { ComposeToolbar } from '@/propel/components/campaign/ComposeToolbar';
import { type FormatAction } from '@/propel/lib/campaignBuilderConfig';
import { DUR, EASE } from '~/heroes/_pulse/motion';
import { type MergeField } from '@/propel/lib/campaignRenderer';
import {
  type AbConfig,
  type AbWinnerMetric,
  type WaTemplateOption,
} from '@/propel/types/campaignBuilder';

// S2 — the A/B "test two versions" front door (design decision D-2,
// founder-locked). A/B exists end-to-end in the backend (marketingCampaign
// schema + /marketing/save-campaign write + campaign-detail result read) but had
// NO build UI anywhere — this is the missing door.
//
// Now BOTH channels:
//   • EMAIL — variant B is a second subject + body (variant A = the main Compose
//     copy), validated against the same fillable-merge-field contract.
//   • WHATSAPP — variant B is a second approved template (abTemplateBId; the WA
//     body IS the template, so there's nothing to free-type). The variant-A
//     template (the one picked in Compose) is excluded from the B picker so the
//     two variants are genuinely different.
// The slice / winner-metric / decision-window controls are shared across both.
// The panel is presentational; all state lives in the wizard's `ab` slice and is
// wired into save-campaign there (abEnabled, abSubjectB/abBodyB OR abTemplateBId,
// abSlicePct, abWinnerMetric, abDecideAfterHours, abMinEvents).
export const AbTestPanel = ({
  ab,
  onChange,
  channel,
  subjectBRef,
  bodyBRef,
  mergeFields,
  customFields,
  onInsertTokenB,
  onFormatB,
  copyTokensFillableB,
  waTemplates,
  waTemplateAId,
  hideEmailBodyEditor = false,
  showMechanics = true,
}: {
  ab: AbConfig;
  onChange: (patch: Partial<AbConfig>) => void;
  channel: 'EMAIL' | 'WHATSAPP';
  subjectBRef: React.Ref<HTMLInputElement>;
  bodyBRef: React.Ref<HTMLTextAreaElement>;
  mergeFields: MergeField[];
  customFields: { id: string; key: string; value: string; label: string }[];
  onInsertTokenB: (field: string) => void;
  onFormatB: (action: FormatAction) => void;
  copyTokensFillableB: boolean;
  // WhatsApp A/B — the approved templates to pick variant B from, and the
  // variant-A template id to exclude. Unused for EMAIL.
  waTemplates: WaTemplateOption[];
  waTemplateAId: string | null;
  // EMAIL only: when true, Variant B's subject + body are authored in the shared
  // GrapesJS builder (via the A|B switcher above), so this panel shows only the
  // test mechanics — no markdown editor for B. (WhatsApp ignores this.)
  hideEmailBodyEditor?: boolean;
  // When false, the test MECHANICS (slice / winner / decide-after / min-events) are
  // NOT rendered here — they live on the Review step instead (founder: the Compose
  // step shouldn't be a scroll-fest). The toggle + variant-B door stay. Default
  // true for back-compat (e.g. WhatsApp / any inline use that wants them together).
  showMechanics?: boolean;
}) => {
  const isWa = channel === 'WHATSAPP';

  return (
    <Box
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 12,
        padding: 14,
        background: 'var(--mantine-color-body)',
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Box>
          <Text size="sm" fw={700} c="var(--mantine-color-text)">
            Test two versions (A/B)
          </Text>
          <Text size="xs" c="dimmed">
            Send two variants to a slice of your audience; the winner ships to
            everyone else automatically.
          </Text>
        </Box>
        <Switch
          checked={ab.enabled}
          onChange={(e) => onChange({ enabled: e.currentTarget.checked })}
          color="red"
          aria-label="Enable A/B test"
        />
      </Group>

      {ab.enabled && (
        <Stack gap="md" mt="md">
          {/* Variant B — copy (EMAIL) or a second approved template (WhatsApp).
              For EMAIL with hideEmailBodyEditor, B's subject + body live in the
              GrapesJS builder (A|B switcher above) — here we only confirm that. */}
          <Box>
            <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>
              Variant B
            </Text>
            {isWa ? (
              <WaVariantB
                ab={ab}
                onChange={onChange}
                waTemplates={waTemplates}
                waTemplateAId={waTemplateAId}
              />
            ) : hideEmailBodyEditor ? (
              <Text size="xs" c="dimmed">
                Design Variant B in the builder above — switch to{' '}
                <Text span fw={700} c="var(--mantine-color-text)">
                  Variant B
                </Text>{' '}
                with the A | B toggle, then design its email like Variant A.
                {!copyTokensFillableB
                  ? ' ⚠ Variant B currently uses a merge field this campaign can’t fill.'
                  : ''}
              </Text>
            ) : (
              <Stack gap="sm">
                <TextInput
                  ref={subjectBRef}
                  label="Subject (B)"
                  placeholder="A different subject line to test"
                  value={ab.subjectB}
                  onChange={(e) =>
                    onChange({ subjectB: e.currentTarget.value })
                  }
                />
                <Box>
                  <Text size="sm" fw={600} mb={6} c="var(--mantine-color-text)">
                    Body (B)
                  </Text>
                  <ComposeToolbar
                    mergeFields={mergeFields}
                    customFields={customFields}
                    onFormat={onFormatB}
                    onInsertToken={onInsertTokenB}
                  />
                  <Textarea
                    ref={bodyBRef}
                    mt={8}
                    autosize
                    minRows={6}
                    maxRows={14}
                    placeholder="The alternate message to test against version A."
                    value={ab.bodyB}
                    onChange={(e) => onChange({ bodyB: e.currentTarget.value })}
                  />
                </Box>
                {!copyTokensFillableB && (
                  <Group gap={6} wrap="nowrap" c="red">
                    <IconAlertCircle size={14} />
                    <Text size="xs" c="red">
                      Variant B uses a merge field this campaign can&rsquo;t
                      fill — it would send blank.
                    </Text>
                  </Group>
                )}
              </Stack>
            )}
          </Box>

          {/* Test mechanics (slice / winner / decide-after / min-events). Shown
              here only when showMechanics; on the EMAIL builder flow they live on
              the Review step instead, so Compose isn't a scroll-fest. */}
          {showMechanics && <AbTestMechanics ab={ab} onChange={onChange} />}
        </Stack>
      )}
    </Box>
  );
};

// The A/B test MECHANICS — test-slice %, the live split bar, the winning signal,
// the decision window (decide-after hours), and min-events. Extracted so it can be
// rendered either inline in the panel (showMechanics) OR on the Review step (the
// EMAIL builder flow, where Compose keeps only the toggle + variant designs).
// Pure/presentational: all state is the wizard's `ab` slice.
export const AbTestMechanics = ({
  ab,
  onChange,
}: {
  ab: AbConfig;
  onChange: (patch: Partial<AbConfig>) => void;
}) => {
  const slice = ab.slicePct;
  // Live split bar: `slice` is sampled (half to A, half to B); the remaining
  // (100 − slice) gets the winning variant after the decision window.
  const halfSlice = Math.round(slice / 2);
  const remainder = Math.max(0, 100 - halfSlice * 2);
  return (
    <Stack gap="md">
      {/* Test slice + live split bar */}
      <Box>
        <Group justify="space-between" align="baseline">
          <Text size="sm" fw={600} c="var(--mantine-color-text)">
            Test slice
          </Text>
          <Text size="sm" fw={700} c="var(--mantine-color-text)">
            {slice}%
          </Text>
        </Group>
        <Slider
          mt={6}
          color="red"
          min={5}
          max={50}
          step={5}
          value={slice}
          onChange={(v) => onChange({ slicePct: v })}
          marks={[
            { value: 10, label: '10%' },
            { value: 30, label: '30%' },
            { value: 50, label: '50%' },
          ]}
        />
        <SplitBar aPct={halfSlice} bPct={halfSlice} winnerPct={remainder} />
        <Text size="xs" c="dimmed" mt={6}>
          {halfSlice}% gets A, {halfSlice}% gets B, the remaining {remainder}%
          gets the winner.
        </Text>
      </Box>

      {/* Winner metric + decision window */}
      <Group grow align="flex-start" wrap="wrap">
        <Box>
          <Text size="sm" fw={600} mb={6} c="var(--mantine-color-text)">
            Winning signal
          </Text>
          <SegmentedControl
            fullWidth
            value={ab.winnerMetric}
            onChange={(v) => onChange({ winnerMetric: v as AbWinnerMetric })}
            data={[
              { label: 'Opens', value: 'OPENS' },
              { label: 'Replies', value: 'REPLIES' },
            ]}
          />
        </Box>
        <NumberInput
          label="Decide after"
          description="Hours before the winner is chosen"
          min={1}
          max={168}
          value={ab.decideAfterHours}
          onChange={(v) =>
            onChange({
              decideAfterHours:
                typeof v === 'number' && v > 0 ? Math.round(v) : 1,
            })
          }
          suffix=" h"
        />
        <NumberInput
          label="Min. events"
          description="Wait for at least this many before deciding"
          min={0}
          max={100000}
          value={ab.minEvents}
          onChange={(v) =>
            onChange({
              minEvents: typeof v === 'number' && v >= 0 ? Math.round(v) : 0,
            })
          }
        />
      </Group>
    </Stack>
  );
};

// WhatsApp variant B — a second approved template (the WA body is the template,
// so there's no free copy to write). The variant-A template (picked in Compose)
// is excluded so the two variants genuinely differ; if there's only one approved
// template, B can't be formed and we say so plainly rather than offering a list
// of one (which would let A === B).
const WaVariantB = ({
  ab,
  onChange,
  waTemplates,
  waTemplateAId,
}: {
  ab: AbConfig;
  onChange: (patch: Partial<AbConfig>) => void;
  waTemplates: WaTemplateOption[];
  waTemplateAId: string | null;
}) => {
  const options = waTemplates.filter((t) => t.id !== waTemplateAId);

  if (options.length === 0) {
    return (
      <Group gap={6} wrap="nowrap" align="flex-start">
        <IconAlertCircle
          size={14}
          style={{
            color: 'var(--mantine-color-yellow-7)',
            flex: 'none',
            marginTop: 2,
          }}
        />
        <Text size="xs" c="dimmed">
          You need a second approved WhatsApp template to test against — there
          {waTemplateAId
            ? ' isn’t another approved template besides the one you picked.'
            : ' aren’t two approved templates to compare.'}{' '}
          Create one on the Templates tab, then turn A/B back on.
        </Text>
      </Group>
    );
  }

  return (
    <Stack gap="sm">
      <Select
        label="Template (B)"
        description="A different approved template to test against version A."
        placeholder="Search or pick the variant-B template"
        searchable
        value={ab.templateBId}
        onChange={(v) => onChange({ templateBId: v })}
        data={options.map((t) => ({
          value: t.id,
          label: `${t.name} (${t.languageCode})`,
        }))}
        nothingFoundMessage="No other approved templates match"
      />
      {!ab.templateBId && (
        <Group gap={6} wrap="nowrap" c="dimmed">
          <IconAlertCircle size={14} />
          <Text size="xs" c="dimmed">
            Pick a second template — without one there&rsquo;s nothing to test
            against.
          </Text>
        </Group>
      )}
    </Stack>
  );
};

// A pure CSS split bar — A | B | winner — animated on width change (transform is
// not possible for a flex-grow segment, so width is acceptable here; this is a
// rare, deliberate state change, not per-frame).
const SplitBar = ({
  aPct,
  bPct,
  winnerPct,
}: {
  aPct: number;
  bPct: number;
  winnerPct: number;
}) => (
  <Group
    gap={2}
    mt={10}
    wrap="nowrap"
    style={{ height: 14, borderRadius: 7, overflow: 'hidden' }}
  >
    <Segment
      pct={aPct}
      color="var(--mantine-color-red-6)"
      title={`A · ${aPct}%`}
    />
    <Segment
      pct={bPct}
      color="var(--mantine-color-red-3)"
      title={`B · ${bPct}%`}
    />
    <Segment
      pct={winnerPct}
      color="var(--mantine-color-default-border)"
      title={`Winner · ${winnerPct}%`}
    />
  </Group>
);

const Segment = ({
  pct,
  color,
  title,
}: {
  pct: number;
  color: string;
  title: string;
}) =>
  pct <= 0 ? null : (
    <Box
      title={title}
      style={{
        flex: `${pct} 0 0`,
        height: '100%',
        background: color,
        transition: `flex-grow ${DUR.dropdown}ms ${EASE.out}`,
      }}
    />
  );
