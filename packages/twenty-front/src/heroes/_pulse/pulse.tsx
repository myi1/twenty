/* eslint-disable @nx/enforce-module-boundaries */
// ═══════════════════════════════════════════════════════════════════════════
// PULSE — Nocturne Refined design system (hero-side shared foundation)
// ═══════════════════════════════════════════════════════════════════════════
// "The private bank for property" — DESIGN.md is the spec this file implements
// (source of truth; when a value here and DESIGN.md disagree, DESIGN.md wins).
// Approved visual: docs/superpowers/specs/design-mockup-nocturne-refined.html.
//
// Mirrored byte-for-byte across BOTH hero forks — see docs/superpowers/plans/
// 2026-07-11-nocturne-design-system-implementation.md Task 1.0/1.1. Edit
// DESIGN.md first, then re-mirror (diff -r must be clean).
//
// One brand, two registers (DESIGN.md §3):
//   • INSTRUMENT — daily work: dense, hairline grids, EASE.out at 140–200ms.
//   • BLOOM      — client-facing: air, Fraunces headlines, EASE.drawer sheets.
// Same tokens, same fonts, same accent, same easing — different air.
//
// Accent discipline (non-negotiable, §2.1): brass --p-accent is the ONLY
// chromatic accent in the chrome. Gold --p-accent-strong is money + hero
// numerals ONLY. Sage/amber/terracotta are status semantics ONLY. If you reach
// for a second hue, stop — the answer is brass, weight, or size.

import styled from '@emotion/styled';
import { Global, css } from '@emotion/react';
import type { CSSProperties, ReactNode } from 'react';

import { DUR, EASE, MOTION_VARS, propelPressable } from './motion';

// ── Fonts (DESIGN.md §2.2) — Fraunces · Hanken Grotesk · IBM Plex Mono ───────
// Self-hosted (was fonts.googleapis.com) — see index.html: external font CDNs
// get blocked and the fallback clips the layout. Served from our own origin.
export const PULSE_FONT_IMPORT_URL = '/fonts/fonts.css';

/** Display / headlines — serif, the "money moments" only. Never below 15px. */
export const FONT_DISPLAY = "'Fraunces', Georgia, 'Times New Roman', serif";
/** UI / body / labels — everything functional. */
export const FONT_UI =
  "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
/** Data / numerals / eyebrows / IDs — tabular. */
export const FONT_MONO =
  "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace";

/** Loads the Nocturne font trio. Render ONCE near the hero root. */
export function PulseFonts() {
  return (
    <Global
      styles={css`
        @import url('${PULSE_FONT_IMPORT_URL}');
      `}
    />
  );
}

// ── Token ledger (DESIGN.md §2.1 + mockup :root, verbatim) ───────────────────
// DARK is the hero register (default); LIGHT is "Riviera paper" — first-class
// for print-adjacent and bright-room use.
export const NOCTURNE_DARK_VARS = `
  --p-bg:            #14130E;
  --p-surface:       #1C1A13;
  --p-surface-2:     #232016;
  --p-ink:           #F4EEE0;
  --p-ink-2:         #C3BBA9;
  --p-line:          #322D22;
  --p-accent:        #C6A86C;  /* brass — the ONLY accent */
  --p-accent-strong: #E4C988;  /* gold — prices + hero numerals ONLY */
  --p-good:          #7F9B6E;  /* sage */
  --p-warn:          #D8B14E;
  --p-bad:           #C7513B;

  /* derived (DESIGN.md §2.1) */
  --p-accent-tint:   color-mix(in srgb, var(--p-accent) 12%, transparent);
  --p-focus-ring:    0 0 0 2px var(--p-bg), 0 0 0 4px var(--p-accent);
  --p-scrim:         rgba(10, 9, 6, 0.62);

  /* radius (§2.4) */
  --p-radius:        12px;
  --p-radius-sm:     8px;
  --p-radius-lg:     16px;
  --p-radius-pill:   999px;

  /* elevation (§2.5) — hairline system; shadows warm, low, rare */
  --p-shadow-sm:     0 1px 2px rgba(10,9,6,0.30);
  --p-shadow-pop:    0 8px 28px rgba(10,9,6,0.45);
  --p-shadow-sheet:  0 16px 48px rgba(10,9,6,0.55);

  /* register-specific derived tones (mockup) */
  --seal-new:        #6f97b4;
  --seal-view:       var(--p-good);
  --seal-nurt:       #8a8172;
  --stage-new:       #4b6f8a;
  --stage-nurt:      #6b6252;
  --avatar-bg:       linear-gradient(135deg, #3a3323, #2a2418);
  --primary-grad:    linear-gradient(180deg, #d3b676, var(--p-accent));
  --primary-grad-hov:linear-gradient(180deg, #dcc084, #cbad70);
  --primary-ink:     #201b10;
  --seal-ring:       rgba(0,0,0,0.15);
  --vignette:
    radial-gradient(1200px 700px at 78% -8%, rgba(198,168,108,0.06), transparent 60%),
    radial-gradient(900px 600px at 0% 100%, rgba(198,168,108,0.03), transparent 55%);
  --hero-grad:
    linear-gradient(180deg, rgba(20,19,14,0) 40%, rgba(20,19,14,0.72) 100%),
    linear-gradient(120deg, #7a5a2f 0%, #b98a48 30%, #d8ab5e 48%, #8f6a3a 66%, #43351f 100%);
  --hero-skyline:    rgba(20,19,14,0.55);
  --hero-glow:       radial-gradient(340px 150px at 74% 24%, rgba(255,232,178,0.55), transparent 70%);
  --hero-eyebrow:    #f3e6c8;
  --hero-price:      #fff4dc;
  --hero-from:       #e9dcc0;
  --sw-note:         rgba(255,255,255,0.7);
  ${MOTION_VARS}
`;

export const NOCTURNE_LIGHT_VARS = `
  --p-bg:            #F6F1E7;  /* bone — warm off-white, not stark white */
  --p-surface:       #FCF8F0;
  --p-surface-2:     #EFE8D9;
  --p-ink:           #2A2620;  /* espresso */
  --p-ink-2:         #6E6656;
  --p-line:          #E2D9C7;  /* hairlines that read on paper */
  --p-accent:        #A6844A;  /* brass, darkened for contrast on light */
  --p-accent-strong: #8A6A34;  /* gold-for-money, legible on light */
  --p-good:          #4F7A46;
  --p-warn:          #9A7A2E;
  --p-bad:           #B23A2A;

  --p-accent-tint:   color-mix(in srgb, var(--p-accent) 12%, transparent);
  --p-focus-ring:    0 0 0 2px var(--p-bg), 0 0 0 4px var(--p-accent);
  --p-scrim:         rgba(10, 9, 6, 0.62);

  --p-shadow-sm:     0 1px 2px rgba(10,9,6,0.10);
  --p-shadow-pop:    0 8px 28px rgba(10,9,6,0.16);
  --p-shadow-sheet:  0 16px 48px rgba(10,9,6,0.22);

  --seal-new:        #3f6b8c;
  --seal-view:       var(--p-good);
  --seal-nurt:       #8a7f66;
  --stage-new:       #4b6f8a;
  --stage-nurt:      #b8ab90;
  --avatar-bg:       linear-gradient(135deg, #efe6d2, #e4d8bf);
  --primary-grad:    linear-gradient(180deg, #b8965a, #A6844A);
  --primary-grad-hov:linear-gradient(180deg, #c2a166, #9d7c42);
  --primary-ink:     #fbf6ec;
  --seal-ring:       rgba(120,100,60,0.10);
  --vignette:
    radial-gradient(1200px 700px at 78% -8%, rgba(166,132,74,0.07), transparent 60%),
    radial-gradient(900px 600px at 0% 100%, rgba(166,132,74,0.04), transparent 55%);
  --hero-grad:
    linear-gradient(180deg, rgba(246,241,231,0) 44%, rgba(246,241,231,0.42) 100%),
    linear-gradient(120deg, #caa25f 0%, #e0b871 28%, #f0d091 48%, #cba25c 68%, #9a7538 100%);
  --hero-skyline:    rgba(80,58,26,0.30);
  --hero-glow:       radial-gradient(340px 150px at 74% 24%, rgba(255,244,214,0.55), transparent 72%);
  --hero-eyebrow:    #4a3a18;
  --hero-price:      #33260f;
  --hero-from:       #5c4a24;
  --sw-note:         rgba(20,19,14,0.62);
`;

// ── Root: declares the ledger + base typography ──────────────────────────────
// Dark (the hero register) is the DEFAULT; pass $light for Riviera paper.
// Theme rides a styling prop, NOT a data-theme attribute — the front-component
// sandbox drops undeclared attributes, and the prop pattern works everywhere.
export const PulseNocturne = styled.div<{ $light?: boolean }>`
  ${NOCTURNE_DARK_VARS}
  ${({ $light }) => ($light ? NOCTURNE_LIGHT_VARS : '')}
  font-family: ${FONT_UI};
  color: var(--p-ink);
  background: var(--p-bg);
  background-image: var(--vignette);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  height: 100%;
  position: relative;
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  ::selection {
    background: var(--p-accent-tint);
  }
`;

/** Token-only wrapper for EMBEDDED widgets — declares the ledger + text/font
 *  without PulseNocturne's full-panel chrome (no height/background takeover). */
export const PulseScope = styled.div<{ $light?: boolean }>`
  ${NOCTURNE_DARK_VARS}
  ${({ $light }) => ($light ? NOCTURNE_LIGHT_VARS : '')}
  font-family: ${FONT_UI};
  color: var(--p-ink);
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
`;

// Plain-string token refs for inline styles / SVG fills.
export const P = {
  bg: 'var(--p-bg)',
  surface: 'var(--p-surface)',
  surface2: 'var(--p-surface-2)',
  ink: 'var(--p-ink)',
  ink2: 'var(--p-ink-2)',
  line: 'var(--p-line)',
  accent: 'var(--p-accent)',
  accentStrong: 'var(--p-accent-strong)',
  accentTint: 'var(--p-accent-tint)',
  good: 'var(--p-good)',
  warn: 'var(--p-warn)',
  bad: 'var(--p-bad)',
  scrim: 'var(--p-scrim)',
  radius: 'var(--p-radius)',
  radiusSm: 'var(--p-radius-sm)',
  radiusLg: 'var(--p-radius-lg)',
  radiusPill: 'var(--p-radius-pill)',
  shadowSm: 'var(--p-shadow-sm)',
  shadowPop: 'var(--p-shadow-pop)',
  shadowSheet: 'var(--p-shadow-sheet)',
  fontDisplay: FONT_DISPLAY,
  fontUi: FONT_UI,
  fontMono: FONT_MONO,
} as const;

// ── Buttons (DESIGN.md §4) ───────────────────────────────────────────────────
// Primary = brass gradient on espresso ink. Secondary = surface fill + line
// border. Ghost = transparent. Every pressable presses (propelPressable);
// do NOT wire the press onto keyboard-submit paths.
export const Btn = styled.button<{
  variant?: 'primary' | 'secondary' | 'ghost';
}>`
  box-sizing: border-box;
  font-family: ${FONT_UI};
  font-weight: 600;
  font-size: 13.5px;
  cursor: pointer;
  border-radius: var(--p-radius-sm);
  padding: 9px 15px;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  ${propelPressable}
  &:focus-visible {
    outline: none;
    box-shadow: var(--p-focus-ring);
  }
  &:disabled {
    cursor: default;
    opacity: 0.55;
  }
  ${({ variant = 'primary' }) =>
    variant === 'primary'
      ? `background: var(--primary-grad); color: var(--primary-ink);
         @media (hover: hover) and (pointer: fine) {
           &:hover { background: var(--primary-grad-hov); }
         }`
      : variant === 'secondary'
        ? `background: var(--p-surface); border-color: var(--p-line); color: var(--p-ink);
           @media (hover: hover) and (pointer: fine) {
             &:hover { background: var(--p-surface-2); }
           }`
        : `background: transparent; color: var(--p-ink-2);
           @media (hover: hover) and (pointer: fine) {
             &:hover { color: var(--p-ink); background: var(--p-surface); }
           }`}
`;

// ── Inputs (DESIGN.md §4) ────────────────────────────────────────────────────
export const Input = styled.input`
  box-sizing: border-box;
  width: 100%;
  font-family: ${FONT_UI};
  font-size: 13.5px;
  color: var(--p-ink);
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius-sm);
  padding: 9px 12px;
  outline: none;
  transition: border-color ${DUR.tooltip}ms ${EASE.out},
    box-shadow ${DUR.tooltip}ms ${EASE.out};
  &::placeholder {
    color: var(--p-ink-2);
  }
  &:focus {
    border-color: var(--p-accent);
    box-shadow: var(--p-focus-ring);
  }
`;
export const Textarea = Input.withComponent('textarea');

// ── Status seals (DESIGN.md §4 — seals, NOT badges) ──────────────────────────
// 7px dot + plain-language label, soft dark ring. No filled pills, no
// UPPER_CASE. Dot color carries the semantic; color changes GLIDE, never snap.
export type SealTone = 'new' | 'qualified' | 'good' | 'nurture' | 'warn' | 'bad';

const SEAL_DOT: Record<SealTone, string> = {
  new: 'var(--seal-new)',
  qualified: 'var(--p-accent-strong)',
  good: 'var(--seal-view)',
  nurture: 'var(--seal-nurt)',
  warn: 'var(--p-warn)',
  bad: 'var(--p-bad)',
};

export function Seal({
  tone,
  label,
  style,
}: {
  tone: SealTone;
  /** Plain-language phrase — never an UPPER_CASE enum. */
  label: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontFamily: FONT_UI,
        fontSize: 12.5,
        fontWeight: 500,
        color: 'var(--p-ink-2)',
        ...style,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          flex: 'none',
          background: SEAL_DOT[tone],
          boxShadow: '0 0 0 3px var(--seal-ring)',
          transition: `background ${DUR.dropdown}ms ${EASE.out}`,
        }}
      />
      {label}
    </span>
  );
}

// ── Cards (DESIGN.md §4) ─────────────────────────────────────────────────────
// Prefer hairline separation over boxes-in-boxes. Hover lift gated behind
// hover capability. Interpolate `clickableCard` into a styled component.
export const clickableCard = `
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  cursor: pointer;
  transition: transform ${DUR.tooltip}ms ${EASE.out},
    border-color ${DUR.tooltip}ms ${EASE.out};
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--p-accent) 35%, var(--p-line));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    &:hover { transform: none; }
  }
`;

export const ClickableCard = styled.div`
  ${clickableCard}
`;

// ── Text primitives (DESIGN.md §2.2 type scale) ──────────────────────────────
/** Section eyebrow — Plex Mono uppercase, 10px, wide tracking. */
export const Eyebrow = styled.div`
  font-family: ${FONT_MONO};
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--p-ink-2);
`;

/** Page/section display — Fraunces. Serif is for the money moments only. */
export const Display = styled.div`
  font-family: ${FONT_DISPLAY};
  font-weight: 400;
  font-size: 29px;
  line-height: 1.1;
  letter-spacing: -0.01em;
  color: var(--p-ink);
`;

/** Money / KPI figure — gold tabular Plex (the ONLY place gold appears). */
export const Money = styled.span`
  font-family: ${FONT_MONO};
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--p-accent-strong);
`;

// ── KPI tiles (DESIGN.md §4) ─────────────────────────────────────────────────
// Plain-language label, gold Plex figure, small delta line. Separated by
// hairlines, not cards — lay tiles in a 1px-gap grid over a --p-line background.
export function KpiTile({
  label,
  figure,
  delta,
  deltaTone = 'flat',
  estimate,
  style,
}: {
  label: string;
  figure: ReactNode;
  delta?: ReactNode;
  deltaTone?: 'up' | 'flat';
  /** Estimates carry a small "est." qualifier (§5 rule 2 — no fake precision). */
  estimate?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div style={{ background: 'var(--p-surface)', padding: 14, ...style }}>
      <div
        style={{
          fontFamily: FONT_UI,
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--p-ink-2)',
          marginBottom: 6,
        }}
      >
        {label}
        {estimate ? (
          <span style={{ opacity: 0.7, marginLeft: 5 }}>est.</span>
        ) : null}
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontWeight: 500,
          fontSize: 27,
          lineHeight: 1,
          letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--p-accent-strong)',
        }}
      >
        {figure}
      </div>
      {delta !== undefined ? (
        <div
          style={{
            fontFamily: FONT_UI,
            fontSize: 11.5,
            marginTop: 6,
            color: deltaTone === 'up' ? 'var(--p-good)' : 'var(--p-ink-2)',
          }}
        >
          {delta}
        </div>
      ) : null}
    </div>
  );
}

// ── Drawer chrome (DESIGN.md §4 — bloom sheets) ──────────────────────────────
// Right drawers ride EASE.drawer: enter DUR.drawerIn, exit DUR.drawerOut
// (exit always faster). Backdrop = --p-scrim. Transform + opacity only.
export const DRAWER_CHROME = {
  backdrop: 'var(--p-scrim)',
  enterTransition: `transform ${DUR.drawerIn}ms ${EASE.drawer}, opacity ${DUR.drawerIn}ms ${EASE.drawer}`,
  exitTransition: `transform ${DUR.drawerOut}ms ${EASE.drawer}, opacity ${DUR.drawerOut}ms ${EASE.drawer}`,
  panel: `
    background: var(--p-surface);
    border-left: 1px solid var(--p-line);
    box-shadow: var(--p-shadow-sheet);
  `,
} as const;
