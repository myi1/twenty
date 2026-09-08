/* eslint-disable @nx/enforce-module-boundaries */
// Definitions — the honesty layer, folded away. One visible line says what the page
// cannot see; everything else (the caveats this particular computation attached, and
// how each number is counted) lives one tap down. The page face carries numbers; this
// carries their meaning, once.

import styled from '@emotion/styled';
import type { ScorecardSummaryPayload } from '@/propel/types/teamScorecard';
import { FONT_UI } from '../_pulse/pulse';

const Box = styled.section`
  font-family: ${FONT_UI};
  font-size: 13px;
  color: var(--p-ink-2);
  border-top: 1px solid var(--p-line);
  padding-top: 14px;
  p {
    margin: 0;
    max-width: 76ch;
  }
  details {
    margin-top: 10px;
  }
  summary {
    cursor: pointer;
    color: var(--p-ink);
    font-weight: 500;
    width: fit-content;
  }
  summary:focus-visible {
    box-shadow: var(--p-focus-ring);
    border-radius: 4px;
  }
  ul {
    margin: 12px 0 0;
    padding-left: 18px;
    max-width: 76ch;
  }
  li {
    margin-bottom: 4px;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 8px 16px;
    margin: 14px 0 0;
  }
  dt {
    font-weight: 600;
    color: var(--p-ink);
  }
  dd {
    margin: 0;
    max-width: 62ch;
  }
  @media (max-width: 720px) {
    dl {
      grid-template-columns: 1fr;
      gap: 2px 0;
    }
    dt {
      margin-top: 10px;
    }
  }
`;

export const Definitions = ({ summary }: { summary: ScorecardSummaryPayload }) => {
  const sla = summary.headline.missedClock.slaMinutes;
  // caveats[0..1] are the two constants (what is invisible, and the Dubai/UK-hours
  // note); the rest are attached by this computation and belong at the top of the fold.
  const computed = summary.caveats.slice(2);
  return (
    <Box>
      <p>
        If it isn’t logged in Propel, it isn’t here: calls from a personal phone, WhatsApps from a personal number, and outcomes nobody saved.
        The response clock only starts when a lead reaches an agent, so time spent waiting at the desk is counted on its own line, not as a missed clock. Dubai time. Computed {summary.computedLabel}.
      </p>
      <details>
        <summary>How these numbers are counted</summary>
        {computed.length > 0 ? (
          <ul>
            {computed.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}
        <dl>
          <dt>New leads</dt>
          <dd>Contacts marked as a lead, created in the window.</dd>
          <dt>Reached an agent</dt>
          <dd>Someone other than a desk owner held the lead at some point, or holds it now.</dd>
          <dt>Outcome logged within 24h</dt>
          <dd>
            A call outcome saved on the first-response call task within 24 hours of the lead landing with someone. Judged only on leads whose 24 hours
            have passed, or that already have an outcome.
          </dd>
          <dt>First attempt</dt>
          <dd>Minutes from the lead landing with someone to the outcome being saved. Shown from five outcomes.</dd>
          <dt>WhatsApp from Propel</dt>
          <dd>
            A message sent from Propel on the everyday Dubai or UK line within 24 hours, that left the system and carries the name of the person who sent
            it. Automatic messages carry no sender, so they never count.
          </dd>
          <dt>Waiting at the desk</dt>
          <dd>
            Leads from this window still held by a desk owner right now, and how long they have been there. Counted separately from the response clock,
            which does not start until a lead reaches an agent.
          </dd>
          <dt>Added by hand</dt>
          <dd>Contacts somebody typed or imported rather than ones Propel captured from a source. Counted in none of the figures above.</dd>
          <dt>Missed the response clock</dt>
          <dd>The lead’s first-response limit{sla ? ` of ${sla} minutes` : ''} passed at least once, whoever held it. The separate one-hour task deadline is counted apart.</dd>
          <dt>Deal moved past New</dt>
          <dd>Of leads with a deal, the share whose deal left its first stage within 7 days. Deals younger than 7 days are not judged.</dd>
          <dt>Agents logging outcomes</dt>
          <dd>Agents who saved at least one outcome, out of the agents who received a lead.</dd>
          <dt>Hand-offs</dt>
          <dd>Times a lead changed hands: bounced by the response clock, or recycled to the pool after going idle.</dd>
        </dl>
      </details>
    </Box>
  );
};
