import styled from '@emotion/styled';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  resolveWaTarget,
  searchPeopleByName,
  sendWaTemplate,
  sendWaText,
  type WaPersonResult,
  type WaSendOutcome,
  type WaTarget,
} from '@/whatsapp-dock/utils/whatsAppComposeBridge';

// Floating WhatsApp dock — the message-from-anywhere sibling of the DialerDock.
// Same shell contract: mounted once in App.tsx OUTSIDE the router and outside
// BaseThemeProvider, so it must not read the emotion theme — styling is
// self-contained and theme-neutral dark (Nocturne-adjacent), matching the
// dialer, with WhatsApp's green as the accent.
//
// Gated on a flag so it can dark-ship: absent flag => renders nothing, exactly
// like DIALER_DOCK_URL gates the dialer. Set REACT_APP_WA_DOCK_ENABLED=true to
// turn it on (staging first).
const WA_DOCK_ENABLED: boolean =
  (window._env_?.REACT_APP_WA_DOCK_ENABLED ??
    import.meta.env.REACT_APP_WA_DOCK_ENABLED) === 'true';

const WA_DOCK_EXPANDED_STORAGE_KEY = 'propel-wa-dock-expanded';
const WA_DOCK_POSITION_STORAGE_KEY = 'propel-wa-dock-position';

// Sits ABOVE the dialer's default pill (right:14, bottom:72) so the two docks
// stack rather than overlap. Draggable; this is only the fallback.
const DEFAULT_DOCK_POSITION = { right: 14, bottom: 130 };
const DOCK_EDGE_MARGIN_PX = 8;
const DOCK_DRAG_THRESHOLD_PX = 4;
// Match the dialer's stacking band: above SidePanel (21), below the modal
// backdrop (39). One under the dialer so an open dialer panel wins overlap.
const WA_DOCK_Z_INDEX = 29;

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
    const raw = localStorage.getItem(WA_DOCK_POSITION_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<DockPosition>;
      if (typeof parsed.right === 'number' && typeof parsed.bottom === 'number') {
        return clampDockPosition({ right: parsed.right, bottom: parsed.bottom });
      }
    }
  } catch {
    // Malformed JSON — fall through to the default.
  }
  return { ...DEFAULT_DOCK_POSITION };
};

const StyledDockContainer = styled.div`
  display: flex;
  flex-direction: column;
  position: fixed;
  z-index: ${WA_DOCK_Z_INDEX};
`;

const StyledPanel = styled.div<{ isExpanded: boolean }>`
  background: #17171c;
  border: 1px solid #2a2a31;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  height: ${({ isExpanded }) => (isExpanded ? '460px' : '0')};
  margin-bottom: ${({ isExpanded }) => (isExpanded ? '8px' : '0')};
  opacity: ${({ isExpanded }) => (isExpanded ? '1' : '0')};
  overflow: hidden;
  transition:
    height 180ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 140ms ease;
  visibility: ${({ isExpanded }) => (isExpanded ? 'visible' : 'hidden')};
  width: ${({ isExpanded }) => (isExpanded ? '340px' : '0')};
`;

const StyledPanelHeader = styled.div`
  align-items: center;
  background: #101014;
  border-bottom: 1px solid #2a2a31;
  color: #9a9aa2;
  cursor: grab;
  display: flex;
  flex-shrink: 0;
  font:
    600 11px/1 ui-sans-serif,
    system-ui,
    sans-serif;
  justify-content: space-between;
  letter-spacing: 0.06em;
  padding: 10px 12px;
  text-transform: uppercase;
  touch-action: none;
  user-select: none;
`;

const StyledHeaderDot = styled.span`
  color: #25d366;
  margin-right: 6px;
`;

const StyledCollapseButton = styled.button`
  background: transparent;
  border: 0;
  color: #9a9aa2;
  cursor: pointer;
  font: inherit;
  padding: 2px 4px;

  &:hover {
    color: #f2f2f7;
  }
`;

const StyledBody = styled.div`
  color: #e6e6ea;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding: 12px;
`;

const StyledInput = styled.input`
  background: #0d0d11;
  border: 1px solid #2a2a31;
  border-radius: 8px;
  color: #f2f2f7;
  font: 400 13px/1.3 ui-sans-serif, system-ui, sans-serif;
  outline: none;
  padding: 9px 11px;
  width: 100%;

  &:focus {
    border-color: #25d366;
  }

  &::placeholder {
    color: #6b6b73;
  }
`;

const StyledResultRow = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 8px;
  color: #e6e6ea;
  cursor: pointer;
  display: flex;
  font: 400 13px/1.3 ui-sans-serif, system-ui, sans-serif;
  gap: 8px;
  justify-content: space-between;
  padding: 9px 10px;
  text-align: left;
  transition: background 120ms ease;
  width: 100%;

  &:hover {
    background: #22222a;
  }
`;

const StyledResultMeta = styled.span`
  color: #8a8a92;
  font-size: 11px;
`;

const StyledHint = styled.div`
  color: #8a8a92;
  font: 400 12px/1.4 ui-sans-serif, system-ui, sans-serif;
  padding: 4px 2px;
`;

const StyledSelectedName = styled.div`
  align-items: center;
  color: #f2f2f7;
  display: flex;
  font: 600 13px/1.2 ui-sans-serif, system-ui, sans-serif;
  gap: 8px;
  justify-content: space-between;
`;

const StyledBackButton = styled.button`
  background: transparent;
  border: 0;
  color: #8a8a92;
  cursor: pointer;
  font: 400 12px/1 ui-sans-serif, system-ui, sans-serif;
  padding: 2px 4px;

  &:hover {
    color: #f2f2f7;
  }
`;

const StyledTextarea = styled.textarea`
  background: #0d0d11;
  border: 1px solid #2a2a31;
  border-radius: 8px;
  color: #f2f2f7;
  font: 400 13px/1.4 ui-sans-serif, system-ui, sans-serif;
  min-height: 96px;
  outline: none;
  padding: 10px 11px;
  resize: vertical;
  width: 100%;

  &:focus {
    border-color: #25d366;
  }
`;

const StyledSendButton = styled.button`
  align-items: center;
  background: #25d366;
  border: 0;
  border-radius: 8px;
  color: #08130c;
  cursor: pointer;
  display: flex;
  font: 600 13px/1 ui-sans-serif, system-ui, sans-serif;
  gap: 6px;
  justify-content: center;
  padding: 11px 14px;
  transition: background 120ms ease;
  width: 100%;

  &:hover:not(:disabled) {
    background: #2ee574;
  }

  &:disabled {
    background: #2a2a31;
    color: #6b6b73;
    cursor: not-allowed;
  }
`;

const StyledTemplateCard = styled.div`
  background: #1d1a10;
  border: 1px solid #4a3f16;
  border-radius: 8px;
  color: #e8dba8;
  font: 400 12px/1.45 ui-sans-serif, system-ui, sans-serif;
  padding: 10px 11px;
`;

const StyledStatus = styled.div<{ tone: 'ok' | 'error' }>`
  color: ${({ tone }) => (tone === 'ok' ? '#25d366' : '#ff8f8f')};
  font: 500 12px/1.4 ui-sans-serif, system-ui, sans-serif;
  padding: 2px 2px;
`;

const StyledPill = styled.button`
  align-items: center;
  align-self: flex-end;
  background: #128c4b;
  border: 0;
  border-radius: 999px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.32);
  color: #fff;
  cursor: pointer;
  display: flex;
  font:
    600 13px/1 ui-sans-serif,
    system-ui,
    sans-serif;
  gap: 6px;
  padding: 10px 16px;
  touch-action: none;
  transition: background 120ms ease, transform 120ms ease;

  &:hover {
    background: #16a557;
    transform: translateY(-1px);
  }
`;

type ComposeState =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'sent' }
  | { phase: 'error'; message: string }
  | {
      phase: 'windowClosed';
      suggestedTemplate: { name: string; languageCode: string; preview: string } | null;
      message: string;
    };

export const WhatsAppDock = () => {
  const [isExpanded, setIsExpanded] = useState(
    () => localStorage.getItem(WA_DOCK_EXPANDED_STORAGE_KEY) === 'true',
  );
  const [position, setPosition] = useState<DockPosition>(readStoredDockPosition);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WaPersonResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<WaTarget | null>(null);
  const [message, setMessage] = useState('');
  const [compose, setCompose] = useState<ComposeState>({ phase: 'idle' });

  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const searchSeqRef = useRef(0);

  const toggleExpanded = () => {
    setIsExpanded((previous) => {
      localStorage.setItem(WA_DOCK_EXPANDED_STORAGE_KEY, String(!previous));
      return !previous;
    });
  };

  // Debounced name search. A monotonic sequence guards against out-of-order
  // responses overwriting a newer query's results.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeqRef.current;
    const timer = window.setTimeout(() => {
      void searchPeopleByName(term).then((people) => {
        if (seq === searchSeqRef.current) {
          setResults(people);
          setSearching(false);
        }
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const pickPerson = useCallback(async (person: WaPersonResult) => {
    setResults([]);
    setQuery('');
    setCompose({ phase: 'idle' });
    setMessage('');
    // Optimistic selection so the panel switches to compose immediately; the
    // thread/line resolution fills in behind it.
    setTarget({
      personId: person.id,
      name: person.name,
      e164Digits: person.e164Digits,
      conversationId: null,
      lineType: null,
      lastInboundAt: null,
    });
    const resolved = await resolveWaTarget(person);
    setTarget((current) => (current?.personId === person.id ? resolved : current));
  }, []);

  const clearSelection = () => {
    setTarget(null);
    setMessage('');
    setCompose({ phase: 'idle' });
  };

  const applyOutcome = (outcome: WaSendOutcome) => {
    if (outcome.ok) {
      setCompose({ phase: 'sent' });
      setMessage('');
      setTarget((current) =>
        current && outcome.conversationId
          ? { ...current, conversationId: outcome.conversationId }
          : current,
      );
      return;
    }
    if ('windowClosed' in outcome) {
      setCompose({
        phase: 'windowClosed',
        suggestedTemplate: outcome.suggestedTemplate,
        message: outcome.message,
      });
      return;
    }
    setCompose({ phase: 'error', message: outcome.error });
  };

  const handleSendText = async () => {
    if (target === null || message.trim().length === 0) {
      return;
    }
    setCompose({ phase: 'sending' });
    applyOutcome(await sendWaText(target, message));
  };

  const handleSendTemplate = async (templateName: string) => {
    if (target === null) {
      return;
    }
    setCompose({ phase: 'sending' });
    applyOutcome(await sendWaTemplate(target, templateName));
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
        localStorage.setItem(WA_DOCK_POSITION_STORAGE_KEY, JSON.stringify(current));
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

  if (!WA_DOCK_ENABLED) {
    return null;
  }

  const hasNoPhone = target !== null && target.e164Digits.length < 5;
  const sending = compose.phase === 'sending';

  return (
    <StyledDockContainer
      data-testid="whatsapp-dock"
      style={{ right: position.right, bottom: position.bottom }}
    >
      <StyledPanel
        isExpanded={isExpanded}
        style={
          isExpanded
            ? { maxHeight: `calc(100vh - ${position.bottom + 24}px)` }
            : undefined
        }
      >
        <StyledPanelHeader {...dragHandleProps}>
          <span>
            <StyledHeaderDot>●</StyledHeaderDot>WhatsApp
          </span>
          <StyledCollapseButton
            aria-label="Collapse WhatsApp"
            onClick={toggleExpanded}
            onPointerDown={(event) => event.stopPropagation()}
          >
            —
          </StyledCollapseButton>
        </StyledPanelHeader>

        <StyledBody>
          {target === null ? (
            <>
              <StyledInput
                autoFocus
                placeholder="Search a contact by name…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {searching && <StyledHint>Searching…</StyledHint>}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <StyledHint>No contacts match “{query.trim()}”.</StyledHint>
              )}
              {results.map((person) => (
                <StyledResultRow key={person.id} onClick={() => void pickPerson(person)}>
                  <span>{person.name}</span>
                  <StyledResultMeta>
                    {person.e164Digits ? `+${person.e164Digits}` : 'No number'}
                  </StyledResultMeta>
                </StyledResultRow>
              ))}
              {query.trim().length < 2 && (
                <StyledHint>
                  Find anyone in the CRM and send them a WhatsApp without leaving this
                  page.
                </StyledHint>
              )}
            </>
          ) : (
            <>
              <StyledSelectedName>
                <span>{target.name}</span>
                <StyledBackButton onClick={clearSelection}>Change</StyledBackButton>
              </StyledSelectedName>

              {hasNoPhone ? (
                <StyledHint>
                  This contact has no phone number on file, so there is nobody to
                  message. Add a number to their record first.
                </StyledHint>
              ) : compose.phase === 'sent' ? (
                <>
                  <StyledStatus tone="ok">Message sent.</StyledStatus>
                  <StyledSendButton onClick={() => setCompose({ phase: 'idle' })}>
                    Send another
                  </StyledSendButton>
                </>
              ) : compose.phase === 'windowClosed' ? (
                <>
                  <StyledHint>{compose.message}</StyledHint>
                  {compose.suggestedTemplate ? (
                    <>
                      <StyledTemplateCard>{compose.suggestedTemplate.preview}</StyledTemplateCard>
                      <StyledSendButton
                        disabled={sending}
                        onClick={() =>
                          void handleSendTemplate(compose.suggestedTemplate!.name)
                        }
                      >
                        Send approved template
                      </StyledSendButton>
                    </>
                  ) : (
                    <StyledHint>
                      No approved re-engagement template is available yet — it may still
                      be awaiting WhatsApp approval.
                    </StyledHint>
                  )}
                  <StyledBackButton onClick={() => setCompose({ phase: 'idle' })}>
                    Back to message
                  </StyledBackButton>
                </>
              ) : (
                <>
                  <StyledTextarea
                    autoFocus
                    placeholder={`Message ${target.name.split(' ')[0] || 'contact'}…`}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                  {compose.phase === 'error' && (
                    <StyledStatus tone="error">{compose.message}</StyledStatus>
                  )}
                  <StyledSendButton
                    disabled={sending || message.trim().length === 0}
                    onClick={() => void handleSendText()}
                  >
                    {sending ? 'Sending…' : 'Send WhatsApp'}
                  </StyledSendButton>
                </>
              )}
            </>
          )}
        </StyledBody>
      </StyledPanel>

      {!isExpanded && (
        <StyledPill
          aria-label="Open WhatsApp"
          {...dragHandleProps}
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            toggleExpanded();
          }}
        >
          <StyledHeaderDot>●</StyledHeaderDot>WhatsApp
        </StyledPill>
      )}
    </StyledDockContainer>
  );
};
