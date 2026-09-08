import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// ── ONE DRAG, SHARED BY THE FLOATING DOCKS ───────────────────────────────────
// 2026-09-08. Yahya: "the note button isnt movable like the other 2 buttons are."
// He is right, and it is the same complaint as the one underneath it: the Quick Note pill
// sits ON TOP of the Inbox Send button and is the one pill an agent cannot drag out of the
// way. The Dialer and WhatsApp docks each grew their own copy of this logic; the Quick
// Note button got none, and its comment reasoned that "a fixed default position is enough"
// — which held right up until it landed on the Send button.
//
// This is the Dialer's implementation, lifted verbatim in behaviour (threshold, pointer
// capture, click suppression, edge clamping, persistence) so the three pills feel
// identical. The other two still carry their own copies; migrating them is a follow-up and
// deliberately not bundled here — they work today and this release exists to fix the one
// that does not.

const EDGE_MARGIN_PX = 8;
const DRAG_THRESHOLD_PX = 4;

export type DockPosition = { right: number; bottom: number };

export const clampDockPosition = (position: DockPosition): DockPosition => ({
  right: Math.min(
    Math.max(position.right, EDGE_MARGIN_PX),
    Math.max(EDGE_MARGIN_PX, window.innerWidth - 120),
  ),
  bottom: Math.min(
    Math.max(position.bottom, EDGE_MARGIN_PX),
    Math.max(EDGE_MARGIN_PX, window.innerHeight - 56),
  ),
});

export const readStoredDockPosition = (
  storageKey: string,
  fallback: DockPosition,
): DockPosition => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<DockPosition>;
      if (
        typeof parsed?.right === 'number' &&
        typeof parsed?.bottom === 'number' &&
        Number.isFinite(parsed.right) &&
        Number.isFinite(parsed.bottom)
      ) {
        return clampDockPosition({ right: parsed.right, bottom: parsed.bottom });
      }
    }
  } catch {
    // Unreadable or malformed — fall through to the default. A dock that cannot read its
    // saved position must still appear somewhere sensible.
  }
  return { ...fallback };
};

/**
 * Makes a floating pill draggable and remembers where it was put.
 *
 * A drag and a click share one pointer gesture: passing DRAG_THRESHOLD_PX turns the
 * gesture into a drag, and `shouldSuppressClick` swallows the click the browser fires
 * afterwards — so dragging the pill does not also open what it launches.
 */
export const useDraggableDock = (
  storageKey: string,
  defaultPosition: DockPosition,
) => {
  const [position, setPosition] = useState<DockPosition>(() =>
    readStoredDockPosition(storageKey, defaultPosition),
  );
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
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

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (
      !drag.moved &&
      Math.abs(deltaX) < DRAG_THRESHOLD_PX &&
      Math.abs(deltaY) < DRAG_THRESHOLD_PX
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

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (drag.moved) {
      suppressClickRef.current = true;
      setPosition((current) => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(current));
        } catch {
          // Storage unavailable (private window, blocked). The pill still moved for this
          // session; only the memory of it is lost.
        }
        return current;
      });
    }
  };

  /** True exactly once, for the click the browser fires at the end of a drag. */
  const shouldSuppressClick = (): boolean => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  };

  return {
    position,
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
    shouldSuppressClick,
  };
};
