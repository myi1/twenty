/* eslint-disable @nx/enforce-module-boundaries */
// Team Scorecard — the manager dashboard for lead care (runtime hero `team-scorecard`).
//
// Rides Twenty's chrome (PropelMantineProvider + PageContainer + PageHeader) like My
// Desk; owns everything below the top bar in the Nocturne register. One route call
// (POST /team-scorecard) per window; the route decides the SCOPE from the caller's
// role — managers and admins get the team, an agent gets "My scorecard" (own row
// against the targets, never a colleague's name). The page never computes a metric:
// every number arrives from the pure core behind the route, with its caveats.
//
// States that must never be a blank page: loading, route not deployed on this
// environment (404), server unreachable (0), route error, and "no leads in window".

import styled from '@emotion/styled';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconChartBar } from 'twenty-ui/display';
import { PropelMantineProvider } from '@/propel/components/PropelMantineProvider';
import type { PropelHeroHost } from '@/propel/runtime/heroHost';
import type {
  ScorecardDrillMetric,
  ScorecardLeadRow,
  ScorecardSummaryPayload,
  ScorecardWindowInput,
  ScorecardWindowPreset,
} from '@/propel/types/teamScorecard';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { Btn, FONT_DISPLAY, FONT_MONO, FONT_UI, NOCTURNE_LIGHT_VARS, PulseFonts, PulseNocturne } from '~/heroes/_pulse/pulse';
import { Definitions } from '~/heroes/team-scorecard/Definitions';
import { DrillPanel } from '~/heroes/team-scorecard/DrillPanel';
import { DeskWaitBand, HeadlineTiles } from '~/heroes/team-scorecard/HeadlineTiles';
import { PeopleTable, SourceTable } from '~/heroes/team-scorecard/PeopleTable';
import { fetchLeads, fetchSummary, type ScorecardLoad } from '~/heroes/team-scorecard/scorecardApi';
import { TrendColumns } from '~/heroes/team-scorecard/TrendColumns';

const STACK_BREAKPOINT_PX = 1023;

const useStacked = (): boolean => {
  const query = `(max-width: ${STACK_BREAKPOINT_PX}px)`;
  const matches = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [stacked, setStacked] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const q = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setStacked(e.matches);
    setStacked(q.matches);
    q.addEventListener('change', onChange);
    return () => q.removeEventListener('change', onChange);
  }, [query]);
  return stacked;
};

const Root = styled(PulseNocturne)`
  html[data-mantine-color-scheme='light'] & {
    ${NOCTURNE_LIGHT_VARS}
  }
  font-family: ${FONT_UI};
`;

const Stage = styled.div<{ $stacked: boolean }>`
  max-width: 1180px;
  margin: 0 auto;
  padding: ${(p) => (p.$stacked ? '14px 12px 48px' : '20px 20px 64px')};
  width: 100%;
  box-sizing: border-box;
`;

const Head = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px 24px;
  margin-bottom: 16px;
`;

const Sub = styled.div`
  color: var(--p-ink-2);
  font-size: 13.5px;
  margin-top: 4px;
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
`;

const Chip = styled.button<{ $on: boolean }>`
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  border: 1px solid ${(p) => (p.$on ? 'var(--p-accent)' : 'var(--p-line)')};
  background: ${(p) => (p.$on ? 'var(--p-accent-tint)' : 'var(--p-surface)')};
  color: ${(p) => (p.$on ? 'var(--p-ink)' : 'var(--p-ink-2)')};
  font-weight: ${(p) => (p.$on ? 500 : 400)};
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  font-family: ${FONT_UI};
  &:focus-visible {
    box-shadow: var(--p-focus-ring);
  }
`;

const DateInput = styled.input`
  font-family: ${FONT_UI};
  font-size: 13px;
  color: var(--p-ink);
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: 999px;
  padding: 5px 10px;
  color-scheme: dark;
  html[data-mantine-color-scheme='light'] & {
    color-scheme: light;
  }
`;

const Grid2 = styled.div<{ $stacked: boolean }>`
  display: grid;
  gap: 12px;
  grid-template-columns: ${(p) => (p.$stacked ? '1fr' : '3fr 2fr')};
  margin-bottom: 14px;
`;

const Card = styled.section`
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  padding: 16px 18px;
  min-width: 0;
  h2 {
    margin: 0 0 2px;
    font-size: 15px;
    font-weight: 600;
    color: var(--p-ink);
  }
`;

// A quiet line, not a tile: hand-added contacts are context for the numbers above,
// never a metric of their own. Clickable so "which ones?" is one tap away.
const ManualNote = styled.button`
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  display: block;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--p-line);
  font-size: 12.5px;
  color: var(--p-ink-2);
  &:hover {
    color: var(--p-ink);
  }
  &:focus-visible {
    box-shadow: var(--p-focus-ring);
    border-radius: 4px;
  }
`;

const Flow = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 8px;
    align-items: center;
    font-size: 13.5px;
    color: var(--p-ink);
  }
  .n {
    font-family: ${FONT_MONO};
    font-variant-numeric: tabular-nums;
  }
  .bar {
    grid-column: 1 / -1;
    height: 8px;
    border-radius: 0 4px 4px 0;
    background: var(--p-accent);
  }
  .bar.rest {
    background: color-mix(in srgb, var(--p-ink) 16%, transparent);
  }
`;

const Notice = styled.div`
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  padding: 22px 20px;
  max-width: 60ch;
  h2 {
    margin: 0 0 6px;
    font-family: ${FONT_DISPLAY};
    font-weight: 500;
    font-size: 22px;
    color: var(--p-ink);
  }
  p {
    margin: 0 0 12px;
    color: var(--p-ink-2);
    font-size: 14px;
  }
`;

const PRESETS: { key: ScorecardWindowPreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'since', label: 'Since a date…' },
];

type Drill = {
  metric: ScorecardDrillMetric;
  title: string;
  personId: string | null;
  rows: ScorecardLeadRow[];
  total: number;
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
};

const todayKeyLocal = (): string => {
  // Dubai calendar day for the date picker default (fixed UTC+4).
  return new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
};

export const TeamScorecardPage = ({ host }: { host: PropelHeroHost }) => {
  const stacked = useStacked();
  const [preset, setPreset] = useState<ScorecardWindowPreset>('7d');
  const [since, setSince] = useState<string>(() => todayKeyLocal());
  const [load, setLoad] = useState<ScorecardLoad<ScorecardSummaryPayload> | { kind: 'loading' }>({ kind: 'loading' });
  const [groupBy, setGroupBy] = useState<'person' | 'source'>('person');
  const [drill, setDrill] = useState<Drill | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const windowInput = useMemo<ScorecardWindowInput>(() => (preset === 'since' ? { preset, since } : { preset }), [preset, since]);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoad({ kind: 'loading' });
    setDrill(null);
    void fetchSummary(windowInput, ctrl.signal).then((res) => {
      if (!ctrl.signal.aborted) setLoad(res);
    });
    return () => ctrl.abort();
  }, [windowInput, reloadKey]);

  const openDrill = useCallback(
    (metric: ScorecardDrillMetric, title: string, personId: string | null = null) => {
      setDrill({ metric, title, personId, rows: [], total: 0, nextCursor: null, loading: true, error: null });
      void fetchLeads(windowInput, metric, personId, null).then((res) => {
        setDrill((d) => {
          if (!d || d.metric !== metric || d.personId !== personId) return d;
          if (res.kind !== 'ok') return { ...d, loading: false, error: res.kind === 'error' ? res.message : 'The lead list could not be loaded.' };
          return { ...d, loading: false, rows: res.data.rows, total: res.data.total, nextCursor: res.data.nextCursor };
        });
      });
    },
    [windowInput],
  );

  const moreDrill = useCallback(() => {
    if (!drill || !drill.nextCursor || drill.loading) return;
    const cursor = drill.nextCursor;
    setDrill({ ...drill, loading: true });
    void fetchLeads(windowInput, drill.metric, drill.personId, cursor).then((res) => {
      setDrill((d) => {
        if (!d) return d;
        if (res.kind !== 'ok') return { ...d, loading: false, error: res.kind === 'error' ? res.message : 'The next page could not be loaded.' };
        return { ...d, loading: false, rows: [...d.rows, ...res.data.rows], nextCursor: res.data.nextCursor };
      });
    });
  }, [drill, windowInput]);

  const summary = load.kind === 'ok' ? load.data : null;
  const mine = summary?.scope === 'MINE';
  const title = mine ? 'My scorecard' : 'Team scorecard';

  return (
    <PropelMantineProvider>
      <PulseFonts />
      <PageContainer style={{ flex: 1, minHeight: 0 }}>
        <PageHeader Icon={IconChartBar} title={<span style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 400 }}>{title}</span>} />
        <Root data-testid="team-scorecard-root" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <Stage $stacked={stacked}>
            <Head>
              <Sub>{summary ? summary.window.label : 'Lead care'}</Sub>
              <Chips role="group" aria-label="Time window">
                {PRESETS.map((p) => (
                  <Chip key={p.key} type="button" $on={preset === p.key} aria-pressed={preset === p.key} onClick={() => setPreset(p.key)}>
                    {p.label}
                  </Chip>
                ))}
                {preset === 'since' ? (
                  <DateInput type="date" value={since} max={todayKeyLocal()} onChange={(e) => setSince(e.currentTarget.value)} aria-label="Since date" />
                ) : null}
              </Chips>
            </Head>

            {load.kind === 'loading' ? (
              <Notice>
                <h2>Computing…</h2>
              </Notice>
            ) : load.kind === 'not-deployed' ? (
              <Notice>
                <h2>Not on this server yet</h2>
                <p>This release is not on this server yet.</p>
              </Notice>
            ) : load.kind === 'offline' ? (
              <Notice>
                <h2>Can’t reach the server</h2>
                <Btn type="button" variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
                  Try again
                </Btn>
              </Notice>
            ) : load.kind === 'error' ? (
              <Notice>
                <h2>Couldn’t load the scorecard</h2>
                <p>{load.message}</p>
                <Btn type="button" variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
                  Try again
                </Btn>
              </Notice>
            ) : summary ? (
              <>
                <HeadlineTiles headline={summary.headline} targets={summary.targets} stacked={stacked} onDrill={(m, t) => openDrill(m, t)} />

                {/* Hidden for agents on purpose. Under MINE scope an agent cannot see
                    desk-held leads at all, so this would render a confident 0 — and a 0
                    meaning "you cannot see this" is indistinguishable from "nothing is
                    stuck", which is the very failure the figure exists to correct. */}
                {mine ? null : <DeskWaitBand headline={summary.headline} targets={summary.targets} onDrill={(m, ttl) => openDrill(m, ttl)} />}

                {drill ? (
                  <DrillPanel
                    title={drill.title}
                    rows={drill.rows}
                    total={drill.total}
                    loading={drill.loading}
                    error={drill.error}
                    hasMore={drill.nextCursor !== null}
                    onMore={moreDrill}
                    onClose={() => setDrill(null)}
                    onOpenLead={(id) => host.navigate(`/object/person/${id}`)}
                  />
                ) : null}

                <Grid2 $stacked={stacked}>
                  <Card>
                    <h2>New leads by day, and how many got an outcome</h2>
                    <TrendColumns trend={summary.trend} />
                  </Card>
                  <Card>
                    <h2>Where the leads went</h2>
                    <Flow>
                      <FlowRow label="Reached an agent" n={summary.headline.handedToAgent.n} of={summary.headline.newLeads} />
                      <FlowRow label="Never left the desk" n={summary.headline.handedToAgent.neverLeftDesk} of={summary.headline.newLeads} rest />
                      {summary.headline.handedToAgent.unassigned > 0 ? <FlowRow label="Unassigned" n={summary.headline.handedToAgent.unassigned} of={summary.headline.newLeads} rest /> : null}
                      <FlowRow label="Bounced by the response clock" n={summary.headline.missedClock.handoffsSla} of={Math.max(summary.headline.newLeads, summary.headline.missedClock.handoffs)} rest />
                      <FlowRow label="Recycled to the pool after going idle" n={summary.headline.missedClock.handoffsIdle} of={Math.max(summary.headline.newLeads, summary.headline.missedClock.handoffs)} rest />
                    </Flow>
                    {/* Contacts somebody typed or imported. Counted nowhere above — two
                        bulk imports of 998 records turned every wide-window rate into a
                        false pass — but shown, because hiding them is its own lie. */}
                    {summary.headline.manuallyAdded > 0 ? (
                      <ManualNote type="button" onClick={() => openDrill('manual', 'Added by hand')}>
                        Plus {summary.headline.manuallyAdded} added by hand, counted in none of the figures above.
                      </ManualNote>
                    ) : null}
                  </Card>
                </Grid2>

                <Card style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <h2>{mine ? 'You, against the targets' : groupBy === 'person' ? 'By person' : 'By source'}</h2>
                    </div>
                    {!mine ? (
                      <Chips role="group" aria-label="Group by">
                        <Chip type="button" $on={groupBy === 'person'} aria-pressed={groupBy === 'person'} onClick={() => setGroupBy('person')}>
                          By person
                        </Chip>
                        <Chip type="button" $on={groupBy === 'source'} aria-pressed={groupBy === 'source'} onClick={() => setGroupBy('source')}>
                          By source
                        </Chip>
                      </Chips>
                    ) : null}
                  </div>
                  {mine || groupBy === 'person' ? (
                    <PeopleTable
                      rows={summary.byPerson}
                      collapsed={summary.personRowsCollapsed}
                      targets={summary.targets}
                      stacked={stacked}
                      scopeMine={!!mine}
                      onDrill={(m, t, personId) => openDrill(m, t, mine ? null : personId)}
                    />
                  ) : (
                    <SourceTable rows={summary.bySource} targets={summary.targets} stacked={stacked} />
                  )}
                </Card>

                <Definitions summary={summary} />
              </>
            ) : null}
          </Stage>
        </Root>
      </PageContainer>
    </PropelMantineProvider>
  );
};

const FlowRow = ({ label, n, of, rest = false }: { label: string; n: number; of: number; rest?: boolean }) => (
  <li>
    <span>{label}</span>
    <span className="n">{n}</span>
    <span className={rest ? 'bar rest' : 'bar'} style={{ width: `${of > 0 ? Math.max(n > 0 ? 2 : 0, Math.round((100 * n) / of)) : 0}%` }} />
  </li>
);
