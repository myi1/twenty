// RightRail.tsx — four stacked, independently-failing panels (mockup
// L1205–1372). Lifted out of index.tsx's inline RailPanelShell/RailItem/
// RailRegion per Task 12.
//
// Info rows ONLY in this task (the plan's own call: "Actions arrive in the
// next update" is not an acceptable placeholder, so — rather than render
// disabled-with-reason mini-action buttons — we simply don't render any
// per-item action affordance yet; every row is plain info). Drag-reorder /
// per-panel fold / the whole-rail collapse handle are later polish, not
// wired here.

import { useNavigate } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import type { ReactNode } from 'react';

import { SPACE } from '../_pulse/pulse-tokens';
import { FONT_MONO, FONT_UI, P, Seal } from '../_pulse/pulse';

import { formatClock, formatRelative, friendlyError } from './format';
import { SkeletonStack, Text } from './shared';
import type {
  DeskRailOk,
  DeskTaskItem,
  DeskUnreadWaItem,
  DeskViewingItem,
} from './types';

const RAIL_ITEM_HEIGHT = 40;

const RailPanelShell = ({
  title,
  count,
  status,
  error,
  emptyLabel,
  seeAllLabel,
  onSeeAll,
  children,
}: {
  title: string;
  count: number | null;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  emptyLabel: string;
  seeAllLabel: string;
  onSeeAll: () => void;
  children: ReactNode;
}) => (
  <div style={{ borderBottom: '1px solid var(--p-line)', padding: SPACE[4] }}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: SPACE[2],
        marginBottom: SPACE[3],
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2] }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: 600, color: P.ink }}>
          {title}
        </span>
        {count !== null && (
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: P.ink2 }}>{count}</span>
        )}
      </div>
      <button
        type="button"
        onClick={onSeeAll}
        style={{
          all: 'unset',
          cursor: 'pointer',
          fontFamily: FONT_MONO,
          fontSize: 9.5,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--p-accent)',
        }}
      >
        {seeAllLabel}
      </button>
    </div>
    {status === 'loading' && <SkeletonStack rows={2} height={RAIL_ITEM_HEIGHT} />}
    {status === 'error' && <Text muted>{friendlyError(error ?? 'DESK_LOAD_FAILED')}</Text>}
    {status === 'ready' && count === 0 && <Text muted>{emptyLabel}</Text>}
    {status === 'ready' && count !== null && count > 0 && children}
  </div>
);

const RailItem = ({ title, subtitle }: { title: ReactNode; subtitle: string | null }) => (
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

const viewingSubtitle = (v: DeskViewingItem): string | null => formatClock(v.scheduledAt);

const unreadWaSubtitle = (w: DeskUnreadWaItem): string => {
  const count = w.unreadCount ?? 1;
  const when = formatRelative(w.lastMessageAt);
  return `${count} unread${when ? ` · ${when}` : ''}`;
};

export const RightRail = ({
  status,
  rail,
  error,
}: {
  status: 'loading' | 'ready' | 'error';
  rail: DeskRailOk | null;
  error: string | null;
}) => {
  const navigate = useNavigate();

  return (
    <aside style={{ width: 352, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <RailPanelShell
        title="Today's tasks"
        count={rail ? rail.tasks.length : null}
        status={status}
        error={error}
        emptyLabel="No tasks due today."
        seeAllLabel="See all"
        onSeeAll={() => navigate(AppPath.TasksPage)}
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
        seeAllLabel="Calendar"
        // No dedicated calendar route exists in this app yet (checked
        // AppPath — nothing calendar-flavored ships). Viewings ARE a
        // first-class Twenty object (`Viewing`, defined in
        // src/objects/viewing.object.ts in the CRM repo) with a real
        // record-index route, so this points there instead of a dead link.
        onSeeAll={() => navigate('/objects/viewings')}
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
        seeAllLabel="Open Inbox"
        onSeeAll={() => navigate(AppPath.Inbox)}
      >
        {rail?.unreadWa.map((w) => (
          <RailItem
            key={w.id}
            // Mockup L1315/1325 quotes the last inbound message in italics
            // ("can we do 2.35?"). The rail response's unreadWa items don't
            // carry the message text — only {id,name,unreadCount,
            // lastMessageAt,contactId} — so we render name + unread count +
            // relative time instead. Quoting the last inbound needs route
            // support — Task 15+.
            title={w.name ?? 'Conversation'}
            subtitle={unreadWaSubtitle(w)}
          />
        ))}
      </RailPanelShell>

      <RailPanelShell
        title="Priority leads"
        count={rail ? rail.priorityLeads.length : null}
        status={status}
        error={error}
        emptyLabel="No leads waiting on you."
        seeAllLabel="All leads"
        onSeeAll={() => navigate('/objects/people')}
      >
        {rail?.priorityLeads.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: SPACE[2],
              padding: `${SPACE[2]}px 0`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: P.ink }}>{r.name}</div>
              <div style={{ fontFamily: FONT_UI, fontSize: 11, color: P.ink2, marginTop: 2 }}>
                {r.meta}
              </div>
            </div>
            {/* Flat "Reply soon" seal for every priority lead in Task 12 —
                the live countdown (red "Reply now" ring vs. amber "Reply
                soon") is SlaRing's job, and SlaRing arrives Task 14. Don't
                hand-roll an urgency distinction here that Task 14 will
                replace wholesale. */}
            <Seal tone="warn" label="Reply soon" style={{ flex: 'none' }} />
          </div>
        ))}
      </RailPanelShell>
    </aside>
  );
};
