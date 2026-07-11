/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// My Desk — runtime-loaded HERO ENTRY (Task 12 slice: today strip + read-only
// triage table + read-only right rail)
// ─────────────────────────────────────────────────────────────────────────────
// Rides Twenty's own chrome (PropelMantineProvider + PageContainer + PageHeader —
// same convention as ListingStudioPage/OffplanStudioPage): the sidebar/topbar in
// the approved mockup (docs/superpowers/specs/design-mockup-mydesk-nocturne.html,
// sidebar L813 / topbar L853) are the SHELL's, not this hero's — a separate native
// re-skin effort re-themes those. This hero owns everything below the topbar: the
// Today Strip + the desk grid (board + rail), in the Nocturne register (PulseNocturne).
//
// Task 12 deliverable: TodayStrip.tsx / BoardTable.tsx / RightRail.tsx, lifted
// out of the S1 scaffold's inline sections, now with real filtering (strip
// tiles + board chips) and the shared `banding.ts` mirror. Still read-only —
// no row/panel actions yet, no drawer (onRowClick is wired but stubbed here
// as a no-op; a later task opens the peek drawer from it).
//
// This hero self-serves auth/data via the shimmed callPropelRoute (ignores `host`),
// matching every other runtime-loaded hero in this fork.

import { useEffect, useRef, useState } from 'react';
import { IconLayoutDashboard } from 'twenty-ui/display';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

import { FONT_DISPLAY, PulseFonts, PulseNocturne } from '../_pulse/pulse';

import { BoardTable } from './BoardTable';
import { RightRail } from './RightRail';
import { TodayStrip, type StripFilter } from './TodayStrip';
import { fetchBoard, fetchRail } from './deskApi';
import type { DeskRailOk, DeskRow } from './types';

// "Now", re-snapshotted periodically so band classification (SLA windows,
// going-cold thresholds) doesn't silently go stale on a desk left open for
// hours. 30s is plenty for minute-granularity bands — the second-by-second
// SLA countdown itself is SlaRing's job (Task 14), not this clock's.
const NOW_TICK_MS = 30_000;

export default function MyDeskHero(_props: { host: PropelHeroHost }) {
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

  const cancelledRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), NOW_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

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
              // The peek drawer lands in a later task — Task 12 is read-only.
              onRowClick={() => {}}
            />
            <RightRail status={railStatus} rail={rail} error={railError} />
          </div>
        </PulseNocturne>
      </PageContainer>
    </PropelMantineProvider>
  );
}
