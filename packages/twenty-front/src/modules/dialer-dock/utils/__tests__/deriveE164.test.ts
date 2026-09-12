import { deriveE164 } from '@/dialer-dock/utils/deriveE164';

// Twenty stores a phone SPLIT in two: `primaryPhoneCallingCode` ('+971') and
// `primaryPhoneNumber` (the national part). The Call action on a contact used to
// glue those together with nothing in between and hand the result straight to
// the dialer, which is two separate bugs:
//
//   1. A stored number with display formatting — "50 695 1057" — became
//      "+97150 695 1057", failed the E.164 check, and the agent was told the
//      number "needs to be in international format" while looking at a number
//      that plainly was. No call was placed. (Task 25.)
//
//   2. Worse and quieter: a national number stored with its trunk zero,
//      "0503469348", became "+9710503469348" — thirteen digits, which PASSES a
//      naive E.164 check. That does not fail. It dials a stranger.
//
// Every other surface in the CRM already derives this properly; this is that
// same rule, brought to the one path that skipped it.

describe('deriveE164', () => {
  it('joins the calling code and national number', () => {
    expect(deriveE164('+971', '503469348')).toBe('+971503469348');
  });

  it('strips display formatting rather than refusing the call', () => {
    // The reported case: the agent sees a valid number and is told it is not one.
    expect(deriveE164('+971', '50 346 9348')).toBe('+971503469348');
    expect(deriveE164('+971', '50-346-9348')).toBe('+971503469348');
    expect(deriveE164('+971', '(050) 346 9348')).toBe('+971503469348');
  });

  it('drops the trunk zero instead of dialling a stranger', () => {
    // The dangerous one. Gluing gives +9710503469348, which is a well-formed
    // E.164 number belonging to somebody else.
    expect(deriveE164('+971', '0503469348')).toBe('+971503469348');
    expect(deriveE164('+44', '07903046740')).toBe('+447903046740');
  });

  it('returns null when there is nothing to dial', () => {
    expect(deriveE164(null, '503469348')).toBeNull();
    expect(deriveE164('+971', null)).toBeNull();
    expect(deriveE164('+971', '')).toBeNull();
    expect(deriveE164('', '503469348')).toBeNull();
  });

  it('returns null rather than dialling something implausible', () => {
    // E.164 caps at 15 digits; the lower bound keeps short codes and junk
    // imports out of a real outbound call.
    expect(deriveE164('+971', '123')).toBeNull();
    expect(deriveE164('+971', '1234567890123456')).toBeNull();
  });

  it('never invents digits that were not stored', () => {
    const derived = deriveE164('+971', '50 346 9348');
    expect(derived).not.toBeNull();
    expect((derived as string).replace(/\D/g, '')).toBe('971503469348');
  });
});
