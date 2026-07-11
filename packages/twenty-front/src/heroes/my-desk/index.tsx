/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// My Desk — runtime-loaded HERO ENTRY (S1 slice: the SHELL)
// ─────────────────────────────────────────────────────────────────────────────
// Rides Twenty's own chrome (PropelMantineProvider + PageContainer + PageHeader —
// same convention as ListingStudioPage/OffplanStudioPage): the sidebar/topbar in
// the approved mockup (docs/superpowers/specs/design-mockup-mydesk-nocturne.html,
// sidebar L813 / topbar L853) are the SHELL's, not this hero's — a separate native
// re-skin effort re-themes those. This hero owns everything below the topbar: the
// Today Strip + the desk grid (board + rail), in the Nocturne register (PulseNocturne).
//
// S1 deliverable: the shell only — real data (board paging + rail), skeletons,
// empty/error states. No row/panel actions yet (Task 12 wires the board table +
// rail interactivity; the peek drawer / timeline / waContext land later).
//
// This hero self-serves auth/data via the shimmed callPropelRoute (ignores `host`),
// matching every other runtime-loaded hero in this fork.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconLayoutDashboard } from 'twenty-ui/display';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { type PropelHeroHost } from '@/propel/runtime/heroHost';

import { SPACE } from '../_pulse/pulse-tokens';
import {
  FONT_DISPLAY,
  FONT_MONO,
  FONT_UI,
  KpiTile,
  P,
  PulseFonts,
  PulseNocturne,
} from '../_pulse/pulse';

import { fetchBoard, fetchRail } from './deskApi';
import {
  formatAedTotal,
  formatClock,
  formatRelative,
  friendlyError,
} from './format';
import { SkeletonBar, SkeletonStack, Text } from './shared';
import type {
  DeskRailResponse,
  DeskRow,
  DeskTaskItem,
  DeskUnreadWaItem,
  DeskViewingItem,
} from './types';

// The successful-response shape of the rail action — narrows out the shared
// `{ ok: false; error }` envelope so panel code never has to re-check `ok`.
type DeskRailOk = Extract<DeskRailResponse, { ok: true }>;

// Skeleton bar heights, matched to the REAL rows they stand in for (a BoardRow
// renders at ≈56px, a RailItem block at ≈40px) so the loading→loaded swap
// doesn't shift the layout.
const BOARD_ROW_HEIGHT = 56;
const RAIL_ITEM_HEIGHT = 40;

// Reserves a KpiTile text line's height while its content is still unknown —
// without it the strip tiles grow when data lands (KpiTile omits the delta
// line entirely for an undefined delta, and pulse.tsx is shared/untouchable).
// The value is a NON-BREAKING space (U+00A0) — a plain space would
// whitespace-collapse into a zero-height line and reserve nothing.
const LINE_PLACEHOLDER = ' ';

// ── Today Strip — 4 KPI tiles laid over a 1px --p-line grid (DESIGN.md §4) ──

type StripStat = {
  label: string;
  figure: string;
  hint: string;
  deltaTone: 'up' | 'flat';
};

const TodayStrip = ({
  status,
  rail,
}: {
  status: 'loading' | 'ready' | 'error';
  rail: DeskRailOk | null;
}) => {
  const stats: StripStat[] | null =
    status === 'ready' && rail
      ? [
          {
            label: 'Needs you now',
            figure: String(rail.priorityLeads.length),
            hint: 'priority leads waiting on a reply',
            deltaTone: rail.priorityLeads.length > 0 ? ('up' as const) : ('flat' as const),
          },
          {
            label: 'Viewings today',
            figure: String(rail.viewings.length),
            hint:
              rail.viewings.length > 0 && formatClock(rail.viewings[0]?.scheduledAt ?? null)
                ? `next at ${formatClock(rail.viewings[0]?.scheduledAt ?? null)}`
                : 'none scheduled',
            deltaTone: 'flat' as const,
          },
          {
            label: 'Unread WhatsApp',
            figure: String(
              rail.unreadWa.reduce((n, item) => n + (item.unreadCount ?? 1), 0),
            ),
            hint: rail.unreadWa.length > 0 ? 'conversations waiting on a reply' : 'all caught up',
            deltaTone: 'flat' as const,
          },
          {
            label: 'Tasks due today',
            figure: String(rail.tasks.length),
            hint: rail.tasks.length > 0 ? 'on today\'s list' : 'nothing due today',
            deltaTone: 'flat' as const,
          },
        ]
      : null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 1,
        background: 'var(--p-line)',
        borderBottom: '1px solid var(--p-line)',
      }}
    >
      {(stats ?? Array.from({ length: 4 })).map((stat, i) => (
        <KpiTile
          key={stat ? stat.label : i}
          label={stat ? stat.label : LINE_PLACEHOLDER}
          figure={
            status === 'error' ? '—' : stat ? stat.figure : <SkeletonBar height={27} />
          }
          delta={
            status === 'error'
              ? "Couldn't load"
              : stat
                ? stat.hint
                : LINE_PLACEHOLDER
          }
          deltaTone={stat?.deltaTone ?? 'flat'}
          style={{ borderRadius: 0 }}
        />
      ))}
    </div>
  );
};

// ── Board (centerpiece) — a lean row list. Task 12 replaces this with the full
// table/kanban view + filter chips from the mockup. ────────────────────────

const BoardList = ({
  status,
  rows,
  error,
  partial,
}: {
  status: 'loading' | 'ready' | 'error';
  rows: DeskRow[];
  error: string | null;
  /** Later pages failed after some rows already landed — keep them on screen. */
  partial: boolean;
}) => {
  const totalValue = rows.reduce((sum, r) => sum + (r.valueAed ?? 0), 0);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        borderRight: '1px solid var(--p-line)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: SPACE[2],
          padding: `${SPACE[5]}px ${SPACE[6]}px ${SPACE[4]}px`,
          borderBottom: '1px solid var(--p-line)',
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

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: SPACE[4] }}>
        {status === 'error' && (
          <Text muted>{friendlyError(error ?? 'DESK_LOAD_FAILED')}</Text>
        )}
        {status === 'loading' && (
          <SkeletonStack rows={7} height={BOARD_ROW_HEIGHT} />
        )}
        {status === 'ready' && rows.length === 0 && (
          <Text muted>Nothing needs you right now — all replies are on time.</Text>
        )}
        {status === 'ready' && rows.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--p-line)' }}>
              {rows.map((row) => (
                <BoardRow key={row.id} row={row} />
              ))}
            </div>
            {partial && (
              <div style={{ paddingTop: SPACE[3] }}>
                <Text muted>
                  Couldn't load the rest — showing what arrived.
                </Text>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const BoardRow = ({ row }: { row: DeskRow }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACE[4],
      padding: `${SPACE[3]}px ${SPACE[4]}px`,
      background: P.surface,
    }}
  >
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: FONT_UI, fontSize: 13.5, fontWeight: 500, color: P.ink }}>
        {row.name || 'Unnamed'}
      </div>
      <div style={{ fontFamily: FONT_UI, fontSize: 11.5, color: P.ink2, marginTop: 2 }}>
        {row.meta}
        {row.nextAction ? ` · ${row.nextAction}` : ''}
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[4], flex: 'none' }}>
      {row.valueAed !== null && (
        <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: 'var(--p-accent-strong)' }}>
          {formatAedTotal(row.valueAed)}
        </span>
      )}
      <span style={{ fontFamily: FONT_UI, fontSize: 11, color: P.ink2, minWidth: 64, textAlign: 'right' }}>
        {formatRelative(row.lastTouchAt) ?? 'no touch yet'}
      </span>
    </div>
  </div>
);

// ── Right rail — 4 stacked panels. Drag-reorder/fold land with Task 12+. ────

const RailPanelShell = ({
  title,
  count,
  status,
  error,
  emptyLabel,
  children,
}: {
  title: string;
  count: number | null;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  emptyLabel: string;
  children: ReactNode;
}) => (
  <div style={{ borderBottom: '1px solid var(--p-line)', padding: SPACE[4] }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], marginBottom: SPACE[3] }}>
      <span style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: 600, color: P.ink }}>{title}</span>
      {count !== null && (
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: P.ink2 }}>{count}</span>
      )}
    </div>
    {status === 'loading' && <SkeletonStack rows={2} height={RAIL_ITEM_HEIGHT} />}
    {status === 'error' && <Text muted>{friendlyError(error ?? 'DESK_LOAD_FAILED')}</Text>}
    {status === 'ready' && count === 0 && <Text muted>{emptyLabel}</Text>}
    {status === 'ready' && count !== null && count > 0 && children}
  </div>
);

const RailItem = ({ title, subtitle }: { title: string; subtitle: string | null }) => (
  <div style={{ padding: `${SPACE[2]}px 0` }}>
    <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: P.ink }}>{title}</div>
    {subtitle && (
      <div style={{ fontFamily: FONT_UI, fontSize: 11, color: P.ink2, marginTop: 2 }}>{subtitle}</div>
    )}
  </div>
);

const taskSubtitle = (t: DeskTaskItem): string | null => {
  const clock = formatClock(t.slaDueAt);
  return clock ? `Due ${clock}` : null;
};

const viewingSubtitle = (v: DeskViewingItem): string | null => {
  const clock = formatClock(v.scheduledAt);
  return clock ?? null;
};

const unreadWaSubtitle = (w: DeskUnreadWaItem): string => {
  const count = w.unreadCount ?? 1;
  const when = formatRelative(w.lastMessageAt);
  return `${count} unread${when ? ` · ${when}` : ''}`;
};

const RailRegion = ({
  status,
  rail,
  error,
}: {
  status: 'loading' | 'ready' | 'error';
  rail: DeskRailOk | null;
  error: string | null;
}) => (
  <aside style={{ width: 352, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
    <RailPanelShell
      title="Today's tasks"
      count={rail ? rail.tasks.length : null}
      status={status}
      error={error}
      emptyLabel="No tasks due today."
    >
      {rail?.tasks.map((t) => (
        <RailItem key={t.id} title={t.title ?? 'Untitled task'} subtitle={taskSubtitle(t)} />
      ))}
    </RailPanelShell>

    <RailPanelShell
      title="Viewings today"
      count={rail ? rail.viewings.length : null}
      status={status}
      error={error}
      emptyLabel="No viewings today."
    >
      {rail?.viewings.map((v) => (
        <RailItem key={v.id} title={v.name ?? 'Viewing'} subtitle={viewingSubtitle(v)} />
      ))}
    </RailPanelShell>

    <RailPanelShell
      title="Unread WhatsApp"
      count={rail ? rail.unreadWa.length : null}
      status={status}
      error={error}
      emptyLabel="You're all caught up."
    >
      {rail?.unreadWa.map((w) => (
        <RailItem key={w.id} title={w.name ?? 'Conversation'} subtitle={unreadWaSubtitle(w)} />
      ))}
    </RailPanelShell>

    <RailPanelShell
      title="Priority leads"
      count={rail ? rail.priorityLeads.length : null}
      status={status}
      error={error}
      emptyLabel="No leads waiting on you."
    >
      {rail?.priorityLeads.map((r) => (
        <RailItem
          key={r.id}
          title={r.name}
          subtitle={
            formatClock(r.slaDeadline) ? `Reply window ends ${formatClock(r.slaDeadline)}` : r.meta
          }
        />
      ))}
    </RailPanelShell>
  </aside>
);

// ── Root ─────────────────────────────────────────────────────────────────────

export default function MyDeskHero(_props: { host: PropelHeroHost }) {
  const [boardStatus, setBoardStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [boardRows, setBoardRows] = useState<DeskRow[]>([]);
  const [boardError, setBoardError] = useState<string | null>(null);
  // A later page failed AFTER rows were already painted — keep them on screen
  // (BoardList renders an inline "showing what arrived" line instead of an
  // error state that would erase the rows the agent is already looking at).
  const [boardPartial, setBoardPartial] = useState(false);

  const [railStatus, setRailStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rail, setRail] = useState<DeskRailOk | null>(null);
  const [railError, setRailError] = useState<string | null>(null);

  const cancelledRef = useRef(false);

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
          <TodayStrip status={railStatus} rail={rail} />
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <BoardList
              status={boardStatus}
              rows={boardRows}
              error={boardError}
              partial={boardPartial}
            />
            <RailRegion status={railStatus} rail={rail} error={railError} />
          </div>
        </PulseNocturne>
      </PageContainer>
    </PropelMantineProvider>
  );
}
