import { act, render } from '@testing-library/react';
import {
  MemoryRouter,
  useLocation,
  useNavigate,
  type NavigateFunction,
} from 'react-router-dom';

import { PropelCallOnQueryParamEffect } from '@/dialer-dock/components/PropelCallOnQueryParamEffect';
import { startPropelCall } from '@/dialer-dock/utils/startPropelCall';

// Task 41. The Call action navigates the page to `?call=1`; this effect dials and
// then drops the flag. The flag MUST NOT survive the visit — the address bar is
// reachable again later (reload, bookmark, Back), and on a contact that HAS a
// number a surviving flag places a real phone call nobody pressed Call for.
//
// The 2026-09-12 staging check found a second Call click on the same contact left
// `?call=1` in the URL: the repeat-dial guard returned before the strip, so the
// visit ended armed. These tests pin BOTH halves — one dial per contact, and a
// clean URL every time — because a fix for either one alone re-creates the other.
//
// The sibling file deliberately drives the REAL metadata hook (the 2026-08-06
// sign-in lockout). These tests need the opposite: a workspace where Person IS
// readable, so the dialling half actually runs. Hence a separate file with its
// own mocks rather than mocking that hook out from under the lockout cover.

const enqueueErrorSnackBarMock = jest.fn();
const useFindOneRecordMock = jest.fn();

jest.mock('@/dialer-dock/utils/startPropelCall', () => ({
  startPropelCall: jest.fn(() => true),
}));

jest.mock('@/object-metadata/hooks/useReadableObjectMetadataItems', () => ({
  useReadableObjectMetadataItems: () => ({
    readableObjectMetadataItems: [{ nameSingular: 'person' }],
  }),
}));

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: (...args: unknown[]) => useFindOneRecordMock(...args),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: enqueueErrorSnackBarMock }),
}));

const startPropelCallMock = jest.mocked(startPropelCall);

const PERSON_ID = '11111111-2222-4333-8444-555555555555';
const PERSON_PATH = `/object/person/${PERSON_ID}`;
const CALL_URL = `${PERSON_PATH}?call=1`;

// A contact with NO number on file. Every case below uses one: a fixture that
// carries a number is one bug away from being a real call.
const PHONE_LESS_PERSON = {
  __typename: 'Person',
  id: PERSON_ID,
  name: { firstName: 'Phoneless', lastName: 'Fixture' },
  phones: { primaryPhoneNumber: '', primaryPhoneCallingCode: '' },
};

let latestSearch: string | null = null;
let navigateFromTest: NavigateFunction | null = null;

const RouterProbe = () => {
  latestSearch = useLocation().search;
  navigateFromTest = useNavigate();
  return null;
};

const renderEffectAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <PropelCallOnQueryParamEffect />
      <RouterProbe />
    </MemoryRouter>,
  );

// Re-arriving at `?call=1` while the SAME tree stays mounted is what a second
// Call click does: the SDK panel navigates the page again, and the ref that
// remembers "already dialled this contact" lives above the remount, so it
// survives. Rendering a fresh tree instead would reset that ref and quietly test
// nothing.
const clickCallAgain = () =>
  act(() => {
    navigateFromTest?.(CALL_URL);
  });

beforeEach(() => {
  jest.clearAllMocks();
  latestSearch = null;
  navigateFromTest = null;
  startPropelCallMock.mockReturnValue(true);
  useFindOneRecordMock.mockReturnValue({
    record: PHONE_LESS_PERSON,
    loading: false,
  });
});

describe('PropelCallOnQueryParamEffect — the ?call=1 flag never survives the visit', () => {
  it('dials once and clears the flag on the first Call click', () => {
    renderEffectAt(CALL_URL);

    expect(startPropelCallMock).toHaveBeenCalledTimes(1);
    expect(latestSearch).toBe('');
  });

  it('clears the flag on a SECOND Call click for the same contact, and does not dial again', () => {
    renderEffectAt(CALL_URL);
    expect(startPropelCallMock).toHaveBeenCalledTimes(1);

    clickCallAgain();

    // The repeat-dial guard must still hold: one dial per contact per visit.
    expect(startPropelCallMock).toHaveBeenCalledTimes(1);
    // ...and it must not leave the page armed. A surviving `?call=1` is what a
    // later reload or Back turns into an unrequested call.
    expect(latestSearch).toBe('');
  });

  it('leaves no flag behind even when the contact cannot be loaded', () => {
    useFindOneRecordMock.mockReturnValue({ record: undefined, loading: false });

    renderEffectAt(CALL_URL);

    expect(startPropelCallMock).not.toHaveBeenCalled();
    expect(enqueueErrorSnackBarMock).toHaveBeenCalledTimes(1);
    expect(latestSearch).toBe('');
  });

  it('keeps the flag while the contact is still loading, so the dial is not lost', () => {
    useFindOneRecordMock.mockReturnValue({ record: undefined, loading: true });

    renderEffectAt(CALL_URL);

    // Stripping early unmounts this effect before the record arrives — the Call
    // click would then do nothing at all. The flag is the only thing keeping the
    // request alive across that wait.
    expect(latestSearch).toBe('?call=1');
    expect(startPropelCallMock).not.toHaveBeenCalled();
  });

  it('takes the flag out without taking the rest of the query with it', () => {
    // `viewId` is how the record page knows which list it is paging through.
    // Replacing the whole query string to drop one flag would silently break
    // next/previous-record on any URL that carried both.
    renderEffectAt(`${PERSON_PATH}?viewId=view-7&call=1`);

    expect(startPropelCallMock).toHaveBeenCalledTimes(1);
    expect(latestSearch).toBe('?viewId=view-7');
  });

  it('does not dial, and does not touch the URL, without the flag', () => {
    renderEffectAt(PERSON_PATH);

    expect(startPropelCallMock).not.toHaveBeenCalled();
    expect(latestSearch).toBe('');
  });
});
