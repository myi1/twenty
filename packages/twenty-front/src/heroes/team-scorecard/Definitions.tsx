/* eslint-disable @nx/enforce-module-boundaries */
// Definitions — what the page cannot see, the caveats the route attached to THIS
// computation, and how each number is counted, in plain words. Always visible at
// the bottom; the definitions fold open on request.

import styled from '@emotion/styled';
import type { ScorecardSummaryPayload } from '@/propel/types/teamScorecard';
import { FONT_UI } from '../_pulse/pulse';

const Box = styled.section`
  background: var(--p-surface-2);
  border: 1px dashed var(--p-line);
  border-radius: var(--p-radius);
  padding: 14px 18px;
  font-family: ${FONT_UI};
  font-size: 13.5px;
  color: var(--p-ink);
  p {
    margin: 0 0 6px;
    max-width: 72ch;
  }
  ul {
    margin: 0 0 6px;
    padding-left: 18px;
    color: var(--p-ink-2);
  }
  details {
    border-top: 1px solid var(--p-line);
    padding-top: 10px;
    margin-top: 10px;
  }
  summary {
    cursor: pointer;
    font-weight: 500;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 8px 16px;
    margin: 12px 0 0;
    font-size: 13px;
  }
  dt {
    font-weight: 600;
  }
  dd {
    margin: 0;
    color: var(--p-ink-2);
    max-width: 62ch;
  }
  @media (max-width: 720px) {
    dl {
      grid-template-columns: 1fr;
      gap: 2px 0;
    }
    dt {
      margin-top: 8px;
    }
  }
`;

export const Definitions = ({ summary }: { summary: ScorecardSummaryPayload }) => {
  const sla = summary.headline.missedClock.slaMinutes;
  return (
    <Box>
      <p>
        <strong>What this page cannot see.</strong> Calls made from a personal phone, WhatsApps sent from a personal number, and outcomes that were
        never saved. None of that counts here. If it isn’t logged in Propel, it didn’t happen.
      </p>
      {summary.caveats.length > 2 ? (
        <ul>
          {summary.caveats.slice(2).map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
      <p style={{ color: 'var(--p-ink-2)' }}>
        Times are Dubai time. UK leads are worked 08:00–20:00 London; the clock does not yet pause outside those hours, so night-time breaches are included.
        Computed {summary.computedLabel}.
      </p>
      <details>
        <summary>How each number is counted</summary>
        <dl>
          <dt>New leads</dt>
          <dd>Contacts marked as a lead, created in the window.</dd>
          <dt>Reached an agent</dt>
          <dd>Someone other than a desk owner (Nancy, Cristina) held the lead at some point, or holds it now. “Back on the desk” means it reached an agent and bounced back.</dd>
          <dt>Outcome logged within 24h</dt>
          <dd>
            A call outcome (Interested, Callback, No answer, Not interested, Wrong number, Converted) saved on the first-response call task within 24 hours of
            the lead landing with someone. Judged only on leads whose 24 hours have passed, or that already have an outcome; the rest are “still inside the window”.
          </dd>
          <dt>First attempt, median</dt>
          <dd>Minutes from the lead landing with someone to the outcome being saved. Shown once five or more outcomes exist.</dd>
          <dt>WhatsApp from Propel</dt>
          <dd>
            A message sent to the lead from Propel on the everyday Dubai or UK line within 24 hours, that left the system, and that carries the name of the person
            who sent it. The automatic welcome, automatic follow-ups and campaign blasts carry no sender, so they never count as an agent’s message.
          </dd>
          <dt>Missed the response clock</dt>
          <dd>
            The lead’s first-response limit{sla ? ` (${sla} minutes)` : ''} was missed at least once, whoever held it. The separate one-hour task deadline is not
            this number.
          </dd>
          <dt>Deal moved past New</dt>
          <dd>Of leads that have a deal in any lane, the share whose deal left its first stage within 7 days. Leads with deals younger than 7 days are “too early”.</dd>
          <dt>Agents logging outcomes</dt>
          <dd>Agents (not desk owners) who saved at least one outcome, out of the agents who received at least one lead.</dd>
          <dt>Hand-offs</dt>
          <dd>Times a lead changed hands in the window: bounced by the response clock, or recycled to the pool after going idle.</dd>
        </dl>
      </details>
    </Box>
  );
};
