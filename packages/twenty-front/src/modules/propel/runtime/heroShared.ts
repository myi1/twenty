/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Propel runtime-loaded heroes — HOST BOOT MODULE
// ─────────────────────────────────────────────────────────────────────────────
//
// Runtime-loaded heroes (see HeroRoute.tsx) are built with every shared specifier
// EXTERNAL. Their bare imports resolve — via the page <script type="importmap"> —
// to one re-export SHIM per specifier under /propel-shims/*.js. Each shim reads its
// instance off `window.__propelShared[<specifier>]`.
//
// THIS module is what populates that global. It is imported from src/index.tsx
// BEFORE the React tree mounts (and therefore before any hero `import()` can run),
// so by the time a hero loads, `window.__propelShared` already holds the host's
// own bundled singletons. Sharing the SAME instances is what makes:
//   • React hooks work across the host/hero boundary (one React, one dispatcher),
//   • Mantine's context + portals work (one @mantine/core),
//   • dark mode work (one twenty-ui ThemeContext identity — CRITICAL),
//   • the hero's data/auth calls hit the host's callPropelRoute / getTokenPair.
//
// NOTHING here is hero-specific: it is the stable contract every hero depends on.
// Adding a new shared specifier = (1) import it here, (2) add it to SHARED_SPECIFIERS,
// (3) re-run `scripts/gen-hero-shims.mjs` (regenerates the shims + import map). The
// generator reads SHARED_SPECIFIERS-driven slugs from a sibling JSON it also writes.

// ── npm shared deps ──────────────────────────────────────────────────────────
import * as React from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactDom from 'react-dom';
import * as ReactDomClient from 'react-dom/client';
import * as MantineCore from '@mantine/core';
import * as MantineHooks from '@mantine/hooks';
import * as EmotionReact from '@emotion/react';
import EmotionStyled from '@emotion/styled';
import * as ReactRouterDom from 'react-router-dom';
import * as FramerMotion from 'framer-motion';

// ── twenty-ui shared (theme-constants is CRITICAL — shared ThemeContext identity) ─
import * as TwentyUiDisplay from 'twenty-ui/display';
import * as TwentyUiThemeConstants from 'twenty-ui/theme-constants';

// ── host-internal modules (shimmed so hero SOURCE stays unchanged) ────────────
import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import * as DialerCrmBridge from '@/dialer-dock/utils/dialerCrmBridge';
import * as HostConfig from '~/config';

// The exact bare specifier → module map exposed to heroes. The KEY is the string a
// hero writes in `import … from '<key>'`; the value is the host's loaded instance.
// `@emotion/styled` is a default-only CJS-ish module → wrap so the shim's
// `export default` resolves; everything else is exposed as its namespace object.
const SHARED: Record<string, unknown> = {
  // npm
  react: React,
  'react/jsx-runtime': ReactJsxRuntime,
  'react-dom': ReactDom,
  'react-dom/client': ReactDomClient,
  '@mantine/core': MantineCore,
  '@mantine/hooks': MantineHooks,
  '@emotion/react': EmotionReact,
  '@emotion/styled': { default: EmotionStyled },
  'react-router-dom': ReactRouterDom,
  'framer-motion': FramerMotion,
  // twenty-ui
  'twenty-ui/display': TwentyUiDisplay,
  'twenty-ui/theme-constants': TwentyUiThemeConstants,
  // host-internal (named-export modules wrapped so the generated shim re-exports
  // the SAME function/value the host uses)
  '@/apollo/utils/getTokenPair': { getTokenPair },
  '@/propel/lib/callPropelRoute': { callPropelRoute },
  '@/ui/layout/page/components/PageContainer': { PageContainer },
  '@/ui/layout/page/components/PageHeader': { PageHeader },
  '@/ui/feedback/snack-bar-manager/hooks/useSnackBar': { useSnackBar },
  '@/dialer-dock/utils/dialerCrmBridge': DialerCrmBridge,
  '~/config': HostConfig,
};

// Window.__propelShared is declared in src/modules/types/global.d.ts (canonical).

// Install ONCE. Idempotent so an accidental double-import (HMR, StrictMode) can't
// swap instances mid-flight. Must run before the first hero import() — guaranteed
// because src/index.tsx imports this module statically before root.render().
if (window.__propelShared === undefined) {
  window.__propelShared = SHARED;
}

export const PROPEL_SHARED = SHARED;

// The canonical specifier list. The shim generator derives the import map + one
// shim file per entry from this exact array (kept in sync via a JSON it emits).
export const SHARED_SPECIFIERS: readonly string[] = Object.keys(SHARED);
