/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Propel runtime nav config — THE NAV FAST-PATH (Taskmaster #74)
// ─────────────────────────────────────────────────────────────────────────────
//
// WHAT THIS IS
// The Propel hero sidebar nav (labels, icons, order, route paths, which heroes
// are even shown) used to be HARDCODED in NavigationDrawerOtherSection.tsx +
// useCreateAppRouter.tsx. Relabeling / reordering / adding a hero's nav link
// therefore needed a full engine image rebuild (~10 min) — the same pain that
// hero CONTENT already escaped via the runtime-loaded-heroes mechanism.
//
// This module makes the nav CONFIG-DRIVEN AT RUNTIME, exactly like hero content:
// the nav entries are read from a JSON file served from the SAME host-mounted
// heroes volume the hero bundles live in. So a future nav edit is:
//
//     edit  <heroes-mount>/nav.config.json   (prod: the Coolify heroes dir;
//                                              staging: ~/twenty-staging/heroes)
//     → browser hard-refresh. NO rebuild, NO redeploy.
//
// HOW IT'S SOURCED (mounted JSON, NOT an env blob — chosen so nav edits never
// need a rebuild and so the file lives next to the heroes it describes):
//   GET `${REACT_APP_HEROES_BASE_URL || '/heroes'}/nav.config.json`
// REACT_APP_HEROES_BASE_URL is already injected into window._env_ by the server's
// generate-front-config.ts and already points at the heroes mount, so the config
// file rides the exact same rebuild-free volume as `<hero>/index.js`.
//
// SYNC-RENDER SAFETY
// The nav drawer and the router render SYNCHRONOUSLY and cannot await a fetch.
// So this module ships a baked DEFAULT_NAV_CONFIG (the current live nav, with
// correct labels — this is what fixes the garbled-label bug, TM#14) that is
// returned synchronously from the very first render. loadPropelNavConfigOnce()
// (kicked off at boot from index.tsx) fetches the mounted JSON in the background;
// when it resolves, the merged config replaces the cache and subscribers
// (the nav drawer) re-render. If the file is absent / malformed / 404, the baked
// default stands and nothing regresses.
//
// Adding a hero is then a config-only change: add an entry here (or in the
// mounted JSON) with its route + bundle name, and BOTH the nav item AND the
// route registration pick it up (routes register unconditionally and simply 404
// when the entry is nav-hidden, preserving the existing behavior).

import { AppPath } from 'twenty-shared/types';

// ── Schema ──────────────────────────────────────────────────────────────────
//
// One entry per Propel hero nav slot. `icon` is a STRING name resolved against
// twenty-ui/display at render time (resolvePropelNavIcon), so the mounted JSON
// can name any Tabler icon without a code change. `route` is an AppPath string
// (the literal path, e.g. '/marketing') — string-valued so the JSON is portable
// and not coupled to the TS enum. `bundle` is the runtime-loaded hero bundle
// name (the `<HeroRoute name>` slug + the `/heroes/<bundle>/index.js` dir).

export type PropelNavEntry = {
  // Stable identity for the entry (also the React key). Unique within the config.
  key: string;
  // The sidebar label shown to the user. Plain string (the CRM is English-only
  // and these strings are absent from the Lingui catalog — see the nav drawer).
  label: string;
  // Tabler icon name from twenty-ui/display, e.g. 'IconBroadcast'. Resolved to
  // the component at render; falls back to IconCircleDot if unknown.
  icon: string;
  // The route path this entry navigates to (an AppPath value, as a string).
  route: string;
  // The runtime-loaded hero bundle name (HeroRoute `name` + heroes-volume dir).
  // The route is registered as `<HeroRoute name={bundle} />`.
  bundle: string;
  // Whether this entry shows in the sidebar. A disabled entry's ROUTE still
  // registers (so deep-links resolve) — it just has no nav item. Mirrors the
  // long-standing "a2a-studio / social-calendar have routes but no nav item".
  enabled: boolean;
  // Sort order in the sidebar (ascending). Ties broken by array position.
  order: number;
};

export type PropelNavConfig = {
  // Optional schema marker for forward-compat; ignored today.
  version?: number;
  // The ordered hero nav entries.
  entries: PropelNavEntry[];
};

// ── Baked default (the current live nav) ───────────────────────────────────
//
// This is the source of truth when no mounted nav.config.json is present, and
// the synchronous value the nav/router see on first render. Keep it in sync with
// what we want shipped by default. Labels here are the CORRECT human labels —
// this is the fix for TM#14 (the macro previously rendered hashed message ids).
//
// `enabled: false` entries register their route (deep-links resolve) but show no
// nav item — matching the prior hand-written behavior:
//   • social-calendar  → folded into the Marketing hero's "Social" tab (#41)
//   • a2a-studio       → only meaningful opened from an opportunity
//   • campaign-builder → opened from within Marketing, not a top-level nav slot
//   • sequence-editor  → opened from within Marketing, not a top-level nav slot

export const DEFAULT_NAV_CONFIG: PropelNavConfig = {
  version: 1,
  entries: [
    {
      key: 'inbox',
      label: 'Inbox',
      icon: 'IconInbox',
      route: AppPath.Inbox,
      bundle: 'inbox',
      enabled: true,
      order: 10,
    },
    {
      key: 'marketing-hub',
      label: 'Marketing',
      icon: 'IconBroadcast',
      route: AppPath.MarketingHub,
      bundle: 'marketing-hub',
      enabled: true,
      order: 20,
    },
    {
      key: 'one-on-one-runner',
      label: 'Weekly 1:1',
      icon: 'IconUsers',
      route: AppPath.OneOnOneRunner,
      bundle: 'one-on-one-runner',
      enabled: true,
      order: 30,
    },
    {
      key: 'listing-studio',
      label: 'Listing Studio',
      icon: 'IconBuildingSkyscraper',
      route: AppPath.ListingStudio,
      bundle: 'listing-studio',
      enabled: true,
      order: 40,
    },
    {
      key: 'settings-hub',
      label: 'Settings',
      icon: 'IconSettings',
      route: AppPath.SettingsHub,
      bundle: 'settings-hub',
      enabled: true,
      order: 90,
    },
    // ── route-only entries (no sidebar item; deep-links still resolve) ──
    {
      key: 'campaign-builder',
      label: 'Campaign Builder',
      icon: 'IconBroadcast',
      route: AppPath.MarketingCampaignBuilder,
      bundle: 'campaign-builder',
      enabled: false,
      order: 50,
    },
    {
      key: 'sequence-editor',
      label: 'Sequence Editor',
      icon: 'IconBroadcast',
      route: AppPath.MarketingSequenceEditor,
      bundle: 'sequence-editor',
      enabled: false,
      order: 60,
    },
    {
      key: 'social-calendar',
      label: 'Social',
      icon: 'IconCalendar',
      route: AppPath.MarketingSocialCalendar,
      bundle: 'social-calendar',
      enabled: false,
      order: 70,
    },
    {
      key: 'a2a-studio',
      label: 'A2A Studio',
      icon: 'IconBuildingSkyscraper',
      route: AppPath.A2AStudio,
      bundle: 'a2a-studio',
      enabled: false,
      order: 80,
    },
  ],
};

// ── Runtime cache + subscription ────────────────────────────────────────────
//
// `currentConfig` is what getPropelNavConfig() returns synchronously. It starts
// as the baked default and is swapped to the merged (default ∪ mounted) config
// once the fetch resolves. A tiny pub/sub lets useSyncExternalStore subscribers
// (the nav drawer) re-render when the swap happens — without pulling in jotai/
// redux for a single global value.

let currentConfig: PropelNavConfig = DEFAULT_NAV_CONFIG;
let loadStarted = false;
const listeners = new Set<() => void>();

const emitChange = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const getPropelNavConfig = (): PropelNavConfig => currentConfig;

export const subscribePropelNavConfig = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// The heroes base URL — IDENTICAL resolution to HeroRoute.heroesBaseUrl(), so the
// nav config file always lives alongside the hero bundles on the same mount.
const heroesBaseUrl = (): string =>
  window._env_?.REACT_APP_HEROES_BASE_URL ||
  import.meta.env.REACT_APP_HEROES_BASE_URL ||
  '/heroes';

// Validate + normalize a single raw entry from the mounted JSON. Returns null if
// the entry is missing required fields (it's then skipped, not fatal).
const normalizeEntry = (raw: unknown): PropelNavEntry | null => {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const key = typeof r.key === 'string' ? r.key : undefined;
  const label = typeof r.label === 'string' ? r.label : undefined;
  const route = typeof r.route === 'string' ? r.route : undefined;
  const bundle = typeof r.bundle === 'string' ? r.bundle : undefined;
  if (
    key === undefined ||
    label === undefined ||
    route === undefined ||
    bundle === undefined
  ) {
    return null;
  }
  return {
    key,
    label,
    route,
    bundle,
    icon: typeof r.icon === 'string' ? r.icon : 'IconCircleDot',
    enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
    order: typeof r.order === 'number' ? r.order : 999,
  };
};

// Merge the mounted config over the baked default: entries are matched by `key`.
// A mounted entry overrides the default of the same key (partial overrides are
// applied field-by-field); a mounted entry with a new key is appended. Default
// entries not mentioned in the mounted config are preserved. This means a nav
// edit can be as small as "{ key: 'marketing-hub', label: 'Campaigns' }" while
// every other entry keeps its baked values.
const mergeConfig = (raw: unknown): PropelNavConfig => {
  if (typeof raw !== 'object' || raw === null) {
    return DEFAULT_NAV_CONFIG;
  }
  const rawEntries = (raw as Record<string, unknown>).entries;
  if (!Array.isArray(rawEntries)) {
    return DEFAULT_NAV_CONFIG;
  }

  const byKey = new Map<string, PropelNavEntry>();
  for (const entry of DEFAULT_NAV_CONFIG.entries) {
    byKey.set(entry.key, { ...entry });
  }

  for (const rawEntry of rawEntries) {
    // Partial override: only overwrite the fields actually provided, so a mounted
    // entry can supply just `{ key, label }` and keep the baked icon/route/etc.
    if (typeof rawEntry === 'object' && rawEntry !== null) {
      const r = rawEntry as Record<string, unknown>;
      const key = typeof r.key === 'string' ? r.key : undefined;
      if (key !== undefined && byKey.has(key)) {
        const base = byKey.get(key)!;
        byKey.set(key, {
          ...base,
          ...(typeof r.label === 'string' ? { label: r.label } : {}),
          ...(typeof r.icon === 'string' ? { icon: r.icon } : {}),
          ...(typeof r.route === 'string' ? { route: r.route } : {}),
          ...(typeof r.bundle === 'string' ? { bundle: r.bundle } : {}),
          ...(typeof r.enabled === 'boolean' ? { enabled: r.enabled } : {}),
          ...(typeof r.order === 'number' ? { order: r.order } : {}),
        });
        continue;
      }
    }
    // New entry (key not in default): must be fully formed.
    const normalized = normalizeEntry(rawEntry);
    if (normalized !== null) {
      byKey.set(normalized.key, normalized);
    }
  }

  const version = (raw as Record<string, unknown>).version;
  return {
    version: typeof version === 'number' ? version : DEFAULT_NAV_CONFIG.version,
    entries: [...byKey.values()],
  };
};

// Fetch the mounted nav config ONCE (idempotent). Called at boot from index.tsx,
// before/independent of render. On success it swaps the cache and notifies
// subscribers; on any failure (no file, 404, bad JSON) it silently keeps the
// baked default. Never throws — a missing config must not break the app.
export const loadPropelNavConfigOnce = (): void => {
  if (loadStarted) {
    return;
  }
  loadStarted = true;

  const url = `${heroesBaseUrl()}/nav.config.json`;
  // cache:'no-cache' → always revalidate so a nav edit shows on hard-refresh
  // without a stale cached 200 masking the new file.
  fetch(url, { cache: 'no-cache' })
    .then((res) => {
      if (!res.ok) {
        // 404 = no mounted config; the baked default is correct. Not an error.
        return undefined;
      }
      return res.json();
    })
    .then((raw) => {
      if (raw === undefined) {
        return;
      }
      const merged = mergeConfig(raw);
      currentConfig = merged;
      emitChange();
    })
    .catch(() => {
      // Network / parse failure → keep the baked default. Swallow: nav must never
      // break because a config file was unreachable.
    });
};

// The ordered, ENABLED entries for the sidebar (sorted by `order`).
export const getEnabledNavEntries = (
  config: PropelNavConfig,
): PropelNavEntry[] =>
  config.entries
    .filter((entry) => entry.enabled)
    .sort((a, b) => a.order - b.order);

// ALL entries (enabled + route-only), for route registration. Sorted for stable
// route order; the router 404s nav-hidden routes only by virtue of the user not
// having a nav link — every entry's route is registered.
export const getAllNavEntries = (config: PropelNavConfig): PropelNavEntry[] =>
  [...config.entries].sort((a, b) => a.order - b.order);
