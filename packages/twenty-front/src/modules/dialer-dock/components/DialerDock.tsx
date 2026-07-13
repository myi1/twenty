import styled from '@emotion/styled';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
} from 'react';
import { IconPhone } from 'twenty-ui/display';

import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { fetchWithRenewal } from '@/apollo/utils/renewAndRetryFetch';
import {
  createPersonWithPhone,
  lookupPeopleByNumbers,
  navigateCrm,
  openWhatsAppInCrm,
} from '@/dialer-dock/utils/dialerCrmBridge';
import { dialerAccent, dockColor } from '@/ui/theme/dockColorTokens';

// Resolved once at module load, same dual mechanism as REACT_APP_SERVER_BASE_URL
// (src/config/index.ts): window._env_ for the Docker runtime injection,
// import.meta.env for vite dev. Absent flag => component renders nothing.
const DIALER_DOCK_URL: string | undefined =
  window._env_?.REACT_APP_DIALER_DOCK_URL ||
  import.meta.env.REACT_APP_DIALER_DOCK_URL ||
  undefined;

// The dock advertises the CRM origin to the embedded dialer via `?crm=` so the
// dialer's postMessage origin checks + crmLinks resolve to this host (localhost
// on staging, the real domain in prod) without a per-environment dialer build.
const DIALER_IFRAME_SRC: string | undefined = DIALER_DOCK_URL
  ? `${DIALER_DOCK_URL}${DIALER_DOCK_URL.includes('?') ? '&' : '?'}crm=${encodeURIComponent(
      window.location.origin,
    )}`
  : undefined;

// The propel logic-function route that hands back THIS agent's webphone line.
// It derives the agent identity server-side from the access token (the dock
// never sends an identity), mints/returns the per-agent Telnyx credential via
// voice-service, and returns { sipUser, sipPassword, wssUrl, sipDomain,
// businessDid }. We forward that verbatim into the dialer iframe.
const WEBPHONE_CONFIG_URL = `${REACT_APP_SERVER_BASE_URL}/s/voice/webphone-config`;

const DIALER_DOCK_EXPANDED_STORAGE_KEY = 'propel-dialer-dock-expanded';
const DIALER_DOCK_POSITION_STORAGE_KEY = 'propel-dialer-dock-position';

// Default offsets: right-aligned but ABOVE the record side-panel footer (the
// "Options ⌘O / Open" strip occupies the bottom ~56px), so the collapsed
// launcher never covers those buttons. The dock is draggable; this is only the
// fallback.
const DEFAULT_DOCK_POSITION = { right: 14, bottom: 72 };
const DOCK_EDGE_MARGIN_PX = 8;
const DOCK_DRAG_THRESHOLD_PX = 4;

type DockPosition = { right: number; bottom: number };

const clampDockPosition = (position: DockPosition): DockPosition => ({
  right: Math.min(
    Math.max(position.right, DOCK_EDGE_MARGIN_PX),
    Math.max(DOCK_EDGE_MARGIN_PX, window.innerWidth - 120),
  ),
  bottom: Math.min(
    Math.max(position.bottom, DOCK_EDGE_MARGIN_PX),
    Math.max(DOCK_EDGE_MARGIN_PX, window.innerHeight - 56),
  ),
});

const readStoredDockPosition = (): DockPosition => {
  try {
    const raw = localStorage.getItem(DIALER_DOCK_POSITION_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<DockPosition>;
      if (
        typeof parsed.right === 'number' &&
        typeof parsed.bottom === 'number'
      ) {
        // Clamp on read: a position saved on a larger window must not strand
        // the dock off-screen on a smaller one.
        return clampDockPosition({ right: parsed.right, bottom: parsed.bottom });
      }
    }
  } catch {
    // Malformed JSON — fall through to the default.
  }
  return { ...DEFAULT_DOCK_POSITION };
};

// Inside RootStackingContextZIndices terms: above SidePanel (21), below
// RootModalBackDrop (39) so modals and dialogs still cover the dock.
const DIALER_DOCK_Z_INDEX = 30;

// The dock lives OUTSIDE the router AND outside BaseThemeProvider's React
// tree — but it is themed anyway, the same way the WhatsApp dock is: Twenty's
// real `--t-*` CSS custom properties cascade via the DOM (a class on <html>),
// not via React context, so they resolve correctly here regardless of where
// in the component tree this renders. See
// modules/ui/theme/dockColorTokens.ts for the full explanation. (Note: this
// only re-skins the dock's own CHROME — the softphone UI itself lives inside
// a cross-origin <iframe>, a separate app this repo doesn't own, so it can't
// be retheme'd from here.)
// right/bottom offsets come from the drag position (inline style) — the dock is
// user-movable and the position persists per browser.
const StyledDockContainer = styled.div`
  display: flex;
  flex-direction: column;
  position: fixed;
  z-index: ${DIALER_DOCK_Z_INDEX};
`;

const StyledPanel = styled.div<{ isExpanded: boolean }>`
  background: ${dockColor.bgPrimary};
  border: 1px solid ${dockColor.borderMedium};
  border-radius: ${dockColor.radiusMd};
  box-shadow: ${dockColor.shadowStrong};
  display: flex;
  flex-direction: column;
  height: ${({ isExpanded }) => (isExpanded ? '560px' : '0')};
  margin-bottom: ${({ isExpanded }) => (isExpanded ? '8px' : '0')};
  overflow: hidden;
  visibility: ${({ isExpanded }) => (isExpanded ? 'visible' : 'hidden')};
  width: ${({ isExpanded }) => (isExpanded ? '360px' : '0')};
`;

// The header doubles as the drag handle while the panel is expanded.
const StyledPanelHeader = styled.div`
  align-items: center;
  background: ${dockColor.bgSecondary};
  border-bottom: 1px solid ${dockColor.borderLight};
  color: ${dockColor.textSecondary};
  cursor: grab;
  display: flex;
  flex-shrink: 0;
  font:
    600 11px/1 ui-sans-serif,
    system-ui,
    sans-serif;
  justify-content: space-between;
  letter-spacing: 0.06em;
  padding: 8px 10px;
  text-transform: uppercase;
  touch-action: none;
  user-select: none;
`;

const StyledCollapseButton = styled.button`
  background: transparent;
  border: 0;
  color: ${dockColor.textSecondary};
  cursor: pointer;
  font: inherit;
  padding: 2px 4px;

  &:hover {
    color: ${dockColor.textPrimary};
  }
`;

// The iframe is mounted exactly once and never conditionally rendered —
// expand/collapse only changes container CSS. Remounting it would drop the
// softphone's SIP registration and any active call.
const StyledIframe = styled.iframe`
  border: 0;
  flex: 1;
  width: 100%;
`;

const StyledLauncher = styled.button`
  align-items: center;
  align-self: flex-end;
  background: ${dialerAccent.pillBg};
  border: 0;
  border-radius: 50%;
  box-shadow: ${dockColor.shadowStrong};
  color: ${dockColor.iconOnAccent};
  cursor: pointer;
  display: flex;
  height: 44px;
  justify-content: center;
  padding: 0;
  touch-action: none;
  width: 44px;

  &:hover {
    background: ${dialerAccent.pillBgHover};
  }

  &:focus-visible {
    outline: 2px solid ${dockColor.textPrimary};
    outline-offset: 2px;
  }
`;

type DialerDockLauncherProps = {
  onClick: () => void;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onPointerMove?: PointerEventHandler<HTMLButtonElement>;
  onPointerUp?: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>;
};

export const DialerDockLauncher = ({
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: DialerDockLauncherProps) => (
  <StyledLauncher
    aria-label="Expand dialer"
    title="Open dialer"
    type="button"
    onClick={onClick}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerCancel}
  >
    <span aria-hidden="true">
      <IconPhone size={20} />
    </span>
  </StyledLauncher>
);

type DialerDockMessage = {
  type: 'propel:dial';
  number: string;
  name?: string;
  leadId?: string;
  source?: string;
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const isDialerDockMessage = (data: unknown): data is DialerDockMessage =>
  typeof data === 'object' &&
  data !== null &&
  (data as { type?: unknown }).type === 'propel:dial' &&
  typeof (data as { number?: unknown }).number === 'string';

// Requests the embedded dialer posts UP to the dock (it has no CRM access of
// its own): batch person lookup, add-unknown-caller, navigate-the-CRM.
type DialerIframeRequest =
  | { type: 'propel:lookup'; numbers: string[] }
  | { type: 'propel:add-to-crm'; number: string }
  | { type: 'propel:open'; path: string }
  | { type: 'propel:open-whatsapp'; number: string };

const parseDialerIframeRequest = (data: unknown): DialerIframeRequest | null => {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const candidate = data as Record<string, unknown>;
  if (
    candidate.type === 'propel:lookup' &&
    Array.isArray(candidate.numbers) &&
    candidate.numbers.every((entry) => typeof entry === 'string')
  ) {
    return { type: 'propel:lookup', numbers: candidate.numbers.slice(0, 50) };
  }
  if (
    candidate.type === 'propel:add-to-crm' &&
    typeof candidate.number === 'string' &&
    candidate.number.length > 0
  ) {
    return { type: 'propel:add-to-crm', number: candidate.number };
  }
  if (
    candidate.type === 'propel:open' &&
    typeof candidate.path === 'string' &&
    candidate.path.startsWith('/') &&
    !candidate.path.startsWith('//')
  ) {
    return { type: 'propel:open', path: candidate.path };
  }
  if (
    candidate.type === 'propel:open-whatsapp' &&
    typeof candidate.number === 'string' &&
    candidate.number.length > 0
  ) {
    return { type: 'propel:open-whatsapp', number: candidate.number };
  }
  return null;
};

export const DialerDock = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // The agent's webphone line, fetched once from the propel route. Held in a ref
  // (not state) because it is pushed imperatively to the iframe, never rendered.
  const credentialRef = useRef<unknown>(null);
  const pushConfigRef = useRef<() => void>(() => {});
  const [isExpanded, setIsExpanded] = useState(
    () => localStorage.getItem(DIALER_DOCK_EXPANDED_STORAGE_KEY) === 'true',
  );
  const [position, setPosition] = useState<DockPosition>(readStoredDockPosition);
  // Live drag bookkeeping. A drag and a click share the same pointer gesture on
  // the pill — `moved` past the threshold turns the gesture into a drag, and
  // suppressClickRef swallows the click event the browser fires after pointerup.
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const toggleExpanded = () => {
    setIsExpanded((previousIsExpanded) => {
      localStorage.setItem(
        DIALER_DOCK_EXPANDED_STORAGE_KEY,
        String(!previousIsExpanded),
      );
      return !previousIsExpanded;
    });
  };

  const handleDragPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRight: position.right,
      startBottom: position.bottom,
      moved: false,
    };
    // Pointer capture keeps move events flowing to the handle even when the
    // pointer crosses the dialer iframe (which would otherwise eat them).
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (
      !drag.moved &&
      Math.abs(deltaX) < DOCK_DRAG_THRESHOLD_PX &&
      Math.abs(deltaY) < DOCK_DRAG_THRESHOLD_PX
    ) {
      return;
    }
    drag.moved = true;
    setPosition(
      clampDockPosition({
        right: drag.startRight - deltaX,
        bottom: drag.startBottom - deltaY,
      }),
    );
  };

  const handleDragPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }
    dragStateRef.current = null;
    if (drag.moved) {
      suppressClickRef.current = true;
      setPosition((current) => {
        localStorage.setItem(
          DIALER_DOCK_POSITION_STORAGE_KEY,
          JSON.stringify(current),
        );
        return current;
      });
    }
  };

  const dragHandleProps = {
    onPointerDown: handleDragPointerDown,
    onPointerMove: handleDragPointerMove,
    onPointerUp: handleDragPointerEnd,
    onPointerCancel: handleDragPointerEnd,
  };

  useEffect(() => {
    if (!DIALER_DOCK_URL) {
      return;
    }
    const dockOrigin = new URL(DIALER_DOCK_URL, window.location.href).origin;

    // Forward the agent's webphone line into the dialer iframe. Safe to call
    // repeatedly: fires only once both the credential is fetched AND the iframe
    // window exists; the dialer ignores a re-push of the same line.
    const pushConfig = () => {
      const credential = credentialRef.current;
      const contentWindow = iframeRef.current?.contentWindow;
      if (credential && contentWindow) {
        contentWindow.postMessage({ type: 'propel:config', credential }, dockOrigin);
      }
    };
    pushConfigRef.current = pushConfig;

    // Reply channel back into the softphone iframe.
    const postToDialer = (message: object) => {
      iframeRef.current?.contentWindow?.postMessage(message, dockOrigin);
    };

    const handleDialerRequest = (request: DialerIframeRequest) => {
      switch (request.type) {
        case 'propel:lookup': {
          void lookupPeopleByNumbers(request.numbers).then((results) => {
            if (results.length > 0) {
              postToDialer({ type: 'propel:lookup-result', results });
            }
          });
          return;
        }
        case 'propel:add-to-crm': {
          void createPersonWithPhone(request.number).then((personId) => {
            if (personId === null) {
              postToDialer({ type: 'propel:add-failed', number: request.number });
              return;
            }
            postToDialer({
              type: 'propel:lookup-result',
              results: [{ number: request.number, personId }],
            });
            // Land the agent on the fresh record so they type the name —
            // client-side route change; a reload would drop the SIP line.
            navigateCrm(`/object/person/${personId}`);
          });
          return;
        }
        case 'propel:open': {
          navigateCrm(request.path);
          return;
        }
        case 'propel:open-whatsapp': {
          void openWhatsAppInCrm(request.number);
          return;
        }
      }
    };

    const handleMessage = (event: MessageEvent) => {
      // Click-to-call bridge from the CRM host: forward the agreed
      // `propel:dial` envelope into the softphone iframe, lead context and all
      // (name/leadId ride along so the call + its log entry start identified).
      if (event.origin === window.location.origin) {
        if (isDialerDockMessage(event.data)) {
          setIsExpanded(true);
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: 'propel:dial',
              number: event.data.number,
              name: optionalString(event.data.name),
              leadId: optionalString(event.data.leadId),
              source: optionalString(event.data.source),
            },
            dockOrigin,
          );
        }
        return;
      }
      // Messages from the dialer iframe — require BOTH the dialer origin and
      // that the sender is our own iframe (not another tab on that origin).
      if (
        event.origin === dockOrigin &&
        event.source === iframeRef.current?.contentWindow
      ) {
        // Readiness handshake: push the line the moment the iframe's message
        // listener is up (avoids racing its boot).
        if ((event.data as { type?: unknown } | null)?.type === 'propel:ready') {
          pushConfig();
          return;
        }
        const request = parseDialerIframeRequest(event.data);
        if (request !== null) {
          handleDialerRequest(request);
        }
      }
    };
    window.addEventListener('message', handleMessage);

    // Fetch THIS agent's line. The route requires auth — send the CRM session's
    // access token; identity is derived server-side from it (never sent by us).
    // Renew-and-retry: on an expired token (401) this now attempts the same
    // renewal the main app's Apollo client does and retries once, instead of
    // leaving the dialer stuck "Connecting…" until a hard reload (founder-
    // confirmed hardening, WhatsApp dock redesign 2026-07-12 — bundled here,
    // same class of gap as the two bridge files).
    if (getTokenPair()?.accessOrWorkspaceAgnosticToken?.token) {
      void fetchWithRenewal(() =>
        fetch(WEBPHONE_CONFIG_URL, {
          headers: {
            authorization: `Bearer ${getTokenPair()?.accessOrWorkspaceAgnosticToken?.token ?? ''}`,
          },
        }),
      )
        .then((res) => (res && res.ok ? res.json() : null))
        .then((json) => {
          if (json && typeof json === 'object' && !('error' in json)) {
            credentialRef.current = json;
            pushConfig();
          }
        })
        .catch(() => {
          // Leave the dialer in its "Connecting…" state; nothing to surface in
          // the shell. A reload re-attempts the fetch.
        });
    }

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!DIALER_DOCK_URL) {
    return null;
  }

  return (
    <StyledDockContainer
      data-testid="dialer-dock"
      style={{ right: position.right, bottom: position.bottom }}
    >
      <StyledPanel
        isExpanded={isExpanded}
        style={
          // Never let the panel poke past the top of the viewport when the dock
          // has been dragged high — the iframe (flex: 1) absorbs the shrink.
          isExpanded
            ? { maxHeight: `calc(100vh - ${position.bottom + 24}px)` }
            : undefined
        }
      >
        <StyledPanelHeader {...dragHandleProps}>
          Dialer
          <StyledCollapseButton
            aria-label="Collapse dialer"
            onClick={toggleExpanded}
            onPointerDown={(event) => event.stopPropagation()}
          >
            —
          </StyledCollapseButton>
        </StyledPanelHeader>
        <StyledIframe
          allow="microphone; autoplay"
          ref={iframeRef}
          src={DIALER_IFRAME_SRC}
          title="Dialer"
          onLoad={() => pushConfigRef.current()}
        />
      </StyledPanel>
      {!isExpanded && (
        <DialerDockLauncher
          onPointerDown={handleDragPointerDown}
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerEnd}
          onPointerCancel={handleDragPointerEnd}
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            toggleExpanded();
          }}
        />
      )}
    </StyledDockContainer>
  );
};
