import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RAIL_PANEL_IDS, type RailArrangement } from '../deskState';
import { RightRail } from '../RightRail';
import type { DeskRailOk, DeskRow } from '../types';

// Regression cover for the reported bug: a priority-lead row rendered as a plain
// div with only hover handlers, so tapping a lead did nothing at all. The drawer
// plumbing already existed (index.tsx's resolveRow falls back to railRows) — only
// the click was never wired.

const lead: DeskRow = {
  id: 'rcbiOpportunity:lead-1',
  laneObject: 'rcbiOpportunity',
  recordId: 'lead-1',
  personId: 'person-1',
  phoneE164: '+971500000001',
  hasWhatsApp: true,
  name: 'Amelia Rossi',
  meta: 'Downtown 1BR · Meta lead',
  stage: 'NEW',
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
} as DeskRow;

const rail: DeskRailOk = {
  ok: true,
  tasks: [],
  viewings: [],
  unreadWa: [],
  priorityLeads: [lead],
};

const arrangement: RailArrangement = {
  order: [...RAIL_PANEL_IDS],
  folds: { tasks: false, viewings: false, unreadWa: false, priorityLeads: false },
  collapsed: false,
};

const renderRail = (props: Partial<Parameters<typeof RightRail>[0]> = {}) => {
  const onOpenRow = jest.fn();
  const onRowAction = jest.fn();
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <RightRail
        status="ready"
        rail={rail}
        error={null}
        nowMs={Date.parse('2026-07-24T08:00:00.000Z')}
        onRowAction={onRowAction}
        onCompleteTask={jest.fn().mockResolvedValue(true)}
        onOpenRow={onOpenRow}
        arrangement={arrangement}
        onArrangementChange={jest.fn()}
        forceExpanded
        {...props}
      />
    </MemoryRouter>,
  );
  return { onOpenRow, onRowAction };
};

it('opens the lead when its row is clicked', () => {
  const { onOpenRow } = renderRail();
  fireEvent.click(screen.getByRole('button', { name: 'Open Amelia Rossi' }));
  expect(onOpenRow).toHaveBeenCalledTimes(1);
  expect(onOpenRow).toHaveBeenCalledWith(expect.objectContaining({ id: lead.id }));
});

it('opens the lead from the keyboard (Enter and Space)', () => {
  const { onOpenRow } = renderRail();
  const row = screen.getByRole('button', { name: 'Open Amelia Rossi' });
  fireEvent.keyDown(row, { key: 'Enter' });
  fireEvent.keyDown(row, { key: ' ' });
  expect(onOpenRow).toHaveBeenCalledTimes(2);
});

it('does NOT open the lead when a mini-action (Call / WhatsApp) is used', () => {
  // The actions are siblings of the clickable body, so they must keep working
  // without also firing the row-open — otherwise calling a lead would rip the
  // drawer open over the top of it.
  const { onOpenRow, onRowAction } = renderRail();
  const actions = screen
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-label')?.match(/call|whats/i));
  expect(actions.length).toBeGreaterThan(0);
  actions.forEach((b) => fireEvent.click(b));
  expect(onRowAction).toHaveBeenCalled();
  expect(onOpenRow).not.toHaveBeenCalled();
});

it('stays inert (no button role, no crash) when no handler is supplied', () => {
  renderRail({ onOpenRow: undefined });
  expect(
    screen.queryByRole('button', { name: 'Open Amelia Rossi' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Amelia Rossi')).toBeVisible();
});
