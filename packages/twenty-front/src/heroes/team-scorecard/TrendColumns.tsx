/* eslint-disable @nx/enforce-module-boundaries */
// TrendColumns — new leads per Dubai day, with the part that got a logged outcome
// within 24h stacked in brass. One scale, thin columns (≤ 22px), rounded data-end
// only, direct value labels above each column; the title names the series.

import styled from '@emotion/styled';
import type { ScorecardTrendPoint } from '@/propel/types/teamScorecard';
import { FONT_MONO, FONT_UI } from '../_pulse/pulse';

const Wrap = styled.div`
  display: grid;
  gap: 8px;
  align-items: end;
  height: 132px;
  padding-top: 14px;
`;

const Col = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  gap: 4px;
  min-width: 0;
`;

const Stack = styled.div`
  width: 22px;
  display: flex;
  flex-direction: column-reverse;
  gap: 2px;
`;

const Seg = styled.div<{ $kind: 'logged' | 'rest'; $top: boolean }>`
  width: 100%;
  background: ${(p) => (p.$kind === 'logged' ? 'var(--p-accent)' : 'color-mix(in srgb, var(--p-ink) 16%, transparent)')};
  border-radius: ${(p) => (p.$top ? '4px 4px 0 0' : '0')};
`;

const Num = styled.span`
  font-family: ${FONT_MONO};
  font-size: 11px;
  color: var(--p-ink-2);
  font-variant-numeric: tabular-nums;
`;

const Day = styled.span`
  font-family: ${FONT_UI};
  font-size: 11px;
  color: var(--p-ink-2);
  white-space: nowrap;
`;

const Legend = styled.div`
  display: flex;
  gap: 14px;
  margin-top: 10px;
  font-family: ${FONT_UI};
  font-size: 12px;
  color: var(--p-ink-2);
  i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    vertical-align: -1px;
    margin-right: 5px;
  }
`;

export const TrendColumns = ({ trend }: { trend: ScorecardTrendPoint[] }) => {
  const max = Math.max(1, ...trend.map((p) => p.newLeads));
  const unit = 84 / max;
  return (
    <div>
      <Wrap style={{ gridTemplateColumns: `repeat(${Math.max(1, trend.length)}, minmax(0, 1fr))` }} role="img" aria-label="New leads per day with the part that got an outcome within 24 hours">
        {trend.map((p) => {
          const rest = p.newLeads - p.outcome24h;
          return (
            <Col key={p.dayKey} title={`${p.label}: ${p.newLeads} new lead${p.newLeads === 1 ? '' : 's'}, ${p.outcome24h} with an outcome within 24h`}>
              <Num>{p.newLeads}</Num>
              <Stack>
                {p.outcome24h > 0 ? <Seg $kind="logged" $top={rest === 0} style={{ height: `${p.outcome24h * unit}px` }} /> : null}
                {rest > 0 ? <Seg $kind="rest" $top style={{ height: `${rest * unit}px` }} /> : null}
                {p.newLeads === 0 ? <Seg $kind="rest" $top style={{ height: 2, opacity: 0.5 }} /> : null}
              </Stack>
              <Day>{trend.length > 8 ? p.label.replace(/^\w+ /, '') : p.label}</Day>
            </Col>
          );
        })}
      </Wrap>
      <Legend>
        <span>
          <i style={{ background: 'var(--p-accent)' }} />
          Outcome logged within 24h
        </span>
        <span>
          <i style={{ background: 'color-mix(in srgb, var(--p-ink) 16%, transparent)' }} />
          No outcome logged
        </span>
      </Legend>
    </div>
  );
};
