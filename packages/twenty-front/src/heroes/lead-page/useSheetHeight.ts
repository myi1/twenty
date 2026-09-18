// The phone qualification sheet's height: three stops, dragged or tapped between,
// remembered per agent.
//
// Why remembered: the sheet replaced a tab, and a tab had no memory to lose. An agent
// who works with the form half-open all day should not re-open it on every lead, and
// an agent who never uses it should never be handed a form covering the conversation.
// One number in localStorage buys both, and a browser that refuses storage (private
// window, blocked site data) just falls back to the default rather than breaking.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type SheetStop = 'peek' | 'half' | 'full';

const KEY = 'propel.leadPage.sheetStop';
const ORDER: SheetStop[] = ['peek', 'half', 'full'];

const isStop = (v: unknown): v is SheetStop => typeof v === 'string' && (ORDER as string[]).includes(v);

const readStored = (): SheetStop => {
  try {
    const raw = window.localStorage.getItem(KEY);
    return isStop(raw) ? raw : 'peek';
  } catch {
    return 'peek';
  }
};

const store = (stop: SheetStop): void => {
  try {
    window.localStorage.setItem(KEY, stop);
  } catch {
    /* private window / blocked storage — the sheet still works, it just forgets. */
  }
};

/**
 * Pixel height per stop, given the room the sheet actually has.
 *
 * `available` is the viewport minus the action bar, so FULL can never grow tall enough
 * to push Call / WhatsApp / Log outcome off screen. HALF is a little under half so the
 * last message stays visible above it — that visibility is the entire point.
 */
export const stopHeight = (stop: SheetStop, available: number, peek: number): number => {
  const room = Math.max(peek, available);
  if (stop === 'peek') return peek;
  if (stop === 'half') return Math.round(Math.min(room * 0.52, room));
  return Math.round(room * 0.92);
};

/** The stop a released drag should settle on: whichever stop's height is nearest. */
export const nearestStop = (height: number, available: number, peek: number): SheetStop => {
  let best: SheetStop = 'peek';
  let bestGap = Number.POSITIVE_INFINITY;
  for (const stop of ORDER) {
    const gap = Math.abs(stopHeight(stop, available, peek) - height);
    if (gap < bestGap) {
      bestGap = gap;
      best = stop;
    }
  }
  return best;
};

/** Tapping the handle advances one stop and wraps — a keyboard/tap path that never
 *  requires a drag, because a gesture must never be the only way to do something. */
export const nextStop = (stop: SheetStop): SheetStop => ORDER[(ORDER.indexOf(stop) + 1) % ORDER.length];

/**
 * Commit whatever is being typed before the sheet changes height.
 *
 * The fields inside the sheet are UNCONTROLLED and save on blur (FactsRail.tsx). A
 * collapse can unmount a focused input, and React does not fire blur on unmount — so
 * a half-typed answer would disappear with no save and no warning. Every path that
 * changes the height goes through setStop, so blurring here covers all of them: the
 * handle, the scrim, and the programmatic collapse when the composer is focused.
 */
const commitFocusedField = (): void => {
  if (typeof document === 'undefined') return;
  const el = document.activeElement as HTMLElement | null;
  if (el && el !== document.body && typeof el.blur === 'function') el.blur();
};

export const __testing = { commitFocusedField };


export const useSheetHeight = (available: number, peek: number) => {
  const [stop, setStopState] = useState<SheetStop>(readStored);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragging = dragHeight !== null;
  const start = useRef<{ y: number; height: number } | null>(null);

  const setStop = useCallback((next: SheetStop) => {
    commitFocusedField();
    setStopState(next);
    store(next);
  }, []);

  const height = useMemo(
    () => (dragHeight !== null ? dragHeight : stopHeight(stop, available, peek)),
    [dragHeight, stop, available, peek],
  );

  // Pointer events rather than touch events: one code path covers finger, pen and a
  // mouse dragging the handle on a narrow desktop window.
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      start.current = { y: e.clientY, height: stopHeight(stop, available, peek) };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [stop, available, peek],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const from = start.current;
      if (!from) return;
      const delta = from.y - e.clientY;
      // A 6px threshold so a tap is never read as a one-pixel drag.
      if (dragHeight === null && Math.abs(delta) < 6) return;
      const raw = from.height + delta;
      setDragHeight(Math.max(peek, Math.min(raw, stopHeight('full', available, peek))));
    },
    [dragHeight, available, peek],
  );

  const onPointerUp = useCallback(() => {
    const from = start.current;
    start.current = null;
    if (dragHeight === null) {
      // No drag happened — treat it as a tap and advance a stop.
      if (from) setStop(nextStop(stop));
      return;
    }
    setStop(nearestStop(dragHeight, available, peek));
    setDragHeight(null);
  }, [dragHeight, stop, available, peek, setStop]);

  // A viewport change (rotation, keyboard opening) must not leave a stale pixel height.
  useEffect(() => {
    if (dragHeight !== null) setDragHeight(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  return { stop, setStop, height, dragging, onPointerDown, onPointerMove, onPointerUp };
};
