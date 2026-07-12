// BriefingCard.tsx — the AI v2 "morning briefing": a compact ≤3-line day-setter
// under the greeting, grounded in the acting member's OWN board + rail state
// (SLA leads, quiet deals, unconfirmed viewings, unread WhatsApp — the route
// gathers the real signals; the model only picks + phrases the top few).
//
// Rules honored:
//   · Refreshed on load (fetch once on mount).
//   · Dismissible (the × hides it for the session).
//   · A subtle shimmer while loading — never a spinner, never a layout jump
//     (the skeleton holds the card's height).
//   · Hidden ENTIRELY when AI is unavailable / the call fails — we never show a
//     broken card. An empty book comes back as one calm "all caught up" line
//     (still worth showing — it feels good), so that stays visible.
//   · Quiet Nocturne register (instrument, not bloom). Reduced-motion drops the
//     shimmer (the text still lands).

import { useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';

import { DUR, EASE } from '../_pulse/pulse-tokens';
import { FONT_MONO, FONT_UI } from '../_pulse/pulse';

import { assistBriefing } from './deskApi';

const Card = styled.div`
  position: relative;
  /* Full-bleed band — same horizontal rhythm as the top bar (24px) and flush
     with the Today strip below, so the desk header reads as three aligned bands
     rather than an inset card floating on a full-width strip. */
  margin: 0;
  padding: 13px 40px 14px 24px;
  border-bottom: 1px solid var(--p-line);
  border-left: 2px solid var(--p-accent);
  background: var(--p-surface-2);
  @media (prefers-reduced-motion: no-preference) {
    animation: briefingIn ${DUR.drawerIn}ms ${EASE.out};
  }
  @keyframes briefingIn {
    from { opacity: 0; transform: translate3d(0, -3px, 0); }
    to { opacity: 1; transform: none; }
  }
`;

const Eyebrow = styled.div`
  font-family: ${FONT_MONO};
  font-size: 9.5px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--p-accent-strong);
  margin-bottom: 8px;
`;

const Line = styled.div`
  display: flex;
  align-items: baseline;
  gap: 9px;
  font-family: ${FONT_UI};
  font-size: 13px;
  line-height: 1.5;
  color: var(--p-ink);
  & + & {
    margin-top: 5px;
  }
  &::before {
    content: '';
    flex: none;
    width: 4px;
    height: 4px;
    margin-top: 6px;
    border-radius: 50%;
    background: var(--p-accent);
  }
`;

const Dismiss = styled.button`
  all: unset;
  box-sizing: border-box;
  position: absolute;
  top: 9px;
  right: 9px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  color: var(--p-ink-2);
  cursor: pointer;
  @media (prefers-reduced-motion: no-preference) {
    transition: color ${DUR.press}ms ${EASE.out}, background ${DUR.press}ms ${EASE.out};
  }
  &:hover {
    color: var(--p-ink);
    background: var(--p-surface-3, var(--p-line));
  }
`;

// Shimmer skeleton lines — the card's height is held so nothing jumps when the
// real lines land.
const Shimmer = styled.div<{ $w: string }>`
  height: 12px;
  width: ${({ $w }) => $w};
  border-radius: 4px;
  background: linear-gradient(90deg, var(--p-line) 25%, var(--p-surface-3, var(--p-surface-2)) 37%, var(--p-line) 63%);
  background-size: 400% 100%;
  & + & {
    margin-top: 8px;
  }
  @media (prefers-reduced-motion: no-preference) {
    animation: briefingShimmer 1.4s ${EASE.inOut} infinite;
  }
  @keyframes briefingShimmer {
    0% { background-position: 100% 0; }
    100% { background-position: 0 0; }
  }
`;

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; lines: string[] }
  | { kind: 'hidden' };

export const BriefingCard = () => {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [dismissed, setDismissed] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    assistBriefing()
      .then((res) => {
        if (cancelled.current) return;
        // null (transport) / not-ok / AI unavailable → hide the card entirely.
        if (!res || !res.ok || !res.lines?.length) {
          setState({ kind: 'hidden' });
          return;
        }
        setState({ kind: 'ready', lines: res.lines });
      })
      .catch(() => {
        if (!cancelled.current) setState({ kind: 'hidden' });
      });
    return () => {
      cancelled.current = true;
    };
  }, []);

  if (dismissed || state.kind === 'hidden') return null;

  return (
    <Card role="status" aria-label="Your day at a glance">
      <Eyebrow>Your day</Eyebrow>
      {state.kind === 'loading' ? (
        <>
          <Shimmer $w="72%" />
          <Shimmer $w="54%" />
        </>
      ) : (
        <>
          {state.lines.map((line, i) => (
            <Line key={i}>{line}</Line>
          ))}
          <Dismiss type="button" aria-label="Dismiss the briefing" title="Dismiss" onClick={() => setDismissed(true)}>
            <svg viewBox="0 0 14 14" width="12" height="12" fill="none" aria-hidden>
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </Dismiss>
        </>
      )}
    </Card>
  );
};
