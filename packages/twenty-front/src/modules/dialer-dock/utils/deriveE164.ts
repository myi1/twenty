/**
 * Build a dialable E.164 number from Twenty's SPLIT phone storage.
 *
 * The engine keeps a phone in two fields — `primaryPhoneCallingCode` ('+971')
 * and `primaryPhoneNumber` (the national part) — and the national part is not
 * clean. It arrives from imports, from agents typing, and from lead webhooks, so
 * it can carry spaces, dashes and brackets, and it can carry the national trunk
 * zero ('0503469348').
 *
 * The Call action on a contact used to concatenate the two with nothing in
 * between, which is two bugs wearing one line of code:
 *
 *   1. "+971" + "50 346 9348" = "+97150 346 9348" — fails the E.164 check, so
 *      the agent is told the number "needs to be in international format" while
 *      looking at a number that plainly is one. No call is placed. (Task 25.)
 *
 *   2. "+971" + "0503469348" = "+9710503469348" — thirteen digits, which PASSES
 *      a naive E.164 check. This one does not fail loudly. It dials a stranger,
 *      which is the failure this whole dial path is built to avoid.
 *
 * Every other Propel surface already derives phones this way (the CRM app's
 * `src/shared/phone-e164.ts`, which feeds My Desk and the Lead Page). This is
 * that same rule brought to the one path that skipped it.
 *
 * Returns null — never a guess — when the parts cannot make a plausible number.
 */
export const deriveE164 = (
  callingCode: string | null | undefined,
  national: string | null | undefined,
): string | null => {
  if (!callingCode || !national) {
    return null;
  }

  const code = callingCode.replace(/[^0-9]/g, '');
  // Strip formatting, then the national trunk prefix: 0503469348 -> 503469348.
  const subscriber = national.replace(/[^0-9]/g, '').replace(/^0+/, '');

  if (code === '' || subscriber === '') {
    return null;
  }

  const digits = `${code}${subscriber}`;

  // E.164 caps at 15 digits. The lower bound keeps short codes and junk imports
  // out of a real outbound call to a real person.
  if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  return `+${digits}`;
};
