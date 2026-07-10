import {
  freshness,
  attributionLabel,
  toggleSelection,
  formatPerfValue,
} from './deskLogic';

describe('freshness', () => {
  const now = Date.parse('2026-07-10T12:00:00Z');
  it('flags a null timestamp as never / stale', () => {
    expect(freshness(null, 7, now)).toEqual({ label: 'never updated', stale: true });
  });
  it('reads a recent timestamp as fresh', () => {
    const at = new Date(now - 2 * 86_400_000).toISOString(); // 2 days ago
    expect(freshness(at, 7, now)).toEqual({ label: 'updated 2d ago', stale: false });
  });
  it('flags past the threshold as stale', () => {
    const at = new Date(now - 10 * 86_400_000).toISOString(); // 10 days ago
    expect(freshness(at, 7, now)).toEqual({ label: 'updated 10d ago', stale: true });
  });
  it('reads today as updated today', () => {
    expect(freshness(new Date(now).toISOString(), 7, now)).toEqual({
      label: 'updated today',
      stale: false,
    });
  });
});

describe('attributionLabel', () => {
  it('shows an honest empty when nothing attributed', () => {
    expect(attributionLabel({ leads: 0, deals: 0, revenue: 0 })).toBe('no leads yet');
    expect(attributionLabel({ leads: null, deals: null, revenue: null })).toBe('no leads yet');
  });
  it('shows leads only', () => {
    expect(attributionLabel({ leads: 12, deals: 0, revenue: 0 })).toBe('12 leads');
  });
  it('shows leads · deals · revenue', () => {
    expect(attributionLabel({ leads: 12, deals: 3, revenue: 450000, currency: 'AED' })).toBe(
      '12 leads · 3 deals · AED 450,000',
    );
  });
});

describe('toggleSelection', () => {
  it('adds an unselected id', () => {
    expect([...toggleSelection(new Set(['a']), 'b')]).toEqual(['a', 'b']);
  });
  it('removes a selected id (immutably)', () => {
    const src = new Set(['a', 'b']);
    const out = toggleSelection(src, 'a');
    expect([...out]).toEqual(['b']);
    expect([...src]).toEqual(['a', 'b']); // original untouched
  });
});

describe('formatPerfValue', () => {
  it('formats counts, percents and currency', () => {
    expect(formatPerfValue(1234, 'count')).toBe('1,234');
    expect(formatPerfValue(42, 'pct')).toBe('42%');
    expect(formatPerfValue(450000, 'currency')).toBe('AED 450,000');
    expect(formatPerfValue(null, 'count')).toBe('—');
  });
});
