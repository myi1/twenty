import { __testing, nearestStop, nextStop, stopHeight } from '../useSheetHeight';

const AVAILABLE = 744; // 812 phone minus a 68px action bar
const PEEK = 52;

describe('stopHeight', () => {
  it('peek is the handle only — the conversation is still the page', () => {
    expect(stopHeight('peek', AVAILABLE, PEEK)).toBe(PEEK);
  });

  it('half leaves the last messages visible while typing', () => {
    const h = stopHeight('half', AVAILABLE, PEEK);
    expect(h).toBeLessThan(AVAILABLE / 2 + 40);
    expect(AVAILABLE - h).toBeGreaterThan(300);
  });

  it('full never covers the action bar', () => {
    expect(stopHeight('full', AVAILABLE, PEEK)).toBeLessThan(AVAILABLE);
  });

  it('a tiny window (landscape phone) still yields the handle, never a negative height', () => {
    expect(stopHeight('full', 20, PEEK)).toBeGreaterThanOrEqual(0);
    expect(stopHeight('peek', 0, PEEK)).toBe(PEEK);
  });
});

describe('nearestStop', () => {
  it('a released drag settles on the nearest stop, not where the finger stopped', () => {
    expect(nearestStop(stopHeight('half', AVAILABLE, PEEK) + 8, AVAILABLE, PEEK)).toBe('half');
    expect(nearestStop(PEEK + 4, AVAILABLE, PEEK)).toBe('peek');
    expect(nearestStop(stopHeight('full', AVAILABLE, PEEK) - 10, AVAILABLE, PEEK)).toBe('full');
  });

  it('a drag pulled past full still settles on full', () => {
    expect(nearestStop(9999, AVAILABLE, PEEK)).toBe('full');
  });
});

describe('nextStop', () => {
  it('tapping cycles and wraps — a gesture is never the only way', () => {
    expect(nextStop('peek')).toBe('half');
    expect(nextStop('half')).toBe('full');
    expect(nextStop('full')).toBe('peek');
  });
});

describe('commitFocusedField', () => {
  it('blurs the field being typed into, because the sheet can unmount it without a blur', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    __testing.commitFocusedField();
    expect(document.activeElement).not.toBe(input);
    input.remove();
  });

  it('does nothing when nothing is focused', () => {
    expect(() => __testing.commitFocusedField()).not.toThrow();
  });
});
