// RightRail.tsx — the four stacked, independently-failing panels (mockup
// L1206–1372), now the WORKING rail (Batch 2 = plan Task 26 + the rail half of
// Task 16):
//
//   1. Rail mini-actions (mockup L1232–1363). Every item gets its inline
//      action(s), REUSING the board's own handlers — never a new write path:
//        · Today's tasks    → a complete checkbox + Call / WhatsApp / Note
//        · Viewings today   → WhatsApp / Call the attendee
//        · Unread WhatsApp  → quick reply (the board's WhatsApp compose path)
//        · Priority leads   → Call / WhatsApp, beside the Batch-1 SLA ring / seal
//      Match the board's hover-reveal + :active press + disabled-with-reason.
//
//      A rail item only becomes actionable through the record behind it. The
//      rail response is thin (no phone on a task/viewing, no full row), so each
//      item JOINS to a board row we already hold:
//        · task    → row.nextActionTaskId === task.id
//        · viewing → row.viewingTodayAt === viewing.scheduledAt
//        · unread  → row.personId === conversation.contactId
//        · lead    → the item ALREADY IS a DeskRow (rail.priorityLeads)
//      With a matched row the mini-actions run the board's exact rules; with no
//      match they show disabled-with-reason (honest — the record isn't in the
//      open book on screen).
//
//   2. Rail arrangement (mockup L1571–1649): drag-reorder the panels (grip on
//      header hover, brass drop indicator, HTML5 drag), per-panel collapse
//      (click the header; ~200ms height ease), and whole-rail collapse (a slim
//      handle folds the rail to a ~34px strip of live count badges).
//
// Order / folds / collapse + which item is being dragged are LOCAL state, seeded
// from the restored arrangement and mirrored back out via onArrangementChange
// (deskState.ts owns the localStorage write). Reduced-motion drops every
// transition (widths, folds, presses) — layout still changes, just instantly.

import { useMemo, useRef, useState, type ReactNode } from 'react';
import styled from '@emotion/styled';
import { useNavigate } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { IconCheck, IconComment, IconNotes, IconPhone } from 'twenty-ui/display';

import { DUR, EASE, SPACE } from '../_pulse/pulse-tokens';
import { FONT_MONO, FONT_UI, P, Seal } from '../_pulse/pulse';

import { bandOf } from './banding';
import { ReidinRailPanel } from './ReidinRailPanel';
import { SlaRing } from './SlaRing';
import { formatClock, formatRelative, friendlyError } from './format';
import { SkeletonStack, Text } from './shared';
import type { RailArrangement, RailPanelId } from './deskState';
import type {
  DeskRailOk,
  DeskRow,
  DeskTaskItem,
  DeskUnreadWaItem,
  DeskViewingItem,
} from './types';

type RowAction = 'call' | 'whatsapp' | 'note';

const RAIL_WIDTH = 352;
const RAIL_STRIP_WIDTH = 34;
const RAIL_ITEM_HEIGHT = 40;

// ── Shell ────────────────────────────────────────────────────────────────────
// Aside is position:relative and NON-scrolling so the collapse handle can ride
// its left edge without being clipped; a nested Scroll holds the panels/strip.
const Aside = styled.aside<{ $collapsed: boolean }>`
  position: relative;
  flex: none;
  width: ${({ $collapsed }) => ($collapsed ? RAIL_STRIP_WIDTH : RAIL_WIDTH)}px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  @media (prefers-reduced-motion: no-preference) {
    transition: width ${DUR.drawerIn}ms ${EASE.out};
  }
`;

const Scroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
`;

const RailToggle = styled.button<{ $collapsed: boolean }>`
  all: unset;
  box-sizing: border-box;
  position: absolute;
  left: -11px;
  top: 26px;
  z-index: 20;
  width: 22px;
  height: 40px;
  border-radius: 7px;
  border: 1px solid var(--p-line);
  background: var(--p-surface-2);
  color: var(--p-ink-2);
  cursor: pointer;
  display: grid;
  place-items: center;
  opacity: 0.55;
  @media (prefers-reduced-motion: no-preference) {
    transition: opacity ${DUR.tooltip}ms ${EASE.out}, transform ${DUR.press}ms ${EASE.out};
  }
  &:hover {
    opacity: 1;
    color: var(--p-accent);
  }
  &:active {
    transform: scale(0.94);
  }
  @media (prefers-reduced-motion: reduce) {
    &:active {
      transform: none;
    }
  }
  svg {
    width: 11px;
    height: 11px;
    transform: ${({ $collapsed }) => ($collapsed ? 'rotate(180deg)' : 'none')};
  }
`;

// Folded-rail strip — compact live counts; click anywhere to expand.
const Strip = styled.button`
  all: unset;
  box-sizing: border-box;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 84px 0 20px;
  cursor: pointer;
`;
const StripBadge = styled.div<{ $urgent?: boolean }>`
  display: grid;
  justify-items: center;
  gap: 3px;
  color: var(--p-ink-2);
  svg {
    width: 14px;
    height: 14px;
  }
  b {
    font-family: ${FONT_MONO};
    font-size: 10.5px;
    font-weight: 600;
    color: ${({ $urgent }) => ($urgent ? 'var(--p-bad)' : 'var(--p-accent-strong)')};
  }
`;

// ── Panel ─────────────────────────────────────────────────────────────────────
const Panel = styled.div<{ $dragging: boolean; $drop: 'before' | 'after' | null }>`
  border-bottom: 1px solid var(--p-line);
  padding: 18px 22px 20px;
  &:last-of-type {
    border-bottom: 0;
  }
  opacity: ${({ $dragging }) => ($dragging ? 0.45 : 1)};
  box-shadow: ${({ $drop }) =>
    $drop === 'before'
      ? 'inset 0 2px 0 var(--p-accent)'
      : $drop === 'after'
        ? 'inset 0 -2px 0 var(--p-accent)'
        : 'none'};
`;

const PanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  @media (prefers-reduced-motion: no-preference) {
    transition: margin-bottom ${DUR.dropdown}ms ${EASE.out};
  }
`;

const PhTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
`;

const PhSide = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
`;

const Grip = styled.span<{ $show: boolean }>`
  width: 14px;
  height: 14px;
  flex: none;
  margin-left: -3px;
  display: grid;
  place-items: center;
  color: var(--p-ink-2);
  opacity: ${({ $show }) => ($show ? 0.65 : 0)};
  cursor: grab;
  @media (prefers-reduced-motion: no-preference) {
    transition: opacity ${DUR.tooltip}ms ${EASE.out}, color ${DUR.tooltip}ms ${EASE.out};
  }
  &:hover {
    opacity: 1;
    color: var(--p-ink);
  }
  &:active {
    cursor: grabbing;
  }
`;

const Fold = styled.span<{ $show: boolean; $folded: boolean }>`
  width: 18px;
  height: 18px;
  flex: none;
  display: grid;
  place-items: center;
  color: var(--p-ink-2);
  opacity: ${({ $show }) => ($show ? 0.7 : 0)};
  @media (prefers-reduced-motion: no-preference) {
    transition: opacity ${DUR.tooltip}ms ${EASE.out};
  }
  svg {
    width: 11px;
    height: 11px;
    transform: ${({ $folded }) => ($folded ? 'rotate(-90deg)' : 'none')};
    @media (prefers-reduced-motion: no-preference) {
      transition: transform ${DUR.dropdown}ms ${EASE.out};
    }
  }
`;

const SeeAll = styled.button`
  all: unset;
  cursor: pointer;
  font-family: ${FONT_MONO};
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--p-accent);
  &:hover {
    color: var(--p-accent-strong);
  }
`;

// Fold animation: grid-template-rows 1fr→0fr collapses the body to nothing while
// its inner PanelItems clips the overflow. (The task explicitly asks for a height
// ease here; reduced-motion snaps it.)
const PanelBody = styled.div<{ $folded: boolean }>`
  display: grid;
  grid-template-rows: ${({ $folded }) => ($folded ? '0fr' : '1fr')};
  @media (prefers-reduced-motion: no-preference) {
    transition: grid-template-rows ${DUR.dropdown}ms ${EASE.out};
  }
`;
const PanelItems = styled.div`
  overflow: hidden;
  min-height: 0;
`;

// ── Item + mini-actions ────────────────────────────────────────────────────────
const Item = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--p-line);
  &:last-of-type {
    border-bottom: 0;
    padding-bottom: 0;
  }
`;
const ItemBody = styled.div`
  min-width: 0;
  flex: 1;
`;
const T1 = styled.div<{ $done?: boolean }>`
  font-family: ${FONT_UI};
  font-size: 13px;
  color: var(--p-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
  opacity: ${({ $done }) => ($done ? 0.55 : 1)};
`;
const T2 = styled.div<{ $late?: boolean }>`
  font-family: ${FONT_UI};
  font-size: 11.5px;
  color: ${({ $late }) => ($late ? 'var(--p-bad)' : 'var(--p-ink-2)')};
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// Hover-reveal driven by explicit React state (NOT a cross-component `:hover &`
// selector — that pattern renders invisible in a runtime hero; see the
// hero-emotion-component-hover-selector gotcha).
const MiniActs = styled.div<{ $show: boolean }>`
  display: flex;
  gap: 3px;
  flex: none;
  align-items: center;
  opacity: ${({ $show }) => ($show ? 1 : 0)};
  pointer-events: ${({ $show }) => ($show ? 'auto' : 'none')};
  transform: translate3d(${({ $show }) => ($show ? 0 : 4)}px, 0, 0);
  @media (prefers-reduced-motion: no-preference) {
    transition: opacity ${DUR.tooltip}ms ${EASE.out}, transform ${DUR.tooltip}ms ${EASE.out};
  }
  @media (prefers-reduced-motion: reduce) {
    transform: none;
  }
`;

const IAct = styled.button`
  all: unset;
  box-sizing: border-box;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  flex: none;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--p-ink-2);
  background: transparent;
  border: 1px solid transparent;
  @media (prefers-reduced-motion: no-preference) {
    transition: transform ${DUR.press}ms ${EASE.out}, color ${DUR.press}ms ${EASE.out},
      background ${DUR.press}ms ${EASE.out}, border-color ${DUR.press}ms ${EASE.out};
  }
  &:hover {
    color: var(--p-accent-strong);
    background: var(--p-surface-2);
    border-color: var(--p-line);
  }
  &:active {
    transform: scale(0.9);
  }
  @media (prefers-reduced-motion: reduce) {
    &:active {
      transform: none;
    }
  }
  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
  &:disabled:hover {
    color: var(--p-ink-2);
    background: transparent;
    border-color: transparent;
  }
`;

const Check = styled.button<{ $done: boolean; $overdue: boolean }>`
  all: unset;
  box-sizing: border-box;
  width: 17px;
  height: 17px;
  border-radius: 5px;
  flex: none;
  border: 1.4px solid ${({ $overdue }) => ($overdue ? 'var(--p-bad)' : 'var(--p-line)')};
  background: ${({ $done }) => ($done ? 'var(--p-accent)' : 'transparent')};
  color: var(--p-bg);
  cursor: pointer;
  display: grid;
  place-items: center;
  @media (prefers-reduced-motion: no-preference) {
    transition: border-color ${DUR.press}ms ${EASE.out}, background ${DUR.press}ms ${EASE.out},
      transform ${DUR.press}ms ${EASE.out};
  }
  &:hover {
    border-color: var(--p-accent);
  }
  &:active {
    transform: scale(0.9);
  }
  @media (prefers-reduced-motion: reduce) {
    &:active {
      transform: none;
    }
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
  &:disabled:hover {
    border-color: ${({ $overdue }) => ($overdue ? 'var(--p-bad)' : 'var(--p-line)')};
  }
`;

const TimeChip = styled.div`
  font-family: ${FONT_MONO};
  font-size: 11px;
  color: var(--p-accent-strong);
  border: 1px solid var(--p-line);
  border-radius: 6px;
  padding: 4px 8px;
  flex: none;
  text-align: center;
  line-height: 1.15;
  min-width: 42px;
`;

// ── Inline glyphs (grip / fold / toggle / strip) ───────────────────────────────
const GripDots = () => (
  <svg viewBox="0 0 10 14" width="9" height="13" aria-hidden>
    <circle cx="3" cy="3" r="1.1" fill="currentColor" />
    <circle cx="7" cy="3" r="1.1" fill="currentColor" />
    <circle cx="3" cy="7" r="1.1" fill="currentColor" />
    <circle cx="7" cy="7" r="1.1" fill="currentColor" />
    <circle cx="3" cy="11" r="1.1" fill="currentColor" />
    <circle cx="7" cy="11" r="1.1" fill="currentColor" />
  </svg>
);
const Chevron = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="m4 6.5 4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ToggleChevron = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ReplyGlyph = () => (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden>
    <path d="M2 3.5h12v7H6l-3 2.5V10.5H2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);
const StripTask = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="2.5" y="2.5" width="11" height="11" rx="3" stroke="currentColor" strokeWidth="1.2" />
    <path d="m5.4 8.2 1.9 1.9 3.4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const StripView = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 1.5c-2.8 0-5 2-5 4.8C3 9.6 8 14.5 8 14.5s5-4.9 5-8.2C13 3.5 10.8 1.5 8 1.5Z" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="8" cy="6.2" r="1.7" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);
const StripWa = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M2 3.5h12v7H6l-3 2.5V10.5H2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);
const StripLead = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="5.2" r="2.6" stroke="currentColor" strokeWidth="1.2" />
    <path d="M3.2 13.5c.5-2.6 2.4-4 4.8-4s4.3 1.4 4.8 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

// ── Mini-action button trio (Call / WhatsApp / Note against a matched row) ─────
// The disabled-with-reason rules are the board's verbatim (BoardTable's tray).
const CallAct = ({ row, onAct }: { row: DeskRow | null; onAct: (a: RowAction, r: DeskRow) => void }) => (
  <IAct
    type="button"
    aria-label={row ? `Call ${row.name}` : 'Call'}
    title={!row ? 'Open the linked record to call' : row.phoneE164 ? 'Call' : 'No phone number'}
    disabled={!row || !row.phoneE164}
    onClick={() => row && onAct('call', row)}
  >
    <IconPhone size={15} />
  </IAct>
);
const WaAct = ({ row, onAct }: { row: DeskRow | null; onAct: (a: RowAction, r: DeskRow) => void }) => (
  <IAct
    type="button"
    aria-label={row ? `WhatsApp ${row.name}` : 'WhatsApp'}
    title={
      !row
        ? 'Open the linked record to message'
        : !row.phoneE164
          ? 'No phone number yet'
          : row.hasWhatsApp
            ? 'WhatsApp'
            : 'Not on WhatsApp yet'
    }
    disabled={!row || !row.phoneE164 || !row.hasWhatsApp}
    onClick={() => row && onAct('whatsapp', row)}
  >
    <IconComment size={15} />
  </IAct>
);
const NoteAct = ({ row, onAct }: { row: DeskRow | null; onAct: (a: RowAction, r: DeskRow) => void }) => (
  <IAct
    type="button"
    aria-label={row ? `Add note for ${row.name}` : 'Add note'}
    title={row ? 'Add note' : 'Open the linked record to add a note'}
    disabled={!row}
    onClick={() => row && onAct('note', row)}
  >
    <IconNotes size={15} />
  </IAct>
);

const isTaskOverdue = (t: DeskTaskItem, nowMs: number): boolean => {
  const due = t.slaDueAt ? Date.parse(t.slaDueAt) : NaN;
  return !Number.isNaN(due) && due < nowMs;
};

const taskSubtitle = (t: DeskTaskItem): string | null => {
  const clock = formatClock(t.slaDueAt);
  return clock ? `Due ${clock}` : null;
};

const unreadWaSubtitle = (w: DeskUnreadWaItem): string => {
  const count = w.unreadCount ?? 1;
  const when = formatRelative(w.lastMessageAt);
  return `${count} unread${when ? ` · ${when}` : ''}`;
};

// Viewing time chip ("2:00 PM"); scheduledAt is the join key to a board row.
const viewingClock = (v: DeskViewingItem): string => formatClock(v.scheduledAt) ?? '—';

export const RightRail = ({
  status,
  rail,
  error,
  nowMs,
  boardRows,
  onRowAction,
  onCompleteTask,
  arrangement,
  onArrangementChange,
}: {
  status: 'loading' | 'ready' | 'error';
  rail: DeskRailOk | null;
  error: string | null;
  /** The hero's re-ticked clock — drives the priority-lead SLA ring. */
  nowMs: number;
  /** The open board — the join source that turns a thin rail item actionable. */
  boardRows: DeskRow[];
  /** The board's own action handler (dialer / drawer) — reused, never re-built. */
  onRowAction: (action: RowAction, row: DeskRow) => void;
  /** Existing `completeTask` route write; resolves true on success. */
  onCompleteTask: (row: DeskRow, taskId: string) => Promise<boolean>;
  /** Restored rail arrangement (order / folds / collapse). */
  arrangement: RailArrangement;
  /** Mirror every arrangement change out (deskState persists it). */
  onArrangementChange: (next: RailArrangement) => void;
}) => {
  const navigate = useNavigate();

  const order = arrangement.order;
  const folds = arrangement.folds;
  const collapsed = arrangement.collapsed;

  const [hoverHeadId, setHoverHeadId] = useState<RailPanelId | null>(null);
  const [hoverItemId, setHoverItemId] = useState<string | null>(null);
  const [dragEnabledId, setDragEnabledId] = useState<RailPanelId | null>(null);
  const [draggingId, setDraggingId] = useState<RailPanelId | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: RailPanelId; before: boolean } | null>(null);
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(() => new Set());
  // Grip / See-all press flag: consumed by the header click so those never fold
  // the panel (useRef flag rather than stopPropagation — that's unreliable here).
  const skipFoldRef = useRef(false);

  // ── Board joins — thin rail item → the row that makes it actionable ──────────
  const rowByTaskId = useMemo(() => {
    const m = new Map<string, DeskRow>();
    for (const r of boardRows) if (r.nextActionTaskId) m.set(r.nextActionTaskId, r);
    return m;
  }, [boardRows]);
  const rowByPersonId = useMemo(() => {
    const m = new Map<string, DeskRow>();
    for (const r of boardRows) if (r.personId) m.set(r.personId, r);
    return m;
  }, [boardRows]);
  const rowByViewingAt = useMemo(() => {
    const m = new Map<string, DeskRow>();
    for (const r of boardRows) if (r.viewingTodayAt) m.set(r.viewingTodayAt, r);
    return m;
  }, [boardRows]);

  const emit = (patch: Partial<RailArrangement>) =>
    onArrangementChange({ order, folds, collapsed, ...patch });

  const toggleFold = (id: RailPanelId) => emit({ folds: { ...folds, [id]: !folds[id] } });
  const toggleCollapse = () => emit({ collapsed: !collapsed });

  const reorder = (dragId: RailPanelId, targetId: RailPanelId, before: boolean) => {
    const next = order.filter((id) => id !== dragId);
    const at = next.indexOf(targetId);
    next.splice(before ? at : at + 1, 0, dragId);
    emit({ order: next });
  };

  const completeTask = async (row: DeskRow, taskId: string) => {
    if (completedTaskIds.has(taskId)) return;
    const ok = await onCompleteTask(row, taskId);
    if (ok) setCompletedTaskIds((prev) => new Set(prev).add(taskId));
  };

  // ── Panel definitions (title / count / see-all / body) ───────────────────────
  const counts = {
    tasks: rail ? rail.tasks.length : null,
    viewings: rail ? rail.viewings.length : null,
    unreadWa: rail ? rail.unreadWa.length : null,
    priorityLeads: rail ? rail.priorityLeads.length : null,
  };
  const priorityUrgent = (rail?.priorityLeads ?? []).some((r) => bandOf(r, nowMs) === 'slaAtRisk');

  const panels: Record<
    RailPanelId,
    { title: string; count: number | null; seeAllLabel: string; onSeeAll: () => void; emptyLabel: string; body: ReactNode }
  > = {
    tasks: {
      title: "Today's tasks",
      count: counts.tasks,
      seeAllLabel: 'See all',
      onSeeAll: () => navigate(AppPath.TasksPage),
      emptyLabel: 'No tasks due today.',
      body: (rail?.tasks ?? []).map((t) => {
        const row = rowByTaskId.get(t.id) ?? null;
        const done = completedTaskIds.has(t.id);
        const overdue = isTaskOverdue(t, nowMs);
        return (
          <Item
            key={t.id}
            onMouseEnter={() => setHoverItemId(t.id)}
            onMouseLeave={() => setHoverItemId((prev) => (prev === t.id ? null : prev))}
          >
            <Check
              type="button"
              $done={done}
              $overdue={overdue}
              aria-label={done ? 'Completed' : `Complete "${t.title ?? 'task'}"`}
              disabled={done || !row}
              title={done ? 'Completed' : row ? 'Mark done' : 'Open this task in Tasks to complete it'}
              onClick={() => row && void completeTask(row, t.id)}
            >
              {done ? <IconCheck size={12} /> : null}
            </Check>
            <ItemBody>
              <T1 $done={done}>{t.title ?? 'Untitled task'}</T1>
              {(overdue || taskSubtitle(t)) && (
                <T2 $late={overdue}>
                  {overdue
                    ? `Overdue${formatClock(t.slaDueAt) ? ` · was due ${formatClock(t.slaDueAt)}` : ''}`
                    : taskSubtitle(t)}
                </T2>
              )}
            </ItemBody>
            <MiniActs $show={hoverItemId === t.id}>
              <CallAct row={row} onAct={onRowAction} />
              <WaAct row={row} onAct={onRowAction} />
              <NoteAct row={row} onAct={onRowAction} />
            </MiniActs>
          </Item>
        );
      }),
    },
    viewings: {
      title: 'Viewings today',
      count: counts.viewings,
      seeAllLabel: 'Calendar',
      // No calendar route ships yet; Viewing is a first-class record index.
      onSeeAll: () => navigate('/objects/viewings'),
      emptyLabel: 'No viewings today.',
      body: (rail?.viewings ?? []).map((v) => {
        const row = v.scheduledAt ? rowByViewingAt.get(v.scheduledAt) ?? null : null;
        return (
          <Item
            key={v.id}
            onMouseEnter={() => setHoverItemId(v.id)}
            onMouseLeave={() => setHoverItemId((prev) => (prev === v.id ? null : prev))}
          >
            <TimeChip>{viewingClock(v)}</TimeChip>
            <ItemBody>
              <T1>{v.name ?? 'Viewing'}</T1>
            </ItemBody>
            <MiniActs $show={hoverItemId === v.id}>
              <WaAct row={row} onAct={onRowAction} />
              <CallAct row={row} onAct={onRowAction} />
            </MiniActs>
          </Item>
        );
      }),
    },
    unreadWa: {
      title: 'Unread WhatsApp',
      count: counts.unreadWa,
      seeAllLabel: 'Open Inbox',
      onSeeAll: () => navigate(AppPath.Inbox),
      emptyLabel: "You're all caught up.",
      body: (rail?.unreadWa ?? []).map((w) => {
        const row = w.contactId ? rowByPersonId.get(w.contactId) ?? null : null;
        return (
          <Item
            key={w.id}
            onMouseEnter={() => setHoverItemId(w.id)}
            onMouseLeave={() => setHoverItemId((prev) => (prev === w.id ? null : prev))}
          >
            <ItemBody>
              <T1>{w.name ?? 'Conversation'}</T1>
              <T2>{unreadWaSubtitle(w)}</T2>
            </ItemBody>
            <MiniActs $show={hoverItemId === w.id}>
              {/* Quick reply — the board's WhatsApp compose path when the contact
                  is in the open book, else the Inbox (never dead). */}
              <IAct
                type="button"
                aria-label={`Quick reply to ${w.name ?? 'conversation'}`}
                title="Quick reply"
                onClick={() => (row ? onRowAction('whatsapp', row) : navigate(AppPath.Inbox))}
              >
                <ReplyGlyph />
              </IAct>
            </MiniActs>
          </Item>
        );
      }),
    },
    priorityLeads: {
      title: 'Priority leads',
      count: counts.priorityLeads,
      seeAllLabel: 'All leads',
      onSeeAll: () => navigate('/objects/people'),
      emptyLabel: 'No leads waiting on you.',
      body: (rail?.priorityLeads ?? []).map((r) => {
        // The item already IS a DeskRow — mini-actions run the board rules directly.
        const inWindow = bandOf(r, nowMs) === 'slaAtRisk';
        return (
          <Item
            key={r.id}
            onMouseEnter={() => setHoverItemId(r.id)}
            onMouseLeave={() => setHoverItemId((prev) => (prev === r.id ? null : prev))}
          >
            <ItemBody>
              <T1>{r.name}</T1>
              <T2>{r.meta}</T2>
            </ItemBody>
            {inWindow ? (
              <SlaRing deadline={r.slaDeadline} nowMs={nowMs} />
            ) : (
              <Seal tone="warn" label="Reply soon" style={{ flex: 'none' }} />
            )}
            <MiniActs $show={hoverItemId === r.id}>
              <CallAct row={r} onAct={onRowAction} />
              <WaAct row={r} onAct={onRowAction} />
            </MiniActs>
          </Item>
        );
      }),
    },
    // REIDIN login helper (Batch 3). An ACTION panel — no live count, no
    // "see all" (empty seeAllLabel hides the header link), and its body owns its
    // own state machine, so it renders regardless of the rail's load status (the
    // generic loading/error/empty gating is skipped for it below).
    reidin: {
      title: 'REIDIN login',
      count: null,
      seeAllLabel: '',
      onSeeAll: () => {},
      emptyLabel: '',
      body: null,
    },
  };

  // ── Collapsed: the slim count strip ──────────────────────────────────────────
  if (collapsed) {
    return (
      <Aside $collapsed>
        <RailToggle
          type="button"
          $collapsed
          title="Expand the panel rail"
          aria-label="Expand the panel rail"
          onClick={toggleCollapse}
        >
          <ToggleChevron />
        </RailToggle>
        <Scroll>
          <Strip type="button" title="Show panels" aria-label="Show panels" onClick={toggleCollapse}>
            <StripBadge title={`${counts.tasks ?? 0} tasks due today`}>
              <StripTask />
              {counts.tasks !== null && <b>{counts.tasks}</b>}
            </StripBadge>
            <StripBadge title={`${counts.viewings ?? 0} viewings today`}>
              <StripView />
              {counts.viewings !== null && <b>{counts.viewings}</b>}
            </StripBadge>
            <StripBadge title={`${counts.unreadWa ?? 0} unread WhatsApp`}>
              <StripWa />
              {counts.unreadWa !== null && <b>{counts.unreadWa}</b>}
            </StripBadge>
            <StripBadge $urgent={priorityUrgent} title={`${counts.priorityLeads ?? 0} priority leads`}>
              <StripLead />
              {counts.priorityLeads !== null && <b>{counts.priorityLeads}</b>}
            </StripBadge>
          </Strip>
        </Scroll>
      </Aside>
    );
  }

  // ── Expanded: the four panels in the remembered order ────────────────────────
  return (
    <Aside $collapsed={false}>
      <RailToggle
        type="button"
        $collapsed={false}
        title="Collapse the panel rail"
        aria-label="Collapse the panel rail"
        onClick={toggleCollapse}
      >
        <ToggleChevron />
      </RailToggle>
      <Scroll>
        {order.map((id) => {
          const panel = panels[id];
          const folded = folds[id];
          const drop = dropTarget && dropTarget.id === id ? (dropTarget.before ? 'before' : 'after') : null;
          const count = panel.count;
          return (
            <Panel
              key={id}
              $dragging={draggingId === id}
              $drop={drop}
              draggable={dragEnabledId === id}
              onDragStart={(e) => {
                setDraggingId(id);
                e.dataTransfer.effectAllowed = 'move';
                try {
                  e.dataTransfer.setData('text/plain', id);
                } catch {
                  /* some browsers reject setData in tests — reorder still works */
                }
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDropTarget(null);
                setDragEnabledId(null);
              }}
              onDragOver={(e) => {
                if (!draggingId || draggingId === id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = e.currentTarget.getBoundingClientRect();
                const before = e.clientY - rect.top < rect.height / 2;
                setDropTarget((prev) =>
                  prev && prev.id === id && prev.before === before ? prev : { id, before },
                );
              }}
              onDragLeave={() => setDropTarget((prev) => (prev && prev.id === id ? null : prev))}
              onDrop={(e) => {
                if (!draggingId || draggingId === id) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const before = e.clientY - rect.top < rect.height / 2;
                reorder(draggingId, id, before);
                setDropTarget(null);
              }}
            >
              <PanelHead
                style={{ marginBottom: folded ? 0 : 14 }}
                onMouseEnter={() => setHoverHeadId(id)}
                onMouseLeave={() => setHoverHeadId((prev) => (prev === id ? null : prev))}
                onClick={() => {
                  if (skipFoldRef.current) {
                    skipFoldRef.current = false;
                    return;
                  }
                  toggleFold(id);
                }}
              >
                <PhTitle>
                  <Grip
                    $show={hoverHeadId === id || dragEnabledId === id}
                    title="Drag to reorder"
                    onMouseDown={() => {
                      skipFoldRef.current = true;
                      setDragEnabledId(id);
                    }}
                    onMouseUp={() => setDragEnabledId(null)}
                  >
                    <GripDots />
                  </Grip>
                  <span
                    style={{
                      fontFamily: FONT_UI,
                      fontSize: 13,
                      fontWeight: 600,
                      color: P.ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {panel.title}
                  </span>
                  {count !== null && (
                    <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: P.ink2, flex: 'none' }}>
                      {count}
                    </span>
                  )}
                </PhTitle>
                <PhSide>
                  {panel.seeAllLabel ? (
                    <SeeAll
                      type="button"
                      onMouseDown={() => {
                        skipFoldRef.current = true;
                      }}
                      onClick={panel.onSeeAll}
                    >
                      {panel.seeAllLabel}
                    </SeeAll>
                  ) : null}
                  <Fold $show={hoverHeadId === id} $folded={folded} title="Fold panel">
                    <Chevron />
                  </Fold>
                </PhSide>
              </PanelHead>
              <PanelBody $folded={folded}>
                <PanelItems>
                  {id === 'reidin' ? (
                    // Action panel — self-contained state; never gated on rail load.
                    <ReidinRailPanel />
                  ) : (
                    <>
                      {status === 'loading' && <SkeletonStack rows={2} height={RAIL_ITEM_HEIGHT} />}
                      {status === 'error' && <Text muted>{friendlyError(error ?? 'DESK_LOAD_FAILED')}</Text>}
                      {status === 'ready' && count === 0 && <Text muted>{panel.emptyLabel}</Text>}
                      {status === 'ready' && count !== null && count > 0 && panel.body}
                    </>
                  )}
                </PanelItems>
              </PanelBody>
            </Panel>
          );
        })}
      </Scroll>
    </Aside>
  );
};
