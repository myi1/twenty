// ─────────────────────────────────────────────────────────────────────────────
// Propel runtime-loaded heroes — REGISTRY (derived from the nav config)
// ─────────────────────────────────────────────────────────────────────────────
//
// The hero set (bundle names + display names + routes) now lives in ONE place:
// the runtime nav config (propelNavConfig.ts → DEFAULT_NAV_CONFIG, overridable by
// the host-mounted nav.config.json). This module is a thin lookup over it so the
// rest of the runtime-hero code (HeroRoute's error UI, etc.) keeps a stable API.
//
// `name` (the bundle name) is the directory served at
// `${REACT_APP_HEROES_BASE_URL}/<name>/index.js` and the slug used in the router
// (`<HeroRoute name="listing-studio" />`). Adding a hero is now a config-only
// change — add an entry to the nav config and BOTH its nav item and its route
// pick it up, no edit here required.

import {
  DEFAULT_NAV_CONFIG,
  getPropelNavConfig,
} from '@/propel/runtime/propelNavConfig';

// The known-at-build-time bundle names. Kept as a type for the routes that name
// heroes literally in TSX (useCreateAppRouter); runtime-added heroes are still
// fine because HeroRoute accepts any string name.
export type HeroName =
  | 'inbox'
  | 'listing-studio'
  | 'marketing-hub'
  | 'campaign-builder'
  | 'sequence-editor'
  | 'one-on-one-runner'
  | 'social-calendar'
  | 'a2a-studio';

// Look up a hero's display name (for the loading / error UI). Reads the live nav
// config first (so a mounted relabel is reflected), then the baked default,
// finally the bundle name itself.
export const getHeroDisplayName = (name: string): string => {
  const fromLive = getPropelNavConfig().entries.find(
    (entry) => entry.bundle === name,
  )?.label;
  if (fromLive !== undefined) {
    return fromLive;
  }
  const fromDefault = DEFAULT_NAV_CONFIG.entries.find(
    (entry) => entry.bundle === name,
  )?.label;
  return fromDefault ?? name;
};
