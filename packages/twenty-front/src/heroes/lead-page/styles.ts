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
export const Columns = styled.div<{ $phone: boolean }>`
  display: grid;
  gap: 20px;
  padding: 0 24px 24px;
  grid-template-columns: ${(p) => (p.$phone ? '1fr' : '320px minmax(0, 1fr)')};
  ${(p) =>
    p.$phone
      ? 'padding: 0 12px 96px;'
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
  `}
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

export const PhoneTabs = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 0 12px 12px;
  border-bottom: 1px solid var(--p-line);
`;

export const PhoneTab = styled.button<{ $active: boolean }>`
  min-height: 44px;
  border: 0;
  background: transparent;
  font: 600 14px ${FONT_UI};
  color: ${(p) => (p.$active ? 'var(--p-ink)' : 'var(--p-ink-2)')};
  box-shadow: ${(p) => (p.$active ? 'inset 0 -2px 0 var(--p-accent)' : 'none')};
  cursor: pointer;
`;

export const PhoneBar = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: 1fr 1fr 1.4fr;
  gap: 8px;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
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
