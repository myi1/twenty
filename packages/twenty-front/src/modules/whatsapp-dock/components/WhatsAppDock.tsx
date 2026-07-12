import styled from '@emotion/styled';
import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { dockColor } from '@/ui/theme/dockColorTokens';
import { resolveWaTarget, type WaPersonResult, type WaTarget } from '@/whatsapp-dock/utils/whatsAppComposeBridge';

import { ChatListView } from './ChatListView';
import { ConversationView } from './ConversationView';

// Floating WhatsApp dock — a familiar WhatsApp-style panel: a contact/recent-
// chats list + a full conversation view (real history, composer, attachments,
// voice notes, 24h-window handling). Mounted once in App.tsx, OUTSIDE the
// router and OUTSIDE BaseThemeProvider's React tree — same shell contract as
// the DialerDock (see SPIKE-DOCK.md). Theming works anyway: see
// modules/ui/theme/dockColorTokens.ts for why `var(--t-*)` resolves correctly
// here without being inside the provider's React subtree.
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
  background: ${dockColor.bgPrimary};
  border: 1px solid ${dockColor.borderMedium};
  border-radius: ${dockColor.radiusMd};
  box-shadow: ${dockColor.shadowStrong};
  display: flex;
  flex-direction: column;
  height: ${({ isExpanded }) => (isExpanded ? '480px' : '0')};
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
  padding: 10px 12px;
  text-transform: uppercase;
  touch-action: none;
  user-select: none;
`;

const StyledHeaderDot = styled.span`
  color: ${dockColor.accentGreen};
  margin-right: 6px;
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

const StyledPill = styled.button`
  align-items: center;
  align-self: flex-end;
  background: ${dockColor.accentGreen};
  border: 0;
  border-radius: ${dockColor.radiusPill};
  box-shadow: ${dockColor.shadowStrong};
  color: ${dockColor.textInverted};
  cursor: pointer;
  display: flex;
  font:
    600 13px/1 ui-sans-serif,
    system-ui,
    sans-serif;
  gap: 6px;
  padding: 10px 16px;
  touch-action: none;
  transition: transform 120ms ease;

  &:hover {
    transform: translateY(-1px);
  }
`;

export const WhatsAppDock = () => {
  const [isExpanded, setIsExpanded] = useState(
    () => localStorage.getItem(WA_DOCK_EXPANDED_STORAGE_KEY) === 'true',
  );
  const [position, setPosition] = useState<DockPosition>(readStoredDockPosition);
  const [target, setTarget] = useState<WaTarget | null>(null);

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
    setIsExpanded((previous) => {
      localStorage.setItem(WA_DOCK_EXPANDED_STORAGE_KEY, String(!previous));
      return !previous;
    });
  };

  const handlePickPerson = useCallback(async (person: WaPersonResult) => {
    // Optimistic selection so the panel switches to the conversation view
    // immediately; the thread/line resolution fills in behind it.
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

        {target === null ? (
          <ChatListView onOpenChat={setTarget} onPickPerson={(person) => void handlePickPerson(person)} />
        ) : (
          <ConversationView
            onBack={() => setTarget(null)}
            onTargetUpdate={setTarget}
            target={target}
          />
        )}
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
