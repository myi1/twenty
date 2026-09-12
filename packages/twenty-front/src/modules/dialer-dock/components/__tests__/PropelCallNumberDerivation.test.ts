import { readFileSync } from 'fs';
import { join } from 'path';

// deriveE164.test.ts proves the RULE. This proves the Call action USES it.
//
// Why a source-level guard rather than a rendered test: PropelCallOnQueryParamEffect
// returns null until Person object-metadata has loaded (deliberately — see the
// 2026-08-06 sign-in lockout it was fixed for), so under jest, where the metadata
// store is empty, the effect never reaches the number at all. The existing
// rendered tests in this folder confirm exactly that inertness; they cannot reach
// the derivation, and mocking Apollo, the metadata store and useFindOneRecord
// well enough to get there would be testing the mocks.
//
// So this asserts the one thing that actually regressed: the number handed to the
// dialer must be DERIVED from Twenty's split phone storage, never built by
// gluing the calling code onto the stored national part. That glue is what
// produced "+97150 346 9348" (refused, agent blamed) and "+9710503469348" from a
// stored "0503469348" — a valid E.164 number belonging to someone else.

const source = readFileSync(
  join(__dirname, '..', 'PropelCallOnQueryParamEffect.tsx'),
  'utf8',
);

// Comments explain the bug at length and legitimately quote the old shape.
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('the Call action derives the number it dials', () => {
  it('calls deriveE164', () => {
    expect(code).toMatch(/deriveE164\(/);
  });

  it('never template-concatenates the calling code onto the stored number', () => {
    // The exact shape of the bug: `${callingCode}${...primaryPhoneNumber}`.
    expect(code).not.toMatch(
      /\$\{[^}]*[Cc]allingCode[^}]*\}\s*\$\{[^}]*[Pp]rimaryPhoneNumber/,
    );
  });

  it('reads the raw stored number exactly once', () => {
    // Counts READS off the record (`record.phones?.primaryPhoneNumber`), not the
    // type declaration. Exactly one: the `stored` value, which feeds deriveE164
    // and the failure message. A second read is a second path to the number, and
    // the second path is the one that skipped the derivation last time.
    const rawReads = code.match(/record\.phones\?\.primaryPhoneNumber/g) ?? [];
    expect(rawReads).toHaveLength(1);
  });
});
