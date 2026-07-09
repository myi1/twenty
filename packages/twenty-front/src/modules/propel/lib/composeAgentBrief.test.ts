import { composeAgentBrief, type AgentBriefState } from './composeAgentBrief';

// The agent brief is deterministic and load-bearing: it must ALWAYS read the same
// counts the "My work" pipeline rows show. These tests pin given-counts → the EXACT
// string, so any drift between the sentence and the pipeline is caught here.

const base: AgentBriefState = {
  hour: 9,
  firstName: null,
  cameBack: 0,
  waiting: 0,
  inProgress: 0,
  live: 0,
};

describe('composeAgentBrief — all-clear', () => {
  it('invites the maker to make something when the desk is empty', () => {
    expect(composeAgentBrief({ ...base, hour: 9 })).toBe(
      'Good morning. Nothing on your desk right now — make something.',
    );
  });

  it('celebrates live work when nothing needs action', () => {
    expect(composeAgentBrief({ ...base, hour: 14, live: 3 })).toBe(
      'Good afternoon. Nice — three of your pieces are live.',
    );
  });

  it('singularizes a single live piece', () => {
    expect(composeAgentBrief({ ...base, hour: 20, live: 1 })).toBe(
      'Good evening. Nice — one of your pieces is live.',
    );
  });
});

describe('composeAgentBrief — personalization', () => {
  it('folds a known first name into the greeting', () => {
    expect(
      composeAgentBrief({ ...base, hour: 9, firstName: 'Layla', cameBack: 1 }),
    ).toBe('Good morning, Layla. One draft came back with a note.');
  });

  it('ignores a blank name', () => {
    expect(
      composeAgentBrief({ ...base, hour: 9, firstName: '   ', cameBack: 1 }),
    ).toBe('Good morning. One draft came back with a note.');
  });
});

describe('composeAgentBrief — single state', () => {
  it('leads with came-back (highest priority)', () => {
    expect(composeAgentBrief({ ...base, hour: 9, cameBack: 2 })).toBe(
      'Good morning. Two drafts came back with notes.',
    );
  });

  it('renders waiting alone', () => {
    expect(composeAgentBrief({ ...base, hour: 9, waiting: 1 })).toBe(
      'Good morning. One is waiting on a manager.',
    );
  });

  it('renders in-progress alone', () => {
    expect(composeAgentBrief({ ...base, hour: 9, inProgress: 4 })).toBe(
      'Good morning. Four are still in progress.',
    );
  });
});

describe('composeAgentBrief — two states', () => {
  it('the spec sentence: one back with a note, two waiting', () => {
    expect(
      composeAgentBrief({
        ...base,
        hour: 9,
        firstName: 'Layla',
        cameBack: 1,
        waiting: 2,
      }),
    ).toBe(
      'Good morning, Layla. One draft came back with a note, and two are waiting on a manager.',
    );
  });

  it('respects the priority order (cameBack > waiting > inProgress) and caps at two', () => {
    expect(
      composeAgentBrief({
        ...base,
        hour: 13,
        cameBack: 1,
        waiting: 1,
        inProgress: 5,
        live: 2,
      }),
    ).toBe(
      'Good afternoon. One draft came back with a note, and one is waiting on a manager.',
    );
  });

  it('pairs waiting + in-progress when nothing came back', () => {
    expect(
      composeAgentBrief({ ...base, hour: 8, waiting: 2, inProgress: 1 }),
    ).toBe(
      'Good morning. Two are waiting on a manager, and one is still in progress.',
    );
  });
});
