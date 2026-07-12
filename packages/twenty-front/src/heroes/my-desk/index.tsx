/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// My Desk — runtime-loaded HERO ENTRY: live triage table, inline actions and
// record peek drawer.
// ─────────────────────────────────────────────────────────────────────────────
// Rides Twenty's own chrome (PropelMantineProvider + PageContainer + PageHeader —
// same convention as ListingStudioPage/OffplanStudioPage): the sidebar/topbar in
// the approved mockup (docs/superpowers/specs/design-mockup-mydesk-nocturne.html,
// sidebar L813 / topbar L853) are the SHELL's, not this hero's — a separate native
// re-skin effort re-themes those. This hero owns everything below the topbar: the
// Today Strip + the desk grid (board + rail), in the Nocturne register (PulseNocturne).
//
// TodayStrip / BoardTable / RightRail remain independently failing surfaces;
// PeekDrawer owns the action bloom without replacing the agent's table context.
//
// Reads use the shared route wrapper; host supplies navigation, dialer and toasts.

import { useCallback, useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';
import { IconLayoutDashboard } from 'twenty-ui/display';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

import { Btn, FONT_DISPLAY, FONT_UI, PulseFonts, PulseNocturne } from '../_pulse/pulse';

import { BoardTable } from './BoardTable';
import { deskRecordPath, PeekDrawer, type DrawerMode } from './PeekDrawer';
import { RightRail } from './RightRail';
import { TodayStrip, type StripFilter } from './TodayStrip';
import { fetchBoard, fetchRail, fetchTimeline, runDeskAction } from './deskApi';
import { StagePicker, type StagePickerAnchor } from './StagePicker';
import { formatStageLabel } from './format';
import {
  deskStateKey,
  loadDeskState,
  migrateDeskStateKey,
  saveDeskState,
  type DeskPersistedState,
  type RailArrangement,
} from './deskState';
import type { DeskMoveResponse, DeskRailOk, DeskRow, DeskUndoResponse } from './types';

// "Now", re-snapshotted periodically so band classification (SLA windows,
// going-cold thresholds) doesn't silently go stale on a desk left open for
// hours. 30s is plenty for minute-granularity bands — the second-by-second
// SLA countdown itself is SlaRing's job (Task 14), not this clock's.
const NOW_TICK_MS = 30_000;

// Twenty's People index (RecordIndexPage = '/objects/:objectNamePlural'). Twenty
// has NO dedicated record-CREATE URL — new records are made in-place via an
// in-shell hook (useCreateNewIndexRecord) that a runtime hero can't reach, and
// host.navigate only takes a path. So "+ New lead" lands the agent on the People
// list, where the "+ Add" affordance is one click away. A "LEAD" here is a
// Person with contactType=LEAD (see my-desk-route.ts's board query), so People
// is the correct destination. (If a create deep-link ever ships, point here.)
const NEW_LEAD_PATH = '/objects/people';

// The top bar's greeting: "<Weekday, D Month> · Good <part>, <FirstName>".
// Date + part-of-day are computed client-side off the live clock (nowMs, which
// the hero already re-ticks every 30s) so the line stays correct across the
// noon/6pm boundaries on a desk left open. `firstName` comes from the real
// signed-in workspace member; when it's absent we drop the name (and its comma)
// rather than ever hardcoding one.
const buildGreeting = (nowMs: number, firstName: string | null): { date: string; lead: string; name: string | null } => {
  const now = new Date(nowMs);
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = now.toLocaleDateString('en-GB', { month: 'long' });
  const hour = now.getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  return {
    date: `${weekday}, ${now.getDate()} ${month}`,
    lead: `Good ${part}`,
    name: firstName && firstName.trim() ? firstName.trim() : null,
  };
};

// Header row above the Today Strip (mockup .topbar, L853–862). space-between so
// the greeting sits left and the actions right; the right padding reserves the
// top-right corner for the shell's own theme toggle (mockup keeps it clear at
// ≤1500px — we reserve it always, since the toggle is viewport-fixed) so the
// two buttons never slide under it.
const TopBarRow = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 172px 18px 24px;
  border-bottom: 1px solid var(--p-line);
  @media (max-width: 720px) {
    flex-wrap: wrap;
    padding-right: 24px;
  }
`;

export default function MyDeskHero({ host }: { host: PropelHeroHost }) {
  const [boardStatus, setBoardStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [boardRows, setBoardRows] = useState<DeskRow[]>([]);
  const [boardError, setBoardError] = useState<string | null>(null);
  // A later page failed AFTER rows were already painted — keep them on screen
  // (BoardTable renders an inline "showing what arrived" line instead of an
  // error state that would erase the rows the agent is already looking at).
  const [boardPartial, setBoardPartial] = useState(false);

  const [railStatus, setRailStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rail, setRail] = useState<DeskRailOk | null>(null);
  const [railError, setRailError] = useState<string | null>(null);

  const [nowMs, setNowMs] = useState(() => Date.now());

  // ── Per-agent UI state (spec §4.3/§8.3) ──────────────────────────────────────
  // ONE small localStorage blob, keyed per agent. At mount there's no member id
  // yet, so the key starts at the stable per-browser 'local' slot; the /my-desk
  // board now returns the acting member id (Batch 3), and when it arrives the key
  // UPGRADES transparently to the member-scoped slot (migrateDeskStateKey — the
  // browser's pre-login prefs carry over the first time). Load ONCE on mount;
  // every change merges in and writes debounced. A malformed/stale blob silently
  // falls back to defaults (loadDeskState never throws) — losing this state can
  // never break the desk.
  const stateKeyRef = useRef(deskStateKey(null));
  const persistedRef = useRef<DeskPersistedState>(loadDeskState(stateKeyRef.current));
  // The signed-in agent, from the board response (first page). firstName drives
  // the greeting; memberId keys the persistence blob. Both null until the board
  // lands — we NEVER hardcode a name or an id.
  const [firstName, setFirstName] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const persist = useCallback((patch: Partial<DeskPersistedState>) => {
    persistedRef.current = { ...persistedRef.current, ...patch };
    saveDeskState(stateKeyRef.current, persistedRef.current);
  }, []);

  // "Today's plan" focus mode — client-side only; narrows the board to rows that
  // need the agent today (banding.needsAttentionToday), reflected in the button
  // and the board header count. Seeded from + saved to the persisted blob.
  const [focusToday, setFocusToday] = useState(() => persistedRef.current.focusToday);
  const [railArrangement, setRailArrangement] = useState<RailArrangement>(() => ({
    order: persistedRef.current.order,
    folds: persistedRef.current.folds,
    collapsed: persistedRef.current.collapsed,
  }));
  // Greeting first name: the /my-desk board response now carries it (Batch 3 —
  // actingMemberName, resolved server-side from the acting member). We greet
  // name-lessly until it lands and if it's ever absent — never a hardcoded name.
  const greeting = buildGreeting(nowMs, firstName);
  // The Today Strip's active filter tile, ANDed against BoardTable's own
  // lane/going-cold chip filter — set by TodayStrip, consumed by BoardTable.
  // Seeded from the persisted blob (one of the two remembered filter chips).
  const [stripFilter, setStripFilter] = useState<StripFilter | null>(persistedRef.current.stripFilter);
  const [drawer, setDrawer] = useState<{ rowId: string; mode: DrawerMode } | null>(null);
  const [stagePicker, setStagePicker] = useState<{ rowId: string; anchor: StagePickerAnchor } | null>(null);
  const [undoMove, setUndoMove] = useState<{
    rowId: string;
    previousStage: string;
    toStage: string;
    noteId: string | null;
    sideEffects: string[];
  } | null>(null);
  const [pendingCall, setPendingCall] = useState<{ rowId: string; startedAtMs: number } | null>(null);

  const cancelledRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), NOW_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!undoMove) return;
    const id = window.setTimeout(() => setUndoMove(null), 6_000);
    return () => window.clearTimeout(id);
  }, [undoMove]);

  useEffect(() => {
    if (!pendingCall) return;
    const check = async () => {
      if (Date.now() - pendingCall.startedAtMs > 30 * 60_000) {
        setPendingCall(null);
        return;
      }
      const row = boardRows.find((candidate) => candidate.id === pendingCall.rowId);
      if (!row) return;
      const result = await fetchTimeline(row.laneObject, row.recordId);
      if (!result?.ok) return;
      const terminal = new Set(['COMPLETED', 'MISSED', 'NO_ANSWER', 'BUSY', 'FAILED', 'CANCELED']);
      const call = result.events.find((event) =>
        event.type === 'CALL' &&
        Date.parse(event.occurredAt) >= pendingCall.startedAtMs &&
        (!event.callStatus || terminal.has(event.callStatus)),
      );
      if (call) {
        setPendingCall(null);
        setDrawer({ rowId: row.id, mode: 'postCall' });
      }
    };
    void check();
    const id = window.setInterval(() => void check(), 10_000);
    return () => window.clearInterval(id);
  }, [pendingCall, boardRows]);

  const startCall = (row: DeskRow) => {
    if (!row.phoneE164) return;
    window.postMessage(
      { type: 'propel:dial', number: row.phoneE164, name: row.name, leadId: row.personId ?? undefined, source: 'my-desk' },
      window.location.origin,
    );
    setPendingCall({ rowId: row.id, startedAtMs: Date.now() });
    host.notify('Dialer ready — press Call when you are ready.', 'info');
  };

  // The ONE row-action handler — shared by the board rows AND the rail's inline
  // mini-actions (which reach it with a joined DeskRow). Call → dialer; open →
  // record page; everything else → the peek drawer in that mode.
  const handleRowAction = (
    action: 'call' | 'whatsapp' | 'note' | 'task' | 'viewing' | 'snooze' | 'open',
    row: DeskRow,
  ) => {
    if (action === 'call' && row.phoneE164) {
      startCall(row);
      return;
    }
    if (action === 'open') {
      host.navigate(deskRecordPath(row));
      return;
    }
    setDrawer({ rowId: row.id, mode: action === 'call' ? 'overview' : action });
  };

  // Rail task checkbox → the EXISTING `completeTask` route write (never a new
  // path); optimistically clears the row's next action on the board. Returns
  // success so the rail can strike the item through.
  const completeTaskFromRail = async (row: DeskRow, taskId: string): Promise<boolean> => {
    const result = await runDeskAction('completeTask', {
      laneObject: row.laneObject,
      recordId: row.recordId,
      taskId,
    });
    if (!result?.ok) {
      host.notify("That task couldn't be completed. Please try again.", 'error');
      return false;
    }
    setBoardRows((current) =>
      current.map((candidate) =>
        candidate.id === row.id
          ? {
              ...candidate,
              ...(candidate.nextActionTaskId === taskId
                ? { nextAction: null, nextActionTaskId: null, nextActionDueAt: null, taskDueToday: false }
                : {}),
              lastTouchAt: result.touchedAt ?? candidate.lastTouchAt,
            }
          : candidate,
      ),
    );
    host.notify('Task completed', 'success');
    return true;
  };

  // Once the acting member id arrives (board first page), upgrade the persistence
  // key from the per-browser 'local' slot to the member-scoped one. The browser's
  // pre-login prefs carry over the first time; if the member already had saved
  // prefs those win, and we reflect the adopted arrangement/filters into live
  // state. BoardTable's column widths (mounted with the local key's initials) keep
  // their current values and re-persist under the new key on the next drag — a
  // storage detail, never a visible reset. Graceful when memberId stays null.
  useEffect(() => {
    if (!memberId) return;
    const { key, state } = migrateDeskStateKey(stateKeyRef.current, memberId, persistedRef.current);
    if (key === stateKeyRef.current) return;
    stateKeyRef.current = key;
    persistedRef.current = state;
    setRailArrangement({ order: state.order, folds: state.folds, collapsed: state.collapsed });
    setFocusToday(state.focusToday);
    setStripFilter(state.stripFilter);
  }, [memberId]);

  useEffect(() => {
    cancelledRef.current = false;

    // Board — fails ALONE (a rail outage must never blank the opportunities list).
    // Tracks how many rows made it on screen so a MID-SEQUENCE failure (page 2+,
    // incl. deskApi's stuck-cursor/page-cap bails) degrades to a partial board
    // instead of erasing rows the agent is already reading.
    let boardRowsReceived = 0;
    fetchBoard(
      (rows) => {
        if (cancelledRef.current) return;
        boardRowsReceived = rows.length;
        setBoardRows(rows);
        setBoardStatus('ready');
      },
      (meta) => {
        if (cancelledRef.current) return;
        setFirstName(meta.actingMemberName);
        setMemberId(meta.memberId);
      },
    )
      .catch((err: unknown) => {
        if (cancelledRef.current) return;
        if (boardRowsReceived > 0) {
          setBoardPartial(true); // keep the painted rows; flag the gap inline
          return;
        }
        setBoardStatus('error');
        setBoardError(err instanceof Error ? err.message : 'DESK_LOAD_FAILED');
      });

    // Rail — fails ALONE (a board outage must never blank the day's panels).
    fetchRail()
      .then((res) => {
        if (cancelledRef.current) return;
        if (res === null || !res.ok) {
          setRailStatus('error');
          setRailError(res && !res.ok ? res.error : 'DESK_LOAD_FAILED');
          return;
        }
        setRail(res);
        setRailStatus('ready');
      })
      .catch(() => {
        if (cancelledRef.current) return;
        setRailStatus('error');
        setRailError('DESK_LOAD_FAILED');
      });

    return () => {
      cancelledRef.current = true;
    };
  }, []);

  return (
    <PropelMantineProvider>
      <PulseFonts />
      <PageContainer style={{ flex: 1, minHeight: 0 }}>
        <PageHeader
          Icon={IconLayoutDashboard}
          title={
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 400 }}>
              My Desk
            </span>
          }
        />
        <PulseNocturne
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          <TopBarRow>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONT_UI, fontSize: 13, color: 'var(--p-ink-2)', marginTop: 2 }}>
                {greeting.date} · {greeting.lead}
                {greeting.name ? (
                  <>
                    , <b style={{ color: 'var(--p-ink)', fontWeight: 500 }}>{greeting.name}</b>
                  </>
                ) : null}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
              <Btn
                type="button"
                variant="secondary"
                aria-pressed={focusToday}
                title="Show only what needs you today"
                onClick={() =>
                  setFocusToday((on) => {
                    const next = !on;
                    persist({ focusToday: next });
                    return next;
                  })
                }
                style={
                  focusToday
                    ? { borderColor: 'var(--p-accent)', background: 'var(--p-accent-tint)' }
                    : undefined
                }
              >
                {focusToday ? 'Focus: today' : "Today's plan"}
              </Btn>
              <Btn
                type="button"
                variant="primary"
                title="Add a new lead"
                onClick={() => host.navigate(NEW_LEAD_PATH)}
              >
                + New lead
              </Btn>
            </div>
          </TopBarRow>
          <TodayStrip
            boardStatus={boardStatus}
            rows={boardRows}
            railStatus={railStatus}
            rail={rail}
            nowMs={nowMs}
            activeFilter={stripFilter}
            onToggleFilter={(filter) =>
              setStripFilter((prev) => {
                const next = prev === filter ? null : filter;
                persist({ stripFilter: next });
                return next;
              })
            }
          />
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <BoardTable
              status={boardStatus}
              rows={boardRows}
              error={boardError}
              partial={boardPartial}
              nowMs={nowMs}
              stripFilter={stripFilter}
              focusToday={focusToday}
              onRowClick={(row) => setDrawer({ rowId: row.id, mode: 'overview' })}
              onRowAction={handleRowAction}
              onStagePick={(row, anchor) => setStagePicker({ rowId: row.id, anchor })}
              initialColWidths={persistedRef.current.colWidths}
              initialLaneFilter={persistedRef.current.laneFilter}
              onColWidthsChange={(widths) => persist({ colWidths: widths })}
              onLaneFilterChange={(laneFilter) => persist({ laneFilter })}
            />
            <RightRail
              status={railStatus}
              rail={rail}
              error={railError}
              nowMs={nowMs}
              boardRows={boardRows}
              onRowAction={handleRowAction}
              onCompleteTask={completeTaskFromRail}
              arrangement={railArrangement}
              onArrangementChange={(next) => {
                setRailArrangement(next);
                persist({ order: next.order, folds: next.folds, collapsed: next.collapsed });
              }}
            />
          </div>
          {drawer && (() => {
            const row = boardRows.find((candidate) => candidate.id === drawer.rowId);
            return row ? (
              <PeekDrawer
                row={row}
                mode={drawer.mode}
                host={host}
                onClose={() => setDrawer(null)}
                onStartCall={() => startCall(row)}
                onRowPatch={(patch) => setBoardRows((current) => current.map((candidate) => candidate.id === row.id ? { ...candidate, ...patch } : candidate))}
                onMoveStage={(anchor) => setStagePicker({ rowId: row.id, anchor })}
              />
            ) : null;
          })()}
          {stagePicker && (() => {
            const row = boardRows.find((candidate) => candidate.id === stagePicker.rowId);
            return row ? (
              <StagePicker
                row={row}
                anchor={stagePicker.anchor}
                host={host}
                onClose={() => setStagePicker(null)}
                onMoved={(result: Extract<DeskMoveResponse, { ok: true }>, toStage) => {
                  setBoardRows((current) => current.map((candidate) => candidate.id === row.id ? {
                    ...candidate,
                    stage: toStage,
                    meta: candidate.meta.replace(/ · [^·]+$/, ` · ${formatStageLabel(toStage)}`),
                    lastTouchAt: result.touchedAt ?? candidate.lastTouchAt,
                  } : candidate));
                  setUndoMove({ rowId: row.id, previousStage: result.previousStage, toStage, noteId: result.noteId, sideEffects: result.sideEffects });
                }}
              />
            ) : null;
          })()}
          {undoMove && (() => {
            const row = boardRows.find((candidate) => candidate.id === undoMove.rowId);
            if (!row) return null;
            return (
              <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 5001, display: 'flex', alignItems: 'center', gap: 14, padding: '11px 12px 11px 14px', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-sm)', background: 'var(--p-surface-2)', boxShadow: 'var(--p-shadow-pop)', color: 'var(--p-ink)', fontFamily: 'Hanken Grotesk, sans-serif', fontSize: 12.5 }}>
                <span>Moved to {formatStageLabel(undoMove.toStage)}{undoMove.sideEffects.length ? ` · ${undoMove.sideEffects.join(' · ')}` : ''}</span>
                <button type="button" onClick={async () => {
                  const result = await runDeskAction('undoMove', { laneObject: row.laneObject, recordId: row.recordId, previousStage: undoMove.previousStage, expectedStage: undoMove.toStage, noteId: undoMove.noteId }) as DeskUndoResponse | null;
                  if (!result?.ok) {
                    host.notify(result?.error === 'STALE_MOVE' ? 'The stage changed again, so Undo was not applied.' : "The stage couldn't be restored. Please try again.", 'error');
                    return;
                  }
                  setBoardRows((current) => current.map((candidate) => candidate.id === row.id ? { ...candidate, stage: undoMove.previousStage, meta: candidate.meta.replace(/ · [^·]+$/, ` · ${formatStageLabel(undoMove.previousStage)}`), lastTouchAt: result.touchedAt } : candidate));
                  if (result.sideEffectsStay.length) host.notify(`${result.sideEffectsStay.join(' · ')} stays in place.`, 'warning');
                  setUndoMove(null);
                }} style={{ all: 'unset', padding: '5px 8px', borderRadius: 6, color: 'var(--p-accent)', fontWeight: 600, cursor: 'pointer' }}>Undo</button>
              </div>
            );
          })()}
        </PulseNocturne>
      </PageContainer>
    </PropelMantineProvider>
  );
}
