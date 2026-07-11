type FilterOption = { value: string; label: string };

// Compact summary for a multi-select that must stay one control-row tall.
// The dropdown remains multi-value; only the closed-state presentation changes.
export function compactFilterLabel(
  options: FilterOption[],
  selected: string[],
  emptyLabel: string,
): string {
  if (selected.length === 0) return emptyLabel;
  const first = options.find((option) => option.value === selected[0])?.label ?? selected[0];
  return selected.length === 1 ? first : `${first} +${selected.length - 1}`;
}
