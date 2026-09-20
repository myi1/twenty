import { closeReasonsFor } from '../closeReasons';

const PERSON = [
  { value: 'WRONG_NUMBER', label: 'Wrong number / number does not exist' },
  { value: 'NOT_QUALIFIED', label: 'Not a real buyer — does not qualify' },
];
const LANE = [
  { value: 'BOUGHT_ELSEWHERE', label: 'Booked with another agent / agency' },
  { value: 'WRONG_NUMBER', label: 'Wrong number / number does not exist' },
];

describe('which reasons the close dialog offers', () => {
  it('a lead with NO deal still gets reasons — the regression this fixes', () => {
    // Prod, 20 Sep 2026: this returned [] and the picker vanished for every junk lead,
    // so a wrong number could only ever be closed with a note Meta never sees.
    expect(closeReasonsFor(undefined, PERSON).map((r) => r.value)).toEqual(['WRONG_NUMBER', 'NOT_QUALIFIED']);
    expect(closeReasonsFor(null, PERSON)).toHaveLength(2);
  });

  it("a deal's own lane vocabulary wins when there is one", () => {
    expect(closeReasonsFor({ lostReasons: LANE }, PERSON).map((r) => r.value)).toEqual(['BOUGHT_ELSEWHERE', 'WRONG_NUMBER']);
  });

  it('an empty lane list falls through rather than showing nothing', () => {
    expect(closeReasonsFor({ lostReasons: [] }, PERSON)).toHaveLength(2);
  });

  it('no list anywhere still means free text, never a wrong answer', () => {
    expect(closeReasonsFor(undefined, undefined)).toEqual([]);
    expect(closeReasonsFor({ lostReasons: [] }, [])).toEqual([]);
  });
});
