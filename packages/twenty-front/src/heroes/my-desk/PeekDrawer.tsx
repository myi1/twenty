import { useEffect, useMemo, useState } from 'react';
import styled from '@emotion/styled';
import {
  IconComment,
  IconCalendar,
  IconCheck,
  IconClock,
  IconExternalLink,
  IconNotes,
  IconPhone,
  IconX,
} from 'twenty-ui/display';

import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import { DUR, EASE, SPACE } from '../_pulse/pulse-tokens';
import { FONT_DISPLAY, FONT_MONO, FONT_UI, P, Seal } from '../_pulse/pulse';
import { fetchTimeline, fetchWaContext, runDeskAction, sendDeskWhatsApp } from './deskApi';
import { formatAedTotal, formatRelative, formatStageLabel } from './format';
import { stageTone } from './stageTone';
import type { DeskRow, DeskTimelineEvent, DeskWaContextResponse } from './types';

export type DrawerMode = 'overview' | 'note' | 'whatsapp' | 'more' | 'task' | 'viewing' | 'snooze' | 'postCall';

const Scrim = styled.button`
  all: unset;
  position: fixed;
  inset: 0;
  z-index: 39;
  background: color-mix(in srgb, var(--p-bg) 58%, transparent);
`;

const Panel = styled.aside`
  position: fixed;
  z-index: 40;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(620px, 92vw);
  display: flex;
  flex-direction: column;
  color: var(--p-ink);
  background: var(--p-bg);
  border-left: 1px solid var(--p-line);
  box-shadow: var(--p-shadow-pop);
  animation: desk-drawer-in ${DUR.drawerIn}ms ${EASE.out} both;
  @keyframes desk-drawer-in {
    from { transform: translate3d(24px, 0, 0); opacity: 0; }
    to { transform: translate3d(0, 0, 0); opacity: 1; }
  }
`;

const IconButton = styled.button`
  all: unset;
  box-sizing: border-box;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: var(--p-ink-2);
  border: 1px solid var(--p-line);
  cursor: pointer;
  &:hover { color: var(--p-ink); border-color: var(--p-accent); }
  &:disabled { cursor: not-allowed; opacity: .38; }
`;

const Button = styled.button<{ $primary?: boolean }>`
  all: unset;
  box-sizing: border-box;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 13px;
  border-radius: 999px;
  font: 500 12px ${FONT_UI};
  cursor: pointer;
  color: ${({ $primary }) => ($primary ? 'var(--p-bg)' : 'var(--p-ink)')};
  background: ${({ $primary }) => ($primary ? 'var(--p-accent-strong)' : 'transparent')};
  border: 1px solid ${({ $primary }) => ($primary ? 'var(--p-accent-strong)' : 'var(--p-line)')};
  &:disabled { cursor: not-allowed; opacity: .38; }
`;

const Input = styled.input`
  box-sizing: border-box;
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius-sm);
  background: var(--p-surface);
  color: var(--p-ink);
  padding: 9px 11px;
  font: 12.5px ${FONT_UI};
  outline: none;
  &:focus { border-color: var(--p-accent); }
`;

const Textarea = styled.textarea`
  box-sizing: border-box;
  width: 100%;
  min-height: 88px;
  resize: vertical;
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius-sm);
  background: var(--p-surface);
  color: var(--p-ink);
  padding: 10px 11px;
  font: 12.5px/1.5 ${FONT_UI};
  outline: none;
  &:focus { border-color: var(--p-accent); }
`;

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section style={{ padding: `${SPACE[5]}px ${SPACE[6]}px`, borderBottom: '1px solid var(--p-line)' }}>
    <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '.13em', textTransform: 'uppercase', color: P.ink2, marginBottom: SPACE[3] }}>
      {title}
    </div>
    {children}
  </section>
);

const OBJECT_SINGULAR: Record<DeskRow['laneObject'], string> = {
  lead: 'person',
  secondaryOpportunity: 'secondaryOpportunity',
  sellOpportunity: 'sellOpportunity',
  offplanOpportunity: 'offPlanOpportunity',
  rcbiOpportunity: 'rcbiOpportunity',
  institutionalOpportunity: 'institutionalOpportunity',
  listing: 'listing',
  deal: 'deal',
};

export const deskRecordPath = (row: DeskRow) => `/object/${OBJECT_SINGULAR[row.laneObject]}/${row.recordId}`;

const eventLabel = (event: DeskTimelineEvent): string => ({
  NOTE: 'Note', TASK: 'Task', CALL: 'Call', WHATSAPP: 'WhatsApp',
})[event.type];

export const PeekDrawer = ({
  row,
  mode,
  host,
  onClose,
  onStartCall,
  onRowPatch,
  onMoveStage,
}: {
  row: DeskRow;
  mode: DrawerMode;
  host: PropelHeroHost;
  onClose: () => void;
  onStartCall: () => void;
  onRowPatch: (patch: Partial<DeskRow>) => void;
  onMoveStage: (anchor: { x: number; y: number }) => void;
}) => {
  const [activeMode, setActiveMode] = useState(mode);
  const [timeline, setTimeline] = useState<DeskTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [wa, setWa] = useState<DeskWaContextResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [viewingLabel, setViewingLabel] = useState('');
  const [viewingAt, setViewingAt] = useState('');

  const target = useMemo(() => ({ laneObject: row.laneObject, recordId: row.recordId }), [row.laneObject, row.recordId]);
  const latestCall = useMemo(() => timeline.find((event) => event.type === 'CALL') ?? null, [timeline]);
  const latestWa = useMemo(() => timeline.find((event) => event.type === 'WHATSAPP') ?? null, [timeline]);

  const reloadTimeline = () => {
    setTimelineLoading(true);
    fetchTimeline(row.laneObject, row.recordId)
      .then((res) => setTimeline(res?.ok ? res.events : []))
      .finally(() => setTimelineLoading(false));
  };

  useEffect(() => {
    setActiveMode(mode);
    setNote('');
    setMessage('');
    reloadTimeline();
    setWa(null);
    if (row.personId) fetchWaContext(row.personId).then(setWa);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, mode]);

  const write = async (action: string, body: Record<string, unknown>, success: string, notifySuccess = true) => {
    setBusy(true);
    try {
      const res = await runDeskAction(action, { ...target, ...body });
      if (!res?.ok) {
        host.notify(res?.error === 'SLA_IN_WINDOW' ? 'This lead is still inside the reply window and cannot be snoozed.' : "That didn't save. Please try again.", 'error');
        return false;
      }
      if (res.auditWarning) host.notify(`${success}, but the timeline needs a refresh.`, 'warning');
      else if (notifySuccess) host.notify(success, 'success');
      if (res.touchedAt) onRowPatch({ lastTouchAt: res.touchedAt });
      reloadTimeline();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    const previous = row.lastTouchAt;
    onRowPatch({ lastTouchAt: new Date().toISOString() });
    if (await write('note', { text: note.trim() }, 'Note added')) setNote('');
    else onRowPatch({ lastTouchAt: previous });
  };

  const completeNext = async () => {
    if (!row.nextActionTaskId) return;
    if (await write('completeTask', { taskId: row.nextActionTaskId }, 'Next action completed')) {
      onRowPatch({ nextAction: null, nextActionTaskId: null, nextActionDueAt: null, taskDueToday: false });
    }
  };

  const sendWa = async (templateName?: string) => {
    if (!wa?.ok || !wa.conversationId) return;
    setBusy(true);
    try {
      const res = await sendDeskWhatsApp(wa.conversationId, templateName ? '' : message.trim(), templateName);
      if (!res || res.ok === false) {
        host.notify('WhatsApp could not send this message.', 'error');
        return;
      }
      host.notify('WhatsApp sent', 'success');
      setMessage('');
      await write('touch', { summary: templateName ? 'Sent a WhatsApp template' : 'Sent a WhatsApp message' }, 'Last touch updated', false);
    } finally {
      setBusy(false);
    }
  };

  const openFullRecord = () => host.navigate(deskRecordPath(row));

  return (
    <>
      <Scrim type="button" aria-label="Close record preview" onClick={onClose} />
      <Panel aria-label={`${row.name} preview`}>
        <header style={{ padding: `${SPACE[5]}px ${SPACE[6]}px`, borderBottom: '1px solid var(--p-line)', display: 'flex', gap: SPACE[4], alignItems: 'flex-start' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, display: 'grid', placeItems: 'center', flex: 'none', background: P.surface2, border: '1px solid var(--p-line)', font: `18px ${FONT_DISPLAY}`, color: P.accent }}>
            {(row.name || '?').charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `500 21px ${FONT_DISPLAY}`, color: P.ink }}>{row.name}</div>
            <div style={{ font: `12px ${FONT_UI}`, color: P.ink2, marginTop: 3 }}>{row.meta}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {row.laneObject === 'lead' ? <Seal tone={stageTone(row.stage, row.laneObject)} label={formatStageLabel(row.stage)} /> : (
                <button
                  type="button"
                  aria-label={`Move ${row.name} to another stage`}
                  title="Move stage"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    onMoveStage({ x: rect.left, y: rect.bottom + 6 });
                  }}
                  style={{ all: 'unset', display: 'inline-flex', borderRadius: 999, cursor: 'pointer' }}
                >
                  <Seal tone={stageTone(row.stage, row.laneObject)} label={formatStageLabel(row.stage)} />
                </button>
              )}
              {row.valueAed !== null && <span style={{ font: `500 12px ${FONT_MONO}`, color: P.accent }}>~{formatAedTotal(row.valueAed)}</span>}
            </div>
          </div>
          <IconButton type="button" aria-label="Close" onClick={onClose}><IconX size={17} /></IconButton>
        </header>

        <div style={{ display: 'flex', gap: 8, padding: `${SPACE[4]}px ${SPACE[6]}px`, borderBottom: '1px solid var(--p-line)', overflowX: 'auto' }}>
          <Button type="button" disabled={!row.phoneE164} title={row.phoneE164 ? 'Call' : 'No phone number'} onClick={onStartCall}><IconPhone size={14} /> Call</Button>
          <Button type="button" disabled={!row.phoneE164 || !row.hasWhatsApp} title={!row.phoneE164 ? 'No phone number yet' : row.hasWhatsApp ? 'WhatsApp' : 'Not on WhatsApp yet'} onClick={() => setActiveMode('whatsapp')}><IconComment size={14} /> WhatsApp</Button>
          <Button type="button" onClick={() => setActiveMode('note')}><IconNotes size={14} /> Note</Button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {activeMode === 'postCall' && (
            <Section title="After the call">
              <div style={{ font: `13px/1.5 ${FONT_UI}`, color: P.ink, marginBottom: 10 }}>
                {latestCall ? `${row.name} · ${latestCall.durationSeconds ? `${Math.max(1, Math.round(latestCall.durationSeconds / 60))} min` : 'call ended'} · ${formatRelative(latestCall.occurredAt) ?? 'just now'}` : `Call with ${row.name}`}
              </div>
              <Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? What is the next step?" />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}><Button $primary disabled={busy || !note.trim()} onClick={saveNote}><IconCheck size={14} /> Save outcome</Button></div>
            </Section>
          )}

          {activeMode === 'note' && (
            <Section title="Add note">
              <Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where did you leave this?" />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}><Button $primary disabled={busy || !note.trim()} onClick={saveNote}><IconCheck size={14} /> Add note</Button></div>
            </Section>
          )}

          {activeMode === 'whatsapp' && (
            <Section title="WhatsApp">
              {!row.personId || (wa?.ok && !wa.conversationId) ? (
                <div style={{ font: `12.5px ${FONT_UI}`, color: P.ink2 }}>No WhatsApp conversation is linked to this contact yet.</div>
              ) : !wa ? (
                <div style={{ font: `12.5px ${FONT_UI}`, color: P.ink2 }}>Checking the conversation…</div>
              ) : !wa.ok ? (
                <div style={{ font: `12.5px ${FONT_UI}`, color: P.ink2 }}>WhatsApp is unavailable right now.</div>
              ) : wa.withinWindow ? (
                <>
                  <Textarea autoFocus value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a personal message…" />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}><Button $primary disabled={busy || !message.trim()} onClick={() => sendWa()}><IconComment size={14} /> Send</Button></div>
                </>
              ) : (
                <div>
                  <div style={{ font: `12.5px/1.5 ${FONT_UI}`, color: P.ink2, marginBottom: 10 }}>The 24-hour reply window is closed. Choose an approved template:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {wa.templates.map((template) => <Button key={template.name} disabled={busy} onClick={() => sendWa(template.name)}>{template.bodyText}</Button>)}
                    {wa.templates.length === 0 && <div style={{ font: `12px ${FONT_UI}`, color: P.ink2 }}>No approved re-engagement template is available yet.</div>}
                  </div>
                </div>
              )}
            </Section>
          )}

          {(['more', 'task', 'viewing', 'snooze'] as DrawerMode[]).includes(activeMode) && (
            <>
              {(activeMode === 'more' || activeMode === 'task') && <Section title="Create a follow-up task">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 8 }}>
                  <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="What needs to happen?" />
                  <Input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}><Button disabled={busy || !taskTitle.trim() || !taskDue} onClick={async () => {
                  if (await write('createTask', { title: taskTitle.trim(), dueAt: new Date(taskDue).toISOString() }, 'Task created')) { setTaskTitle(''); setTaskDue(''); }
                }}><IconClock size={14} /> Create task</Button></div>
              </Section>}
              {(activeMode === 'more' || activeMode === 'viewing') && row.laneObject === 'secondaryOpportunity' && <Section title="Book a viewing">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 8 }}>
                  <Input value={viewingLabel} onChange={(e) => setViewingLabel(e.target.value)} placeholder="Property or meeting point" />
                  <Input type="datetime-local" value={viewingAt} onChange={(e) => setViewingAt(e.target.value)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}><Button disabled={busy || !viewingLabel.trim() || !viewingAt} onClick={async () => {
                  if (await write('logViewing', { propertyLabel: viewingLabel.trim(), at: new Date(viewingAt).toISOString() }, 'Viewing booked')) { setViewingLabel(''); setViewingAt(''); }
                }}><IconCalendar size={14} /> Book viewing</Button></div>
              </Section>}
              {(activeMode === 'more' || activeMode === 'snooze') && row.laneObject === 'lead' && <Section title="Snooze">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[['Later today', 4], ['Tomorrow', 24], ['Next week', 168]].map(([label, hours]) => <Button key={String(label)} disabled={busy || !row.personId} onClick={async () => {
                    const until = new Date(Date.now() + Number(hours) * 3_600_000).toISOString();
                    if (await write('snooze', { until }, `Snoozed until ${label}`)) onRowPatch({ snoozedUntil: until });
                  }}><IconClock size={14} /> {label}</Button>)}
                </div>
              </Section>}
            </>
          )}

          <Section title="Next action">
            {row.nextAction ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACE[3] }}>
                <div><div style={{ font: `500 13px ${FONT_UI}`, color: P.ink }}>{row.nextAction}</div><div style={{ font: `11px ${FONT_MONO}`, color: P.ink2, marginTop: 4 }}>{row.nextActionDueAt ? `Due ${formatRelative(row.nextActionDueAt)}` : 'No due date'}</div></div>
                {row.nextAction.toLowerCase().match(/whatsapp|reply|message/) && row.personId ? (
                  <Button disabled={busy} onClick={() => setActiveMode('whatsapp')}><IconComment size={14} /> Reply now</Button>
                ) : row.nextAction.toLowerCase().includes('call') && row.phoneE164 ? (
                  <Button disabled={busy} onClick={onStartCall}><IconPhone size={14} /> Call now</Button>
                ) : row.nextActionTaskId ? (
                  <Button disabled={busy} onClick={completeNext}><IconCheck size={14} /> Mark done</Button>
                ) : (
                  <Button onClick={openFullRecord}>Open record <IconExternalLink size={14} /></Button>
                )}
              </div>
            ) : <div style={{ font: `12.5px ${FONT_UI}`, color: P.ink2 }}>No follow-up task is set.</div>}
          </Section>

          {activeMode === 'overview' && row.hasWhatsApp && (
            <Section title="Latest WhatsApp">
              <div style={{ font: `12.5px/1.5 ${FONT_UI}`, color: latestWa ? P.ink : P.ink2, marginBottom: 10 }}>
                {latestWa?.title ?? 'No WhatsApp messages yet.'}
              </div>
              <Button onClick={() => setActiveMode('whatsapp')}><IconComment size={14} /> Quick reply</Button>
            </Section>
          )}

          <Section title="Timeline">
            {timelineLoading ? <div style={{ font: `12.5px ${FONT_UI}`, color: P.ink2 }}>Loading activity…</div> : timeline.length === 0 ? <div style={{ font: `12.5px ${FONT_UI}`, color: P.ink2 }}>No activity yet.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {timeline.map((event) => <div key={event.id} style={{ display: 'grid', gridTemplateColumns: '82px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--p-line)' }}>
                  <div style={{ font: `9.5px ${FONT_MONO}`, letterSpacing: '.08em', textTransform: 'uppercase', color: P.accent }}>{eventLabel(event)}</div>
                  <div><div style={{ font: `12.5px/1.45 ${FONT_UI}`, color: P.ink }}>{event.title}</div><div style={{ font: `10.5px ${FONT_MONO}`, color: P.ink2, marginTop: 4 }}>{formatRelative(event.occurredAt) ?? ''}{event.by ? ` · ${event.by}` : ''}</div></div>
                </div>)}
              </div>
            )}
          </Section>
        </div>

        <footer style={{ padding: `${SPACE[4]}px ${SPACE[6]}px`, borderTop: '1px solid var(--p-line)', display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={openFullRecord}>Open full record <IconExternalLink size={14} /></Button>
        </footer>
      </Panel>
    </>
  );
};
