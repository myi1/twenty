// BoardTable.tsx — the centerpiece: a read-only, needs-you-first triage table
// (mockup L897–1127, spec §3.2–3.3). Lifted out of index.tsx's inline
// BoardList/BoardRow per Task 12.
//
// TRIAGE TREATMENTS (Task 14 — "the SLA draining ring + triage paint") live
// here: the row's band (banding.ts's bandOf/isGoingCold/needsAttentionToday —
// the ONE classifier, never reinvented) drives a subtle red wash on
// slaAtRisk/overdue rows, a brass "today" tick + full-ink next action on rows
// that need the agent today, an amber "N ago — going cold" stamp + a 35%-faded
// lane bar on going-cold rows, and the live SlaRing countdown in the last column
// of SLA-at-risk lead rows. At a squint the top of the table reads hotter than
// the bottom (rows arrive pre-sorted needs-you-first). Per-stage seal COLOR
// comes from stageTone.ts (shared with the peek drawer).

import { useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type MouseEvent as ReactMouseEvent } from 'react';
import styled from '@emotion/styled';
import { IconComment, IconNotes, IconPhone } from 'twenty-ui/display';

import { DUR, EASE, SPACE } from '../_pulse/pulse-tokens';
import { Btn, FONT_DISPLAY, FONT_MONO, FONT_UI, P, Seal } from '../_pulse/pulse';

import { bandOf, isGoingCold, needsAttentionToday } from './banding';
import { BoardKanban } from './BoardKanban';
import { SlaRing } from './SlaRing';
import { stageTone } from './stageTone';
import type { StripFilter } from './TodayStrip';
import type { LadderStep } from './gates';
import { formatAedTotal, formatRelative, formatStageLabel, friendlyError } from './format';
import { SkeletonStack, Text } from './shared';
import type { DeskLane, DeskRow } from './types';
import type { StagePickerAnchor } from './StagePicker';

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
//                           #b58a4c — no exact _pulse token; re-checked Task 14,
//                           amber reads as institutional weight, not an alarm)
//   listing              → --p-accent        (Task 14 fix: was --p-bad, which
//                           painted every listing row like an alarm. The mockup's
//                           --lane-listing is terracotta/clay #c07a56, and NO
//                           _pulse var is a true terracotta — the only orange-red
//                           match is --p-bad itself, which we're deliberately
//                           leaving. Among the non-red tokens, brass --p-accent
//                           is both the nearest by hex AND the least-alarming
//                           (calm brand tone). FLAGGED: it shares brass with
//                           secondaryOpportunity/Resale — the lane LABEL keeps
//                           them apart, same as the mockup already lets lead +
//                           off-plan share --seal-new. A true clay token would
//                           need DESIGN.md to add one.)
//   sellOpportunity      → --seal-nurt        (no mockup precedent for this
//                           lane at all — lifecycles.md's ④ Mandate/Supply;
//                           picked the one remaining distinct, unused token)
// CONCERN for design review: lead+offplan share --seal-new and listing+resale
// share --p-accent (both match/extend the mockup's own shared-dot choices); the
// lane LABEL carries the real distinction. institutional is an approximation.
export const LANE_COLOR: Record<DeskLane, string> = {
  lead: 'var(--seal-new)',
  secondaryOpportunity: 'var(--p-accent)',
  sellOpportunity: 'var(--seal-nurt)',
  offplanOpportunity: 'var(--seal-new)',
  rcbiOpportunity: 'var(--p-good)',
  institutionalOpportunity: 'var(--p-warn)',
  listing: 'var(--p-accent)',
  deal: 'var(--p-accent-strong)',
};

export const LANE_LABEL: Record<DeskLane, string> = {
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

// $urgent = slaAtRisk/overdue → a subtle red wash (mockup .row.urgent,
// --urgent-tint = --p-bad at 12%). Rebuilt from --p-bad via color-mix so it
// re-tones in both themes without a new local token. Non-urgent rows stay
// transparent (they sit over the panel's own --p-bg).
const RowEl = styled.div<{ $urgent?: boolean }>`
  display: grid;
  align-items: center;
  column-gap: 16px;
  padding: 0 24px 0 21px;
  height: ${ROW_HEIGHT}px;
  border-bottom: 1px solid var(--p-line);
  cursor: pointer;
  position: relative;
  background: ${({ $urgent }) =>
    $urgent ? 'color-mix(in srgb, var(--p-bad) 12%, transparent)' : 'transparent'};
  transition: background ${DUR.tooltip}ms ${EASE.out};
  &:hover {
    background: ${({ $urgent }) =>
      $urgent ? 'color-mix(in srgb, var(--p-bad) 12%, var(--p-surface))' : 'var(--p-surface)'};
  }
`;

const LastTouch = styled.span<{ $hidden: boolean }>`
  opacity: ${({ $hidden }) => ($hidden ? 0 : 1)};
  transition: opacity ${DUR.tooltip}ms ${EASE.out};
`;

const ActionTray = styled.div<{ $visible: boolean; $urgent?: boolean }>`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  /* Match the row's hovered background so the tray never shows a mismatched
     block on urgent (red-wash) rows — same color-mix the RowEl :hover uses. */
  background: ${({ $urgent }) =>
    $urgent ? 'color-mix(in srgb, var(--p-bad) 12%, var(--p-surface))' : 'var(--p-surface)'};
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
  min-width: 210px;
  padding: 5px 0;
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  background: var(--p-surface);
  box-shadow: var(--p-shadow-pop);
  transform-origin: top right;
  animation: my-desk-pop-in ${DUR.dropdown}ms ${EASE.out} both;

  @keyframes my-desk-pop-in {
    from { opacity: 0; transform: translateY(-4px) scale(.98); }
    to { opacity: 1; transform: none; }
  }
`;

const OverflowItem = styled.button<{ $go?: boolean }>`
  all: unset;
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  padding: ${({ $go }) => ($go ? '11px 14px 9px' : '9px 14px')};
  margin-top: ${({ $go }) => ($go ? '5px' : '0')};
  border-top: ${({ $go }) => ($go ? '1px solid var(--p-line)' : '0')};
  color: ${({ $go }) => ($go ? 'var(--p-accent)' : 'var(--p-ink)')};
  font: 400 13px ${FONT_UI};
  cursor: pointer;
  transition: background ${DUR.tooltip}ms ${EASE.out};
  &:hover, &:focus-visible { background: var(--p-surface-2); }
  &:disabled { cursor: default; opacity: .35; background: transparent; }
`;

const StageSealButton = styled.button`
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  cursor: pointer;
  &:focus-visible { box-shadow: var(--p-focus-ring); }
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

// ── View toggle (mockup .vtoggle L306–318) — a pill group in the opps header.
// Table is the default and the centerpiece; Kanban is the secondary glance. The
// active segment fills brass; the choice persists via deskState's `view` slot.
const Vtoggle = styled.div`
  display: inline-flex;
  flex: none;
  padding: 3px;
  gap: 2px;
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: 999px;
`;

const VtoggleBtn = styled.button<{ $on: boolean }>`
  all: unset;
  box-sizing: border-box;
  font-family: ${FONT_MONO};
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ $on }) => ($on ? 'var(--primary-ink)' : 'var(--p-ink-2)')};
  background: ${({ $on }) => ($on ? 'var(--p-accent)' : 'transparent')};
  padding: 6px 13px;
  border-radius: 999px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: color ${DUR.tooltip}ms ${EASE.out}, background ${DUR.tooltip}ms ${EASE.out};
  &:hover { color: ${({ $on }) => ($on ? 'var(--primary-ink)' : 'var(--p-ink)')}; }
  &:focus-visible { box-shadow: var(--p-focus-ring); }
  svg { width: 12px; height: 12px; }
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
  onRetry,
  nowMs,
  stripFilter,
  focusToday,
  view,
  onViewChange,
  onRowClick,
  onRowAction,
  onStagePick,
  onCardDrop,
  initialColWidths,
  initialLaneFilter,
  onColWidthsChange,
  onLaneFilterChange,
}: {
  status: 'loading' | 'ready' | 'error';
  rows: DeskRow[];
  error: string | null;
  /** Later pages failed AFTER rows were already painted — keep them on screen. */
  partial: boolean;
  onRetry: () => void;
  nowMs: number;
  /** Board layout — table (default centerpiece) or the secondary kanban. The
   *  header + filter chips are shared; only the body below them swaps. */
  view: 'table' | 'kanban';
  onViewChange: (view: 'table' | 'kanban') => void;
  /** Active Today Strip tile, if any — ANDed with the lane/cold chip below. */
  stripFilter: StripFilter | null;
  /** Top bar's "Today's plan" focus mode — ANDs a "needs you today" pass over
   *  every other filter, and re-labels the header count to the focused subset. */
  focusToday: boolean;
  /** Row click opens the peek drawer; action clicks are kept separate below. */
  onRowClick: (row: DeskRow) => void;
  onRowAction: (action: 'call' | 'whatsapp' | 'note' | 'task' | 'viewing' | 'snooze' | 'open', row: DeskRow) => void;
  onStagePick: (row: DeskRow, anchor: StagePickerAnchor) => void;
  /** Kanban drop → index.tsx resolves the column to the card's real target stage
   *  and drives the existing move / gate / undo flow. */
  onCardDrop: (row: DeskRow, step: LadderStep, anchor: { x: number; y: number }) => void;
  // ── Per-agent persistence (spec §4.3/§8.3) ──────────────────────────────────
  // These are OPTIONAL so BoardTable still renders identically when unwired
  // (defensive — a bad restore can never leave the table stateless). Column
  // widths are otherwise lost on reload; the lane chip is one of the two
  // "active filter chips" the desk remembers.
  /** Restored column widths (6 entries; null = that column's default). */
  initialColWidths?: (string | null)[];
  /** Restored lane chip ('all' | 'goingCold' | a DeskLane); anything else → 'all'. */
  initialLaneFilter?: string;
  /** Fired at the END of a resize / on reset — never every drag frame. */
  onColWidthsChange?: (widths: (string | null)[]) => void;
  onLaneFilterChange?: (laneFilter: LaneFilter) => void;
}) => {
  // Restore the lane chip only if it's a value this table actually knows.
  const seededLaneFilter: LaneFilter =
    initialLaneFilter === 'all' ||
    initialLaneFilter === 'goingCold' ||
    (initialLaneFilter && (ALL_LANES as string[]).includes(initialLaneFilter))
      ? (initialLaneFilter as LaneFilter)
      : 'all';
  const seededColWidths =
    Array.isArray(initialColWidths) && initialColWidths.length === COL_DEFAULTS.length
      ? initialColWidths
      : COL_DEFAULTS.map(() => null);

  const [laneFilter, setLaneFilter] = useState<LaneFilter>(seededLaneFilter);
  const [actionRowId, setActionRowId] = useState<string | null>(null);
  const [colWidths, setColWidths] = useState<(string | null)[]>(seededColWidths);

  const changeLaneFilter = (next: LaneFilter) => {
    setLaneFilter(next);
    onLaneFilterChange?.(next);
  };
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

  // How many of the open book needs the agent today — drives the header count
  // when focus mode is on (independent of the lane/strip chips, so the number
  // always reads "of everything, this many need you today").
  const focusCount = useMemo(
    () => rows.filter((r) => needsAttentionToday(r, nowMs)).length,
    [rows, nowMs],
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
    () =>
      rows.filter(
        (r) =>
          passesStripFilter(r) &&
          passesLaneFilter(r) &&
          (!focusToday || needsAttentionToday(r, nowMs)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, stripFilter, laneFilter, nowMs, focusToday],
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
      // Persist ONCE, at drag end — the debounced save already coalesces, but
      // emitting per-frame would be wasteful. Read the settled widths off state.
      setColWidths((prev) => {
        onColWidthsChange?.(prev);
        return prev;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const resetCol = (i: number) => {
    setColWidths((prev) => {
      const copy = [...prev];
      copy[i] = null;
      onColWidthsChange?.(copy);
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
    const itemCount = 5;
    const menuHeight = itemCount * 36 + 10;
    setOverflow({
      row,
      x: Math.max(8, Math.min(rect.right - 210, window.innerWidth - 218)),
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

  const chooseStage = () => {
    if (!overflow || overflow.row.laneObject === 'lead') return;
    const { row, x, y } = overflow;
    setOverflow(null);
    onStagePick(row, { x, y });
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
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: SPACE[4],
          padding: `${SPACE[5]}px ${SPACE[6]}px ${SPACE[4]}px`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE[2], minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 500, color: P.ink }}>
            All my opportunities
          </span>
          {status === 'ready' && (
            <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: P.ink2, fontWeight: 400 }}>
              {focusToday
                ? `${focusCount} need you today · of ${rows.length} open`
                : `${rows.length} open${totalValue > 0 ? ` · ~${formatAedTotal(totalValue)} in play` : ''}`}
            </span>
          )}
          {status === 'ready' && focusToday && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: FONT_UI,
                fontSize: 11.5,
                fontWeight: 500,
                color: P.ink,
                padding: '3px 10px',
                borderRadius: 999,
                border: '1px solid var(--p-accent)',
                background: 'var(--p-accent-tint)',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 999, background: P.accent, flex: 'none' }} />
              Focus: today
            </span>
          )}
        </div>
        <Vtoggle role="group" aria-label="Board view">
          <VtoggleBtn
            type="button"
            $on={view === 'table'}
            aria-pressed={view === 'table'}
            title="Table view"
            onClick={() => onViewChange('table')}
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 3.5h12M2 8h12M2 12.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Table
          </VtoggleBtn>
          <VtoggleBtn
            type="button"
            $on={view === 'kanban'}
            aria-pressed={view === 'kanban'}
            title="Kanban view"
            onClick={() => onViewChange('kanban')}
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden>
              <rect x="2" y="2.5" width="3.4" height="11" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <rect x="6.3" y="2.5" width="3.4" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <rect x="10.6" y="2.5" width="3.4" height="9" rx="1" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            Kanban
          </VtoggleBtn>
        </Vtoggle>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: `4px ${SPACE[6]}px ${SPACE[4]}px` }}>
        <Chip type="button" $on={laneFilter === 'all'} onClick={() => changeLaneFilter('all')}>
          All
        </Chip>
        {ALL_LANES.map((lane) => (
          <Chip key={lane} type="button" $on={laneFilter === lane} onClick={() => changeLaneFilter(lane)}>
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
          onClick={() => changeLaneFilter('goingCold')}
        >
          <span style={{ width: 7, height: 7, borderRadius: 999, flex: 'none', background: 'var(--p-warn)' }} />
          Going cold
        </Chip>
      </div>

      {view === 'kanban' ? (
        <BoardKanban
          status={status}
          rows={visibleRows}
          error={error}
          partial={partial}
          onRetry={onRetry}
          nowMs={nowMs}
          onRowClick={onRowClick}
          onCardDrop={onCardDrop}
        />
      ) : (
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
            <Text muted>
              {focusToday
                ? 'Nothing needs you today — you are all caught up.'
                : 'Nothing matches this filter.'}
            </Text>
          </div>
        )}
        {status === 'ready' &&
          visibleRows.map((row) => {
            // The ONE classifier (banding.ts) drives every row treatment below —
            // never reinvented here.
            const band = bandOf(row, nowMs);
            const urgent = band === 'slaAtRisk' || band === 'overdue';
            const today = needsAttentionToday(row, nowMs);
            const cold = isGoingCold(row, nowMs);
            return (
            <RowEl
              key={row.id}
              data-testid={`desk-row-${row.id}`}
              $urgent={urgent}
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
                  // going cold → lane bar fades back (mockup .row.cold::before)
                  opacity: cold ? 0.35 : 1,
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
                {/* Per-stage seal COLOR from stageTone.ts (Task 14) — red for a
                    lead's reply-now urgency, gold for money-hot stages, green for
                    live, amber for pending, blue for early, grey otherwise. Label
                    is the raw native enum, humanized (never UPPER_CASE, never a
                    pill). */}
                {row.laneObject === 'lead' ? (
                  <Seal tone={stageTone(row.stage, row.laneObject)} label={formatStageLabel(row.stage)} />
                ) : (
                  <StageSealButton
                    type="button"
                    aria-label={`Move ${row.name} to another stage`}
                    title="Move stage"
                    onMouseDown={() => { actionClickRef.current = true; }}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      onStagePick(row, { x: rect.left, y: rect.bottom + 6 });
                    }}
                  >
                    <Seal tone={stageTone(row.stage, row.laneObject)} label={formatStageLabel(row.stage)} />
                  </StageSealButton>
                )}
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

              {/* Needs-you-today → brass tick + full-ink next action (mockup
                  .row.today .next). The tick sits OUTSIDE the ellipsizing span
                  so truncation still works on the text. */}
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                {today && (
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      flex: 'none',
                      background: P.accent,
                      marginRight: 7,
                    }}
                  />
                )}
                <Ellipsis
                  style={{
                    fontFamily: FONT_UI,
                    fontSize: 12.5,
                    color: today ? P.ink : P.ink2,
                    fontWeight: today ? 500 : 400,
                  }}
                  onMouseEnter={(e) => handleTruncateEnter(e, row.nextAction ?? '')}
                  onMouseLeave={handleTruncateLeave}
                >
                  {row.nextAction ?? '—'}
                </Ellipsis>
              </div>

              {/* Last column stays fixed at 132px so the four hover actions
                  never bleed into the next-action copy. */}
              <div style={{ textAlign: 'right', minWidth: 0, position: 'relative', height: 28, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                {band === 'slaAtRisk' ? (
                  // SLA-at-risk lead (slaDeadline in the future) → the live
                  // draining ring + countdown, in place of the last-touch stamp.
                  // Crossfades to the row actions on hover, same as LastTouch.
                  <LastTouch $hidden={actionRowId === row.id} style={{ display: 'inline-flex' }}>
                    <SlaRing deadline={row.slaDeadline} nowMs={nowMs} />
                  </LastTouch>
                ) : (
                  <LastTouch
                    $hidden={actionRowId === row.id}
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 11.5,
                      // going cold → amber stamp (mockup .row.cold .touch)
                      color: cold ? 'var(--p-warn)' : P.ink2,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatRelative(row.lastTouchAt) ?? 'no touch yet'}
                    {cold ? ' — going cold' : ''}
                  </LastTouch>
                )}
                <ActionTray $visible={actionRowId === row.id} $urgent={urgent}>
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
                  ><svg width={13} height={13} viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="3.5" cy="8" r="1.1" fill="currentColor" /><circle cx="8" cy="8" r="1.1" fill="currentColor" /><circle cx="12.5" cy="8" r="1.1" fill="currentColor" /></svg></RowAction>
                </ActionTray>
              </div>
            </RowEl>
            );
          })}

        {status === 'ready' && partial && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: SPACE[3],
              padding: `${SPACE[3]}px ${SPACE[6]}px`,
              minWidth: TABLE_MIN_WIDTH,
            }}
          >
            <Text muted>Couldn't load the rest — showing what arrived.</Text>
            <Btn type="button" variant="secondary" onClick={onRetry}>
              Retry board load
            </Btn>
          </div>
        )}
      </div>
      )}

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
            <OverflowItem
              type="button"
              role="menuitem"
              disabled={overflow.row.laneObject !== 'secondaryOpportunity'}
              title={overflow.row.laneObject === 'secondaryOpportunity' ? 'Log a viewing' : 'Viewings are linked to buyer opportunities'}
              onClick={() => chooseOverflow('viewing')}
            >
              Log a viewing
            </OverflowItem>
            <OverflowItem type="button" role="menuitem" onClick={() => chooseOverflow('task')}>
              Create a task
            </OverflowItem>
            <OverflowItem
              type="button"
              role="menuitem"
              disabled={overflow.row.laneObject === 'lead'}
              title={overflow.row.laneObject === 'lead' ? 'Convert this lead to a pipeline before moving its stage' : 'Move stage'}
              onClick={chooseStage}
            >
              Move stage
            </OverflowItem>
            <OverflowItem
              type="button"
              role="menuitem"
              disabled={overflow.row.laneObject !== 'lead'}
              title={overflow.row.laneObject === 'lead' ? 'Snooze' : 'Snooze is only available for unconverted leads'}
              onClick={() => chooseOverflow('snooze')}
            >
              Snooze
            </OverflowItem>
            <OverflowItem $go type="button" role="menuitem" onClick={() => chooseOverflow('open')}>
              Open full record →
            </OverflowItem>
          </OverflowMenu>
        </>
      )}

      <Tooltip tooltip={tooltip} />
    </div>
  );
};
