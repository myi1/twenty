import { useReadableObjectMetadataItems } from '@/object-metadata/hooks/useReadableObjectMetadataItems';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { startPropelCall } from '@/dialer-dock/utils/startPropelCall';
import { type MutableRefObject, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CoreObjectNameSingular } from 'twenty-shared/types';

// Propel: the bridge between the "Call" action on a Person and the dialer dock.
//
// The Call action is a Twenty-SDK command-menu item, and SDK front-components
// execute inside a WORKER with no access to this page's `window` — so the panel
// cannot post the dock's same-origin `propel:dial` message itself. What the SDK
// DOES give it is `navigate`, so the panel navigates back to the contact with
// `?call=1`, and this effect — which runs in the page, beside the dock —
// resolves the contact and places the call.
//
// The flag is a query param rather than a path because SDK `navigate` only
// accepts known AppPath routes; this needs no new route, and no change to the
// SDK package. The phone number is never in the URL (it is personal data that
// would land in history and server logs) — only the record id already in the
// path, and a flag.

const PERSON_PATH = /^\/object\/person\/([0-9a-fA-F-]{36})$/;

type PersonRecord = {
  // useFindOneRecord constrains its type param to ObjectRecord, which requires
  // __typename. Apollo returns it on every record, so this is descriptive, not a
  // new requirement — without it the whole front package fails to typecheck.
  __typename: string;
  id: string;
  name?: { firstName?: string | null; lastName?: string | null } | null;
  phones?: {
    primaryPhoneNumber?: string | null;
    primaryPhoneCallingCode?: string | null;
  } | null;
};

const fullName = (name: PersonRecord['name']): string | undefined => {
  const joined = [name?.firstName, name?.lastName]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' ')
    .trim();

  return joined === '' ? undefined : joined;
};

// Mounted globally in AppRouterProviders, so it renders on the signed-out routes
// too — and there the metadata store is EMPTY by design (MinimalMetadataGater
// excludes SignInUp/Invite/ResetPassword/Verify from its loader). `useFindOneRecord`
// resolves object metadata BEFORE it honours `skip`, so calling it here
// unconditionally threw "Object metadata item \"person\" cannot be found in an
// array of 0 elements" on the sign-in page and the error boundary turned that into
// a full-app error page — locking out anyone arriving without a session (new
// joiner, new device, cleared browser, private window). Signed-in users never saw
// it, because by then metadata has loaded.
//
// So the metadata-reading half only mounts once a call is actually requested AND
// the Person object is readable. Same guard the Quick Note launcher uses for Note.
export const PropelCallOnQueryParamEffect = () => {
  const location = useLocation();

  const isCallRequested =
    new URLSearchParams(location.search).get('call') === '1';
  const personId = PERSON_PATH.exec(location.pathname)?.[1] ?? '';

  const { readableObjectMetadataItems } = useReadableObjectMetadataItems();
  const isPersonObjectReady = readableObjectMetadataItems.some(
    (item) => item.nameSingular === CoreObjectNameSingular.Person,
  );

  // The record arrives asynchronously, so the inner effect necessarily runs more
  // than once per request. Dial AT MOST once per contact — a repeat here is a
  // second real phone call to a real client. The ref lives OUT here so that
  // guarantee survives the inner component unmounting once the flag is dropped.
  const dialedFor = useRef<string | null>(null);

  if (!isCallRequested || personId === '' || !isPersonObjectReady) {
    return null;
  }

  return <PropelCallEffect personId={personId} dialedFor={dialedFor} />;
};

const PropelCallEffect = ({
  personId,
  dialedFor,
}: {
  personId: string;
  dialedFor: MutableRefObject<string | null>;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { enqueueErrorSnackBar } = useSnackBar();

  const { record, loading } = useFindOneRecord<PersonRecord>({
    objectNameSingular: CoreObjectNameSingular.Person,
    objectRecordId: personId,
  });

  useEffect(() => {
    // Wait for the record, but ONLY for the record. Dropping the flag before it
    // arrives unmounts this effect (the outer component renders it only while
    // the flag is present), and the requested call is then simply lost.
    if (loading) {
      return;
    }

    // Drop the flag as soon as the wait is over — BEFORE the repeat-dial guard
    // below, and whatever that guard decides. The flag is not a record of what
    // happened; it is an instruction to place a call, and the address bar
    // outlives this visit (reload, bookmark, Back, a copied link).
    //
    // Stripping it after the guard is what task 41 was: a second Call click on
    // the same contact returned early, left `?call=1` standing, and any later
    // load of that URL re-ran the dial on a page where `dialedFor` is empty
    // again. On a contact with a number that is a real phone call nobody asked
    // for. Dial at most once per contact, and end every visit disarmed.
    //
    // Remove ONLY the flag. Dropping the whole query string would take `viewId`
    // with it — the record page reads that to page between records — and this
    // now runs on paths that previously returned before touching the URL at all.
    const remainingParams = new URLSearchParams(location.search);
    remainingParams.delete('call');
    const remainingQuery = remainingParams.toString();

    navigate(
      remainingQuery === ''
        ? location.pathname
        : `${location.pathname}?${remainingQuery}`,
      { replace: true },
    );

    if (dialedFor.current === personId) {
      return;
    }

    dialedFor.current = personId;

    if (!record) {
      enqueueErrorSnackBar({ message: 'Could not load that contact.' });
      return;
    }

    const callingCode = record.phones?.primaryPhoneCallingCode ?? '';
    const number = `${callingCode}${record.phones?.primaryPhoneNumber ?? ''}`;

    if (
      startPropelCall({
        number,
        name: fullName(record.name),
        leadId: personId,
        source: 'person-call-action',
      })
    ) {
      return;
    }

    // Either no dock in this environment, or the stored number is not dialable.
    // Say which — an agent staring at a silent dock has no way to tell them apart.
    enqueueErrorSnackBar({
      message:
        number === ''
          ? 'This contact has no phone number on file.'
          : `Could not call ${number} — the number needs to be in international format, like +971 50 123 4567.`,
    });
  }, [
    loading,
    record,
    personId,
    dialedFor,
    location.pathname,
    location.search,
    navigate,
    enqueueErrorSnackBar,
  ]);

  return null;
};
