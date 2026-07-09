import {
  composeDeskBrief,
  greeting,
  numberWord,
  type DeskBriefState,
} from './composeDeskBrief';

// The brief is deterministic and load-bearing: it must ALWAYS read the same
// counts the sign-off seals below it show. These tests pin given-counts → the
// EXACT string, so any drift between the sentence and the queue is caught here.

const base: DeskBriefState = {
  hour: 9,
  slaLeads: 0,
  replies: 0,
  scoutCampaigns: 0,
  drafts: 0,
  stalePages: 0,
  engineRan: true,
};

describe('greeting', () => {
  it('splits the day into morning / afternoon / evening at the boundaries', () => {
    expect(greeting(5)).toBe('Good morning');
    expect(greeting(11)).toBe('Good morning');
    expect(greeting(12)).toBe('Good afternoon');
    expect(greeting(16)).toBe('Good afternoon');
    expect(greeting(17)).toBe('Good evening');
    expect(greeting(23)).toBe('Good evening');
    expect(greeting(0)).toBe('Good evening');
    expect(greeting(4)).toBe('Good evening');
  });
});

describe('numberWord', () => {
  it('renders small counts as words and falls back to digits past twelve', () => {
    expect(numberWord(0)).toBe('zero');
    expect(numberWord(1)).toBe('one');
    expect(numberWord(2)).toBe('two');
    expect(numberWord(12)).toBe('twelve');
    expect(numberWord(13)).toBe('13');
    expect(numberWord(41)).toBe('41');
  });
});

describe('composeDeskBrief — all-clear', () => {
  it('claims a clean overnight only when the engine ran', () => {
    expect(composeDeskBrief({ ...base, hour: 9, engineRan: true })).toBe(
      'Good morning. You’re all caught up — the desk ran clean overnight.',
    );
  });

  it('stays honest when nothing is available (engine silent)', () => {
    expect(composeDeskBrief({ ...base, hour: 20, engineRan: false })).toBe(
      'Good evening. Nothing needs you right now.',
    );
  });
});

describe('composeDeskBrief — single item', () => {
  it('an SLA lead leads, engine-ran closer follows', () => {
    expect(composeDeskBrief({ ...base, hour: 14, slaLeads: 1 })).toBe(
      'Good afternoon. One lead’s clock is running. Everything else ran clean overnight.',
    );
  });

  it('one draft, engine silent → no closer', () => {
    expect(
      composeDeskBrief({ ...base, hour: 6, drafts: 1, engineRan: false }),
    ).toBe('Good morning. One draft is ready to review.');
  });

  it('pluralizes with number-words', () => {
    expect(composeDeskBrief({ ...base, hour: 9, stalePages: 3 })).toBe(
      'Good morning. Three live pages have drifted out of date. Everything else ran clean overnight.',
    );
  });
});

describe('composeDeskBrief — two lead items', () => {
  it('joins the top two fragments and appends the clean-overnight closer', () => {
    expect(
      composeDeskBrief({ ...base, hour: 8, scoutCampaigns: 3, drafts: 2 }),
    ).toBe(
      'Good morning. The Scout drafted three campaigns for your sign-off, and two drafts are ready to review. Everything else ran clean overnight.',
    );
  });
});

describe('composeDeskBrief — leftovers are named, not dropped', () => {
  it('names the single leftover category in the closer', () => {
    expect(
      composeDeskBrief({
        ...base,
        hour: 23,
        slaLeads: 2,
        replies: 1,
        scoutCampaigns: 1,
      }),
    ).toBe(
      'Good evening. Two leads’ clocks are running, and one reply is waiting in the window. The Scout’s campaigns can wait.',
    );
  });

  it('names two leftover categories with an "and"', () => {
    expect(
      composeDeskBrief({
        ...base,
        hour: 10,
        slaLeads: 1,
        replies: 1,
        scoutCampaigns: 1,
        drafts: 1,
      }),
    ).toBe(
      'Good morning. One lead’s clock is running, and one reply is waiting in the window. The Scout’s campaigns and drafts can wait.',
    );
  });

  it('respects the full priority order (SLA > replies > scout > drafts > stale)', () => {
    expect(
      composeDeskBrief({
        hour: 13,
        slaLeads: 1,
        replies: 2,
        scoutCampaigns: 1,
        drafts: 1,
        stalePages: 4,
        engineRan: true,
      }),
    ).toBe(
      'Good afternoon. One lead’s clock is running, and two replies are waiting in the window. The Scout’s campaigns, drafts, and stale pages can wait.',
    );
  });
});
