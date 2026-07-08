import { type KeyboardEvent, type MutableRefObject, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { IconHistory, IconSparkles, IconX } from 'twenty-ui/display';
import { type BenchLogEntry } from '@/propel/lib/landingPagesCrm';

// Stage 3B — the click+tell instruction bar (plan §T3). Sits at the bottom of
// the Landing editor: a target chip (the section picked via the preview's
// "Edit with AI" button or a row's Instruct affordance; clearable → whole page),
// free-text instruction input, and Apply → the parent's instructEdit call. A
// small history popover lists recent `instruct` benchLog entries for the
// current target (filtered client-side by the entry's sectionIndex).
//
// Presentation-only: the parent owns target/text/busy/featureOff and the whole
// apply flow, so this stays a dumb, hero-safe Mantine strip (no new deps).

// Keep the visible history short — it's a glanceable trail, not an audit UI.
const HISTORY_LIMIT = 10;

export interface InstructionBarProps {
  // The targeted section index (null = whole page) + its human label.
  targetIndex: number | null;
  targetLabel: string;
  text: string;
  busy: boolean;
  // FEATURE_OFF from the route → dim the whole bar (mirrors the brief box).
  featureOff: boolean;
  // False until the page exists server-side (instruct edits the SAVED page).
  canApply: boolean;
  disabledHint: string | null;
  // The page's full benchLog — filtered to instruct entries in here.
  history: BenchLogEntry[];
  inputRef: MutableRefObject<HTMLInputElement | null>;
  onTextChange: (next: string) => void;
  onClearTarget: () => void;
  onApply: () => void;
}

const shortTs = (ts: string): string => {
  // ISO → "MM-DD HH:mm" (good enough for a glanceable trail; never throws).
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(ts);
  return m ? `${m[1]}-${m[2]} ${m[3]}:${m[4]}` : ts;
};

export const InstructionBar = ({
  targetIndex,
  targetLabel,
  text,
  busy,
  featureOff,
  canApply,
  disabledHint,
  history,
  inputRef,
  onTextChange,
  onClearTarget,
  onApply,
}: InstructionBarProps) => {
  const [historyOpen, setHistoryOpen] = useState(false);

  // Recent instruct entries for the CURRENT target: a targeted chip shows that
  // section's edits; whole-page shows every instruct entry. Newest first.
  const entries = useMemo(() => {
    const instructs = history.filter((e) => e.action === 'instruct');
    const scoped =
      targetIndex === null
        ? instructs
        : instructs.filter((e) => e.sectionIndex === targetIndex);
    return scoped.slice(-HISTORY_LIMIT).reverse();
  }, [history, targetIndex]);

  const applyDisabled = !canApply || featureOff || busy || text.trim() === '';

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !applyDisabled) onApply();
  };

  return (
    <Paper
      withBorder
      radius="md"
      p="xs"
      style={featureOff ? { opacity: 0.55 } : undefined}
    >
      <Group gap="xs" wrap="nowrap" align="center">
        <ThemeIcon size="sm" variant="light" color="grape">
          <IconSparkles size={14} />
        </ThemeIcon>
        <Badge
          size="sm"
          variant={targetIndex === null ? 'outline' : 'light'}
          color={targetIndex === null ? 'gray' : 'grape'}
          style={{ flexShrink: 0, maxWidth: 220, textTransform: 'none' }}
          rightSection={
            targetIndex !== null ? (
              <IconX
                size={10}
                style={{ cursor: 'pointer', display: 'block' }}
                aria-label="Clear target (whole page)"
                onClick={onClearTarget}
              />
            ) : undefined
          }
        >
          {targetLabel}
        </Badge>
        <TextInput
          ref={inputRef}
          size="xs"
          style={{ flex: 1, minWidth: 0 }}
          placeholder="Tell the AI what to change — e.g. make this more urgent"
          value={text}
          onChange={(e) => onTextChange(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          disabled={featureOff || !canApply}
        />
        <Popover
          opened={historyOpen}
          onChange={setHistoryOpen}
          position="top-end"
          width={340}
          shadow="md"
          zIndex={5000}
          withinPortal
        >
          <Popover.Target>
            <ActionIcon
              size="md"
              variant="subtle"
              color="gray"
              aria-label="AI edit history"
              onClick={() => setHistoryOpen((o) => !o)}
            >
              <IconHistory size={16} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown p="xs">
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>
              AI edits — {targetLabel}
            </Text>
            {entries.length === 0 ? (
              <Text size="xs" c="dimmed">
                No AI edits {targetIndex === null ? 'on this page' : 'on this section'} yet.
              </Text>
            ) : (
              <ScrollArea.Autosize mah={260}>
                <Stack gap={6}>
                  {entries.map((e, i) => (
                    <Stack key={`${e.ts}-${i}`} gap={0}>
                      <Text size="xs">{e.summary}</Text>
                      <Text size="xs" c="dimmed">
                        {shortTs(e.ts)}
                        {typeof e.sectionIndex === 'number'
                          ? ` · section ${e.sectionIndex + 1}`
                          : ' · whole page'}
                      </Text>
                    </Stack>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            )}
          </Popover.Dropdown>
        </Popover>
        <Button
          size="xs"
          color="grape"
          loading={busy}
          disabled={!canApply || featureOff || text.trim() === ''}
          onClick={onApply}
        >
          Apply
        </Button>
      </Group>
      {featureOff ? (
        <Text size="xs" c="dimmed" mt={6}>
          AI editing isn’t configured yet.
        </Text>
      ) : disabledHint ? (
        <Text size="xs" c="dimmed" mt={6}>
          {disabledHint}
        </Text>
      ) : null}
    </Paper>
  );
};

export default InstructionBar;
