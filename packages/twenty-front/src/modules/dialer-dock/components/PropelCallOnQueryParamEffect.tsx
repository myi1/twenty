import { CoreObjectNameSingular } from '@/object-metadata/types/CoreObjectNameSingular';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { startPropelCall } from '@/dialer-dock/utils/startPropelCall';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

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

export const PropelCallOnQueryParamEffect = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { enqueueErrorSnackBar } = useSnackBar();

  const isCallRequested =
    new URLSearchParams(location.search).get('call') === '1';
  const personId = PERSON_PATH.exec(location.pathname)?.[1] ?? '';
  const shouldDial = isCallRequested && personId !== '';

  // The record arrives asynchronously, so this effect necessarily runs more than
  // once per request. Dial AT MOST once per contact — a repeat here is a second
  // real phone call to a real client.
  const dialedFor = useRef<string | null>(null);

  const { record, loading } = useFindOneRecord<PersonRecord>({
    objectNameSingular: CoreObjectNameSingular.Person,
    objectRecordId: personId,
    skip: !shouldDial,
  });

  useEffect(() => {
    if (!shouldDial || loading || dialedFor.current === personId) {
      return;
    }

    dialedFor.current = personId;

    // Drop the flag immediately so a reload, or Back onto this entry, cannot
    // place the call a second time.
    navigate(location.pathname, { replace: true });

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
    shouldDial,
    loading,
    record,
    personId,
    location.pathname,
    navigate,
    enqueueErrorSnackBar,
  ]);

  return null;
};
