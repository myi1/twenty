/* eslint-disable @nx/enforce-module-boundaries */
// HeadlineTiles — the one hero figure (outcome logged within 24h, against its target)
// and the six lead-care tiles. Each tile is a button: pressing it opens the "which
// leads" drill for that number. Tone (good / warn / bad) is judged against the targets
// from Lead Routing settings; a number nobody can judge yet stays neutral.
//
// Copy rule for this surface: a label, a number, and at most ONE qualifier. What a
// number MEANS lives once, in the collapsed "How these numbers are counted" block —
// never repeated on the face of the tile.

import styled from '@emotion/styled';
import type { ScorecardDrillMetric, ScorecardHeadline, ScorecardTargets } from '@/propel/types/teamScorecard';
import { FONT_DISPLAY, FONT_MONO, FONT_UI } from '../_pulse/pulse';
import { hoursLabel, minutesLabel, pctLabel, plural, toneForAgents, toneForDeskWait, toneForMinutes, toneHigherIsBetter, toneLowerIsBetter, type Tone } from './format';

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

const HeroFig = styled.div`
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  padding: 18px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 20px;
  min-height: 168px;
`;

const FigLabel = styled.div`
  font-family: ${FONT_UI};
  font-size: 13px;
  color: var(--p-ink-2);
`;

const Big = styled.div`
  font-family: ${FONT_DISPLAY};
  font-size: 60px;
  line-height: 1;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: var(--p-ink);
  font-variant-numeric: tabular-nums;
  margin-top: 6px;
`;

const FigSub = styled.div`
  font-family: ${FONT_MONO};
  font-size: 12px;
  color: var(--p-ink-2);
  font-variant-numeric: tabular-nums;
  margin-top: 8px;
`;

const Meter = styled.div`
  position: relative;
  height: 6px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--p-ink) 14%, transparent);
  margin-bottom: 20px;
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
  transition: border-color 140ms ease;
  &:hover {
    border-color: var(--p-accent);
  }
  &:focus-visible {
    border-color: var(--p-accent);
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


// ── Waiting at the desk ─────────────────────────────────────────────────────────
// Its own band rather than a seventh tile, for two reasons. It carries TWO numbers
// that must be read together — how many are sitting there, and how long — and a tile
// big enough for one number invites it to be read as a rate, which is the exact
// mistake this figure exists to correct. The response clock cannot see desk-held
// leads at all (it starts when a selling agent receives one), so without this the
// page reports a pass while leads age for days.
const Band = styled.button<{ $tone: Tone }>`
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px 22px;
  width: 100%;
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  padding: 14px 18px;
  margin-bottom: 14px;
  transition: border-color 140ms ease;
  &:hover {
    border-color: var(--p-accent);
  }
  &:focus-visible {
    border-color: var(--p-accent);
    box-shadow: var(--p-focus-ring);
  }
`;

const BandLabel = styled.span`
  font-family: ${FONT_UI};
  font-size: 13px;
  color: var(--p-ink-2);
`;

const BandFig = styled.span`
  font-family: ${FONT_MONO};
  font-size: 22px;
  font-weight: 500;
  color: var(--p-ink);
  font-variant-numeric: tabular-nums;
  b {
    font-weight: 500;
  }
  span {
    font-family: ${FONT_UI};
    font-size: 12.5px;
    font-weight: 400;
    color: var(--p-ink-2);
    margin-left: 6px;
  }
`;

export const DeskWaitBand = ({
  headline,
  targets,
  onDrill,
}: {
  headline: ScorecardHeadline;
  targets: ScorecardTargets;
  onDrill: (metric: ScorecardDrillMetric, title: string) => void;
}) => {
  const d = headline.deskWait;
  if (d.leads === 0) return null;
  return (
    <Band type="button" $tone={toneForDeskWait(d.medianHours, targets.deskWaitHours)} onClick={() => onDrill('deskWait', 'Waiting at the desk')}>
      <BandLabel>Waiting at the desk</BandLabel>
      <BandFig>
        <b>{d.leads}</b>
        <span>{d.leads === 1 ? 'lead sitting there' : 'leads sitting there'}</span>
      </BandFig>
      <BandFig>
        <b>{hoursLabel(d.medianHours)}</b>
        <span>typical wait</span>
      </BandFig>
      {d.overTarget > 0 ? (
        <Pill $tone={toneForDeskWait(d.medianHours, targets.deskWaitHours)}>
          {d.overTarget} past {targets.deskWaitHours}h
        </Pill>
      ) : (
        <Pill $tone="good">all within {targets.deskWaitHours}h</Pill>
      )}
    </Band>
  );
};

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
  const fillPct = Math.max(0, Math.min(100, h.outcome24h.pct ?? 0));

  return (
    <Grid $stacked={stacked}>
      <HeroFig>
        <div>
          <FigLabel>Outcome logged within 24 hours</FigLabel>
          <Big>{pctLabel(h.outcome24h.pct)}</Big>
          <FigSub>
            {h.newLeads === 0
              ? 'no new leads'
              : h.outcome24h.of === 0
                ? `${h.outcome24h.pending} still inside 24h`
                : `${h.outcome24h.n} of ${h.outcome24h.of} judged${h.outcome24h.pending > 0 ? ` · ${h.outcome24h.pending} still inside 24h` : ''}`}
          </FigSub>
        </div>
        <Meter aria-label={`Target ${targets.coverage24hPct} percent`}>
          <Fill $tone={coverageTone} style={{ width: `${fillPct}%` }} />
          <Target style={{ left: `${Math.min(98, targets.coverage24hPct)}%` }} data-label={`target ${targets.coverage24hPct}%`} />
        </Meter>
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
              <Pill $tone={h.handedToAgent.neverLeftDesk > h.handedToAgent.n ? 'bad' : 'warn'}>{h.handedToAgent.neverLeftDesk} still on the desk</Pill>
            ) : h.handedToAgent.backOnDesk > 0 ? (
              <Pill $tone="warn">{h.handedToAgent.backOnDesk} bounced back</Pill>
            ) : h.newLeads > 0 ? (
              <Pill $tone="good">all of them</Pill>
            ) : null}
          </Foot>
        </Tile>

        <Tile type="button" onClick={() => onDrill('outcome', 'First attempts')}>
          <Label>First attempt, median</Label>
          <Value>{minutesLabel(h.firstAttempt.medianMinutes)}</Value>
          <Foot>
            {h.firstAttempt.medianMinutes === null ? (
              `${plural(h.firstAttempt.outcomes, 'outcome', 'outcomes')} logged · needs 5`
            ) : (
              <Pill $tone={toneForMinutes(h.firstAttempt.medianMinutes, targets.firstAttemptMinutes)}>target ≤ {targets.firstAttemptMinutes} min</Pill>
            )}
          </Foot>
        </Tile>

        <Tile type="button" onClick={() => onDrill('whatsapp', 'WhatsApp from Propel')}>
          <Label>WhatsApp from Propel</Label>
          <Value>
            {h.whatsapp24h.n}
            <span>of {h.whatsapp24h.of}</span>
          </Value>
          <Foot>
            {h.whatsapp24h.unattributed > 0 ? `${h.whatsapp24h.unattributed} with no sender recorded` : <Pill $tone="neutral">automatic messages excluded</Pill>}
          </Foot>
        </Tile>

        <Tile type="button" onClick={() => onDrill('missed', 'Missed the response clock')}>
          <Label>Missed the response clock</Label>
          <Value>
            {h.missedClock.n}
            <span>of {h.missedClock.of}</span>
          </Value>
          <Foot>
            <Pill $tone={toneLowerIsBetter(h.missedClock.pct, targets.breachMaxPct)}>
              {pctLabel(h.missedClock.pct)} · target ≤ {targets.breachMaxPct}%
            </Pill>
          </Foot>
        </Tile>

        <Tile type="button" onClick={() => onDrill('moved', 'Deals that moved')}>
          <Label>Deal moved past “New”</Label>
          <Value>
            {h.pipelineMotion.moved}
            <span>of {h.pipelineMotion.judged}</span>
          </Value>
          <Foot>
            {h.pipelineMotion.tooEarly > 0
              ? `${h.pipelineMotion.tooEarly} too early to judge`
              : h.pipelineMotion.noDeal > 0
                ? `${h.pipelineMotion.noDeal} with no deal yet`
                : null}
          </Foot>
        </Tile>

        <Tile type="button" onClick={() => onDrill('outcome', 'Outcomes logged')}>
          <Label>Agents logging outcomes</Label>
          <Value>
            {h.adoption.active}
            <span>of {h.adoption.received}</span>
          </Value>
          <Foot>
            <Pill $tone={toneForAgents(h.adoption.active, targets.activeAgentsMin)}>target {targets.activeAgentsMin}</Pill>
          </Foot>
        </Tile>
      </Tiles>
    </Grid>
  );
};
