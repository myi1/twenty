// Shared AED money formatting for the Propel front-end. One cross-hero standard so
// numbers read the same everywhere ([[ui-plain-language-low-cognitive-load]]).
//
// Client-facing browse/pitch UI wants SCANNABLE rounded figures — "AED 640K",
// "AED 1.9M", "AED 12.4M" — never a fake-exact to-the-dirham number. Many off-plan
// unit "prices" are DERIVED upstream (pricePerSqft × size), so showing 528,686 to
// the dirham reads as machine-generated. Reserve full precision (formatAedExact)
// for the few places an exact figure genuinely matters (payment schedules,
// contracts, an entered price).

const trimZero = (s: string): string => s.replace(/\.0$/, '');

export type FormatAedOpts = {
  /** Prefix "~" — use for a DERIVED / estimated figure. */
  approx?: boolean;
  /** Prefix "from " — use for a project's cheapest-unit starting price. */
  from?: boolean;
};

/**
 * Scannable rounded AED. Returns null for null/NaN so callers can fall back to a
 * placeholder ("Price on request").
 *   640058   → "AED 640K"
 *   528686   → "AED 529K"
 *   1899825  → "AED 1.9M"
 *   12400000 → "AED 12.4M"
 *   { approx:true } → "~AED 640K"    { from:true } → "from AED 640K"
 */
export function formatAed(n: number | null | undefined, opts: FormatAedOpts = {}): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const prefix = opts.from ? 'from ' : opts.approx ? '~' : '';
  const abs = Math.abs(n);
  // Promote to millions just below 1M so 999,600 shows "AED 1M", not "AED 1000K".
  if (abs >= 999_500) return `${prefix}AED ${trimZero((n / 1_000_000).toFixed(1))}M`;
  if (abs >= 1_000) return `${prefix}AED ${Math.round(n / 1_000)}K`;
  return `${prefix}AED ${Math.round(n)}`;
}

/** Full comma-grouped precision — only where an exact dirham figure matters. */
export function formatAedExact(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `AED ${Math.round(n).toLocaleString('en-US')}`;
}
