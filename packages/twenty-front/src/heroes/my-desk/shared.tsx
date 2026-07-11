// shared.tsx — presentational primitives shared across the My Desk hero's
// surfaces (Today Strip / board / rail today; TodayStrip.tsx / BoardTable.tsx /
// RightRail.tsx split out in Task 12). Every color/font/radius/spacing value
// comes from ../_pulse — no local design tokens.

import type { ReactNode } from 'react';

import { RADIUS, SPACE } from '../_pulse/pulse-tokens';
import { FONT_UI, P } from '../_pulse/pulse';

/** Body text in the Nocturne register; `muted` drops to the secondary ink. */
export const Text = ({
  muted,
  children,
}: {
  muted?: boolean;
  children: ReactNode;
}) => (
  <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: muted ? P.ink2 : P.ink }}>
    {children}
  </div>
);

// Skeletons — each bar's height approximates the REAL row it stands in for
// (callers pass the measured row height), so the loading→loaded swap doesn't
// shift the layout. Bar COUNTS are placeholders only — they're a plausible
// page shape, not a claim about how many rows are actually coming.
export const SkeletonBar = ({ height }: { height: number }) => (
  <div
    style={{
      height,
      borderRadius: RADIUS.sm,
      background: 'var(--p-surface-2)',
      opacity: 0.6,
    }}
  />
);

export const SkeletonStack = ({ rows, height }: { rows: number; height: number }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
    {Array.from({ length: rows }, (_, i) => (
      <SkeletonBar key={i} height={height} />
    ))}
  </div>
);
