// format.ts — plain-language formatting for the Team Scorecard (no raw enums, no
// fake precision). Pure; unit-testable.

import type { Ratio, ScorecardTargets } from '@/propel/types/teamScorecard';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

/** "6%" or "—" when there is nothing to judge yet. */
export const pctLabel = (pct: number | null): string => (pct === null ? '—' : `${pct}%`);

/** "2 of 36" */
export const ofLabel = (r: Ratio): string => `${r.n} of ${r.of}`;

/** 41 → "41 min", 95 → "1h 35m", 1500 → "1 day 1h", null → "—" */
export const minutesLabel = (m: number | null): string => {
  if (m === null) return '—';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d} day${d === 1 ? '' : 's'} ${rh}h` : `${d} day${d === 1 ? '' : 's'}`;
};

/** A share that should be HIGH (coverage): at/above target = good, within 15 points = warn, else bad. */
export const toneHigherIsBetter = (pct: number | null, targetPct: number): Tone => {
  if (pct === null) return 'neutral';
  if (pct >= targetPct) return 'good';
  if (pct >= targetPct - 15) return 'warn';
  return 'bad';
};

/** A share that should be LOW (missed clock): at/below target = good, within 15 points = warn, else bad. */
export const toneLowerIsBetter = (pct: number | null, targetPct: number): Tone => {
  if (pct === null) return 'neutral';
  if (pct <= targetPct) return 'good';
  if (pct <= targetPct + 15) return 'warn';
  return 'bad';
};

export const toneForMinutes = (median: number | null, targetMinutes: number): Tone => {
  if (median === null) return 'neutral';
  if (median <= targetMinutes) return 'good';
  if (median <= targetMinutes * 2) return 'warn';
  return 'bad';
};

export const toneForAgents = (active: number, target: number): Tone => {
  if (active >= target) return 'good';
  if (active >= Math.ceil(target / 2)) return 'warn';
  return 'bad';
};

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export const targetLine = (t: ScorecardTargets): string =>
  `Targets: ${t.coverage24hPct}% outcomes within 24h · at most ${t.breachMaxPct}% missed clock · first attempt within ${t.firstAttemptMinutes} min · ${t.activeAgentsMin} active agents`;
