// Shared ISO → human date formatting for the Marketing hero.
//
// The founder's quality bar ([[ui-plain-language-low-cognitive-load]]): a user
// must NEVER see a raw ISO date ("2026-07-11" or worse, a full ISO timestamp)
// in a badge, caption, or row. Any surface with a stored date routes it through
// `friendlyDate` (date-only) or `friendlyDateTime` (when the time matters,
// e.g. a scheduled send).
//
// Both return '' on missing/invalid input so callers can `||` their own
// fallback copy. Pure — safe to call from a render body.

export const friendlyDate = (iso: string | null | undefined): string => {
  const v = (iso ?? '').trim();
  if (v === '') return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const friendlyDateTime = (iso: string | null | undefined): string => {
  const v = (iso ?? '').trim();
  if (v === '') return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};
