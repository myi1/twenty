// styles.ts: Emotion primitives for the lead page hero, riding the Pulse Nocturne
// token ledger (see ../_pulse/pulse.tsx). One border OR one shadow per element,
// never both; no coloured side-stripe borders (project craft rule).

import styled from '@emotion/styled';
import { NOCTURNE_LIGHT_VARS, PulseNocturne, FONT_UI } from '../_pulse/pulse';

// THE SCROLL MODEL. The host gives this hero a box it cannot grow out of:
// PagePanel (ui/layout/page/components/PagePanel.tsx) is `height: 100%` with
// `overflow-y: hidden`, so anything taller than the panel is CLIPPED and
// unreachable — no scrollbar, no wheel, nothing. Every hero owns its own
// scrolling; this one never did, which is why a short window put the end of the
// rail (and, after Story's opening scroll-to-newest, the header itself) out of
// reach. My Desk solves the same problem the same way (heroes/my-desk/index.tsx:
// `<PageContainer style={{ flex: 1, minHeight: 0 }}>` wrapping a Nocturne that
// carries `flex: 1; minHeight: 0; overflowY: 'auto'`); this file follows it.
//
// `flex: 1; min-height: 0` is what makes the chain end here rather than
// overflowing the panel: index.tsx puts the same pair on PageContainer, so this
// element is exactly the panel's height, and everything below is measured
// against a real number instead of against its own content.
//
// DESKTOP: this box does not scroll — it is the frame. The header is a fixed
// row inside it and each column scrolls on its own (see Columns, Rail,
// StoryList). `overflow: hidden` is the guard that keeps that true: nothing can
// quietly push past the frame and become unreachable again. It clips nothing
// real — every menu, popover and the outcome Drawer are Mantine portals, which
// mount at <body> and never enter this box.
//
// WHY FLEX AND NOT `position: sticky`. Sticky fails silently under an ancestor
// with `overflow: hidden/auto/scroll` — no error, nothing in the console,
// invisible to tsc and to the bundler — and PagePanel, an ancestor this hero
// cannot edit, is exactly that. A sticky header would also stay INSIDE the
// scrolling content, so the story would slide under it and it would need an
// opaque background it does not have today, which is a visual change this fix
// has no business making. A flex frame with dedicated scrolling children states
// the same intent as a layout fact instead of a scroll-position effect, and
// there is no ancestor chain that can quietly switch it off.
//
// PHONE: one page scroll, as before. Independent columns are meaningless when
// Columns is a single column, and a pinned composer would fight the fixed
// PhoneBar below it, so this box becomes the one scroller and the whole page
// moves under it. PhoneBar stays put regardless: it is `position: fixed`, and
// an overflow ancestor neither clips it nor scrolls it (only a transform /
// filter / contain ancestor would, and nothing here introduces one).
export const LeadNocturne = styled(PulseNocturne)<{ $phone: boolean }>`
  html[data-mantine-color-scheme='light'] & {
    ${NOCTURNE_LIGHT_VARS}
  }
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  font-family: ${FONT_UI};
  color: var(--p-ink);
  background: var(--p-bg);
  ${(p) => (p.$phone ? 'overflow-y: auto;' : 'overflow: hidden;')}
`;

// DESKTOP: the row that fills whatever the header leaves, and no more.
// `grid-template-rows: minmax(0, 1fr)` is load-bearing — a default `1fr` row is
// `minmax(auto, 1fr)`, whose auto floor is the CONTENT height, so the row would
// grow to fit the longest column and the scrollbars below would never engage.
// `minmax(0, 1fr)` pins the row to the space available; `& > *` then lifts the
// same auto floor off the two columns themselves so each can be shorter than
// its content and scroll instead.
//
// The desktop bottom padding is 24px, not the 96px it shares with phone. That
// 96px is PhoneBar clearance (styles.ts:PhoneBar is `position: fixed` at the
// bottom on phone only) and it read as harmless trailing space back when the
// whole page was one long column. Against a fixed frame it is no longer
// trailing anything: it would be a permanent 96px dead band under the columns,
// on every window — 16% of the 600px-tall window this fix exists for. 24px is
// the horizontal gutter of this very rule, so the frame is evenly inset and no
// new number enters the page. The phone branch below is untouched: there the
// page still scrolls as one and the 96px still clears the bar.
//
// The 96px is now doing MORE work than it was, and still enough of it. While
// PhoneBar sat at `bottom: 0` it hung mostly outside this scroller — down over
// Twenty's own nav bar — and covered only the last ~4px of it, so almost all of
// the 96px was slack. Lifting the bar to the bottom of the hero's box (see
// PhoneBar below) puts its full 68px inside the scroller, and 96 - 68 leaves
// 28px of real clearance between the last line of content and the bar. Measured
// in a harness of the live DOM chain at 375x812: last content ends at y=651,
// the bar starts at y=679. So it stays 96 — a smaller number would be the one
// that needed arguing for.
// RAIL WIDTH (2026-09-19). It was a hard `320px` at every desktop width — 22% of a
// 1440 laptop, 12% of a 27" monitor, and the story column absorbed the rest. A form
// does not get more readable as the screen grows, but it should stop being a ribbon:
// `clamp` gives it a floor it can never drop below, a share of the viewport in the
// middle, and a ceiling past which extra width would only lengthen the line measure.
//
// WIDE (>=1600px) widens the ceiling and Rail goes two-up inside it (see Rail), which
// is what actually uses a large monitor: the SAME form at half the scroll length.
// Splitting the story into a second column was considered and rejected — the story is
// one chronological narrative and fragmenting it by source would cost more than the
// space it won.
//
// COLLAPSED is a 56px icon strip: an agent who is only talking gives the conversation
// the whole window and expands again in one click. The choice is remembered per agent.
export const RAIL_COLLAPSED_PX = 56;

export const Columns = styled.div<{ $phone: boolean; $railCollapsed?: boolean }>`
  display: grid;
  gap: 20px;
  padding: 0 24px 24px;
  grid-template-columns: ${(p) =>
    p.$phone
      ? '1fr'
      : p.$railCollapsed
        ? `${RAIL_COLLAPSED_PX}px minmax(0, 1fr)`
        : 'clamp(280px, 24vw, 420px) minmax(0, 1fr)'};

  ${(p) =>
    p.$phone || p.$railCollapsed
      ? ''
      : `
    @media (min-width: 1600px) {
      grid-template-columns: clamp(360px, 26vw, 560px) minmax(0, 1fr);
    }
  `}
  ${(p) =>
    p.$phone
      ? // Clearance for the two fixed things below the story: PhoneBar (68px) and the
        // qualification sheet resting at its peek height (52px), plus 16px so the last
        // message is not flush against the handle. 68 + 52 + 16 = 136. It was 96 when
        // the bar was the only fixed element; leaving it there would put the last
        // message permanently under the sheet handle.
        'padding: 0 12px 136px;'
      : `
    flex: 1;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr);

    & > * {
      min-height: 0;
    }
  `}
`;

// Reference material you consult, scrolling on its own so reading the deal
// fields and every ad-form answer never drags the conversation along with it.
//
// `overscroll-behavior: contain` on purpose: at the end of the rail there is
// nothing above to chain to (the frame does not scroll on desktop and the story
// is a sibling, not an ancestor), so the only thing chaining could reach is the
// browser itself — a rubber-band bounce of the whole CRM at the end of a short
// list. `contain` stops that at this box. It costs nothing here because the
// gesture has nowhere legitimate to continue TO; the case where containment
// really would trap the wheel is a scroller nested inside a scrolling PAGE, and
// on phone this rule is not emitted at all.
export const Rail = styled.aside<{ $phone: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  ${(p) =>
    p.$phone
      ? ''
      : `
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;

    /* A large monitor should shorten the form, not stretch it. Two-up only once
       there is room for two readable columns; align-content: start so a short
       group does not stretch to match a tall neighbour. */
    @media (min-width: 1600px) {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-content: start;
      column-gap: 18px;
    }
  `}
`;

// The collapse control. Lives in the rail's own header row so it is where the thing
// it collapses is, and keeps a full 44px touch target even though the glyph is small.
export const RailToggle = styled.button`
  appearance: none;
  border: 1px solid var(--p-line);
  background: var(--p-surface);
  color: var(--p-ink-2);
  border-radius: 8px;
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease;

  &:hover {
    background: var(--p-surface-2);
    color: var(--p-ink);
  }

  &:focus-visible {
    outline: 2px solid var(--p-accent);
    outline-offset: 2px;
  }
`;

// When collapsed the rail is a strip: the toggle, and nothing else competing for it.
export const RailStrip = styled.aside`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding-top: 2px;
  min-width: 0;
`;

export const Group = styled.section`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const GroupTitle = styled.h3`
  margin: 0;
  font: 600 12px/1 ${FONT_UI};
  letter-spacing: 0.04em;
  color: var(--p-ink-2);
`;

export const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 36px;
  font-size: 13px;
`;

export const Pill = styled.span<{ $tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: var(--p-radius-pill);
  font-size: 12px;
  font-weight: 600;
  background: ${(p) =>
    p.$tone === 'good'
      ? 'color-mix(in oklab, var(--p-good) 16%, transparent)'
      : p.$tone === 'warn'
        ? 'color-mix(in oklab, var(--p-warn) 18%, transparent)'
        : p.$tone === 'bad'
          ? 'color-mix(in oklab, var(--p-bad) 16%, transparent)'
          : p.$tone === 'accent'
            ? 'var(--p-accent-tint)'
            : 'var(--p-surface-2)'};
  color: ${(p) =>
    p.$tone === 'good'
      ? 'var(--p-good)'
      : p.$tone === 'warn'
        ? 'var(--p-warn)'
        : p.$tone === 'bad'
          ? 'var(--p-bad)'
          : p.$tone === 'accent'
            ? 'var(--p-accent-strong)'
            : 'var(--p-ink)'};
`;

// RETIRED 2026-09-19: PhoneTabs / PhoneTab.
// Facts and Story were mutually exclusive tabs, so an agent filling the qualification
// form could not see the message they were answering. The form is a drag-up sheet over
// the conversation now (Sheet, below) and the tabs have no caller. Deleted rather than
// left dangling: an unused export is an invitation to bring the split back.


// The three actions, pinned. `position: fixed` and not `sticky`: fixed keeps the
// bar in place on a lead SHORT enough not to scroll, where a sticky last child
// would simply sit wherever the content happened to end, halfway up the screen.
//
// `bottom` is NOT 0. It used to be, and that put this bar in the same strip as
// Twenty's own mobile navigation bar, whose z-index (1001) beat this one's —
// its icons sat on the WhatsApp button. $inset is how far the bottom of the
// hero's box is above the viewport's, measured at runtime by
// useHostBottomInset.ts (read that file for why it measures the hole rather
// than the bar). On phone with Twenty's bar present that is 65px; with no host
// furniture it is ~0 and this is exactly the old `bottom: 0`.
//
// The safe-area padding is REDUCED BY THE SAME NUMBER, and this is the reason:
// env(safe-area-inset-bottom) is the home indicator's strip at the bottom of the
// VIEWPORT, so once the bar is sitting $inset px up, only the part of that strip
// still under the bar needs clearing — none of it, once $inset exceeds the
// indicator. Keeping the full value would pad ~34px of dead space onto a bar
// that is nowhere near the indicator; dropping it outright would un-clear the
// bar in the case where $inset really is 0. max(0px, …) is both at once.
// The floating call / WhatsApp / note launchers (modules/dialer-dock, whatsapp-dock)
// are `position: fixed` overlays parked against the RIGHT edge, and they sit ON TOP of
// this bar: on a phone the call launcher landed squarely over "Log outcome" — the one
// button that actually clears the agent's call task, and the one the assignment WhatsApp
// tells them to press. Reported from a handset 2026-09-18.
//
// The gutter is reserved HERE rather than moving the dock for two reasons. The dock is
// user-draggable with a position persisted per browser, so there is no fixed geometry to
// design against — only the corner it rests in by default. And the dock lives in
// modules/**, which is core front: changing it costs a full engine image build, while
// this hero rebuilds on its own. A reserved gutter costs an agent nothing if they later
// drag the dock elsewhere; a covered primary action costs them the task.
//
// 68px, measured against the dock rather than guessed: DialerDock's
// DEFAULT_DOCK_POSITION is { right: 14, bottom: 72 } and its launcher is 44px wide, so
// the dock owns the last 58px of the row at rest. 68 clears it with 10px of daylight.
const DOCK_GUTTER_PX = 68;

export const PhoneBar = styled.div<{ $inset: number }>`
  position: fixed;
  left: 0;
  right: 0;
  bottom: ${(p) => p.$inset}px;
  display: grid;
  /* Call · WhatsApp · Log outcome · Close. The fourth column is narrower than the
     rest: its label is one short word, and Log outcome must not lose room for it. */
  grid-template-columns: 1fr 1fr 1.4fr 0.85fr;
  gap: 8px;
  /* Landscape adds a side notch and a home indicator the bar must sit clear of; the
     right inset rides on top of the dock gutter rather than replacing it, because in
     landscape BOTH the dock and the notch are over there. */
  padding: 10px calc(${DOCK_GUTTER_PX}px + env(safe-area-inset-right))
    ${(p) =>
      `calc(10px + max(0px, env(safe-area-inset-bottom) - ${p.$inset}px))`}
    calc(12px + env(safe-area-inset-left));
  background: var(--p-surface);
  box-shadow: var(--p-shadow-pop);
  z-index: 20;

  & > button {
    min-height: 48px;
  }
`;

// The story scrolls; the composer under it does not. On desktop this takes the
// height the composer leaves (`flex: 1`, `min-height: 0`) and scrolls inside it,
// which is what keeps StoryComposer pinned to the bottom of the STORY COLUMN —
// you are replying to what you are reading, and it is the most common action on
// the page, so it must never scroll away. `overscroll-behavior` as on Rail.
// On phone this is a plain block again and the page scrolls as one.
export const StoryList = styled.div<{ $phone: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  ${(p) =>
    p.$phone
      ? ''
      : `
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  `}
`;

// 12px, not the 11px an earlier draft had. This page is read on a phone, often at
// night, and the day separator is what an agent scans to find "what happened when".
// The repo has 11px meta labels elsewhere, but our own floor is 12 and it costs nothing.
export const DaySep = styled.div`
  text-align: center;
  font: 600 12px ${FONT_UI};
  letter-spacing: 0.04em;
  color: var(--p-ink-2);
  padding: 8px 0;
`;

export const QuietRow = styled.div`
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 10px;
  font-size: 13px;
  color: var(--p-ink-2);

  & b {
    color: var(--p-ink);
    font-weight: 500;
  }
`;

export const CallCard = styled.div`
  padding: 12px 14px;
  border-radius: var(--p-radius);
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  font-size: 13px;
`;

export const BurstRow = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--p-radius);
  background: var(--p-surface-2);
  color: var(--p-ink);
  font: 500 13px ${FONT_UI};
  cursor: pointer;
  text-align: left;
`;

export const Bubble = styled.div<{ $out: boolean }>`
  max-width: 78%;
  align-self: ${(p) => (p.$out ? 'flex-end' : 'flex-start')};
  padding: 8px 12px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.4;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: ${(p) => (p.$out ? 'color-mix(in oklab, #25d366 22%, var(--p-surface))' : 'var(--p-surface)')};
  border: 1px solid var(--p-line);
`;

export const Skeleton = styled.div`
  height: 14px;
  border-radius: 7px;
  background: var(--p-surface-2);
  animation: pulse 1.2s ease-in-out infinite;

  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
`;

// ── Phone: the qualification sheet ───────────────────────────────────────────
//
// It used to be a TAB. Facts and Story were mutually exclusive, so an agent filling
// the form could not read what the client had just said — they flipped back, read,
// flipped forward, and typed from memory. A sheet fixes exactly that: the
// conversation stays on screen and the form is dragged up over it as far as the
// agent wants.
//
// Three heights, not two: PEEK is a handle only (the conversation is the page),
// HALF leaves the last few messages visible while typing — the position this whole
// change exists for — and FULL is for working through the form in one pass. The
// chosen height is REMEMBERED per agent, so an agent who always works at HALF finds
// it at HALF, and one who rarely opens it is never given a form they did not ask for.
export const SHEET_PEEK_PX = 52;

export const SheetScrim = styled.div<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  opacity: ${(p) => (p.$open ? 1 : 0)};
  pointer-events: ${(p) => (p.$open ? 'auto' : 'none')};
  transition: opacity 200ms ease;
  z-index: 18;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

// `$bottom` is the PhoneBar's height: the sheet stops above it so Call / WhatsApp /
// Log outcome are reachable at every height — the actions must never be the thing
// the form covers.
export const Sheet = styled.section<{ $height: number; $bottom: number; $dragging: boolean }>`
  position: fixed;
  left: 0;
  right: 0;
  bottom: ${(p) => p.$bottom}px;
  height: ${(p) => p.$height}px;
  display: flex;
  flex-direction: column;
  background: var(--p-surface);
  border-top: 1px solid var(--p-line);
  border-radius: 14px 14px 0 0;
  box-shadow: var(--p-shadow-pop);
  z-index: 19;
  /* No transition while the finger is down, or the sheet lags behind it. */
  transition: ${(p) => (p.$dragging ? 'none' : 'height 220ms cubic-bezier(0.2, 0, 0, 1)')};
  will-change: height;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

// The grab area. 44px tall in its own right — the visible grip is 4px, but a 4px
// touch target is not a touch target.
export const SheetHandle = styled.button`
  appearance: none;
  border: 0;
  background: transparent;
  width: 100%;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px 2px;
  cursor: grab;
  touch-action: none;
  color: var(--p-ink-2);
  font: inherit;

  &:active {
    cursor: grabbing;
  }

  &:focus-visible {
    outline: 2px solid var(--p-accent);
    outline-offset: -2px;
  }

  &::before {
    content: '';
    width: 36px;
    height: 4px;
    border-radius: 999px;
    background: var(--p-line-strong, var(--p-line));
  }
`;

export const SheetLabel = styled.span`
  font-size: 12px;
  letter-spacing: 0.02em;
`;

export const SheetBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* The sheet is a scroller inside a scrolling page: containment here is what stops
     a flick at the end of the form from scrolling the conversation behind it. */
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 4px 12px 16px;
`;
