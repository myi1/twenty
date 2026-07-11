import { formatAed, formatAedExact } from '../formatMoney';

describe('formatAed', () => {
  it('rounds to K under a million', () => {
    expect(formatAed(640058)).toBe('AED 640K');
    expect(formatAed(528686)).toBe('AED 529K');
    expect(formatAed(498000)).toBe('AED 498K');
  });
  it('rounds to one-decimal M at/over a million, trimming .0', () => {
    expect(formatAed(1899825)).toBe('AED 1.9M');
    expect(formatAed(12400000)).toBe('AED 12.4M');
    expect(formatAed(2000000)).toBe('AED 2M');
  });
  it('promotes just-under-a-million to M so it never shows "1000K"', () => {
    expect(formatAed(999600)).toBe('AED 1M');
  });
  it('applies approx and from prefixes', () => {
    expect(formatAed(640058, { approx: true })).toBe('~AED 640K');
    expect(formatAed(640058, { from: true })).toBe('from AED 640K');
  });
  it('returns null for null / undefined / NaN', () => {
    expect(formatAed(null)).toBeNull();
    expect(formatAed(undefined)).toBeNull();
    expect(formatAed(NaN)).toBeNull();
  });
});

describe('formatAedExact', () => {
  it('comma-groups full precision', () => {
    expect(formatAedExact(640058)).toBe('AED 640,058');
    expect(formatAedExact(1899825)).toBe('AED 1,899,825');
  });
  it('returns null for null', () => {
    expect(formatAedExact(null)).toBeNull();
  });
});
