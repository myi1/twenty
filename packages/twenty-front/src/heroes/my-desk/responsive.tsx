import styled from '@emotion/styled';
import { useEffect, useState } from 'react';

import { NOCTURNE_LIGHT_VARS, PulseNocturne } from '../_pulse/pulse';

export const DESK_STACK_BREAKPOINT_PX = 1023;
export const DESK_PHONE_BREAKPOINT_PX = 720;
const stackQuery = `(max-width: ${DESK_STACK_BREAKPOINT_PX}px)`;

const stackMatches = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(stackQuery).matches;

export const useDeskStackedLayout = (): boolean => {
  const [stacked, setStacked] = useState(stackMatches);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;

    const query = window.matchMedia(stackQuery);
    const onChange = (event: MediaQueryListEvent) => setStacked(event.matches);
    setStacked(query.matches);
    query.addEventListener('change', onChange);

    return () => query.removeEventListener('change', onChange);
  }, []);

  return stacked;
};

export const MyDeskNocturne = styled(PulseNocturne)`
  html[data-mantine-color-scheme='light'] & {
    ${NOCTURNE_LIGHT_VARS}
  }
`;

export const TopBarRow = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid var(--p-line);

  @media (max-width: ${DESK_STACK_BREAKPOINT_PX}px) {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
  }

  @media (max-width: ${DESK_PHONE_BREAKPOINT_PX}px) {
    padding: 18px 16px 16px;
  }
`;

export const TopBarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;

  @media (max-width: ${DESK_STACK_BREAKPOINT_PX}px) {
    flex-wrap: wrap;
  }

  @media (max-width: ${DESK_PHONE_BREAKPOINT_PX}px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    width: 100%;

    > * {
      justify-content: center;
      min-width: 0;
      width: 100%;
    }
  }
`;

export const TodayStripGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  background: var(--p-line);
  border-bottom: 1px solid var(--p-line);

  @media (max-width: ${DESK_STACK_BREAKPOINT_PX}px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

export const DeskBody = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;

  @media (max-width: ${DESK_STACK_BREAKPOINT_PX}px) {
    flex: none;
    flex-direction: column;
    min-height: auto;
  }
`;
