import { friendlyError } from './friendlyError';

// The founder must NEVER see a raw/technical error string. These cover the live
// offenders (blog-pipeline `<stage>: <reason>` strings) + the technical/human
// boundary the mapper must respect.
describe('friendlyError', () => {
  // The exact strings the founder reported seeing raw on blog cards.
  it('maps the live `critic:` offender to the per-stage message', () => {
    expect(friendlyError('critic: verdict=fail score=0<70', 'pipeline')).toBe(
      'This draft didn’t pass review — retry it.',
    );
  });

  it('maps the live `ground:` offender to the per-stage message', () => {
    expect(
      friendlyError('ground: Exceeded 4 tool rounds without final answer', 'pipeline'),
    ).toBe('Couldn’t gather enough live data for this one — retry it.');
  });

  it('maps every blog stage prefix regardless of the trailing reason', () => {
    expect(friendlyError('translate: LLM response was not parseable JSON afte…')).toBe(
      'Couldn’t translate this post — retry it.',
    );
    expect(friendlyError('write: model returned empty body')).toBe(
      'The draft didn’t come together — retry it.',
    );
    expect(friendlyError('drafting: token budget exceeded')).toBe(
      'The draft didn’t come together — retry it.',
    );
    expect(friendlyError('seo: keyword extraction failed')).toBe(
      'The SEO pass failed — retry it.',
    );
    expect(friendlyError('ideate: no angle found')).toBe(
      'Couldn’t land an angle for this one — retry it.',
    );
  });

  it('catches bare pipeline smells without a stage prefix', () => {
    const snag = 'This item hit a snag while being generated — retry it.';
    expect(friendlyError('verdict=fail', 'pipeline')).toBe(snag);
    expect(friendlyError('score=0<70', 'pipeline')).toBe(snag);
    expect(friendlyError('Exceeded 6 tool rounds', 'pipeline')).toBe(snag);
    expect(friendlyError('ungrounded figures in the draft', 'pipeline')).toBe(snag);
  });

  it('replaces generic technical strings with the context fallback', () => {
    expect(friendlyError('Unexpected token < in JSON at position 0', 'generic')).toBe(
      'Something went wrong — please try again.',
    );
    expect(
      friendlyError('TypeError: Cannot read properties of undefined', 'pipeline'),
    ).toBe('This item hit a snag while being generated — retry it.');
    expect(friendlyError('{"code":"BENCH_INVALID"}', 'draft')).toBe(
      'The draft didn’t generate — try again.',
    );
  });

  it('maps connectivity failures to the network message', () => {
    expect(friendlyError('fetch failed', 'generic')).toBe(
      'Couldn’t reach the service — check your connection and try again.',
    );
  });

  it('passes clean human sentences through unchanged', () => {
    const human =
      'Could not reach the blog pipeline (sign in as a Manager; the routes may not be deployed yet).';
    expect(friendlyError(human, 'generic')).toBe(human);
    expect(friendlyError('Publish blocked — pre-flight checks failed.', 'publish')).toBe(
      'Publish blocked — pre-flight checks failed.',
    );
  });

  it('returns the context fallback for an empty string', () => {
    expect(friendlyError('', 'pipeline')).toBe(
      'This item hit a snag while being generated — retry it.',
    );
    expect(friendlyError(null, 'translate')).toBe('Couldn’t translate this — try again.');
  });
});
