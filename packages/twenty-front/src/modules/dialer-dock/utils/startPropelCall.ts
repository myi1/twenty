// Click-to-call from the CRM host into the dialer dock.
//
// The dock listens for a same-origin `propel:dial` window message and forwards it
// into the embedded softphone (see DialerDock.tsx). Posting that message is the
// supported way to place a call from the CRM, and it is what My Desk already
// does. `name` and `leadId` ride along so the call starts identified rather than
// showing as "Anonymous".

// Same dual mechanism DialerDock uses (window._env_ for the Docker runtime
// injection, import.meta.env for vite dev). Read lazily rather than at module
// load: this module is imported by routes that can evaluate before the runtime
// env blob is injected.
const dialerDockUrl = (): string | undefined =>
  window._env_?.REACT_APP_DIALER_DOCK_URL ||
  import.meta.env.REACT_APP_DIALER_DOCK_URL ||
  undefined;

/** True when this environment actually has a dock to call through. */
export const isPropelDialerAvailable = (): boolean =>
  dialerDockUrl() !== undefined;

/**
 * A number we are willing to hand to the PBX: E.164, `+` and 8–15 digits.
 *
 * Anything else is REFUSED rather than dialled on a best guess — a malformed
 * number does not fail loudly, it rings the wrong person, which is far worse
 * than telling the agent we could not place the call.
 */
export const isDialableE164 = (value: string): boolean =>
  /^\+[1-9]\d{7,14}$/.test(value);

export type StartPropelCallParams = {
  /** Must be E.164 (+971…). */
  number: string;
  /** Who we are calling, so the softphone shows a name, not "Anonymous". */
  name?: string;
  /** CRM record id, so the call log links back to the person. */
  leadId?: string;
  /** Which surface placed the call — used for attribution. */
  source: string;
};

/**
 * Ask the dock to place a call. Returns false (having done nothing) when there
 * is no dock or the number is not dialable, so callers can report the failure
 * instead of silently appearing to succeed.
 */
export const startPropelCall = ({
  number,
  name,
  leadId,
  source,
}: StartPropelCallParams): boolean => {
  if (!isPropelDialerAvailable() || !isDialableE164(number)) {
    return false;
  }

  window.postMessage(
    { type: 'propel:dial', number, name, leadId, source },
    window.location.origin,
  );

  return true;
};
