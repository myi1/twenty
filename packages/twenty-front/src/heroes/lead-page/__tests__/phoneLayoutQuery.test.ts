import { MOBILE_VIEWPORT } from 'twenty-ui/theme-constants';

import { phoneLayoutQuery, SHORT_VIEWPORT } from '../usePhoneLayout';

// A tiny CSS matcher: enough to answer "would this viewport take the phone layout?"
// without a browser. Only the two clause shapes this query actually emits.
const matches = (query: string, w: number, h: number): boolean =>
  query.split(',').some((clause) => {
    const max = /max-width:\s*(\d+)px/.exec(clause);
    if (max) return w <= Number(max[1]);
    const maxH = /max-height:\s*(\d+)px/.exec(clause);
    if (maxH) return h <= Number(maxH[1]);
    return false;
  });

const phone = (w: number, h: number) => matches(phoneLayoutQuery(), w, h);

describe('phoneLayoutQuery', () => {
  it('a phone held LANDSCAPE takes the phone layout — the bug this fixes', () => {
    expect(phone(812, 375)).toBe(true); // iPhone 13/14
    expect(phone(844, 390)).toBe(true);
    expect(phone(932, 430)).toBe(true); // 15 Pro Max, the widest of them
  });

  it('a phone held portrait still does', () => {
    expect(phone(375, 812)).toBe(true);
    expect(phone(MOBILE_VIEWPORT, 900)).toBe(true);
  });

  it('a tablet in landscape does NOT — it has room for two columns', () => {
    expect(phone(1024, 768)).toBe(false);
    expect(phone(1194, 834)).toBe(false);
  });

  it('a laptop and a large monitor do not', () => {
    expect(phone(1440, 900)).toBe(false);
    expect(phone(1800, 950)).toBe(false);
    expect(phone(2560, 1440)).toBe(false);
  });

  it('a desktop window dragged short gets it too, and should — same constraint, same answer', () => {
    expect(phone(1440, SHORT_VIEWPORT)).toBe(true);
    expect(phone(1440, SHORT_VIEWPORT + 1)).toBe(false);
  });

  it('the threshold sits clear of both neighbours it separates', () => {
    expect(SHORT_VIEWPORT).toBeGreaterThan(430); // tallest landscape phone
    expect(SHORT_VIEWPORT).toBeLessThan(768); // shortest tablet landscape
  });
});
