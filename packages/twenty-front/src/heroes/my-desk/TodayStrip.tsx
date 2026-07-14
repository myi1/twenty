// TodayStrip.tsx — the 4 clickable KPI tiles atop the desk (mockup L865–888,
// DESIGN.md §4). Lifted out of index.tsx's inline scaffold per Task 12.
//
// Each tile is a CONTROL, not just a readout (spec §3.1): clicking one sets
// index.tsx's `stripFilter`, which BoardTable ANDs against its own lane/cold
// chip filter; clicking the same tile again clears it. "Needs you now" is the
// one alarmed tile — terracotta figure + a pulsing seal dot; the other three
// stay gold/mono (DESIGN.md §2.1 accent discipline: brass/gold are the only
// chromatic chrome accents, terracotta is a status semantic used sparingly).
//
// Tokens only: every color/font/duration below is a ../_pulse export, or a
// CSS var THAT LEDGER already declares (var(--p-bad) etc. — see pulse.tsx's
// NOCTURNE_DARK_VARS/LIGHT_VARS). No local hex/ms literals.

import { keyframes } from '@emotion/react';
import styled from '@emotion/styled';

import { DUR, EASE } from '../_pulse/pulse-tokens';
import { FONT_MONO, FONT_UI, P } from '../_pulse/pulse';

import { bandOf } from './banding';
import { formatClock } from './format';
import { StyledTodayStripGrid } from './responsive';
import { SkeletonBar } from './shared';
import type { DeskRailOk, DeskRow } from './types';

export type StripFilter = 'slaAtRisk' | 'viewingToday' | 'unreadWa' | 'taskDueToday';

// Reserves the hint line's height while its content is still unknown (a plain
// space whitespace-collapses to zero height and reserves nothing) — carried
// over from index.tsx's original S1 scaffold rationale.
const LINE_PLACEHOLDER = ' ';

const pulseDot = keyframes`
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.6); opacity: 0.45; }
`;

const PulsingDot = styled.span`
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex: none;
  background: var(--p-bad);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--p-bad) 42%, transparent);
  animation: ${pulseDot} 1.6s ${EASE.inOut} infinite;
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Arrow = styled.span`
  color: var(--p-accent);
  opacity: 0;
  margin-left: 5px;
  transition:
    opacity ${DUR.tooltip}ms ${EASE.out},
    transform ${DUR.tooltip}ms ${EASE.out};
`;

const TileButton = styled.button<{ $active: boolean; $urgent: boolean }>`
  all: unset;
  box-sizing: border-box;
  display: block;
  width: 100%;
  padding: 14px 18px 16px;
  cursor: pointer;
  background: ${({ $active, $urgent }) =>
    $active
      ? 'color-mix(in srgb, var(--p-accent) 14%, var(--p-surface))'
      : $urgent
        ? 'color-mix(in srgb, var(--p-bad) 12%, transparent)'
        : 'var(--p-surface)'};
  transition: background ${DUR.tooltip}ms ${EASE.out};
  &:disabled {
    cursor: default;
  }
  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:disabled) {
      background: ${({ $active, $urgent }) =>
        $active
          ? 'color-mix(in srgb, var(--p-accent) 18%, var(--p-surface))'
          : $urgent
            ? 'color-mix(in srgb, var(--p-bad) 20%, var(--p-surface))'
            : 'var(--p-surface-2)'};
    }
    &:hover:not(:disabled) .md-strip-arrow {
      opacity: 1;
      transform: translateX(2px);
    }
  }
`;

type TileSpec = {
  key: StripFilter;
  label: string;
  status: 'loading' | 'ready' | 'error';
  figure: number | null;
  hint: string;
  urgent?: boolean;
};

export const TodayStrip = ({
  boardStatus,
  rows,
  railStatus,
  rail,
  nowMs,
  activeFilter,
  onToggleFilter,
}: {
  boardStatus: 'loading' | 'ready' | 'error';
  rows: DeskRow[];
  railStatus: 'loading' | 'ready' | 'error';
  rail: DeskRailOk | null;
  nowMs: number;
  activeFilter: StripFilter | null;
  onToggleFilter: (filter: StripFilter) => void;
}) => {
  // "Needs you now" is the ONE tile sourced from the board (not the rail) —
  // it counts every slaAtRisk row in the full paged board, not just the
  // rail's priorityLeads (which is capped at RAIL_CAP=10 server-side).
  const slaAtRiskCount =
    boardStatus === 'ready' ? rows.filter((r) => bandOf(r, nowMs) === 'slaAtRisk').length : null;

  const nextViewingClock =
    rail && rail.viewings.length > 0 ? formatClock(rail.viewings[0]?.scheduledAt ?? null) : null;

  const tiles: TileSpec[] = [
    {
      key: 'slaAtRisk',
      label: 'Needs you now',
      status: boardStatus,
      figure: slaAtRiskCount,
      hint:
        slaAtRiskCount !== null && slaAtRiskCount > 0
          ? 'leads about to breach the reply window'
          : 'all replies are on time',
      urgent: true,
    },
    {
      key: 'viewingToday',
      label: 'Viewings today',
      status: railStatus,
      figure: rail ? rail.viewings.length : null,
      hint: nextViewingClock ? `next at ${nextViewingClock}` : 'none scheduled',
    },
    {
      key: 'unreadWa',
      label: 'Unread WhatsApp',
      status: railStatus,
      figure: rail ? rail.unreadWa.reduce((n, item) => n + (item.unreadCount ?? 1), 0) : null,
      hint: rail && rail.unreadWa.length > 0 ? 'conversations waiting on a reply' : 'all caught up',
    },
    {
      key: 'taskDueToday',
      label: 'Tasks due today',
      status: railStatus,
      figure: rail ? rail.tasks.length : null,
      hint: rail && rail.tasks.length > 0 ? "on today's list" : 'nothing due today',
    },
  ];

  return (
    <StyledTodayStripGrid>
      {tiles.map((tile) => {
        const active = activeFilter === tile.key;
        const showPulse = Boolean(tile.urgent) && tile.status === 'ready' && (tile.figure ?? 0) > 0;
        return (
          <TileButton
            key={tile.key}
            type="button"
            $active={active}
            $urgent={Boolean(tile.urgent)}
            disabled={tile.status !== 'ready'}
            aria-pressed={active}
            onClick={() => onToggleFilter(tile.key)}
          >
            <div
              style={{
                fontFamily: FONT_UI,
                fontSize: 12,
                fontWeight: 500,
                color: P.ink2,
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              {showPulse ? <PulsingDot /> : null}
              {tile.label}
            </div>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontWeight: 500,
                fontSize: 27,
                lineHeight: 1,
                letterSpacing: '-0.01em',
                fontVariantNumeric: 'tabular-nums',
                color:
                  tile.status === 'error'
                    ? P.ink2
                    : tile.urgent
                      ? 'var(--p-bad)'
                      : 'var(--p-accent-strong)',
              }}
            >
              {tile.status === 'error' ? (
                '—'
              ) : tile.status === 'loading' || tile.figure === null ? (
                <SkeletonBar height={27} />
              ) : (
                tile.figure
              )}
            </div>
            <div
              style={{
                fontFamily: FONT_UI,
                fontSize: 11.5,
                marginTop: 6,
                color: P.ink2,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {tile.status === 'error'
                ? "Couldn't load"
                : tile.status === 'loading'
                  ? LINE_PLACEHOLDER
                  : tile.hint}
              {tile.status === 'ready' ? <Arrow className="md-strip-arrow">→</Arrow> : null}
            </div>
          </TileButton>
        );
      })}
    </StyledTodayStripGrid>
  );
};
