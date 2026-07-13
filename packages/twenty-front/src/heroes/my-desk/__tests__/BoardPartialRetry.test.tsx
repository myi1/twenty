import { fireEvent, render, screen } from '@testing-library/react';

import { BoardKanban } from '../BoardKanban';
import { BoardTable } from '../BoardTable';
import type { DeskPartialFailure } from '../types';

const noop = () => undefined;
const partialFailures: DeskPartialFailure[] = [
  { source: 'secondaryOpportunity', code: 'LOOKUP_FAILED' },
  { source: 'viewings', code: 'LOOKUP_FAILED' },
];

describe('partial board retry controls', () => {
  it('offers an accessible retry from the table partial state', () => {
    const onRetry = jest.fn();

    render(
      <BoardTable
        status="ready"
        rows={[]}
        error={null}
        partial
        partialFailures={partialFailures}
        onRetry={onRetry}
        nowMs={Date.parse('2026-07-13T08:00:00.000Z')}
        stripFilter={null}
        focusToday={false}
        view="table"
        onViewChange={noop}
        onRowClick={noop}
        onRowAction={noop}
        onStagePick={noop}
        onCardDrop={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry board load' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(
        "Couldn't load Resale and Viewings — showing what arrived.",
      ),
    ).toBeInTheDocument();
  });

  it('offers an accessible retry from the kanban partial state', () => {
    const onRetry = jest.fn();

    render(
      <BoardKanban
        status="ready"
        rows={[]}
        error={null}
        partial
        partialFailures={partialFailures}
        onRetry={onRetry}
        nowMs={Date.parse('2026-07-13T08:00:00.000Z')}
        onRowClick={noop}
        onCardDrop={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry board load' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(
        "Couldn't load Resale and Viewings — showing what arrived.",
      ),
    ).toBeInTheDocument();
  });

  it.each(['table', 'kanban'] as const)(
    'offers an accessible retry from the %s full-error state',
    (view) => {
      const onRetry = jest.fn();

      if (view === 'table') {
        render(
          <BoardTable
            status="error"
            rows={[]}
            error="DESK_LOAD_FAILED"
            partial={false}
            partialFailures={[]}
            onRetry={onRetry}
            nowMs={Date.parse('2026-07-13T08:00:00.000Z')}
            stripFilter={null}
            focusToday={false}
            view="table"
            onViewChange={noop}
            onRowClick={noop}
            onRowAction={noop}
            onStagePick={noop}
            onCardDrop={noop}
          />,
        );
      } else {
        render(
          <BoardKanban
            status="error"
            rows={[]}
            error="DESK_LOAD_FAILED"
            partial={false}
            partialFailures={[]}
            onRetry={onRetry}
            nowMs={Date.parse('2026-07-13T08:00:00.000Z')}
            onRowClick={noop}
            onCardDrop={noop}
          />,
        );
      }

      fireEvent.click(screen.getByRole('button', { name: 'Retry board load' }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    },
  );
});
