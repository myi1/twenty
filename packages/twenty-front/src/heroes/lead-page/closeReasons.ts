import type { LeadDeal } from './types';

export type CloseReason = { value: string; label: string };

/**
 * Which reasons the "Close this lead" dialog offers.
 *
 * With a deal open the reasons are that lane's own vocabulary — a loss reason is
 * normally a statement about a deal. With NO deal they describe the person instead,
 * and that is the case that matters: a junk lead never gets a deal, so until
 * 2026-09-20 this returned an empty list, the picker disappeared, and the only thing
 * an agent could record about a wrong number was a free-text note. The reason never
 * reached Meta, so the same audience kept being bought.
 *
 * Returning [] is still possible (an older payload serving no person list) and still
 * means "no picker, free text only" — never a silent wrong answer.
 */
export const closeReasonsFor = (
  selectedDeal: Pick<LeadDeal, 'lostReasons'> | undefined | null,
  personLostReasons: readonly CloseReason[] | undefined,
): CloseReason[] => {
  const lane = selectedDeal?.lostReasons ?? [];
  if (lane.length > 0) return [...lane];
  return [...(personLostReasons ?? [])];
};
