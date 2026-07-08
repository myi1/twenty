import {
  PROPEL_LP_SOURCE,
  debounce,
  originOf,
  parseChildMessage,
  postRender,
  type RenderDraft,
} from './landingPreviewBridge';

const ORIGIN = 'http://localhost:3000';

describe('originOf', () => {
  it('derives the origin from a full url', () => {
    expect(originOf('http://localhost:3000/lp/preview')).toBe('http://localhost:3000');
    expect(originOf('https://remaxhub.ae')).toBe('https://remaxhub.ae');
  });
  it('returns "" for empty / null / undefined / malformed', () => {
    expect(originOf('')).toBe('');
    expect(originOf(null)).toBe('');
    expect(originOf(undefined)).toBe('');
    expect(originOf('not a url')).toBe('');
  });
});

describe('parseChildMessage — origin + source policy', () => {
  it('ignores a message whose source is not propel-lp', () => {
    expect(parseChildMessage({ origin: ORIGIN, data: { type: 'ready' } }, ORIGIN)).toBeNull();
    expect(
      parseChildMessage({ origin: ORIGIN, data: { source: 'other', type: 'ready' } }, ORIGIN),
    ).toBeNull();
  });

  it('ignores a message from a foreign origin even with the right source', () => {
    expect(
      parseChildMessage(
        { origin: 'https://evil.example', data: { source: PROPEL_LP_SOURCE, type: 'ready' } },
        ORIGIN,
      ),
    ).toBeNull();
  });

  it('trusts nothing when the expected origin is unknown ("")', () => {
    expect(
      parseChildMessage({ origin: ORIGIN, data: { source: PROPEL_LP_SOURCE, type: 'ready' } }, ''),
    ).toBeNull();
  });

  it('parses a valid ready message', () => {
    expect(
      parseChildMessage({ origin: ORIGIN, data: { source: PROPEL_LP_SOURCE, type: 'ready' } }, ORIGIN),
    ).toEqual({ source: PROPEL_LP_SOURCE, type: 'ready' });
  });

  it('parses a valid sectionClick and carries the index', () => {
    expect(
      parseChildMessage(
        { origin: ORIGIN, data: { source: PROPEL_LP_SOURCE, type: 'sectionClick', index: 3 } },
        ORIGIN,
      ),
    ).toEqual({ source: PROPEL_LP_SOURCE, type: 'sectionClick', index: 3 });
  });

  it('rejects a sectionClick with a non-numeric index', () => {
    expect(
      parseChildMessage(
        { origin: ORIGIN, data: { source: PROPEL_LP_SOURCE, type: 'sectionClick', index: 'x' } },
        ORIGIN,
      ),
    ).toBeNull();
  });

  it('parses a valid height message', () => {
    expect(
      parseChildMessage(
        { origin: ORIGIN, data: { source: PROPEL_LP_SOURCE, type: 'height', px: 1200 } },
        ORIGIN,
      ),
    ).toEqual({ source: PROPEL_LP_SOURCE, type: 'height', px: 1200 });
  });

  it('rejects an unknown message type', () => {
    expect(
      parseChildMessage(
        { origin: ORIGIN, data: { source: PROPEL_LP_SOURCE, type: 'explode' } },
        ORIGIN,
      ),
    ).toBeNull();
  });

  it('never throws on hostile / junk payloads', () => {
    const junk: unknown[] = [null, undefined, 42, 'str', [], { source: PROPEL_LP_SOURCE }, { type: 'ready' }];
    for (const data of junk) {
      expect(() => parseChildMessage({ origin: ORIGIN, data }, ORIGIN)).not.toThrow();
      expect(parseChildMessage({ origin: ORIGIN, data }, ORIGIN)).toBeNull();
    }
  });
});

describe('postRender', () => {
  const draft: RenderDraft = {
    theme: 'RIVIERA',
    sections: [{ type: 'hero', props: { headline: 'Hi' } }],
    selectedIndex: 0,
  };

  it('posts a well-formed render message to the target origin', () => {
    const postMessage = jest.fn();
    postRender({ postMessage }, ORIGIN, draft);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      {
        source: PROPEL_LP_SOURCE,
        type: 'render',
        theme: 'RIVIERA',
        sections: draft.sections,
        selectedIndex: 0,
      },
      ORIGIN,
    );
  });

  it('no-ops on a null/undefined target', () => {
    expect(() => postRender(null, ORIGIN, draft)).not.toThrow();
    expect(() => postRender(undefined, ORIGIN, draft)).not.toThrow();
  });

  it('never posts to an unknown ("") origin', () => {
    const postMessage = jest.fn();
    postRender({ postMessage }, '', draft);
    expect(postMessage).not.toHaveBeenCalled();
  });
});

describe('debounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('fires once, ms after the LAST call, with the last args', () => {
    const fn = jest.fn();
    const d = debounce(fn, 300);
    d(1);
    d(2);
    d(3);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it('cancel() drops a pending fire', () => {
    const fn = jest.fn();
    const d = debounce(fn, 300);
    d();
    d.cancel();
    jest.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
