import {
  Box,
  Group,
  NumberInput,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconAlertCircle } from 'twenty-ui/display';
import { ComposeToolbar } from '@/propel/components/campaign/ComposeToolbar';
import {
  type FormatAction,
} from '@/propel/lib/campaignBuilderConfig';
import { type MergeField } from '@/propel/lib/campaignRenderer';
import {
  type AbConfig,
  type AbWinnerMetric,
} from '@/propel/types/campaignBuilder';

// S2 — the A/B "test two versions" front door, rendered inside the email Compose
// step. A/B exists end-to-end in the backend (marketingCampaign schema +
// /marketing/save-campaign write + campaign-detail result read) but had NO build
// UI anywhere — this is the missing door (design decision D-2, founder-locked).
//
// EMAIL first: variant B is a second subject + body (variant A is the main
// Compose copy). WhatsApp A/B (abTemplateBId, a second approved template) is a
// fast-follow — see the TODO in ManualWizard. The panel is presentational; all
// state lives in the wizard's `ab` slice and is wired into save-campaign there.
export const AbTestPanel = ({
  ab,
  onChange,
  subjectBRef,
  bodyBRef,
  mergeFields,
  customFields,
  onInsertTokenB,
  onFormatB,
  copyTokensFillableB,
}: {
  ab: AbConfig;
  onChange: (patch: Partial<AbConfig>) => void;
  subjectBRef: React.Ref<HTMLInputElement>;
  bodyBRef: React.Ref<HTMLTextAreaElement>;
  mergeFields: MergeField[];
  customFields: { id: string; key: string; value: string; label: string }[];
  onInsertTokenB: (field: string) => void;
  onFormatB: (action: FormatAction) => void;
  copyTokensFillableB: boolean;
}) => {
  const slice = ab.slicePct;
  // Live split bar: `slice` is sampled (half to A, half to B); the remaining
  // (100 − slice) gets the winning variant after the decision window. The bar
  // makes "you're only testing on a SLICE, then the winner ships to the rest"
  // legible at a glance — the single most-misunderstood part of A/B.
  const halfSlice = Math.round(slice / 2);
  const remainder = Math.max(0, 100 - halfSlice * 2);

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
          {/* Variant B copy */}
          <Box>
            <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>
              Variant B
            </Text>
            <Stack gap="sm">
              <TextInput
                ref={subjectBRef}
                label="Subject (B)"
                placeholder="A different subject line to test"
                value={ab.subjectB}
                onChange={(e) => onChange({ subjectB: e.currentTarget.value })}
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
                    Variant B uses a merge field this campaign can&rsquo;t fill —
                    it would send blank.
                  </Text>
                </Group>
              )}
            </Stack>
          </Box>

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
            <SplitBar
              aPct={halfSlice}
              bPct={halfSlice}
              winnerPct={remainder}
            />
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
                onChange={(v) =>
                  onChange({ winnerMetric: v as AbWinnerMetric })
                }
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
                  minEvents:
                    typeof v === 'number' && v >= 0 ? Math.round(v) : 0,
                })
              }
            />
          </Group>
        </Stack>
      )}
    </Box>
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
    <Segment pct={aPct} color="var(--mantine-color-red-6)" title={`A · ${aPct}%`} />
    <Segment pct={bPct} color="var(--mantine-color-red-3)" title={`B · ${bPct}%`} />
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
        transition: 'flex-grow 200ms cubic-bezier(0.23, 1, 0.32, 1)',
      }}
    />
  );
