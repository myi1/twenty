/* eslint-disable @nx/enforce-module-boundaries */
// PeopleTable — by person (Desk group first, then agents) or by source. On a phone
// the table turns into one card per row (the header disappears; each cell carries
// its own label). Plain words throughout; names come resolved from the route.

import styled from '@emotion/styled';
import type { ScorecardDrillMetric, ScorecardPersonRow, ScorecardSourceRow, ScorecardTargets } from '@/propel/types/teamScorecard';
import { FONT_MONO, FONT_UI } from '../_pulse/pulse';
import { minutesLabel, toneHigherIsBetter, toneLowerIsBetter, type Tone } from './format';

const TONE_COLOR: Record<Tone, string> = {
  good: 'var(--p-good)',
  warn: 'var(--p-warn)',
  bad: 'var(--p-bad)',
  neutral: 'var(--p-ink-2)',
};

const Wrap = styled.div<{ $stacked: boolean }>`
  overflow-x: ${(p) => (p.$stacked ? 'visible' : 'auto')};
  table {
    width: 100%;
    border-collapse: collapse;
    font-family: ${FONT_UI};
    font-size: 13.5px;
    color: var(--p-ink);
  }
  th {
    text-align: left;
    font-family: ${FONT_MONO};
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--p-ink-2);
    font-weight: 500;
    padding: 8px 10px;
    border-bottom: 1px solid var(--p-line);
    white-space: nowrap;
  }
  th.r,
  td.r {
    text-align: right;
  }
  td {
    padding: 9px 10px;
    border-bottom: 1px solid var(--p-line);
    vertical-align: middle;
    white-space: nowrap;
  }
  tr.group td {
    padding: 12px 10px 6px;
    border-bottom: 0;
  }
  tr.me td {
    background: var(--p-accent-tint);
  }
  tr.more td {
    color: var(--p-ink-2);
    font-size: 12.5px;
    white-space: normal;
  }
  ${(p) =>
    p.$stacked
      ? `
    table, tbody, tr, td { display: block; width: 100%; }
    thead { display: none; }
    tr:not(.group):not(.more) { border: 1px solid var(--p-line); border-radius: var(--p-radius-sm); margin: 8px 0; padding: 6px 4px; background: var(--p-surface); }
    tr.me { background: var(--p-accent-tint); }
    td { border-bottom: 0; padding: 4px 8px; display: flex; justify-content: space-between; align-items: center; white-space: normal; }
    td[data-k]::before { content: attr(data-k); color: var(--p-ink-2); font-size: 12px; }
    tr.group td { display: block; padding: 10px 4px 0; }
    tr.more td { display: block; }
  `
      : ''}
`;

const Eyebrow = styled.span`
  font-family: ${FONT_MONO};
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--p-ink-2);
  font-weight: 500;
  b {
    font-family: ${FONT_UI};
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    font-size: 12.5px;
    margin-left: 8px;
  }
`;

const Who = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const Avatar = styled.span`
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: ${FONT_MONO};
  font-size: 11px;
  font-weight: 500;
  background: var(--p-surface-2);
  color: var(--p-ink-2);
  flex: none;
`;

const Mini = styled.span<{ $tone: Tone }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  i {
    display: inline-block;
    width: 56px;
    height: 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--p-ink) 14%, transparent);
    position: relative;
    overflow: hidden;
  }
  i > b {
    position: absolute;
    inset: 0 auto 0 0;
    background: ${(p) => TONE_COLOR[p.$tone]};
  }
  span {
    font-family: ${FONT_MONO};
    font-variant-numeric: tabular-nums;
  }
`;

const NameBtn = styled.button`
  all: unset;
  cursor: pointer;
  color: var(--p-ink);
  &:hover {
    text-decoration: underline;
  }
  &:focus-visible {
    box-shadow: var(--p-focus-ring);
    border-radius: 4px;
  }
`;

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

const bar = (n: number, of: number, tone: Tone, label?: string) => (
  <Mini $tone={tone}>
    <i>
      <b style={{ width: `${of > 0 ? Math.round((100 * n) / of) : 0}%` }} />
    </i>
    <span>{label ?? n}</span>
  </Mini>
);

export const PeopleTable = ({
  rows,
  collapsed,
  targets,
  stacked,
  scopeMine,
  onDrill,
}: {
  rows: ScorecardPersonRow[];
  collapsed: number;
  targets: ScorecardTargets;
  stacked: boolean;
  scopeMine: boolean;
  onDrill: (metric: ScorecardDrillMetric, title: string, personId: string) => void;
}) => {
  type Group = { key: 'DESK' | 'AGENT'; title: string; note: string; rows: ScorecardPersonRow[] };
  const allGroups: Group[] = scopeMine
    ? [{ key: 'AGENT', title: 'You', note: 'your own numbers against the targets', rows }]
    : [
        { key: 'DESK', title: 'Desk', note: 'take every pool lead first', rows: rows.filter((r) => r.group === 'DESK') },
        { key: 'AGENT', title: 'Agents', note: 'received a lead in this window', rows: rows.filter((r) => r.group === 'AGENT') },
      ];
  const groups = allGroups.filter((g) => g.rows.length > 0);

  return (
    <Wrap $stacked={stacked}>
      <table>
        <thead>
          <tr>
            <th>Who</th>
            <th className="r">Leads held</th>
            <th className="r">Outcome ≤ 24h</th>
            <th className="r">First attempt</th>
            <th className="r">WhatsApp from Propel</th>
            <th className="r">Missed clock</th>
            <th className="r">Handed off</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.key} group={g} targets={targets} onDrill={onDrill} />
          ))}
          {!scopeMine && collapsed > 0 ? (
            <tr className="more">
              <td colSpan={7}>
                {collapsed} more {collapsed === 1 ? 'member held' : 'members held'} first-response tasks in this window, but none for these leads.
              </td>
            </tr>
          ) : null}
          {rows.length === 0 && !scopeMine ? (
            <tr className="more">
              <td colSpan={7}>Nobody held a lead in this window.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Wrap>
  );
};

const GroupRows = ({
  group,
  targets,
  onDrill,
}: {
  group: { key: 'DESK' | 'AGENT'; title: string; note: string; rows: ScorecardPersonRow[] };
  targets: ScorecardTargets;
  onDrill: (metric: ScorecardDrillMetric, title: string, personId: string) => void;
}) => (
  <>
    <tr className="group">
      <td colSpan={7}>
        <Eyebrow>
          {group.title}
          <b>· {group.note}</b>
        </Eyebrow>
      </td>
    </tr>
    {group.rows.map((r) => {
      const covPct = r.leadsHeld > 0 ? Math.round((100 * r.outcome24h) / r.leadsHeld) : null;
      const missPct = r.leadsHeld > 0 ? Math.round((100 * r.missedClock) / r.leadsHeld) : null;
      return (
        <tr key={r.memberId} className={r.isViewer ? 'me' : ''}>
          <td>
            <Who>
              <Avatar aria-hidden="true">{initials(r.name)}</Avatar>
              <NameBtn type="button" onClick={() => onDrill('all', `${r.name} · leads held`, r.memberId)} title="Show this person's leads">
                {r.name}
                {r.isViewer ? <span style={{ color: 'var(--p-ink-2)', marginLeft: 6, fontSize: 12 }}>(you)</span> : null}
              </NameBtn>
            </Who>
          </td>
          <td className="r" data-k="Leads held" style={{ fontFamily: FONT_MONO, fontVariantNumeric: 'tabular-nums' }}>
            {r.leadsHeld}
          </td>
          <td className="r" data-k="Outcome ≤ 24h">
            {bar(r.outcome24h, r.leadsHeld, r.leadsHeld === 0 ? 'neutral' : toneHigherIsBetter(covPct, targets.coverage24hPct))}
          </td>
          <td className="r" data-k="First attempt" style={{ fontFamily: FONT_MONO, fontVariantNumeric: 'tabular-nums' }}>
            {r.medianMinutes === null ? '—' : `${minutesLabel(r.medianMinutes)}${r.timedOutcomes > 1 ? ` (${r.timedOutcomes})` : ''}`}
          </td>
          <td className="r" data-k="WhatsApp from Propel" style={{ fontFamily: FONT_MONO, fontVariantNumeric: 'tabular-nums' }}>
            {r.whatsapp24h}
          </td>
          <td className="r" data-k="Missed clock">
            {bar(r.missedClock, r.leadsHeld, r.leadsHeld === 0 ? 'neutral' : toneLowerIsBetter(missPct, targets.breachMaxPct))}
          </td>
          <td className="r" data-k="Handed off" style={{ fontFamily: FONT_MONO, fontVariantNumeric: 'tabular-nums' }}>
            {r.handedOff}
          </td>
        </tr>
      );
    })}
  </>
);

export const SourceTable = ({ rows, targets, stacked }: { rows: ScorecardSourceRow[]; targets: ScorecardTargets; stacked: boolean }) => (
  <Wrap $stacked={stacked}>
    <table>
      <thead>
        <tr>
          <th>Source</th>
          <th className="r">New leads</th>
          <th className="r">Reached an agent</th>
          <th className="r">Outcome ≤ 24h</th>
          <th className="r">WhatsApp from Propel</th>
          <th className="r">Missed clock</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const covPct = s.newLeads > 0 ? Math.round((100 * s.outcome24h) / s.newLeads) : null;
          const missPct = s.newLeads > 0 ? Math.round((100 * s.missedClock) / s.newLeads) : null;
          return (
            <tr key={s.sourceKey}>
              <td style={{ whiteSpace: 'normal' }}>{s.label}</td>
              <td className="r" data-k="New leads" style={{ fontFamily: FONT_MONO, fontVariantNumeric: 'tabular-nums' }}>
                {s.newLeads}
              </td>
              <td className="r" data-k="Reached an agent">{bar(s.handedToAgent, s.newLeads, 'neutral')}</td>
              <td className="r" data-k="Outcome ≤ 24h">{bar(s.outcome24h, s.newLeads, toneHigherIsBetter(covPct, targets.coverage24hPct))}</td>
              <td className="r" data-k="WhatsApp from Propel" style={{ fontFamily: FONT_MONO, fontVariantNumeric: 'tabular-nums' }}>
                {s.whatsapp24h}
              </td>
              <td className="r" data-k="Missed clock">{bar(s.missedClock, s.newLeads, toneLowerIsBetter(missPct, targets.breachMaxPct))}</td>
            </tr>
          );
        })}
        {rows.length === 0 ? (
          <tr className="more">
            <td colSpan={6}>No new leads in this window.</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  </Wrap>
);
