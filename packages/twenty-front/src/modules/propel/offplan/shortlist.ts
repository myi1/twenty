// Ordered, de-duplicated shortlist of project externalIds (in-session in P0; persists
// as offplanInterest records in P1).
export function toggleShortlist(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
