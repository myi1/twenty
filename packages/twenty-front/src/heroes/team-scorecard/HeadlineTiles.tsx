/* eslint-disable @nx/enforce-module-boundaries */
// HeadlineTiles — the one hero figure (outcome within 24h against its target) and
// the six lead-care tiles. Each tile is a button: pressing it opens the "which leads"
// drill for that number. Status tone (good / warn / bad) is judged against the
// targets from Lead Routing settings; a number nobody can judge yet is neutral.

import styled from '@emotion/styled';
import type { ScorecardDrillMetric, ScorecardHeadline, ScorecardTargets } from '@/propel/types/teamScorecard';
import { FONT_DISPLAY, FONT_MONO, FONT_UI } from '../_pulse/pulse';
import { minutesLabel, ofLabel, pctLabel, plural, toneForAgents, toneForMinutes, toneHigherIsBetter, toneLowerIsBetter, type Tone } from './format';

const TONE_COLOR: Record<Tone, string> = {
  good: 'var(--p-good)',
  warn: 'var(--p-warn)',
  bad: 'var(--p-bad)',
  neutral: 'var(--p-ink-2)',
};

const Grid = styled.div<{ $stacked: boolean }>`
  display: grid;
  gap: 12px;
  grid-template-columns: ${(p) => (p.$stacked ? '1fr' : 'minmax(280px, 1.15fr) 2fr')};
  margin-bottom: 14px;
`;

const Card = styled.div`
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  padding: 16px 18px;
`;

const HeroFig = styled(Card)`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 176px;
`;

const Eyebrow = styled.div`
  font-family: ${FONT_MONO};
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--p-ink-2);
  font-weight: 500;
`;

const Big = styled.div`
  font-family: ${FONT_DISPLAY};
  font-size: 60px;
  line-height: 1;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: var(--p-ink);
  margin: 8px 0 4px;
  font-variant-numeric: tabular-nums;
  small {
    font-family: ${FONT_UI};
    font-size: 15px;
    font-weight: 400;
    color: var(--p-ink-2);
    margin-left: 8px;
  }
`;

const Meter = styled.div`
  position: relative;
  height: 6px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--p-ink) 14%, transparent);
  margin: 12px 0 22px;
`;

const Fill = styled.div<{ $tone: Tone }>`
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 3px 0 0 3px;
  background: ${(p) => TONE_COLOR[p.$tone]};
`;

const Target = styled.div`
  position: absolute;
  top: -5px;
  width: 2px;
  height: 16px;
  background: var(--p-ink);
  &::after {
    content: attr(data-label);
    position: absolute;
    top: 17px;
    left: 50%;
    transform: translateX(-50%);
    font-family: ${FONT_MONO};
    font-size: 10.5px;
    color: var(--p-ink-2);
    white-space: nowrap;
  }
`;

const Tiles = styled.div<{ $stacked: boolean }>`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(${(p) => (p.$stacked ? 2 : 3)}, minmax(0, 1fr));
`;

const Tile = styled.button`
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  padding: 12px 14px;
  min-width: 0;
  transition: border-color 120ms ease;
  &:hover,
  &:focus-visible {
    border-color: var(--p-accent);
  }
  &:focus-visible {
    box-shadow: var(--p-focus-ring);
  }
`;

const Label = styled.div`
  font-family: ${FONT_UI};
  font-size: 12.5px;
  color: var(--p-ink-2);
`;

const Value = styled.div`
  font-family: ${FONT_MONO};
  font-size: 26px;
  font-weight: 500;
  line-height: 1.1;
  color: var(--p-ink);
  font-variant-numeric: tabular-nums;
  span {
    font-family: ${FONT_UI};
    font-size: 12.5px;
    font-weight: 400;
    color: var(--p-ink-2);
    margin-left: 5px;
  }
`;

const Foot = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
  font-family: ${FONT_UI};
  font-size: 11.5px;
  color: var(--p-ink-2);
`;

const Pill = styled.span<{ $tone: Tone }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 500;
  color: ${(p) => TONE_COLOR[p.$tone]};
  background: color-mix(in srgb, ${(p) => TONE_COLOR[p.$tone]} 14%, transparent);
  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
  }
`;

export const HeadlineTiles = ({
  headline,
  targets,
  stacked,
  onDrill,
}: {
  headline: ScorecardHeadline;
  targets: ScorecardTargets;
  stacked: boolean;
  onDrill: (metric: ScorecardDrillMetric, title: string) => void;
}) => {
  const h = headline;
  const coverageTone = toneHigherIsBetter(h.outcome24h.pct, targets.coverage24hPct);
  const missedTone = toneLowerIsBetter(h.missedClock.pct, targets.breachMaxPct);
  const speedTone = toneForMinutes(h.firstAttempt.medianMinutes, targets.firstAttemptMinutes);
  const agentsTone = toneForAgents(h.adoption.active, targets.activeAgentsMin);
  const fillPct = Math.max(0, Math.min(100, h.outcome24h.pct ?? 0));

  return (
    <Grid $stacked={stacked}>
      <HeroFig>
        <div>
          <Eyebrow>Outcome logged within 24 hours</Eyebrow>
          <Big>
            {pctLabel(h.outcome24h.pct)}
            <small>
              {h.outcome24h.of === 0 ? (h.newLeads === 0 ? 'no new leads in this window' : 'nothing to judge yet') : `${ofLabel(h.outcome24h)} leads judged`}
            </small>
          </Big>
          <Label style={{ fontSize: 13 }}>
            A call outcome saved on the first-response task within a day of the lead landing with someone.
            {h.outcome24h.pending > 0 ? ` ${plural(h.outcome24h.pending, 'lead is', 'leads are')} still inside the 24-hour window.` : ''}
            {h.outcome24h.approx ? ' Some times are estimated.' : ''}
          </Label>
        </div>
        <div>
          <Meter aria-hidden="true">
            <Fill $tone={coverageTone} style={{ width: `${fillPct}%` }} />
            <Target style={{ left: `${Math.min(98, targets.coverage24hPct)}%` }} data-label={`target ${targets.coverage24hPct}%`} />
          </Meter>
          <Foot>Targets live in Lead Routing settings.</Foot>
        </div>
      </HeroFig>

      <Tiles $stacked={stacked}>
        <Tile type="button" onClick={() => onDrill('handed', 'Reached an agent')}>
          <Label>Reached an agent</Label>
          <Value>
            {h.handedToAgent.n}
            <span>of {h.handedToAgent.of}</span>
          </Value>
          <Foot>
            {h.handedToAgent.neverLeftDesk > 0 ? (
              <Pill $tone={h.handedToAgent.neverLeftDesk > h.handedToAgent.n ? 'bad' : 'warn'}>{h.handedToAgent.neverLeftDesk} never left the desk</Pill>
            ) : h.handedToAgent.unassigned > 0 ? (
              <Pill $tone="warn">{h.handedToAgent.unassigned} unassigned</Pill>
            ) : (
              <Pill $tone="good">every lead reached an agent</Pill>
            )}
            {h.handedToAgent.backOnDesk > 0 ? <span>· {h.handedToAgent.backOnDesk} back on the desk</span> : null}
          </Foot>
        </Tile>

        <Tile type="button" onClick={() => onDrill('outcome', 'First attempts')}>
          <Label>First attempt, median</Label>
          <Value>{minutesLabel(h.firstAttempt.medianMinutes)}</Value>
          <Foot>
            {h.firstAttempt.medianMinutes === null ? (
              <span>
                {plural(h.firstAttempt.outcomes, 'outcome logged', 'outcomes logged')} · needs 5 to show
              </span>
            ) : (
              <Pill $tone={speedTone}>target ≤ {targets.firstAttemptMinutes} min</Pill>
            )}
            {h.firstAttempt.bands.within15 > 0 ? <span>· {h.firstAttempt.bands.within15} within 15 min</span> : null}
          </Foot>
        </Tile>

        <Tile type="button" onClick={() => onDrill('whatsapp', 'WhatsApp from Propel')}>
          <Label>WhatsApp from Propel within 24h</Label>
          <Value>
            {h.whatsapp24h.n}
            <span>of {h.whatsapp24h.of}</span>
          </Value>
          <Foot>
            <Pill $tone="neutral">welcome message and campaigns excluded</Pill>
            {h.whatsapp24h.approx ? <span>· some credited by thread</span> : null}
          </Foot>
        </Tile>

        <Tile type="button" onClick={() => onDrill('missed', 'Missed the response clock')}>
          <Label>Missed the response clock{h.missedClock.slaMinutes ? ` (${h.missedClock.slaMinutes} min)` : ''}</Label>
          <Value>
            {h.missedClock.n}
            <span>of {h.missedClock.of}</span>
          </Value>
          <Foot>
            <Pill $tone={missedTone}>
              {pctLabel(h.missedClock.pct)} · target ≤ {targets.breachMaxPct}%
            </Pill>
            {h.missedClock.handoffs > 0 ? <span>· {plural(h.missedClock.handoffs, 'hand-off', 'hand-offs')}</span> : null}
          </Foot>
        </Tile>

        <Tile type="button" onClick={() => onDrill('moved', 'Deals that moved')}>
          <Label>Deal moved past “New” in 7 days</Label>
          <Value>
            {h.pipelineMotion.moved}
            <span>of {h.pipelineMotion.judged} judged</span>
          </Value>
          <Foot>
            {h.pipelineMotion.tooEarly > 0 ? <span>{h.pipelineMotion.tooEarly} too early to judge · </span> : null}
            <span>{h.pipelineMotion.noDeal} with no deal yet</span>
            {h.pipelineMotion.approx ? <span>· some estimated</span> : null}
          </Foot>
        </Tile>

        <Tile type="button" onClick={() => onDrill('outcome', 'Outcomes logged')}>
          <Label>Agents logging outcomes</Label>
          <Value>
            {h.adoption.active}
            <span>of {h.adoption.received} who got leads</span>
          </Value>
          <Foot>
            <Pill $tone={agentsTone}>target {targets.activeAgentsMin} active</Pill>
            {h.adoption.agentRoleCount !== null ? <span>· {h.adoption.agentRoleCount} on the Agent role</span> : null}
          </Foot>
        </Tile>
      </Tiles>
    </Grid>
  );
};
