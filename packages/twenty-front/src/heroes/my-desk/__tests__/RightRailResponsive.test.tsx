import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RAIL_PANEL_IDS, type RailArrangement } from '../deskState';
import { RightRail } from '../RightRail';
import type { DeskRailOk } from '../types';

const rulesFor = (element: Element): string => {
  const className = [...element.classList].find((value) =>
    value.startsWith('css-'),
  );

  return [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules])
    .map((rule) => rule.cssText)
    .filter((rule) => (className ? rule.includes(`.${className}`) : false))
    .join('\n');
};

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

it('renders the tablet rail full-width in two columns without its toggle', () => {
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

  const toggle = screen.getByRole('button', {
    name: 'Collapse the panel rail',
  });
  const aside = toggle.parentElement;
  const scroll = aside?.querySelector(':scope > div');

  expect(aside).not.toBeNull();
  expect(scroll).not.toBeNull();
  expect(rulesFor(aside as Element)).toContain('width: 100%');
  expect(rulesFor(scroll as Element)).toContain(
    'grid-template-columns: repeat(2, minmax(0, 1fr))',
  );
  expect(rulesFor(toggle)).toContain('max-width: 1023px');
  expect(rulesFor(toggle)).toContain('display: none');
});

it('clears tablet bottom borders from both panels in the final grid row', () => {
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

  const thirdPanel =
    screen.getByText('Unread WhatsApp').parentElement?.parentElement
      ?.parentElement;
  const fourthPanel =
    screen.getByText('Priority leads').parentElement?.parentElement
      ?.parentElement;

  expect(thirdPanel).not.toBeNull();
  expect(fourthPanel).not.toBeNull();
  expect((thirdPanel as Element).matches(':nth-last-of-type(-n + 2)')).toBe(
    true,
  );
  expect((fourthPanel as Element).matches(':nth-last-of-type(-n + 2)')).toBe(
    true,
  );
  expect(rulesFor(thirdPanel as Element)).toContain(
    ':nth-last-of-type(-n + 2)',
  );
  expect(rulesFor(thirdPanel as Element)).toContain('border-bottom: 0');
  expect(rulesFor(fourthPanel as Element)).toContain(
    ':nth-last-of-type(-n + 2)',
  );
  expect(rulesFor(fourthPanel as Element)).toContain('border-bottom: 0');
});
