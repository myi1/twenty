import { type ReactNode, useContext } from 'react';
import { Badge, Box, Text, Tooltip } from '@mantine/core';
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
