import { fireEvent, render, screen } from '@testing-library/react';

import { BoardKanban } from '../BoardKanban';
import { BoardTable } from '../BoardTable';

const noop = () => undefined;

describe('partial board retry controls', () => {
  it('offers an accessible retry from the table partial state', () => {
    const onRetry = jest.fn();

    render(
      <BoardTable
        status="ready"
        rows={[]}
        error={null}
        partial
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
  });

  it('offers an accessible retry from the kanban partial state', () => {
    const onRetry = jest.fn();

    render(
      <BoardKanban
        status="ready"
        rows={[]}
        error={null}
        partial
        onRetry={onRetry}
        nowMs={Date.parse('2026-07-13T08:00:00.000Z')}
        onRowClick={noop}
        onCardDrop={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry board load' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
