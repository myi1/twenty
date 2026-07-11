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

import { useEffect, useRef, useState } from 'react';
import { IconLayoutDashboard } from 'twenty-ui/display';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

import { FONT_DISPLAY, PulseFonts, PulseNocturne } from '../_pulse/pulse';

import { BoardTable } from './BoardTable';
import { deskRecordPath, PeekDrawer, type DrawerMode } from './PeekDrawer';
import { RightRail } from './RightRail';
import { TodayStrip, type StripFilter } from './TodayStrip';
import { fetchBoard, fetchRail, fetchTimeline } from './deskApi';
import type { DeskRailOk, DeskRow } from './types';

// "Now", re-snapshotted periodically so band classification (SLA windows,
// going-cold thresholds) doesn't silently go stale on a desk left open for
// hours. 30s is plenty for minute-granularity bands — the second-by-second
// SLA countdown itself is SlaRing's job (Task 14), not this clock's.
const NOW_TICK_MS = 30_000;

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
  // The Today Strip's active filter tile, ANDed against BoardTable's own
  // lane/going-cold chip filter — set by TodayStrip, consumed by BoardTable.
  const [stripFilter, setStripFilter] = useState<StripFilter | null>(null);
  const [drawer, setDrawer] = useState<{ rowId: string; mode: DrawerMode } | null>(null);
  const [pendingCall, setPendingCall] = useState<{ rowId: string; startedAtMs: number } | null>(null);

  const cancelledRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), NOW_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

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

  useEffect(() => {
    cancelledRef.current = false;

    // Board — fails ALONE (a rail outage must never blank the opportunities list).
    // Tracks how many rows made it on screen so a MID-SEQUENCE failure (page 2+,
    // incl. deskApi's stuck-cursor/page-cap bails) degrades to a partial board
    // instead of erasing rows the agent is already reading.
    let boardRowsReceived = 0;
    fetchBoard((rows) => {
      if (cancelledRef.current) return;
      boardRowsReceived = rows.length;
      setBoardRows(rows);
      setBoardStatus('ready');
    })
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
          <TodayStrip
            boardStatus={boardStatus}
            rows={boardRows}
            railStatus={railStatus}
            rail={rail}
            nowMs={nowMs}
            activeFilter={stripFilter}
            onToggleFilter={(filter) =>
              setStripFilter((prev) => (prev === filter ? null : filter))
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
              onRowClick={(row) => setDrawer({ rowId: row.id, mode: 'overview' })}
              onRowAction={(action, row) => {
                if (action === 'call' && row.phoneE164) {
                  startCall(row);
                  return;
                }
                if (action === 'open') {
                  host.navigate(deskRecordPath(row));
                  return;
                }
                setDrawer({ rowId: row.id, mode: action === 'call' ? 'overview' : action });
              }}
            />
            <RightRail status={railStatus} rail={rail} error={railError} />
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
              />
            ) : null;
          })()}
        </PulseNocturne>
      </PageContainer>
    </PropelMantineProvider>
  );
}
