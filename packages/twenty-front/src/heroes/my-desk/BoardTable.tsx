// BoardTable.tsx — the centerpiece: a read-only, needs-you-first triage table
// (mockup L897–1127, spec §3.2–3.3). Lifted out of index.tsx's inline
// BoardList/BoardRow per Task 12.
//
// SCOPE NOTE (read this before adding urgency colors): row-level band
// TREATMENTS — red wash on slaAtRisk/overdue, the brass "today" tick on
// next-action, the amber "N ago — going cold" stamp + faded lane bar — are
// Task 14 scope ("The SLA draining ring + triage treatments"), not this
// file's. Task 12 only needs the STRUCTURE (columns, chips, lane
// recognition, sort order as given) plus the "Going cold" chip's FILTER
// (banding.ts's isGoingCold) and the "Needs you now" strip-filter pass-
// through (banding.ts's bandOf) — both filters work today; the paint that
// would visually distinguish a going-cold row from any other lands in Task 14.
// Don't preempt that task's diff by inventing band-driven colors here.

import { useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type MouseEvent as ReactMouseEvent } from 'react';
import styled from '@emotion/styled';
import { IconCalendar, IconClock, IconComment, IconExternalLink, IconNotes, IconPhone } from 'twenty-ui/display';

import { DUR, EASE, SPACE } from '../_pulse/pulse-tokens';
import { FONT_DISPLAY, FONT_MONO, FONT_UI, P, Seal } from '../_pulse/pulse';

import { bandOf, isGoingCold } from './banding';
import type { StripFilter } from './TodayStrip';
import { formatAedTotal, formatRelative, formatStageLabel, friendlyError } from './format';
import { SkeletonStack, Text } from './shared';
import type { DeskLane, DeskRow } from './types';

// ── Lane recognition — dot + 3px left-edge bar (mockup's --lane-* vars) ─────
// The mockup's standalone CSS declares --lane-resale/--lane-offplan/etc., but
// those vars are NOT part of ../_pulse's ledger (only pulse.tsx's
// NOCTURNE_DARK_VARS/LIGHT_VARS are real at runtime) — mirroring them here
// would be a new local token, which the hard rule forbids. Instead each lane
// is mapped to the NEAREST existing _pulse var by hex distance to the
// mockup's swatch (exact hex matches noted; approximations flagged):
//   secondaryOpportunity → --p-accent        (exact: mockup's --lane-resale #C6A86C)
//   offplanOpportunity   → --seal-new        (exact: mockup's --lane-offplan #6f97b4)
//   rcbiOpportunity      → --p-good          (exact: mockup's --lane-rcbi #7F9B6E)
//   deal                 → --p-accent-strong (exact: mockup's --lane-deal #E4C988)
//   lead                 → --seal-new        (mockup's own "Lead" row style —
//                           same color as off-plan; the mockup has no
//                           dedicated --lane-lead var, a lead isn't in a
//                           lane yet)
//   institutionalOpportunity → --p-warn      (nearest to mockup's --lane-inst
//                           #b58a4c — no exact _pulse token)
//   listing              → --p-bad           (nearest to mockup's --lane-listing
//                           #c07a56 — no exact _pulse token; reuses the
//                           "bad"/urgent hue family, flagged for design review)
//   sellOpportunity      → --seal-nurt        (no mockup precedent for this
//                           lane at all — lifecycles.md's ④ Mandate/Supply;
//                           picked the one remaining distinct, unused token)
// CONCERN for design review: lead and offplanOpportunity share a dot color
// (matches the mockup's own choice), and institutional/listing are
// approximations, not exact swatches. Flagged in the Task 12 report.
const LANE_COLOR: Record<DeskLane, string> = {
  lead: 'var(--seal-new)',
  secondaryOpportunity: 'var(--p-accent)',
  sellOpportunity: 'var(--seal-nurt)',
  offplanOpportunity: 'var(--seal-new)',
  rcbiOpportunity: 'var(--p-good)',
  institutionalOpportunity: 'var(--p-warn)',
  listing: 'var(--p-bad)',
  deal: 'var(--p-accent-strong)',
};

const LANE_LABEL: Record<DeskLane, string> = {
  lead: 'Lead',
  secondaryOpportunity: 'Resale',
  sellOpportunity: 'Seller',
  offplanOpportunity: 'Off-plan',
  rcbiOpportunity: 'RCBI',
  institutionalOpportunity: 'Institutional',
  listing: 'Listing',
  deal: 'Deal',
};

const ALL_LANES: DeskLane[] = [
  'lead',
  'secondaryOpportunity',
  'sellOpportunity',
  'offplanOpportunity',
  'rcbiOpportunity',
  'institutionalOpportunity',
  'listing',
  'deal',
];

type LaneFilter = 'all' | 'goingCold' | DeskLane;

// ── Column ergonomics (spec §4.1) ───────────────────────────────────────────
// Opportunity / Pipeline / Stage / Value / Next action / Last touch — the
// live grid-template-columns string, resizable via 7px header-boundary drag
// handles; double-click a boundary resets JUST that column back to its
// default minmax() token. Mirrors the mockup's own resize algorithm (L1651–
// 1714) but anchors each handle to its OWN header cell via `left: 100%`
// instead of measuring/positioning via getBoundingClientRect on every
// render — CSS grid already puts the cell in the right place, so the handle
// rides along for free, including live width changes mid-drag.
const COL_DEFAULTS: readonly string[] = [
  'minmax(162px,1.6fr)',
  'minmax(95px,1fr)',
  'minmax(104px,1fr)',
  'minmax(85px,0.8fr)',
  'minmax(129px,1.6fr)',
  '132px',
];
// Px floors while dragging — column 0's CSS default reads 162px, but (as in
// the reference mockup, whose own drag code enforces 180) the runtime floor
// while resizing is 180; last column is fixed, never resized.
const COL_MINS: readonly number[] = [180, 95, 104, 85, 129, 132];
const TABLE_MIN_WIDTH = 835; // matches the mockup's .thead/.row min-width verbatim

const ROW_HEIGHT = 60; // mockup's .row height

const HeaderCell = styled.div`
  position: relative;
  font-family: ${FONT_MONO};
  font-size: 9.5px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--p-ink-2);
  font-weight: 500;
  min-width: 0;
`;

const ResizeHandle = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 100%;
  margin-left: 4.5px;
  width: 7px;
  cursor: col-resize;
  z-index: 10;
  &::after {
    content: '';
    position: absolute;
    left: 3px;
    top: 5px;
    bottom: 5px;
    width: 1px;
    background: transparent;
    transition: background 120ms ${EASE.out};
  }
  &:hover::after {
    background: var(--p-accent);
  }
`;

const RowEl = styled.div`
  display: grid;
  align-items: center;
  column-gap: 16px;
  padding: 0 24px 0 21px;
  height: ${ROW_HEIGHT}px;
  border-bottom: 1px solid var(--p-line);
  cursor: pointer;
  position: relative;
  transition: background ${DUR.tooltip}ms ${EASE.out};
  &:hover {
    background: var(--p-surface);
  }
`;

const LastTouch = styled.span<{ $hidden: boolean }>`
  opacity: ${({ $hidden }) => ($hidden ? 0 : 1)};
  transition: opacity ${DUR.tooltip}ms ${EASE.out};
`;

const ActionTray = styled.div<{ $visible: boolean }>`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  background: var(--p-surface);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  pointer-events: ${({ $visible }) => ($visible ? 'auto' : 'none')};
  transform: translate3d(${({ $visible }) => ($visible ? 0 : 4)}px, 0, 0);
  transition: opacity ${DUR.dropdown}ms ${EASE.out}, transform ${DUR.dropdown}ms ${EASE.out};
`;

const RowAction = styled.button`
  all: unset;
  box-sizing: border-box;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  color: var(--p-ink-2);
  border: 1px solid var(--p-line);
  background: var(--p-surface-2);
  cursor: pointer;
  &:hover { color: var(--p-ink); border-color: var(--p-accent); }
  &:disabled { cursor: not-allowed; opacity: .35; }
`;

const OverflowMenu = styled.div`
  position: fixed;
  z-index: 5000;
  width: 214px;
  padding: 6px;
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius-sm);
  background: var(--p-surface-2);
  box-shadow: var(--p-shadow-pop);
`;

const OverflowItem = styled.button`
  all: unset;
  box-sizing: border-box;
  width: 100%;
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-radius: 6px;
  color: var(--p-ink);
  font: 500 12.5px ${FONT_UI};
  cursor: pointer;
  transition: background ${DUR.tooltip}ms ${EASE.out};
  svg { color: var(--p-ink-2); }
  &:hover, &:focus-visible { background: var(--p-surface); }
`;

const Ellipsis = styled.div`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`;

const Chip = styled.button<{ $on: boolean; $cold?: boolean }>`
  all: unset;
  box-sizing: border-box;
  font-family: ${FONT_UI};
  font-size: 12px;
  color: ${({ $on }) => ($on ? 'var(--p-ink)' : 'var(--p-ink-2)')};
  cursor: pointer;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid ${({ $on }) => ($on ? 'var(--p-accent)' : 'var(--p-line)')};
  background: ${({ $on }) =>
    $on ? 'color-mix(in srgb, var(--p-accent) 12%, transparent)' : 'transparent'};
  font-weight: ${({ $on }) => ($on ? 500 : 400)};
  display: inline-flex;
  align-items: center;
  gap: 7px;
  transition:
    color ${DUR.tooltip}ms ${EASE.out},
    background ${DUR.tooltip}ms ${EASE.out},
    border-color ${DUR.tooltip}ms ${EASE.out};
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: var(--p-ink);
    }
  }
  ${({ $cold }) => ($cold ? 'margin-left: auto;' : '')}
`;

// ── Measured-truncation tooltip — appears only when a cell is actually cut
// (el.scrollWidth > el.clientWidth), matching mockup L1716–1741. ───────────
type TooltipState = { text: string; x: number; y: number } | null;
type OverflowState = { row: DeskRow; x: number; y: number } | null;

const Tooltip = ({ tooltip }: { tooltip: TooltipState }) => {
  if (!tooltip) return null;
  return (
    <div
      style={{
        position: 'fixed',
        left: Math.max(8, tooltip.x),
        top: tooltip.y,
        zIndex: 70, // Z.toast — the highest _pulse z-index tier; a tooltip is as transient as a toast
        maxWidth: 320,
        background: 'var(--p-surface-2)',
        border: '1px solid var(--p-line)',
        borderRadius: 'var(--p-radius-sm)',
        color: 'var(--p-ink)',
        fontFamily: FONT_UI,
        fontSize: 12,
        lineHeight: 1.45,
        padding: '6px 10px',
        boxShadow: 'var(--p-shadow-pop)',
        pointerEvents: 'none',
      }}
    >
      {tooltip.text}
    </div>
  );
};

export const BoardTable = ({
  status,
  rows,
  error,
  partial,
  nowMs,
  stripFilter,
  onRowClick,
  onRowAction,
}: {
  status: 'loading' | 'ready' | 'error';
  rows: DeskRow[];
  error: string | null;
  /** Later pages failed AFTER rows were already painted — keep them on screen. */
  partial: boolean;
  nowMs: number;
  /** Active Today Strip tile, if any — ANDed with the lane/cold chip below. */
  stripFilter: StripFilter | null;
  /** Row click opens the peek drawer; action clicks are kept separate below. */
  onRowClick: (row: DeskRow) => void;
  onRowAction: (action: 'call' | 'whatsapp' | 'note' | 'task' | 'viewing' | 'snooze' | 'open', row: DeskRow) => void;
}) => {
  const [laneFilter, setLaneFilter] = useState<LaneFilter>('all');
  const [actionRowId, setActionRowId] = useState<string | null>(null);
  const [colWidths, setColWidths] = useState<(string | null)[]>(() => COL_DEFAULTS.map(() => null));
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [overflow, setOverflow] = useState<OverflowState>(null);
  const headerCellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragRef = useRef<{ i: number; startX: number; startWidth: number } | null>(null);
  const tooltipTimerRef = useRef<number | undefined>(undefined);

  // This stack's e.stopPropagation() is broken inside the sandbox
  // (twenty-sandbox-stopPropagation-broken gotcha) — use the useRef-flag
  // pattern instead. Each action icon's onMouseDown should set
  // `actionClickRef.current = true`; the row's onClick below checks and
  // clears that flag BEFORE calling onRowClick, so a click on an action icon
  // never also opens the drawer.
  const actionClickRef = useRef(false);

  const colsTemplate = colWidths.map((w, i) => w ?? COL_DEFAULTS[i]).join(' ');

  const totalValue = useMemo(
    () => rows.reduce((sum, r) => sum + (r.valueAed ?? 0), 0),
    [rows],
  );

  const passesStripFilter = (row: DeskRow): boolean => {
    if (!stripFilter) return true;
    if (stripFilter === 'slaAtRisk') return bandOf(row, nowMs) === 'slaAtRisk';
    if (stripFilter === 'viewingToday') return row.viewingTodayAt !== null;
    if (stripFilter === 'unreadWa') return row.unreadWa > 0;
    return row.taskDueToday === true; // 'taskDueToday'
  };

  const passesLaneFilter = (row: DeskRow): boolean => {
    if (laneFilter === 'all') return true;
    if (laneFilter === 'goingCold') return isGoingCold(row, nowMs);
    return row.laneObject === laneFilter;
  };

  const visibleRows = useMemo(
    () => rows.filter((r) => passesStripFilter(r) && passesLaneFilter(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, stripFilter, laneFilter, nowMs],
  );

  const startDrag = (i: number, e: ReactMouseEvent) => {
    e.preventDefault();
    const startWidth = headerCellRefs.current[i]?.getBoundingClientRect().width ?? COL_MINS[i];
    dragRef.current = { i, startX: e.clientX, startWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = Math.max(COL_MINS[drag.i], drag.startWidth + (ev.clientX - drag.startX));
      setColWidths((prev) => {
        const copy = [...prev];
        copy[drag.i] = `${Math.round(next)}px`;
        return copy;
      });
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const resetCol = (i: number) => {
    setColWidths((prev) => {
      const copy = [...prev];
      copy[i] = null;
      return copy;
    });
  };

  const handleTruncateEnter = (e: ReactMouseEvent<HTMLElement>, text: string) => {
    const el = e.currentTarget;
    window.clearTimeout(tooltipTimerRef.current);
    if (el.scrollWidth <= el.clientWidth + 1) return; // text fits: no tooltip
    const rect = el.getBoundingClientRect();
    tooltipTimerRef.current = window.setTimeout(() => {
      setTooltip({
        text,
        x: Math.min(rect.left, window.innerWidth - 336),
        y: rect.bottom + 6,
      });
    }, 150);
  };
  const handleTruncateLeave = () => {
    window.clearTimeout(tooltipTimerRef.current);
    setTooltip(null);
  };

  const handleRowClick = (row: DeskRow) => {
    if (actionClickRef.current) {
      actionClickRef.current = false; // consumed — an action icon was clicked, not the row
      return;
    }
    onRowClick(row);
  };

  const handleRowBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setActionRowId(null);
    }
  };

  const openOverflow = (event: ReactMouseEvent<HTMLButtonElement>, row: DeskRow) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const itemCount = 2 + (row.laneObject === 'secondaryOpportunity' ? 1 : 0) + (row.laneObject === 'lead' ? 1 : 0);
    const menuHeight = itemCount * 36 + 12;
    setOverflow({
      row,
      x: Math.max(8, Math.min(rect.right - 214, window.innerWidth - 222)),
      y: rect.bottom + 6 + menuHeight > window.innerHeight
        ? Math.max(8, rect.top - menuHeight - 6)
        : rect.bottom + 6,
    });
  };

  const chooseOverflow = (action: 'task' | 'viewing' | 'snooze' | 'open') => {
    if (!overflow) return;
    const row = overflow.row;
    setOverflow(null);
    onRowAction(action, row);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        borderRight: '1px solid var(--p-line)',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: SPACE[2],
          padding: `${SPACE[5]}px ${SPACE[6]}px ${SPACE[4]}px`,
        }}
      >
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 500, color: P.ink }}>
          All my opportunities
        </span>
        {status === 'ready' && (
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: P.ink2, fontWeight: 400 }}>
            {rows.length} open{totalValue > 0 ? ` · ~${formatAedTotal(totalValue)} in play` : ''}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: `4px ${SPACE[6]}px ${SPACE[4]}px` }}>
        <Chip type="button" $on={laneFilter === 'all'} onClick={() => setLaneFilter('all')}>
          All
        </Chip>
        {ALL_LANES.map((lane) => (
          <Chip key={lane} type="button" $on={laneFilter === lane} onClick={() => setLaneFilter(lane)}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                flex: 'none',
                background: LANE_COLOR[lane],
              }}
            />
            {LANE_LABEL[lane]}
          </Chip>
        ))}
        <Chip
          type="button"
          $on={laneFilter === 'goingCold'}
          $cold
          onClick={() => setLaneFilter('goingCold')}
        >
          <span style={{ width: 7, height: 7, borderRadius: 999, flex: 'none', background: 'var(--p-warn)' }} />
          Going cold
        </Chip>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: colsTemplate,
            columnGap: 16,
            padding: `11px ${SPACE[6]}px`,
            borderTop: '1px solid var(--p-line)',
            borderBottom: '1px solid var(--p-line)',
            minWidth: TABLE_MIN_WIDTH,
          }}
        >
          {(['Opportunity', 'Pipeline', 'Stage', 'Value', 'Next action', 'Last touch'] as const).map(
            (label, i) => (
              <HeaderCell
                key={label}
                ref={(el) => {
                  headerCellRefs.current[i] = el;
                }}
                style={{ textAlign: i === 3 || i === 5 ? 'right' : 'left' }}
              >
                {label}
                {i < 5 && (
                  <ResizeHandle
                    title="Drag to resize · double-click to reset"
                    onMouseDown={(e) => startDrag(i, e)}
                    onDoubleClick={() => resetCol(i)}
                  />
                )}
              </HeaderCell>
            ),
          )}
        </div>

        {status === 'error' && (
          <div style={{ padding: SPACE[4], minWidth: TABLE_MIN_WIDTH }}>
            <Text muted>{friendlyError(error ?? 'DESK_LOAD_FAILED')}</Text>
          </div>
        )}
        {status === 'loading' && (
          <div style={{ padding: SPACE[4], minWidth: TABLE_MIN_WIDTH }}>
            <SkeletonStack rows={7} height={ROW_HEIGHT - 8} />
          </div>
        )}
        {status === 'ready' && rows.length === 0 && (
          <div style={{ padding: SPACE[4], minWidth: TABLE_MIN_WIDTH }}>
            <Text muted>Nothing needs you right now — all replies are on time.</Text>
          </div>
        )}
        {status === 'ready' && rows.length > 0 && visibleRows.length === 0 && (
          <div style={{ padding: SPACE[4], minWidth: TABLE_MIN_WIDTH }}>
            <Text muted>Nothing matches this filter.</Text>
          </div>
        )}
        {status === 'ready' &&
          visibleRows.map((row) => (
            <RowEl
              key={row.id}
              style={{ gridTemplateColumns: colsTemplate, minWidth: TABLE_MIN_WIDTH }}
              onMouseEnter={() => setActionRowId(row.id)}
              onMouseLeave={() => setActionRowId(null)}
              onFocus={() => setActionRowId(row.id)}
              onBlur={handleRowBlur}
              onClick={() => handleRowClick(row)}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 11,
                  bottom: 11,
                  width: 3,
                  borderRadius: 3,
                  background: LANE_COLOR[row.laneObject],
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    flex: 'none',
                    border: '1px solid var(--p-line)',
                    background: P.surface2,
                    display: 'grid',
                    placeItems: 'center',
                    fontFamily: FONT_DISPLAY,
                    fontSize: 14,
                    color: P.accent,
                  }}
                >
                  {(row.name || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <Ellipsis
                    style={{ fontFamily: FONT_UI, fontSize: 13.5, fontWeight: 500, color: P.ink }}
                    onMouseEnter={(e) => handleTruncateEnter(e, row.name || 'Unnamed')}
                    onMouseLeave={handleTruncateLeave}
                  >
                    {row.name || 'Unnamed'}
                  </Ellipsis>
                  <Ellipsis
                    style={{ fontFamily: FONT_UI, fontSize: 11.5, color: P.ink2, marginTop: 1 }}
                    onMouseEnter={(e) => handleTruncateEnter(e, row.meta)}
                    onMouseLeave={handleTruncateLeave}
                  >
                    {row.meta}
                  </Ellipsis>
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    fontFamily: FONT_UI,
                    fontSize: 12.5,
                    color: P.ink,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 999,
                      flex: 'none',
                      background: LANE_COLOR[row.laneObject],
                      boxShadow: '0 0 0 3px var(--seal-ring)',
                    }}
                  />
                  {LANE_LABEL[row.laneObject]}
                </span>
              </div>

              <div style={{ minWidth: 0 }}>
                {/* Stage seal tone is a FLAT neutral ('new') for every row in
                    Task 12 — no per-lane stage→tone config has shipped to
                    this hero, and inventing a band-driven tone here would
                    duplicate/conflict with Task 14's row-treatment work.
                    Label is the raw native enum, humanized (never
                    UPPER_CASE, never a pill). */}
                <Seal tone="new" label={formatStageLabel(row.stage)} />
              </div>

              <div style={{ minWidth: 0, textAlign: 'right' }}>
                {row.valueAed !== null ? (
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 13.5,
                      color: 'var(--p-accent-strong)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ~{formatAedTotal(row.valueAed)}
                  </span>
                ) : (
                  <span style={{ fontFamily: FONT_MONO, fontSize: 13.5, color: P.ink2 }}>—</span>
                )}
              </div>

              <Ellipsis
                style={{ fontFamily: FONT_UI, fontSize: 12.5, color: P.ink2 }}
                onMouseEnter={(e) => handleTruncateEnter(e, row.nextAction ?? '')}
                onMouseLeave={handleTruncateLeave}
              >
                {row.nextAction ?? '—'}
              </Ellipsis>

              {/* Last column stays fixed at 132px so the four hover actions
                  never bleed into the next-action copy. */}
              <div style={{ textAlign: 'right', minWidth: 0, position: 'relative', height: 28, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <LastTouch
                  $hidden={actionRowId === row.id}
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 11.5,
                    color: P.ink2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatRelative(row.lastTouchAt) ?? 'no touch yet'}
                </LastTouch>
                <ActionTray $visible={actionRowId === row.id}>
                  <RowAction
                    type="button"
                    aria-label={`Call ${row.name}`}
                    title={row.phoneE164 ? 'Call' : 'No phone number'}
                    disabled={!row.phoneE164}
                    onMouseDown={() => { actionClickRef.current = true; }}
                    onClick={() => onRowAction('call', row)}
                  ><IconPhone size={13} /></RowAction>
                  <RowAction
                    type="button"
                    aria-label={`WhatsApp ${row.name}`}
                    title={!row.phoneE164 ? 'No phone number yet' : row.hasWhatsApp ? 'WhatsApp' : 'Not on WhatsApp yet'}
                    disabled={!row.phoneE164 || !row.hasWhatsApp}
                    onMouseDown={() => { actionClickRef.current = true; }}
                    onClick={() => onRowAction('whatsapp', row)}
                  ><IconComment size={13} /></RowAction>
                  <RowAction
                    type="button"
                    aria-label={`Add note for ${row.name}`}
                    title="Add note"
                    onMouseDown={() => { actionClickRef.current = true; }}
                    onClick={() => onRowAction('note', row)}
                  ><IconNotes size={13} /></RowAction>
                  <RowAction
                    type="button"
                    aria-label={`More actions for ${row.name}`}
                    title="More actions"
                    onMouseDown={() => { actionClickRef.current = true; }}
                    onClick={(event) => openOverflow(event, row)}
                  ><span aria-hidden style={{ font: `600 17px/1 ${FONT_UI}`, transform: 'translateY(-2px)' }}>⋯</span></RowAction>
                </ActionTray>
              </div>
            </RowEl>
          ))}

        {status === 'ready' && partial && (
          <div style={{ padding: `${SPACE[3]}px ${SPACE[6]}px`, minWidth: TABLE_MIN_WIDTH }}>
            <Text muted>Couldn't load the rest — showing what arrived.</Text>
          </div>
        )}
      </div>

      {overflow && (
        <>
          <button
            type="button"
            aria-label="Close more actions"
            onClick={() => setOverflow(null)}
            style={{ all: 'unset', position: 'fixed', inset: 0, zIndex: 4999 }}
          />
          <OverflowMenu
            role="menu"
            aria-label={`More actions for ${overflow.row.name}`}
            style={{ left: overflow.x, top: overflow.y }}
          >
            {overflow.row.laneObject === 'secondaryOpportunity' && (
              <OverflowItem type="button" role="menuitem" onClick={() => chooseOverflow('viewing')}>
                <IconCalendar size={15} /> Log a viewing
              </OverflowItem>
            )}
            <OverflowItem type="button" role="menuitem" onClick={() => chooseOverflow('task')}>
              <IconClock size={15} /> Create a task
            </OverflowItem>
            {overflow.row.laneObject === 'lead' && (
              <OverflowItem type="button" role="menuitem" onClick={() => chooseOverflow('snooze')}>
                <IconClock size={15} /> Snooze
              </OverflowItem>
            )}
            <OverflowItem type="button" role="menuitem" onClick={() => chooseOverflow('open')}>
              <IconExternalLink size={15} /> Open full record <span aria-hidden style={{ marginLeft: 'auto' }}>→</span>
            </OverflowItem>
          </OverflowMenu>
        </>
      )}

      <Tooltip tooltip={tooltip} />
    </div>
  );
};
