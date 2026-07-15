import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
      partialFailures={[]}
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

const guardedActionCases = [
  ['call', /call/i, 'call'],
  ['whatsapp', /whatsapp/i, 'whatsapp'],
  ['note', /add note/i, 'note'],
  ['stage', 'Move Normal Opportunity to another stage', 'stage'],
  ['overflow', 'More actions for Normal Opportunity', 'task'],
] as const;

const guardedActivationCases = guardedActionCases.flatMap((actionCase) =>
  (['direct click', 'keyboard'] as const).map(
    (activation) =>
      [actionCase[0], activation, actionCase[1], actionCase[2]] as const,
  ),
);

describe('BoardTable interactions', () => {
  it('keeps the 835px table canvas inside a horizontal overflow container', () => {
    renderBoard();

    const headerRow = screen.getByText('Opportunity').parentElement;
    const overflowContainer = headerRow?.parentElement;
    const firstRow = screen.getByTestId('desk-row-row-1');

    expect(headerRow).toHaveStyle({ minWidth: '835px' });
    expect(firstRow).toHaveStyle({ minWidth: '835px' });
    expect(overflowContainer).toHaveStyle({ overflowX: 'auto' });
  });

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

  it.each(guardedActivationCases)(
    '%s via %s does not also open the drawer',
    async (_name, activation, accessibleName, expectedAction) => {
      const { onRowAction, onRowClick, onStagePick } = renderBoard();
      const rowElement = screen.getByTestId('desk-row-row-1');
      fireEvent.mouseEnter(rowElement);
      const actionButton = within(rowElement).getByRole('button', {
        name: accessibleName,
      });

      if (activation === 'keyboard') {
        act(() => actionButton.focus());
        await userEvent.keyboard('{Enter}');
      } else {
        fireEvent.click(actionButton);
      }

      if (expectedAction === 'stage') {
        expect(onStagePick).toHaveBeenCalledWith(normalRow, { x: 0, y: 6 });
      } else {
        if (expectedAction === 'task') {
          fireEvent.click(
            screen.getByRole('menuitem', { name: 'Create a task' }),
          );
        }
        expect(onRowAction).toHaveBeenCalledWith(expectedAction, normalRow);
      }
      expect(onRowClick).not.toHaveBeenCalled();
    },
  );

  it('shows a visible focus treatment on a focused row action', () => {
    renderBoard();
    const rowElement = screen.getByTestId('desk-row-row-1');
    fireEvent.mouseEnter(rowElement);
    const callButton = within(rowElement).getByRole('button', {
      name: 'Call Normal Opportunity',
    });

    act(() => callButton.focus());

    expect(callButton).toHaveFocus();
    const className = [...callButton.classList].find((candidate) =>
      candidate.startsWith('css-'),
    );
    const focusRule = [...document.styleSheets]
      .flatMap((styleSheet) => [...styleSheet.cssRules])
      .map((rule) => rule.cssText)
      .find((cssText) => cssText.includes(`.${className}:focus-visible`));
    expect(focusRule).toContain('outline: 2px solid var(--p-accent)');
    expect(focusRule).toContain('outline-offset: 2px');
  });

  it('retries a partial board load', () => {
    const { onRetry } = renderBoard({ partial: true });

    fireEvent.click(screen.getByRole('button', { name: 'Retry board load' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
