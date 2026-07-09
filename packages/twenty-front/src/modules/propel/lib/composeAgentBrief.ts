// The deterministic agent brief for the Marketing "My Desk" home (maker-checker
// Phase 2). The agent variant of composeDeskBrief: a PURE function — given the
// SAME counts the "My work" pipeline shows, it composes one plain-English,
// maker-oriented sentence. No LLM, no network. Because it reads the identical
// counts the accordion rows render, the brief and the pipeline can never disagree.
// Unit-tested (given counts → exact string).
//
// The maker cares about a DIFFERENT set than the night-desk COO: their OWN work's
// state — what came back with a note (must act), what's waiting on a manager (out
// of their hands), what's mid-draft. Priority order: cameBack > waiting >
// inProgress. Went-live is celebratory, not a to-do, so it only surfaces in the
// all-clear closer.
//
//   • greeting(hour) → "Good morning/afternoon/evening" (+ ", <name>" when known).
//   • Lead with the highest-priority non-empty state as a crafted fragment.
//   • A second fragment for the next non-empty state.
//   • All-clear (nothing came back, nothing waiting, nothing in progress):
//       any went-live → "Nice — <n> of your pieces are live.";
//       else → "Nothing on your desk right now — make something."

import { greeting, numberWord } from '@/propel/lib/composeDeskBrief';

export interface AgentBriefState {
  /** Local hour 0–23 (new Date().getHours()). */
  hour: number;
  /** The agent's first name, if known — personalizes the greeting. */
  firstName?: string | null;
  /** Drafts a manager sent back with a note — the maker must revise + resubmit. */
  cameBack: number;
  /** Drafts submitted and waiting on a manager's sign-off (out of the maker's hands). */
  waiting: number;
  /** Drafts still being worked — not yet submitted. */
  inProgress: number;
  /** The maker's own work that went live/published/sent (celebratory only). */
  live: number;
}

const capitalize = (s: string): string =>
  s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);

interface BriefFragment {
  fragment: string;
}

// Build the active states in priority order; an empty state is omitted.
const buildFragments = (s: AgentBriefState): BriefFragment[] => {
  const out: BriefFragment[] = [];
  if (s.cameBack > 0) {
    out.push({
      fragment:
        s.cameBack === 1
          ? 'one draft came back with a note'
          : `${numberWord(s.cameBack)} drafts came back with notes`,
    });
  }
  if (s.waiting > 0) {
    out.push({
      fragment:
        s.waiting === 1
          ? 'one is waiting on a manager'
          : `${numberWord(s.waiting)} are waiting on a manager`,
    });
  }
  if (s.inProgress > 0) {
    out.push({
      fragment:
        s.inProgress === 1
          ? 'one is still in progress'
          : `${numberWord(s.inProgress)} are still in progress`,
    });
  }
  return out;
};

export const composeAgentBrief = (s: AgentBriefState): string => {
  const name =
    typeof s.firstName === 'string' && s.firstName.trim() !== ''
      ? `, ${s.firstName.trim()}`
      : '';
  const g = `${greeting(s.hour)}${name}`;
  const items = buildFragments(s);

  if (items.length === 0) {
    if (s.live > 0) {
      return s.live === 1
        ? `${g}. Nice — one of your pieces is live.`
        : `${g}. Nice — ${numberWord(s.live)} of your pieces are live.`;
    }
    return `${g}. Nothing on your desk right now — make something.`;
  }

  // Lead with the top two states; a third leftover is folded into "and more".
  const lead = items.slice(0, 2);
  const clause =
    lead.length === 2
      ? `${lead[0].fragment}, and ${lead[1].fragment}`
      : lead[0].fragment;

  return `${g}. ${capitalize(clause)}.`;
};
