import { hasExpired, sessionHasLapsed } from './sessionLapsed';

jest.mock('~/utils/cookie-storage', () => ({
  cookieStorage: { getItem: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { cookieStorage } = require('~/utils/cookie-storage');

const NOW = Date.parse('2026-09-20T15:53:00.000Z');

describe('hasExpired', () => {
  it('is true only once the expiry has passed', () => {
    expect(hasExpired('2026-09-20T15:52:59.000Z', NOW)).toBe(true);
    expect(hasExpired('2026-09-20T15:53:00.000Z', NOW)).toBe(true);
    expect(hasExpired('2026-09-20T15:53:01.000Z', NOW)).toBe(false);
  });

  // Every one of these must stay quiet. A wrong "you are signed out" sends an
  // agent to re-authenticate over a dropped connection — the mirror of the bug.
  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['not a date', 'whenever'],
  ])('says nothing when the expiry is %s', (_label, value) => {
    expect(hasExpired(value as string | null | undefined, NOW)).toBe(false);
  });
});

describe('sessionHasLapsed', () => {
  const setCookie = (value: string | undefined) =>
    (cookieStorage.getItem as jest.Mock).mockReturnValue(value);

  it('proves a lapse from the cookie the app actually writes', () => {
    setCookie(
      JSON.stringify({
        accessOrWorkspaceAgnosticToken: { token: 'x', expiresAt: '2026-09-20T15:30:00.000Z' },
        refreshToken: { token: 'y', expiresAt: '2026-10-20T15:30:00.000Z' },
      }),
    );
    expect(sessionHasLapsed(NOW)).toBe(true);
  });

  it('stays quiet while the session is still good', () => {
    setCookie(
      JSON.stringify({
        accessOrWorkspaceAgnosticToken: { token: 'x', expiresAt: '2026-09-20T16:30:00.000Z' },
      }),
    );
    expect(sessionHasLapsed(NOW)).toBe(false);
  });

  it.each([
    ['there is no cookie', undefined],
    ['the cookie is empty', ''],
    ['the cookie is not JSON', 'not-json'],
    ['the shape is unfamiliar', '{"somethingElse":true}'],
  ])('stays quiet when %s', (_label, value) => {
    setCookie(value as string | undefined);
    expect(sessionHasLapsed(NOW)).toBe(false);
  });

  it('does not throw when reading the cookie throws', () => {
    (cookieStorage.getItem as jest.Mock).mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => sessionHasLapsed(NOW)).not.toThrow();
    expect(sessionHasLapsed(NOW)).toBe(false);
  });
});
