// Off-plan handover is thought of in quarters, not dates. Pure, timezone-safe
// (parses the YYYY-MM prefix — no Date-timezone drift).
export function isoToQuarterLabel(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return undefined;
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `Q${quarter} ${year}`;
}

// The ISO date at the START of quarter `q` of `year` — used as an EXCLUSIVE upper
// bound: "handover before Q<q> <year>" ⇒ handover < quarterCutoffIso(q, year).
export function quarterCutoffIso(q: number, year: number): string {
  const startMonth = (q - 1) * 3 + 1;
  return `${year}-${String(startMonth).padStart(2, '0')}-01`;
}
