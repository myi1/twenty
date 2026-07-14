import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RAIL_PANEL_IDS, type RailArrangement } from '../deskState';
import { RightRail } from '../RightRail';
import type { DeskRailOk } from '../types';

const rail: DeskRailOk = {
  ok: true,
  tasks: [],
  viewings: [],
  unreadWa: [],
  priorityLeads: [],
};
const arrangement: RailArrangement = {
  order: [...RAIL_PANEL_IDS],
  folds: {
    tasks: false,
    viewings: false,
    unreadWa: false,
    priorityLeads: false,
  },
  collapsed: true,
};

it('ignores persisted desktop collapse when the desk is stacked', () => {
  render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <RightRail
        status="ready"
        rail={rail}
        error={null}
        nowMs={Date.parse('2026-07-13T08:00:00.000Z')}
        onRowAction={jest.fn()}
        onCompleteTask={jest.fn().mockResolvedValue(true)}
        arrangement={arrangement}
        onArrangementChange={jest.fn()}
        forceExpanded
      />
    </MemoryRouter>,
  );
  expect(
    screen.queryByRole('button', { name: 'Expand the panel rail' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Today's tasks")).toBeVisible();
  expect(screen.getByText('Viewings today')).toBeVisible();
  expect(screen.getByText('Unread WhatsApp')).toBeVisible();
  expect(screen.getByText('Priority leads')).toBeVisible();
});

it('preserves persisted desktop collapse when folding a stacked panel', () => {
  const onArrangementChange = jest.fn();

  render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <RightRail
        status="ready"
        rail={rail}
        error={null}
        nowMs={Date.parse('2026-07-13T08:00:00.000Z')}
        onRowAction={jest.fn()}
        onCompleteTask={jest.fn().mockResolvedValue(true)}
        arrangement={arrangement}
        onArrangementChange={onArrangementChange}
        forceExpanded
      />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByText("Today's tasks"));

  expect(onArrangementChange).toHaveBeenCalledWith({
    ...arrangement,
    folds: { ...arrangement.folds, tasks: true },
  });
});

it('does not render panel reorder grips when the desk is stacked', () => {
  render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <RightRail
        status="ready"
        rail={rail}
        error={null}
        nowMs={Date.parse('2026-07-13T08:00:00.000Z')}
        onRowAction={jest.fn()}
        onCompleteTask={jest.fn().mockResolvedValue(true)}
        arrangement={arrangement}
        onArrangementChange={jest.fn()}
        forceExpanded
      />
    </MemoryRouter>,
  );

  expect(screen.queryAllByTitle('Drag to reorder')).toHaveLength(0);
});
