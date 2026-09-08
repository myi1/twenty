// styles.ts: Emotion primitives for the lead page hero, riding the Pulse Nocturne
// token ledger (see ../_pulse/pulse.tsx). One border OR one shadow per element,
// never both; no coloured side-stripe borders (project craft rule).

import styled from '@emotion/styled';
import { NOCTURNE_LIGHT_VARS, PulseNocturne, FONT_UI } from '../_pulse/pulse';

export const LeadNocturne = styled(PulseNocturne)`
  html[data-mantine-color-scheme='light'] & {
    ${NOCTURNE_LIGHT_VARS}
  }
  min-height: 100%;
  display: flex;
  flex-direction: column;
  font-family: ${FONT_UI};
  color: var(--p-ink);
  background: var(--p-bg);
`;

export const Columns = styled.div<{ $phone: boolean }>`
  display: grid;
  gap: 20px;
  padding: 0 24px 96px;
  grid-template-columns: ${(p) => (p.$phone ? '1fr' : '320px minmax(0, 1fr)')};
  ${(p) => (p.$phone ? 'padding: 0 12px 96px;' : '')}
`;

export const Rail = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
`;

export const Group = styled.section`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const GroupTitle = styled.h3`
  margin: 0;
  font: 600 12px/1 ${FONT_UI};
  letter-spacing: 0.04em;
  color: var(--p-ink-2);
`;

export const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 36px;
  font-size: 13px;
`;

export const Pill = styled.span<{ $tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: var(--p-radius-pill);
  font-size: 12px;
  font-weight: 600;
  background: ${(p) =>
    p.$tone === 'good'
      ? 'color-mix(in oklab, var(--p-good) 16%, transparent)'
      : p.$tone === 'warn'
        ? 'color-mix(in oklab, var(--p-warn) 18%, transparent)'
        : p.$tone === 'bad'
          ? 'color-mix(in oklab, var(--p-bad) 16%, transparent)'
          : p.$tone === 'accent'
            ? 'var(--p-accent-tint)'
            : 'var(--p-surface-2)'};
  color: ${(p) =>
    p.$tone === 'good'
      ? 'var(--p-good)'
      : p.$tone === 'warn'
        ? 'var(--p-warn)'
        : p.$tone === 'bad'
          ? 'var(--p-bad)'
          : p.$tone === 'accent'
            ? 'var(--p-accent-strong)'
            : 'var(--p-ink)'};
`;

export const PhoneTabs = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 0 12px 12px;
  border-bottom: 1px solid var(--p-line);
`;

export const PhoneTab = styled.button<{ $active: boolean }>`
  min-height: 44px;
  border: 0;
  background: transparent;
  font: 600 14px ${FONT_UI};
  color: ${(p) => (p.$active ? 'var(--p-ink)' : 'var(--p-ink-2)')};
  box-shadow: ${(p) => (p.$active ? 'inset 0 -2px 0 var(--p-accent)' : 'none')};
  cursor: pointer;
`;

export const PhoneBar = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: 1fr 1fr 1.4fr;
  gap: 8px;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  background: var(--p-surface);
  box-shadow: var(--p-shadow-pop);
  z-index: 20;

  & > button {
    min-height: 48px;
  }
`;

export const StoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
`;

export const DaySep = styled.div`
  text-align: center;
  font: 600 11px ${FONT_UI};
  letter-spacing: 0.04em;
  color: var(--p-ink-2);
  padding: 8px 0;
`;

export const QuietRow = styled.div`
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 10px;
  font-size: 13px;
  color: var(--p-ink-2);

  & b {
    color: var(--p-ink);
    font-weight: 500;
  }
`;

export const CallCard = styled.div`
  padding: 12px 14px;
  border-radius: var(--p-radius);
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  font-size: 13px;
`;

export const BurstRow = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--p-radius);
  background: var(--p-surface-2);
  color: var(--p-ink);
  font: 500 13px ${FONT_UI};
  cursor: pointer;
  text-align: left;
`;

export const Bubble = styled.div<{ $out: boolean }>`
  max-width: 78%;
  align-self: ${(p) => (p.$out ? 'flex-end' : 'flex-start')};
  padding: 8px 12px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.4;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: ${(p) => (p.$out ? 'color-mix(in oklab, #25d366 22%, var(--p-surface))' : 'var(--p-surface)')};
  border: 1px solid var(--p-line);
`;

export const Skeleton = styled.div`
  height: 14px;
  border-radius: 7px;
  background: var(--p-surface-2);
  animation: pulse 1.2s ease-in-out infinite;

  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
`;
