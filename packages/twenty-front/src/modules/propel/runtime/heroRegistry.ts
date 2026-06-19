// ─────────────────────────────────────────────────────────────────────────────
// Propel runtime-loaded heroes — REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
//
// One entry per graduated hero. The `name` (the map KEY) is the bundle directory
// served at `${REACT_APP_HEROES_BASE_URL}/<name>/index.js` and the slug used in the
// router (`<HeroRoute name="listing-studio" />`). `displayName` is for fallback /
// error UI only.
//
// Migration status: only `listing-studio` loads at runtime today (the others still
// ride the in-bundle `lazy()` routes in useCreateAppRouter.tsx). As each hero is
// ported, swap its route to <HeroRoute name="…"/> and it joins the runtime path.

export type HeroName =
  | 'listing-studio'
  | 'marketing-hub'
  | 'campaign-builder'
  | 'sequence-editor'
  | 'one-on-one-runner'
  | 'social-calendar'
  | 'a2a-studio';

export type HeroDescriptor = {
  displayName: string;
};

export const HERO_REGISTRY: Record<HeroName, HeroDescriptor> = {
  'listing-studio': { displayName: 'Listing Studio' },
  'marketing-hub': { displayName: 'Marketing' },
  'campaign-builder': { displayName: 'Campaign Builder' },
  'sequence-editor': { displayName: 'Sequence Editor' },
  'one-on-one-runner': { displayName: '1:1 Runner' },
  'social-calendar': { displayName: 'Social Calendar' },
  'a2a-studio': { displayName: 'A2A Studio' },
};
