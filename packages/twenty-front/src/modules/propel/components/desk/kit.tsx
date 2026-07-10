import { type KeyboardEvent, type ReactNode, useContext } from 'react';
import {
  Badge,
  Box,
  Center,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { ThemeContext } from 'twenty-ui/theme-constants';

// Shared theme primitives for the Marketing home surfaces (the publisher "Night
// Desk" and the agent "My Desk"). Extracted so BOTH homes reuse the SAME
// theme-aware brass/seal hooks — no home reintroduces a hardcoded dark hex.

// The ONE brass/gold accent — reserved for the working MACHINE (engine report +
// cost + trend + the review seals). It carries meaning; it is never decoration.
//
// Theme-aware: the #C6A15B gold sits well on the dark "warm-ink" ground but washes
// out to near-illegible on a white surface, so light mode uses a deeper antique
// gold that keeps contrast. We resolve to a CONCRETE hex per scheme (not a
// light-dark() CSS value) so the same string is safe everywhere it's used —
// tabler-icon `color=` / SVG `stroke=` attributes AND the `${seal}22` alpha-tint
// string concats, neither of which reliably parse CSS color functions.
export const BRASS_DARK = '#C6A15B';
export const BRASS_LIGHT = '#8A6A29';

export const useBrass = (): string => {
  const { colorScheme } = useContext(ThemeContext);
  return colorScheme === 'dark' ? BRASS_DARK : BRASS_LIGHT;
};

// The soft brass tint behind a monitoring rail — a translucent wash that composites
// over whichever ground is active (warm paper in light, warm ink in dark), so it
// flips without a branch.
export const BRASS_TINT_BG = 'rgba(198, 161, 91, 0.06)';
export const BRASS_TINT_BORDER = 'rgba(198, 161, 91, 0.22)';

// Seal colors — the status dot on each queue/pipeline row. Red/amber/grey are
// Mantine semantic tokens; we pick a slightly deeper shade in light mode so the
// dots (and the tinted count badges) stay legible on white, and a brighter shade on
// the dark ground. Brass is the theme-aware gold above.
export type SealKind = 'red' | 'amber' | 'brass' | 'grey' | 'green';

export const useSeal = (): Record<SealKind, string> => {
  const { colorScheme } = useContext(ThemeContext);
  const dark = colorScheme === 'dark';
  return {
    red: `var(--mantine-color-red-${dark ? 5 : 6})`, // act now
    amber: `var(--mantine-color-yellow-${dark ? 5 : 7})`, // attention
    brass: dark ? BRASS_DARK : BRASS_LIGHT, // review (the machine's drafts / waiting)
    grey: `var(--mantine-color-gray-${dark ? 5 : 6})`, // routine / in progress
    green: `var(--mantine-color-teal-${dark ? 5 : 7})`, // went live
  };
};

export const plural = (word: string, n: number): string =>
  n === 1 ? word : `${word}s`;

// Register label (uppercase, tracked eyebrow).
export const Eyebrow = ({ children }: { children: ReactNode }) => (
  <Text fz={11} fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.14em' }}>
    {children}
  </Text>
);

export const Seal = ({ kind }: { kind: SealKind }) => {
  const seal = useSeal();
  return (
    <Box
      style={{
        width: 9,
        height: 9,
        borderRadius: 999,
        background: seal[kind],
        flexShrink: 0,
        boxShadow: `0 0 0 3px ${seal[kind]}22`,
      }}
    />
  );
};

// The maker-checker status pill on a publishable item's OWN surface (Phase 2).
// `submittedForApprovalAt` set → "Pending approval" (brass — it's waiting on a
// publisher). Else `sentBackAt` set → "Sent back" (red; the manager's note rides a
// hover tooltip). Both absent → nothing renders. Pending wins if BOTH are set (a
// re-submitted item that once came back is, right now, waiting again). Theme-aware
// via the brass hook; safe to drop anywhere — it self-hides when there's no state.
export const SubmissionBadge = ({
  submittedForApprovalAt,
  sentBackAt,
  sentBackNote,
  size = 'sm',
}: {
  submittedForApprovalAt?: string | null;
  sentBackAt?: string | null;
  sentBackNote?: string | null;
  size?: string;
}) => {
  const brass = useBrass();
  const pending =
    typeof submittedForApprovalAt === 'string' && submittedForApprovalAt !== '';
  const sentBack = typeof sentBackAt === 'string' && sentBackAt !== '';

  if (pending) {
    return (
      <Badge
        size={size}
        variant="light"
        styles={{
          root: {
            color: brass,
            backgroundColor: `${brass}1F`,
            borderColor: `${brass}55`,
          },
        }}
      >
        Pending approval
      </Badge>
    );
  }

  if (sentBack) {
    const badge = (
      <Badge size={size} variant="light" color="red">
        Sent back
      </Badge>
    );
    const note = typeof sentBackNote === 'string' ? sentBackNote.trim() : '';
    return note !== '' ? (
      <Tooltip label={note} multiline maw={280} withArrow>
        {badge}
      </Tooltip>
    ) : (
      badge
    );
  }

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED DESK KIT (marketing-tabs upgrade — the 4 build-once primitives)
// (spec docs/superpowers/specs/2026-07-10-marketing-tabs-upgrade-audit.md §4)
//
// The single biggest leverage across the Marketing hub: most tabs are weak in the
// SAME ways (Title+dimmed-subtitle boilerplate, `active/idle` status-pill rows,
// "Nothing here" empties, each tab rolling its own status→colour table). Fix them
// ONCE here, reserve the brass/seal system for the working machine, and every tab
// reads as one product. These are icon-agnostic (callers pass ReactNode icons) so
// this file never pulls a tabler dependency.
// ─────────────────────────────────────────────────────────────────────────────

// (1) statusSeal — the SINGLE status→SealKind vocabulary. Campaigns, Templates,
// Site-leads and Blog stop each rolling their own tone table; one map = one colour
// grammar (red=act / amber=attention / brass=review / grey=routine / green=live).
// Case/format-insensitive: normalizes to UPPER_SNAKE, so 'needs approval',
// 'needs_approval' and 'NEEDS_APPROVAL' all land the same. Unknown → grey (routine).
const SEAL_BY_STATUS: Record<string, SealKind> = {
  // act now — a failure / hard stop the human must clear
  FAILED: 'red',
  ERROR: 'red',
  BOUNCED: 'red',
  // attention — queued / on-deck / in a send window
  SCHEDULED: 'amber',
  SENDING: 'amber',
  QUEUED: 'amber',
  PENDING: 'amber',
  NEW: 'amber',
  // review — the machine's drafts waiting on a human (maker-checker)
  NEEDS_APPROVAL: 'brass',
  NEEDS_REVIEW: 'brass',
  REVIEW: 'brass',
  DRAFT: 'brass',
  PROPOSED: 'brass',
  SUBMITTED: 'brass',
  // live — it went out / went live
  PUBLISHED: 'green',
  SENT: 'green',
  LIVE: 'green',
  ACTIVE: 'green',
  DELIVERED: 'green',
  COMPLETED: 'green',
  DONE: 'green',
  // routine — in-progress pipeline work / terminal noise
  IDEA: 'grey',
  GROUNDING: 'grey',
  DRAFTING: 'grey',
  SEO_REVIEW: 'grey',
  TRANSLATING: 'grey',
  IN_PROGRESS: 'grey',
  RUNNING: 'grey',
  PAUSED: 'grey',
  REJECTED: 'grey',
  ARCHIVED: 'grey',
};

export const statusSeal = (status: string | null | undefined): SealKind => {
  const key = String(status ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return SEAL_BY_STATUS[key] ?? 'grey';
};

// (2) SurfaceIntro / DeskHeader — the Night-Desk header, packaged. Replaces the
// `Title order={4}` + dimmed-subtitle boilerplate: an Eyebrow (the surface's
// SIGNATURE — "The newsroom" / "The campaign desk") over a one-line intent framed
// from the agent's actual job, with optional leading icon and right-aligned
// actions. One prop for the signature = instant consistency across every tab.
export const SurfaceIntro = ({
  eyebrow,
  title,
  icon,
  actions,
}: {
  /** The signature line (uppercase tracked) — the surface's organizing metaphor. */
  eyebrow: ReactNode;
  /** The one-line intent, framed from the agent's job (not a bare noun title). */
  title: ReactNode;
  /** Optional leading glyph (ReactNode so this file stays icon-agnostic). */
  icon?: ReactNode;
  /** Optional right-aligned controls (refresh, counts, primary action). */
  actions?: ReactNode;
}) => (
  <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
    <Box style={{ minWidth: 0 }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Group gap={8} align="center" mt={6} wrap="nowrap">
        {icon != null ? <Box style={{ display: 'flex', flexShrink: 0 }}>{icon}</Box> : null}
        <Text fz={20} fw={600} style={{ lineHeight: 1.25 }}>
          {title}
        </Text>
      </Group>
    </Box>
    {actions != null ? (
      <Group gap="md" wrap="nowrap" style={{ flexShrink: 0 }}>
        {actions}
      </Group>
    ) : null}
  </Group>
);

// (3) AmbientAgentCard — the marquee win. Replaces every `active/idle` /
// filled-light-outline STATUS-PILL row: an agent shown ON a real piece of work
// (what it is + what it's doing + a live pulse), not a lamp that's on or off.
// `workingOn` present → the card lights up: a Seal + a Loader pulse + the title of
// the piece it's on. Absent → a quiet "Idle" with a grey seal. Theme-aware via the
// seal hook; icon-agnostic.
export const AmbientAgentCard = ({
  label,
  icon,
  workingOn,
  detail,
  seal = 'grey',
  idleLabel = 'Idle',
}: {
  /** The agent's name — "Writer", "SEO reviewer", "Scout". */
  label: ReactNode;
  /** The agent glyph (ReactNode). */
  icon?: ReactNode;
  /** The piece of work it's on right now; null/'' → the agent is idle. */
  workingOn?: string | null;
  /** Optional second line under the work (a stage, a count, a due). */
  detail?: ReactNode;
  /** Seal colour while working (defaults grey → routine). */
  seal?: SealKind;
  /** Copy shown when idle. */
  idleLabel?: string;
}) => {
  const sealColors = useSeal();
  const working = typeof workingOn === 'string' && workingOn.trim() !== '';
  const dot = working ? seal : 'grey';
  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      style={{
        minWidth: 0,
        opacity: working ? 1 : 0.72,
        borderColor: working ? `${sealColors[dot]}55` : undefined,
      }}
    >
      <Stack gap={6}>
        <Group gap={8} wrap="nowrap" align="center">
          {icon != null ? (
            <Box style={{ display: 'flex', flexShrink: 0, color: sealColors[dot] }}>{icon}</Box>
          ) : null}
          <Text size="sm" fw={600} style={{ flex: 1, minWidth: 0 }} truncate>
            {label}
          </Text>
          <Seal kind={dot} />
          {working ? <Loader size={12} color={sealColors[dot]} /> : null}
        </Group>
        {working ? (
          <Text size="xs" c="dimmed" lineClamp={1}>
            on <Text span fw={500} c="var(--mantine-color-text)">{workingOn}</Text>
          </Text>
        ) : (
          <Text size="xs" c="dimmed">
            {idleLabel}
          </Text>
        )}
        {detail != null ? (
          <Text size="xs" c="dimmed" lineClamp={1}>
            {detail}
          </Text>
        ) : null}
      </Stack>
    </Paper>
  );
};

// (4) InvitingEmpty — one warm empty state to kill the scattered "Nothing here" /
// "No X yet" variants: a glyph, a human sentence, an optional way forward. Reads as
// "the desk is quiet — here's how to start", never a dead end.
export const InvitingEmpty = ({
  icon,
  title,
  message,
  cta,
  compact = false,
}: {
  /** Optional glyph (ReactNode). */
  icon?: ReactNode;
  /** The human headline — "The desk is quiet". */
  title: string;
  /** Optional supporting sentence with the way forward. */
  message?: ReactNode;
  /** Optional CTA (a Button) so the empty offers an action, not just prose. */
  cta?: ReactNode;
  /** Tighter padding for an in-column empty (kanban) vs a full-tab empty. */
  compact?: boolean;
}) => (
  <Paper withBorder radius="md" p={compact ? 'md' : 'xl'} style={{ borderStyle: 'dashed' }}>
    <Center>
      <Stack gap={compact ? 4 : 8} align="center" style={{ textAlign: 'center', maxWidth: 320 }}>
        {icon != null ? (
          <Box style={{ display: 'flex', color: 'var(--mantine-color-dimmed)' }}>{icon}</Box>
        ) : null}
        <Text size={compact ? 'xs' : 'sm'} fw={600}>
          {title}
        </Text>
        {message != null ? (
          <Text size="xs" c="dimmed">
            {message}
          </Text>
        ) : null}
        {cta != null ? <Box mt={compact ? 2 : 6}>{cta}</Box> : null}
      </Stack>
    </Center>
  </Paper>
);

// ─────────────────────────────────────────────────────────────────────────────
// SHARED KANBAN PRIMITIVES (marketing-tabs upgrade — the newsroom board, extracted)
//
// The Blog "newsroom" (BlogTab) is the flagship status-column board. These two
// primitives are its column + board, lifted out verbatim so the Landing pages,
// Social and Email boards render with byte-identical column headers, spacing and
// card affordances — one grammar, four channels. Icon-agnostic (callers pass a
// styled ReactNode) so this file keeps its no-tabler-dependency contract.
// ─────────────────────────────────────────────────────────────────────────────

// A whole card is the click target that opens its detail drawer; the inner
// Approve/Reject/Retry/Submit buttons withhold the click so they still act inline.
// Real DOM here (the twenty-front hero, not the sandbox) → stopPropagation is
// reliable. Callers spread {...clickableCard(onOpen)} onto the card <Paper>, and
// call stop(e) at the top of any inner button handler.
export const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export const clickableCard = (onOpen: () => void) => ({
  style: { cursor: 'pointer' as const },
  onClick: onOpen,
  role: 'button' as const,
  tabIndex: 0,
  onKeyDown: (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  },
});

// One kanban column: an icon + title + count badge over a vertical stack of cards,
// or the inviting empty when the lane is quiet. (Was BlogTab's private NewsroomLane;
// now shared so every marketing board's columns match.)
export const KanbanColumn = ({
  title,
  count,
  icon,
  empty,
  children,
}: {
  title: ReactNode;
  count: number;
  /** A styled glyph, e.g. <IconSparkles size={15} style={{ color: 'var(--mantine-color-dimmed)' }} />. */
  icon?: ReactNode;
  /** Rendered in place of children when count === 0 (usually an <InvitingEmpty compact />). */
  empty: ReactNode;
  children: ReactNode;
}) => (
  <Stack gap="sm" style={{ minWidth: 0 }}>
    <Group gap={6} wrap="nowrap">
      {icon != null ? <Box style={{ display: 'flex', flexShrink: 0 }}>{icon}</Box> : null}
      <Text size="sm" fw={700}>
        {title}
      </Text>
      <Badge size="xs" variant="light" color="gray" radius="sm">
        {count}
      </Badge>
    </Group>
    <Stack gap="sm">{count === 0 ? empty : children}</Stack>
  </Stack>
);

// The board grid the columns sit in. Same responsive grammar the newsroom uses;
// callers pass `cols` to match their column count (blog + campaigns = 5, social &
// landing = 4). Defaults to the 5-lane newsroom layout.
export const KanbanBoard = ({
  children,
  cols = { base: 1, sm: 2, lg: 5 },
}: {
  children: ReactNode;
  cols?: { base?: number; sm?: number; md?: number; lg?: number };
}) => (
  <SimpleGrid cols={cols} spacing="md">
    {children}
  </SimpleGrid>
);
