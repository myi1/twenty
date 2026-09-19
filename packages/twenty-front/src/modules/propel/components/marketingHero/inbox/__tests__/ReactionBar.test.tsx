import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';

import { ReactionBar } from '../ReactionBar';

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(global, 'ResizeObserver', { value: TestResizeObserver });

const draw = (props: Partial<Parameters<typeof ReactionBar>[0]> = {}) => {
  const onReact = jest.fn();
  render(
    <MantineProvider>
      <ReactionBar
        reactions={[]}
        canReact
        busy={false}
        onReact={onReact}
        align="flex-start"
        {...props}
      />
    </MantineProvider>,
  );
  return { onReact };
};

describe('ReactionBar', () => {
  it('shows an emoji with its count once more than one person used it', () => {
    draw({ reactions: [{ emoji: '👍', count: 3, mine: false }] });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('omits the count for a single reaction — "👍 1" reads like a score', () => {
    draw({ reactions: [{ emoji: '👍', count: 1, mine: false }] });
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('tapping a reaction that is already yours REMOVES it', async () => {
    // Same gesture both ways, which is what people expect from the WhatsApp app and
    // why the route accepts an empty emoji as "take mine back".
    const { onReact } = draw({ reactions: [{ emoji: '👍', count: 2, mine: true }] });
    await userEvent.click(screen.getByRole('button', { name: /remove your 👍 reaction/i }));
    expect(onReact).toHaveBeenCalledWith('');
  });

  it('tapping one that is not yours adds that same emoji', async () => {
    const { onReact } = draw({ reactions: [{ emoji: '🎉', count: 1, mine: false }] });
    await userEvent.click(screen.getByRole('button', { name: /react with 🎉/i }));
    expect(onReact).toHaveBeenCalledWith('🎉');
  });

  it('marks your own reaction as pressed, for a screen reader as well as the eye', () => {
    draw({ reactions: [{ emoji: '❤️', count: 1, mine: true }] });
    expect(screen.getByRole('button', { name: /remove your/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('when reacting is not allowed it still SHOWS reactions but offers no way to add', () => {
    draw({ canReact: false, reactions: [{ emoji: '👍', count: 1, mine: false }] });
    expect(screen.getByText('👍')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add a reaction/i })).not.toBeInTheDocument();
  });

  it('draws nothing at all when there is nothing to show and nothing to offer', () => {
    const { container } = render(
      <MantineProvider>
        <ReactionBar reactions={[]} canReact={false} busy={false} onReact={jest.fn()} align="flex-start" />
      </MantineProvider>,
    );
    // An empty row would steal a few pixels from every message in the thread.
    expect(container.querySelector('button')).toBeNull();
  });

  it('a reaction in flight cannot be double-fired', async () => {
    const { onReact } = draw({ busy: true, reactions: [{ emoji: '👍', count: 1, mine: false }] });
    await userEvent.click(screen.getByRole('button', { name: /react with 👍/i }));
    expect(onReact).not.toHaveBeenCalled();
  });
});
