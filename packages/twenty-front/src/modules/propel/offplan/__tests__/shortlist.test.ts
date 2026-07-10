import { toggleShortlist } from '../shortlist';

describe('toggleShortlist', () => {
  it('adds when absent, removes when present, preserving order', () => {
    expect(toggleShortlist([], 7)).toEqual([7]);
    expect(toggleShortlist([7, 9], 9)).toEqual([7]);
    expect(toggleShortlist([7], 9)).toEqual([7, 9]);
  });
});
