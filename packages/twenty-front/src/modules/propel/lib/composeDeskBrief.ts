// The deterministic desk brief for the Marketing home ("The Night Desk").
//
// A PURE function: given the SAME counts the sign-off queue's seals render,
// it composes one plain-English sentence — no LLM, no enum, no network. Because
// the sentence reads the identical counts the seals below it show, the brief and
// the queue can never disagree. Unit-tested (given counts → exact string).
//
// Rules (mirrors the spec §"The deterministic brief"):
//   • greeting(hour) → "Good morning/afternoon/evening".
//   • Lead with the 1–2 highest-priority NON-EMPTY items as crafted fragments,
//     priority order: SLA lead > replies-in-window > scout campaigns > drafts >
//     stale pages. Number-word + pluralized.
//   • Closer: any leftover categories (beyond the 2 named) are named ("… can
//     wait."); else if the overnight engine ran → "Everything else ran clean
//     overnight."; else nothing.
//   • All-clear: engine ran → "You're all caught up — the desk ran clean
//     overnight."; engine silent → "Nothing needs you right now."

export interface DeskBriefState {
  /** Local hour 0–23 (new Date().getHours()). */
  hour: number;
  /** Unassigned website leads with a running SLA clock (red seal). */
  slaLeads: number;
  /** Campaign replies inside the reply window (amber seal). */
  replies: number;
  /** Whole campaigns the Scout proposed, awaiting sign-off (brass seal). */
  scoutCampaigns: number;
  /** Landing-page drafts ready to review (brass seal). */
  drafts: number;
  /** Live pages the Refresher flagged as drifted (grey seal). */
  stalePages: number;
  /**
   * Whether the overnight engine produced anything we can see (any of the
   * Scout / Refresher / Style sources resolved). Gates the "ran clean
   * overnight" claim so we never assert it blind.
   */
  engineRan: boolean;
}

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

// Small counts read as words; anything past twelve falls back to the digits.
export const numberWord = (n: number): string =>
  n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);

const capitalize = (s: string): string =>
  s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);

export const greeting = (hour: number): string => {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
};

interface BriefItem {
  fragment: string; // the crafted lead clause (lowercase, mid-sentence)
  leftover: string; // the short noun when this item is named in the closer
}

// Build the active items in priority order. An empty category is simply omitted
// — so a source that was unavailable (its count passed as 0) is never mentioned.
const buildItems = (s: DeskBriefState): BriefItem[] => {
  const items: BriefItem[] = [];
  if (s.slaLeads > 0) {
    items.push({
      fragment:
        s.slaLeads === 1
          ? 'one lead’s clock is running'
          : `${numberWord(s.slaLeads)} leads’ clocks are running`,
      leftover: 'a lead waiting on an agent',
    });
  }
  if (s.replies > 0) {
    items.push({
      fragment:
        s.replies === 1
          ? 'one reply is waiting in the window'
          : `${numberWord(s.replies)} replies are waiting in the window`,
      leftover: 'replies',
    });
  }
  if (s.scoutCampaigns > 0) {
    items.push({
      fragment:
        s.scoutCampaigns === 1
          ? 'the Scout drafted one campaign for your sign-off'
          : `the Scout drafted ${numberWord(
              s.scoutCampaigns,
            )} campaigns for your sign-off`,
      leftover: 'the Scout’s campaigns',
    });
  }
  if (s.drafts > 0) {
    items.push({
      fragment:
        s.drafts === 1
          ? 'one draft is ready to review'
          : `${numberWord(s.drafts)} drafts are ready to review`,
      leftover: 'drafts',
    });
  }
  if (s.stalePages > 0) {
    items.push({
      fragment:
        s.stalePages === 1
          ? 'one live page has drifted out of date'
          : `${numberWord(s.stalePages)} live pages have drifted out of date`,
      leftover: 'stale pages',
    });
  }
  return items;
};

const joinLeftovers = (labels: string[]): string => {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
};

export const composeDeskBrief = (s: DeskBriefState): string => {
  const g = greeting(s.hour);
  const items = buildItems(s);

  if (items.length === 0) {
    return s.engineRan
      ? `${g}. You’re all caught up — the desk ran clean overnight.`
      : `${g}. Nothing needs you right now.`;
  }

  const lead = items.slice(0, 2);
  const leftovers = items.slice(2);

  const leadClause =
    lead.length === 2
      ? `${lead[0].fragment}, and ${lead[1].fragment}`
      : lead[0].fragment;

  const head = `${g}. ${capitalize(leadClause)}.`;

  let closer = '';
  if (leftovers.length > 0) {
    closer = `${capitalize(
      joinLeftovers(leftovers.map((i) => i.leftover)),
    )} can wait.`;
  } else if (s.engineRan) {
    closer = 'Everything else ran clean overnight.';
  }

  return closer === '' ? head : `${head} ${closer}`;
};
