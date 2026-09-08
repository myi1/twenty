// useHostBottomInset.ts: how many pixels at the bottom of the viewport belong to
// the HOST rather than to this hero — so the hero's own fixed bar can sit ABOVE
// them instead of on top of them.
//
// ── THE BUG THIS EXISTS FOR ───────────────────────────────────────────────────
// Twenty renders MobileNavigationBar (list / search / new-chat) whenever its own
// isMobile is true. DefaultLayout.tsx mounts it as the last flex child of a
// `height: 100dvh` column, so it is NOT an overlay: it takes real layout space
// and the page container above it stops short of the viewport bottom. This
// hero's PhoneBar is `position: fixed; bottom: 0`, which resolves against the
// VIEWPORT, not against that page container — so the two claimed the same strip.
// Measured live on staging at 375x812 (2026-09-09):
//
//   Twenty MobileNavigationBar   [0, 748, 375, 812]   z-index 1001
//   hero PhoneBar                [0, 744, 375, 812]   z-index 20
//
// Twenty's nav icons landed on the WhatsApp button and its search control on the
// hero's buttons. Raising the hero above z-index 1001 would only invert the
// loss — the agent would lose the CRM's navigation instead of the hero's
// actions — so the bar has to move UP, not forward.
//
// ── WHY THIS MEASURES THE HOLE, NOT THE BAR ───────────────────────────────────
// The obvious fix is to find Twenty's bar and read its height. There is nothing
// to find it BY: it renders twenty-ui's NavigationBar, a Linaria `styled.div`
// with no id, no data attribute and no role — only a generated class name
// (`.s12jcd8z` in today's build) that changes every time the front is rebuilt,
// so it is worthless as a hook. Importing the height is not open either:
// `twenty-ui/theme-constants` exports only MOBILE_VIEWPORT, and
// `twenty-ui/navigation` is not one of this hero's allowed externals.
//
// So this measures the SHAPE OF THE HOLE instead of the thing filling it: the
// distance between the bottom of the hero's OWN box and the edge a
// `position: fixed; bottom: 0` element would sit on. That is the better question
// anyway. It needs no selector; it cannot go stale when Twenty restyles, resizes
// or replaces that bar; and it is already right for anything else the host may
// one day put down there. When there is nothing there at all — desktop, a
// settings page, or Twenty dropping the bar — the page container reaches the
// bottom and the answer collapses to ~0, i.e. exactly today's layout, with no
// gap left behind.

import { useLayoutEffect, useState, type RefObject } from 'react';

// A sanity bound, NOT a measurement of anything: no host furniture is a quarter
// of the screen tall (Twenty's bar is 65 of 812 — 8%). If the number comes back
// bigger than this, the flex chain that makes the hero's box fill its panel has
// broken, and a bar stranded in the middle of the screen over a dead strip is a
// worse failure than the overlap this file fixes. So an implausible reading
// degrades to 0 — today's behaviour — instead of being trusted.
const IMPLAUSIBLE_INSET_FRACTION = 0.25;

export const useHostBottomInset = (
  frameRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): number => {
  const [inset, setInset] = useState(0);

  useLayoutEffect(() => {
    const frame = frameRef.current;

    if (!enabled || frame === null) {
      setInset(0);
      return undefined;
    }

    const measure = () => {
      // documentElement.clientHeight, not window.innerHeight: for the root
      // element this is the viewport height EXCLUDING scrollbars, which is
      // exactly the box a fixed element's `bottom` is resolved against.
      // innerHeight includes them and would over-report by a horizontal
      // scrollbar's height.
      const viewportBottom = document.documentElement.clientHeight;
      const gap = Math.round(
        viewportBottom - frame.getBoundingClientRect().bottom,
      );
      const next =
        gap < 0 || gap > viewportBottom * IMPLAUSIBLE_INSET_FRACTION ? 0 : gap;

      setInset((previous) => (previous === next ? previous : next));
    };

    measure();

    // The hero's box is `flex: 1` inside a `100dvh` column, so anything that
    // matters here — the viewport resizing, the host's bar appearing or
    // disappearing, a banner opening above the page — changes this element's
    // height and reaches the observer. PhoneBar is `position: fixed` and so
    // contributes nothing to this element's size or scroll extent, which is why
    // moving the bar cannot feed the observer back into itself.
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    // Belt and braces for the one case the observer cannot see: a viewport
    // height change that the host's furniture absorbs exactly, leaving this
    // element the same size while the viewport bottom moved.
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [frameRef, enabled]);

  return inset;
};
