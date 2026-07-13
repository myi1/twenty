import { fireEvent, render, screen, within } from '@testing-library/react';

import { BoardTable } from '../BoardTable';
import type { DeskRow } from '../types';

const NOW_MS = Date.parse('2026-07-13T08:00:00.000Z');

const row = (id: string, overrides: Partial<DeskRow> = {}): DeskRow => ({
  id,
  laneObject: 'secondaryOpportunity',
  recordId: id,
  personId: `${id}-person`,
  phoneE164: '+971501234567',
  hasWhatsApp: true,
  name: id === 'row-1' ? 'Normal Opportunity' : 'Urgent Lead',
  meta: 'Dubai Marina · Web lead',
  stage: 'QUALIFIED',
  valueAed: 2_500_000,
  nextAction: 'Call the client',
  nextActionTaskId: null,
  nextActionDueAt: null,
  nextActionSource: 'stageMap',
  lastTouchAt: '2026-07-12T08:00:00.000Z',
  slaDeadline: null,
  snoozedUntil: null,
  unreadWa: 0,
  viewingTodayAt: null,
  taskDueToday: false,
  ...overrides,
});

const normalRow = row('row-1');
const urgentRow = row('row-urgent', {
  laneObject: 'lead',
  stage: 'NEW',
  slaDeadline: '2026-07-13T08:30:00.000Z',
});

const renderBoard = ({ partial = false }: { partial?: boolean } = {}) => {
  const callbacks = {
    onRetry: jest.fn(),
    onRowClick: jest.fn(),
    onRowAction: jest.fn(),
    onStagePick: jest.fn(),
  };

  render(
    <BoardTable
      status="ready"
      rows={[normalRow, urgentRow]}
      error={null}
      partial={partial}
      onRetry={callbacks.onRetry}
      nowMs={NOW_MS}
      stripFilter={null}
      focusToday={false}
      view="table"
      onViewChange={jest.fn()}
      onRowClick={callbacks.onRowClick}
      onRowAction={callbacks.onRowAction}
      onStagePick={callbacks.onStagePick}
      onCardDrop={jest.fn()}
    />,
  );

  return callbacks;
};

const hoverActions = [/call/i, /whatsapp/i, /add note/i, /more actions/i];

describe('BoardTable interactions', () => {
  it('opens the matching drawer callback when the row body is clicked', () => {
    const { onRowClick } = renderBoard();

    fireEvent.click(screen.getByTestId('desk-row-row-1'));

    expect(onRowClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'row-1' }),
    );
  });

  it.each([
    ['normal', normalRow],
    ['SLA-at-risk', urgentRow],
  ])(
    'reveals the four-action tray when the %s row is hovered',
    (_name, item) => {
      renderBoard();
      const rowElement = screen.getByTestId(`desk-row-${item.id}`);
      const actionButtons = hoverActions.map((accessibleName) =>
        within(rowElement).getByRole('button', { name: accessibleName }),
      );

      for (const actionButton of actionButtons) {
        expect(actionButton).not.toBeVisible();
      }

      fireEvent.mouseEnter(rowElement);

      expect(actionButtons).toHaveLength(4);
      for (const actionButton of actionButtons) {
        expect(actionButton).toBeVisible();
      }
    },
  );

  it.each([
    ['call', /call/i, 'call'],
    ['whatsapp', /whatsapp/i, 'whatsapp'],
    ['note', /add note/i, 'note'],
  ] as const)(
    '%s invokes its row action without also opening the drawer',
    (_name, accessibleName, action) => {
      const { onRowAction, onRowClick } = renderBoard();
      const rowElement = screen.getByTestId('desk-row-row-1');
      fireEvent.mouseEnter(rowElement);
      const actionButton = within(rowElement).getByRole('button', {
        name: accessibleName,
      });

      fireEvent.mouseDown(actionButton);
      fireEvent.click(actionButton);

      expect(onRowAction).toHaveBeenCalledWith(action, normalRow);
      expect(onRowClick).not.toHaveBeenCalled();
    },
  );

  it('stage invokes the stage picker without also opening the drawer', () => {
    const { onRowClick, onStagePick } = renderBoard();
    const rowElement = screen.getByTestId('desk-row-row-1');
    const stageButton = within(rowElement).getByRole('button', {
      name: 'Move Normal Opportunity to another stage',
    });

    fireEvent.mouseDown(stageButton);
    fireEvent.click(stageButton);

    expect(onStagePick).toHaveBeenCalledWith(normalRow, { x: 0, y: 6 });
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('overflow opens the matching menu action without also opening the drawer', () => {
    const { onRowAction, onRowClick } = renderBoard();
    const rowElement = screen.getByTestId('desk-row-row-1');
    fireEvent.mouseEnter(rowElement);
    const overflowButton = within(rowElement).getByRole('button', {
      name: 'More actions for Normal Opportunity',
    });

    fireEvent.mouseDown(overflowButton);
    fireEvent.click(overflowButton);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Create a task' }));

    expect(onRowAction).toHaveBeenCalledWith('task', normalRow);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('retries a partial board load', () => {
    const { onRetry } = renderBoard({ partial: true });

    fireEvent.click(screen.getByRole('button', { name: 'Retry board load' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
