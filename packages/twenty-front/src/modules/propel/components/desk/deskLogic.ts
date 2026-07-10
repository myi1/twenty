// Pure logic for the control-room chassis (Wave 0). No React here — the
// primitives (PerfStrip/FreshnessFlag/AttributionLink/ControlRoomList/BulkBar)
// import these so their rendering stays trivial and their behavior is tested.

const DAY = 86_400_000;

export interface Freshness {
  label: string;
  stale: boolean;
}

export const freshness = (
  at: string | null | undefined,
  thresholdDays: number,
  now: number = Date.now(),
): Freshness => {
  if (at === null || at === undefined || at === '') {
    return { label: 'never updated', stale: true };
  }
  const days = Math.floor((now - Date.parse(at)) / DAY);
  const label = days <= 0 ? 'updated today' : `updated ${days}d ago`;
  return { label, stale: days > thresholdDays };
};

const nz = (n: number | null | undefined): number => (typeof n === 'number' ? n : 0);
const withCommas = (n: number): string => n.toLocaleString('en-US');

export interface Attribution {
  leads?: number | null;
  deals?: number | null;
  revenue?: number | null;
  currency?: string;
}

export const attributionLabel = (a: Attribution): string => {
  const leads = nz(a.leads);
  const deals = nz(a.deals);
  const revenue = nz(a.revenue);
  if (leads === 0 && deals === 0 && revenue === 0) return 'no leads yet';
  const parts = [`${withCommas(leads)} leads`];
  if (deals > 0) parts.push(`${withCommas(deals)} deals`);
  if (revenue > 0) parts.push(`${a.currency ?? 'AED'} ${withCommas(revenue)}`);
  return parts.join(' · ');
};

export const toggleSelection = (selected: Set<string>, id: string): Set<string> => {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

export type PerfKind = 'count' | 'pct' | 'currency';

export const formatPerfValue = (
  n: number | null | undefined,
  kind: PerfKind,
  currency = 'AED',
): string => {
  if (n === null || n === undefined) return '—';
  if (kind === 'pct') return `${Math.round(n)}%`;
  if (kind === 'currency') return `${currency} ${withCommas(Math.round(n))}`;
  return withCommas(n);
};
