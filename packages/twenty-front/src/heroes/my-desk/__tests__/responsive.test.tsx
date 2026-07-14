import { act, render } from '@testing-library/react';

import {
  StyledDeskBody,
  StyledMyDeskNocturne,
  StyledTodayStripGrid,
  StyledTopBarActions,
  useDeskStackedLayout,
} from '../responsive';

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

it('bridges only My Desk to the host light-theme token ledger', () => {
  const { getByTestId } = render(
    <StyledMyDeskNocturne data-testid="desk-theme">Desk</StyledMyDeskNocturne>,
  );
  const rules = rulesFor(getByTestId('desk-theme')).toLowerCase();

  expect(rules).toContain('data-mantine-color-scheme');
  expect(rules).toContain('--p-bg: #f6f1e7');
  expect(rules).toContain('--p-ink: #2a2620');
});

it('declares a stacked body and two-column KPIs', () => {
  const { getByTestId } = render(
    <>
      <StyledDeskBody data-testid="body" />
      <StyledTodayStripGrid data-testid="strip" />
    </>,
  );

  expect(rulesFor(getByTestId('body'))).toContain('max-width: 1023px');
  expect(rulesFor(getByTestId('body'))).toContain('flex-direction: column');
  expect(rulesFor(getByTestId('strip'))).toContain('repeat(2, minmax(0, 1fr))');
});

it('renders phone top-bar actions as two equal columns with sized children', () => {
  const { getByTestId } = render(
    <StyledTopBarActions data-testid="actions">
      <button type="button">First</button>
      <button type="button">Second</button>
    </StyledTopBarActions>,
  );
  const rules = rulesFor(getByTestId('actions'));

  expect(rules).toContain('max-width: 720px');
  expect(rules).toContain('display: grid');
  expect(rules).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
  expect(rules).toContain('width: 100%');
  expect(rules).toContain('>*');
  expect(rules).toContain('justify-content: center');
  expect(rules).toContain('min-width: 0');
});

it('tracks the stack breakpoint with native matchMedia', () => {
  const originalMatchMedia = window.matchMedia;
  let listener: ((event: MediaQueryListEvent) => void) | undefined;
  window.matchMedia = jest.fn().mockReturnValue({
    matches: false,
    media: '(max-width: 1023px)',
    onchange: null,
    addEventListener: (
      _name: string,
      next: (event: MediaQueryListEvent) => void,
    ) => {
      listener = next;
    },
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  });

  let stacked = false;
  const Probe = () => {
    stacked = useDeskStackedLayout();
    return null;
  };
  render(<Probe />);
  expect(stacked).toBe(false);
  act(() => listener?.({ matches: true } as MediaQueryListEvent));
  expect(stacked).toBe(true);
  window.matchMedia = originalMatchMedia;
});
