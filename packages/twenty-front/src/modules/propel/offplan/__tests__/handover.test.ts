import { isoToQuarterLabel, quarterCutoffIso } from '../handover';

describe('isoToQuarterLabel', () => {
  it('maps a handover date to "Q<n> <year>"', () => {
    expect(isoToQuarterLabel('2027-10-02T00:00:00.000Z')).toBe('Q4 2027');
    expect(isoToQuarterLabel('2027-01-15')).toBe('Q1 2027');
    expect(isoToQuarterLabel('2028-06-30')).toBe('Q2 2028');
  });
  it('returns undefined for empty / invalid input', () => {
    expect(isoToQuarterLabel(undefined)).toBeUndefined();
    expect(isoToQuarterLabel('not-a-date')).toBeUndefined();
  });
});

describe('quarterCutoffIso', () => {
  it('returns the ISO start of the quarter AFTER the selected one (exclusive upper bound)', () => {
    // "before Q4 2027" → everything handing over strictly before 2027-10-01
    expect(quarterCutoffIso(4, 2027)).toBe('2027-10-01');
    expect(quarterCutoffIso(1, 2027)).toBe('2027-01-01');
  });
});
