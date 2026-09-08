/* eslint-disable @nx/enforce-module-boundaries */
// DrillPanel — "which leads" behind a number. Paged by 40 from the route; a lead
// name opens its record. Only the plain-language state line is shown per lead.

import styled from '@emotion/styled';
import type { ScorecardLeadRow } from '@/propel/types/teamScorecard';
import { Btn, FONT_MONO, FONT_UI } from '../_pulse/pulse';

const Card = styled.section`
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  padding: 14px 18px;
  margin-bottom: 14px;
  font-family: ${FONT_UI};
`;

const Head = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--p-ink);
  }
`;

const Lede = styled.p`
  margin: 2px 0 10px;
  font-size: 13px;
  color: var(--p-ink-2);
`;

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px 16px;
    padding: 8px 0;
    border-bottom: 1px solid var(--p-line);
    font-size: 13.5px;
    color: var(--p-ink);
  }
  li:last-child {
    border-bottom: 0;
  }
  .meta {
    color: var(--p-ink-2);
    font-size: 12.5px;
    text-align: right;
  }
  .sub {
    grid-column: 1 / -1;
    color: var(--p-ink-2);
    font-size: 12.5px;
    font-family: ${FONT_MONO};
  }
`;

const NameBtn = styled.button`
  all: unset;
  cursor: pointer;
  font-weight: 500;
  color: var(--p-ink);
  &:hover {
    text-decoration: underline;
  }
  &:focus-visible {
    box-shadow: var(--p-focus-ring);
    border-radius: 4px;
  }
`;

export const DrillPanel = ({
  title,
  rows,
  total,
  loading,
  error,
  hasMore,
  onMore,
  onClose,
  onOpenLead,
}: {
  title: string;
  rows: ScorecardLeadRow[];
  total: number;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onMore: () => void;
  onClose: () => void;
  onOpenLead: (personId: string) => void;
}) => (
  <Card aria-live="polite">
    <Head>
      <h2>{title}</h2>
      <Btn type="button" variant="ghost" onClick={onClose}>
        Close
      </Btn>
    </Head>
    <Lede>
      {error ? error : loading && rows.length === 0 ? 'Loading…' : total === 0 ? 'No leads match this number in this window.' : `${total} lead${total === 1 ? '' : 's'}, newest first. Tap a name to open the record.`}
    </Lede>
    <List>
      {rows.map((r) => (
        <li key={r.personId}>
          <span>
            <NameBtn type="button" onClick={() => onOpenLead(r.personId)}>
              {r.name}
            </NameBtn>
            <span style={{ color: 'var(--p-ink-2)' }}> · {r.source}</span>
          </span>
          <span className="meta">
            {r.holderName ? `${r.holderName}${r.holderGroup === 'DESK' ? ' (desk)' : ''}` : 'Unassigned'}
          </span>
          <span className="sub">
            {r.arrivedLabel} · {r.state}
          </span>
        </li>
      ))}
    </List>
    {hasMore ? (
      <div style={{ marginTop: 10 }}>
        <Btn type="button" variant="secondary" onClick={onMore} disabled={loading}>
          {loading ? 'Loading…' : 'Show 40 more'}
        </Btn>
      </div>
    ) : null}
  </Card>
);
