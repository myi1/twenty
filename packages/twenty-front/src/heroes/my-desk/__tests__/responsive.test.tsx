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

it('declares stacked body, two-column KPIs, and wrapped phone actions', () => {
  const { getByTestId } = render(
    <>
      <StyledDeskBody data-testid="body" />
      <StyledTodayStripGrid data-testid="strip" />
      <StyledTopBarActions data-testid="actions" />
    </>,
  );

  expect(rulesFor(getByTestId('body'))).toContain('max-width: 1023px');
  expect(rulesFor(getByTestId('body'))).toContain('flex-direction: column');
  expect(rulesFor(getByTestId('strip'))).toContain('repeat(2, minmax(0, 1fr))');
  expect(rulesFor(getByTestId('actions'))).toContain('max-width: 1023px');
  expect(rulesFor(getByTestId('actions'))).toContain('flex-wrap: wrap');
  expect(rulesFor(getByTestId('actions'))).toContain('max-width: 720px');
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
