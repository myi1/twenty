// railRows.ts — build a synthetic DeskRow from a rail item's OWN enriched data.
//
// The rail's mini-actions (Call / WhatsApp / Note / quick-reply) run through the
// board's `onRowAction(action, row)` handler, which needs a DeskRow. Rail items
// now carry their own record target + contact reachability (my-desk-route rail
// enrichment), so we no longer JOIN to a board row — we synthesize one here. The
// row id follows the board's `${laneObject}:${recordId}` scheme, so when the SAME
// record is also on the board the ids collide and the (richer) board row wins in
// the combined lookup (index.tsx). Actions open the peek drawer, which fetches its
// own timeline/WhatsApp/next-action from the server — a lean synthetic row is
// enough to drive every drawer mode.

import type {
  DeskRow,
  DeskTaskItem,
  DeskUnreadWaItem,
  DeskViewingItem,
} from './types';

// A DeskRow with only the fields the actions/drawer read populated; the rest take
// honest "nothing here" defaults (the drawer reloads real data by record).
const synth = (
  over: Pick<DeskRow, 'id' | 'laneObject' | 'recordId' | 'name'> & Partial<DeskRow>,
): DeskRow => ({
  personId: null,
  phoneE164: null,
  hasWhatsApp: false,
  meta: '',
  stage: '',
  valueAed: null,
  nextAction: null,
  nextActionTaskId: null,
  nextActionDueAt: null,
  nextActionSource: 'stageMap',
  lastTouchAt: null,
  slaDeadline: null,
  snoozedUntil: null,
  unreadWa: 0,
  viewingTodayAt: null,
  taskDueToday: false,
  ...over,
});

/** The synthetic row for a task rail item, or null when its target didn't resolve
 *  (→ the item's actions stay disabled-with-reason). */
export const rowForTask = (t: DeskTaskItem): DeskRow | null => {
  if (!t.laneObject || !t.recordId) return null;
  return synth({
    id: `${t.laneObject}:${t.recordId}`,
    laneObject: t.laneObject,
    recordId: t.recordId,
    personId: t.personId,
    phoneE164: t.phoneE164,
    hasWhatsApp: t.hasWhatsApp,
    // Drawer header / dialer label = the contact/record behind the task, not the
    // task title (which the panel already shows on its own line).
    name: t.contactName ?? t.title ?? 'Task',
    nextAction: t.title ?? null,
    nextActionTaskId: t.id,
  });
};

export const rowForViewing = (v: DeskViewingItem): DeskRow | null => {
  if (!v.laneObject || !v.recordId) return null;
  return synth({
    id: `${v.laneObject}:${v.recordId}`,
    laneObject: v.laneObject,
    recordId: v.recordId,
    personId: v.personId,
    phoneE164: v.phoneE164,
    hasWhatsApp: v.hasWhatsApp,
    name: v.contactName ?? v.name ?? 'Viewing',
  });
};

export const rowForUnreadWa = (w: DeskUnreadWaItem): DeskRow | null => {
  // An unread thread's "record" is the person behind it (a lead person id).
  const recordId = w.recordId ?? w.personId ?? w.contactId;
  const laneObject = w.laneObject ?? 'lead';
  if (!recordId) return null;
  return synth({
    id: `${laneObject}:${recordId}`,
    laneObject,
    recordId,
    personId: w.personId ?? w.contactId,
    phoneE164: w.phoneE164,
    hasWhatsApp: w.hasWhatsApp,
    name: w.contactName ?? w.name ?? 'Conversation',
    unreadWa: w.unreadCount ?? 0,
  });
};

/** Every synthetic rail row, for the combined drawer/peek lookup in index.tsx.
 *  priorityLeads are already DeskRows (with phone/WA now filled) — included as-is
 *  so a rail-lead action that isn't on the board still opens its drawer. */
export const railRowsFrom = (rail: {
  tasks: DeskTaskItem[];
  viewings: DeskViewingItem[];
  unreadWa: DeskUnreadWaItem[];
  priorityLeads: DeskRow[];
} | null): DeskRow[] => {
  if (!rail) return [];
  const rows: DeskRow[] = [];
  for (const t of rail.tasks) { const r = rowForTask(t); if (r) rows.push(r); }
  for (const v of rail.viewings) { const r = rowForViewing(v); if (r) rows.push(r); }
  for (const w of rail.unreadWa) { const r = rowForUnreadWa(w); if (r) rows.push(r); }
  rows.push(...rail.priorityLeads);
  return rows;
};
