// SlaRing.tsx — the SIGNATURE element of My Desk (mockup L567–581, L949, L1350):
// a small red draining arc + live minutes countdown toward the 10-minute reply
// deadline. This is THE ONE continuously-moving thing on the screen (DESIGN.md
// §2.6 — everything else is state, not animation).
//
// It drives off the row's SLA deadline + the hero's nowMs clock. When motion is
// allowed it runs its OWN 1-second tick so the arc drains smoothly (nowMs alone
// re-snapshots only every 30s — too coarse to read as "draining"). Under
// prefers-reduced-motion it does NOT tick and does NOT transition: the arc is a
// static fraction that only changes as discrete state (when the nowMs prop
// advances), never as animation.

import { useEffect, useState } from 'react';

import { FONT_MONO } from '../_pulse/pulse';

// The reply window is 10 minutes (lead-system spec — SLA = 10min). slaDeadline
// (banding.ts / the /my-desk route) is the END of that window; the ring shows
// the fraction of the window still remaining, draining to empty at the deadline.
const SLA_WINDOW_MS = 10 * 60_000;
const R = 6; // radius in the 16×16 viewBox — matches the mockup's ring
const C = 2 * Math.PI * R; // circumference ≈ 37.699 (the mockup's stroke-dasharray)

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const SlaRing = ({
  deadline,
  nowMs,
}: {
  /** ISO reply-deadline (DeskRow.slaDeadline); null → nothing renders. */
  deadline: string | null;
  /** The hero's re-ticked clock — the reduced-motion fallback reads this. */
  nowMs: number;
}) => {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [selfNow, setSelfNow] = useState(() => Date.now());
  const deadlineMs = deadline ? Date.parse(deadline) : NaN;
  const invalid = Number.isNaN(deadlineMs);

  // Track the OS reduced-motion preference live (a user can flip it mid-session).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Per-second drain — only when motion is allowed and there is a real deadline.
  useEffect(() => {
    if (reduced || invalid) return;
    const id = window.setInterval(() => setSelfNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [reduced, invalid]);

  if (invalid) return null;

  const effectiveNow = reduced ? nowMs : Math.max(nowMs, selfNow);
  const remainingMs = deadlineMs - effectiveNow;
  const fraction = Math.max(0, Math.min(1, remainingMs / SLA_WINDOW_MS));
  const offset = C * (1 - fraction); // full ring at fraction 1, empty at 0
  const minutesLeft = Math.max(0, Math.ceil(remainingMs / 60_000));
  const label = remainingMs <= 0 ? 'now' : `${minutesLeft}m`;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: FONT_MONO,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.04em',
        color: 'var(--p-bad)',
        whiteSpace: 'nowrap',
        flex: 'none',
      }}
    >
      <svg
        width={16}
        height={16}
        viewBox="0 0 16 16"
        style={{ transform: 'rotate(-90deg)', flex: 'none' }}
        aria-hidden
      >
        <circle cx="8" cy="8" r={R} fill="none" stroke="var(--p-line)" strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r={R}
          fill="none"
          stroke="var(--p-bad)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={C}
          // Dashoffset in `style` (not attribute) so the CSS transition below
          // actually animates the drain; reduced-motion drops the transition.
          style={{
            strokeDashoffset: offset,
            transition: reduced ? undefined : 'stroke-dashoffset 1s linear',
          }}
        />
      </svg>
      {label}
    </span>
  );
};
