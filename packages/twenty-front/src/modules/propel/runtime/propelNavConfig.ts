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

// ── Section schema (config-version 2) ────────────────────────────────────────
//
// The sidebar is composed of an ORDERED list of SECTIONS, each rendered by its
// `kind`. This makes the section layout itself config-driven (the same fast-path
// the hero entries already have): the founder can reorder / rename / add / remove
// nav sections by editing the mounted nav.config.json — NO engine rebuild.
//
// The four kinds map onto the engine's existing section renderers (we WRAP the
// native Favorites/Workspace rendering, we do not reimplement them):
//   • 'favorites'  — native Favorites section.
//   • 'workspace'  — native Workspace object/folder nav. `excludeFolders` omits
//                    app-side folders that have been PROMOTED to their own section
//                    (so they aren't listed twice), matched by folder name or
//                    universalIdentifier-derived name.
//   • 'folder'     — promote ONE app-side nav folder (named by `folder`) to a
//                    top-level section whose children render as FLAT, top-level
//                    (non-collapsible) items. Reuses the folder-children the
//                    collapsible folder already resolves. This is what turns the
//                    "Pipeline" folder into the "Pipelines" section.
//   • 'heroes'     — the Propel hero entries (today's "Other" section), sourced
//                    from `entries` above.
//
// BACK-COMPAT: if `sections` is absent / empty / malformed, the engine falls back
// to the hardcoded composition (Favorites → Workspace → Other). A bad config can
// never break the nav.

export type PropelNavSectionKind =
  | 'favorites'
  | 'workspace'
  | 'folder'
  | 'heroes';

export type PropelNavSection = {
  // Stable identity (React key + the section open/closed atom-family id). Unique.
  key: string;
  // User-facing section title. Ignored for 'favorites'/'workspace' (those keep
  // their native i18n titles); used as-is for 'folder'/'heroes'.
  title: string;
  // Ascending sort order among sections. Ties broken by array position.
  order: number;
  // How this section is rendered (see above).
  kind: PropelNavSectionKind;
  // kind:'folder' only — the app-side folder to promote, by its `name`
  // (e.g. 'Pipeline') or universalIdentifier (e.g. 'folderPipeline'). Matched
  // case-insensitively against the folder's resolved name.
  folder?: string;
  // kind:'workspace' only — app-side folder names/identifiers to OMIT from the
  // Workspace section because they're promoted into their own 'folder' section.
  excludeFolders?: string[];
  // Whether the section renders. Default true. A disabled section is skipped.
  enabled?: boolean;
};

export type PropelNavConfig = {
  // Schema marker. Absent/1 ⇒ legacy (entries only); 2 ⇒ adds `sections`.
  version?: number;
  // The ordered hero nav entries (consumed by the 'heroes' section).
  entries: PropelNavEntry[];
  // The ordered nav sections. Absent/empty ⇒ hardcoded fallback composition.
  sections?: PropelNavSection[];
  // The route "/" lands on (2026-07-08). Twenty's stock fallback is the
  // ALPHABETICALLY-FIRST readable object — which in this workspace is
  // agreementDocument, so every fresh login dumped the user on the A2A
  // Documents table. A configured route here wins over that fallback (and
  // over the lastVisited-object heuristic, so landing is deterministic).
  // Editable via the mounted nav.config.json — NO rebuild to change it.
  defaultHome?: string;
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
  version: 2,
  // Land on People — the CRM's heart — instead of Twenty's alphabetical
  // accident (A2A Documents). Override in the mounted nav.config.json.
  defaultHome: '/objects/people',
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
    // ── route-only entries (no sidebar item; deep-links still resolve) ──
    {
      // The standalone Settings Hub hero was FOLDED into the Marketing hero's
      // "Config" tab (manager/admin only) — so it's no longer a top-level nav
      // item. Its route + bundle stay registered (enabled:false) so existing
      // /settings-hub deep-links keep resolving and no engine rebuild is needed;
      // the canonical config surface is now /marketing?tab=config.
      key: 'settings-hub',
      label: 'Settings',
      icon: 'IconSettings',
      route: AppPath.SettingsHub,
      bundle: 'settings-hub',
      enabled: false,
      order: 90,
    },
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
  sections: undefined, // filled in below (DEFAULT_NAV_CONFIG.sections = DEFAULT_SECTIONS)
};

// ── Baked default SECTIONS (config-version 2) ────────────────────────────────
//
// Reproduces TODAY's nav composition PLUS the promoted "Pipelines" section:
//   Favorites → Workspace (minus the promoted Pipeline folder) → Pipelines → Other
// This is the synchronous value the nav drawer sees on first render, and the
// source of truth when no mounted nav.config.json `sections` array is present.
//
// The founder reshuffles the sidebar by editing these in the mounted JSON:
// reorder via `order`, rename a promoted section via `title`, hide via
// `enabled:false`, or promote a different folder by adding a `kind:'folder'`
// section. A mounted `sections` array REPLACES this default wholesale (sections
// are not key-merged like entries — the section LAYOUT is all-or-nothing so a
// partial edit can't leave an inconsistent half-promoted folder).

export const DEFAULT_SECTIONS: PropelNavSection[] = [
  {
    key: 'favorites',
    title: 'Favorites',
    kind: 'favorites',
    order: 10,
    enabled: true,
  },
  {
    key: 'workspace',
    title: 'Workspace',
    kind: 'workspace',
    order: 20,
    // The Pipeline folder is promoted to its own 'pipelines' section below, so
    // omit it here to avoid listing the lanes twice. Matched by folder name OR
    // universalIdentifier ('Pipeline' / 'folderPipeline').
    excludeFolders: ['folderPipeline'],
    enabled: true,
  },
  {
    key: 'pipelines',
    title: 'Pipelines',
    kind: 'folder',
    // Promote the app-side 'Pipeline' folder (folderPipeline) — its 6 lane
    // children (Sell, Secondary, Institutional, Off-plan, RCBI, Deal) render as
    // flat top-level items. Placed BETWEEN Workspace (20) and Other (40).
    folder: 'folderPipeline',
    order: 30,
    enabled: true,
  },
  {
    key: 'other',
    title: 'Other',
    kind: 'heroes',
    order: 40,
    enabled: true,
  },
];

DEFAULT_NAV_CONFIG.sections = DEFAULT_SECTIONS;

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

// The valid section kinds, for runtime validation of the mounted JSON.
const VALID_SECTION_KINDS: readonly PropelNavSectionKind[] = [
  'favorites',
  'workspace',
  'folder',
  'heroes',
];

// Validate + normalize ONE raw section from the mounted JSON. Returns null if the
// section is unusable (missing key, unknown kind, or a 'folder' kind with no
// `folder`) — it's then skipped, not fatal. A section array that ends up empty
// after validation is treated as "absent" by mergeConfig (→ baked default).
const normalizeSection = (raw: unknown): PropelNavSection | null => {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const key = typeof r.key === 'string' ? r.key : undefined;
  const kind =
    typeof r.kind === 'string' &&
    (VALID_SECTION_KINDS as readonly string[]).includes(r.kind)
      ? (r.kind as PropelNavSectionKind)
      : undefined;
  if (key === undefined || kind === undefined) {
    return null;
  }
  // A 'folder' section is meaningless without a folder to promote.
  const folder = typeof r.folder === 'string' ? r.folder : undefined;
  if (kind === 'folder' && folder === undefined) {
    return null;
  }
  const excludeFolders = Array.isArray(r.excludeFolders)
    ? r.excludeFolders.filter((f): f is string => typeof f === 'string')
    : undefined;
  return {
    key,
    kind,
    title: typeof r.title === 'string' ? r.title : key,
    order: typeof r.order === 'number' ? r.order : 999,
    enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
    ...(folder !== undefined ? { folder } : {}),
    ...(excludeFolders !== undefined ? { excludeFolders } : {}),
  };
};

// Merge the mounted config over the baked default: entries are matched by `key`.
// A mounted entry overrides the default of the same key (partial overrides are
// applied field-by-field); a mounted entry with a new key is appended. Default
// entries not mentioned in the mounted config are preserved. This means a nav
// edit can be as small as "{ key: 'marketing-hub', label: 'Campaigns' }" while
// every other entry keeps its baked values.
//
// SECTIONS are handled differently from entries: a mounted `sections` array
// REPLACES the baked DEFAULT_SECTIONS wholesale (the section LAYOUT is
// all-or-nothing — a partial merge could leave a folder both promoted AND listed
// in Workspace). If the mounted `sections` is absent or validates to empty, the
// baked DEFAULT_SECTIONS stands (→ today's nav + the Pipelines section).
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

  // Sections: validate the mounted array (if any). An absent or all-invalid
  // array → keep the baked DEFAULT_SECTIONS. A non-empty valid array REPLACES it.
  const rawSections = (raw as Record<string, unknown>).sections;
  let sections = DEFAULT_SECTIONS;
  if (Array.isArray(rawSections)) {
    const normalized = rawSections
      .map(normalizeSection)
      .filter((s): s is PropelNavSection => s !== null);
    if (normalized.length > 0) {
      sections = normalized;
    }
  }

  const version = (raw as Record<string, unknown>).version;

  // defaultHome: a mounted route string (must start with '/') overrides the
  // baked default; anything else keeps it.
  const rawDefaultHome = (raw as Record<string, unknown>).defaultHome;
  const defaultHome =
    typeof rawDefaultHome === 'string' && rawDefaultHome.startsWith('/')
      ? rawDefaultHome
      : DEFAULT_NAV_CONFIG.defaultHome;

  return {
    version: typeof version === 'number' ? version : DEFAULT_NAV_CONFIG.version,
    entries: [...byKey.values()],
    sections,
    ...(defaultHome !== undefined ? { defaultHome } : {}),
  };
};

// The configured "/" landing route, or undefined when unset/invalid. Consumed
// by useDefaultHomePagePath (which falls back to Twenty's stock heuristic).
export const getDefaultHomeRoute = (
  config: PropelNavConfig,
): string | undefined =>
  typeof config.defaultHome === 'string' && config.defaultHome.startsWith('/')
    ? config.defaultHome
    : undefined;

// One fetch-and-merge pass over the mounted nav config. On success it swaps the
// cache and notifies subscribers; on any failure (no file, 404, bad JSON) it
// silently keeps the current config. Never throws — nav must never break
// because a config file was unreachable.
const fetchAndMergeNavConfig = (): void => {
  const url = `${heroesBaseUrl()}/nav.config.json`;
  // cache:'no-cache' → always revalidate so a nav edit shows on refetch
  // without a stale cached 200 masking the new file.
  fetch(url, { cache: 'no-cache' })
    .then((res) => {
      if (!res.ok) {
        // 404 = no mounted config; the current (baked/merged) config is
        // correct. Not an error.
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
      // Network / parse failure → keep the current config. Swallow.
    });
};

// Fetch the mounted nav config at boot (idempotent registration). Called from
// index.tsx before/independent of render. Also registers a SELF-HEALING
// refetch: whenever the tab regains visibility the mounted config is
// re-validated, so (a) a nav.config.json edit on the heroes mount shows up on
// the next tab focus without a hard refresh, and (b) a transiently stale merge
// heals itself mid-session instead of persisting until re-login (part of the
// 2026-07-08 "heroes vanished from nav" fix).
export const loadPropelNavConfigOnce = (): void => {
  if (loadStarted) {
    return;
  }
  loadStarted = true;

  fetchAndMergeNavConfig();

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchAndMergeNavConfig();
    }
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

// The ordered, ENABLED nav SECTIONS that compose the sidebar. Returns [] when the
// config carries no usable sections — the SIGNAL for the nav drawer to fall back
// to its hardcoded composition (Favorites → Workspace → Other). Because
// DEFAULT_NAV_CONFIG.sections === DEFAULT_SECTIONS, the out-of-the-box result is
// the full config-driven composition (incl. the promoted Pipelines section); the
// [] fallback only triggers if a mounted config somehow disables every section.
export const getNavSections = (config: PropelNavConfig): PropelNavSection[] => {
  const sections = config.sections;
  if (!Array.isArray(sections) || sections.length === 0) {
    return [];
  }
  return sections
    .filter((section) => section.enabled !== false)
    .sort((a, b) => a.order - b.order);
};

// Folder-name/identifier matching for kind:'workspace' excludeFolders and
// kind:'folder' folder. The app-side folder carries a `name` ('Pipeline') and an
// universalIdentifier ('folderPipeline'); the front only receives the name, so we
// match a config token against the folder name case-insensitively, AND accept the
// universalIdentifier form by stripping a leading 'folder' prefix + lowercasing
// (so 'folderPipeline' ≈ 'Pipeline'). Pure helper, shared by the section renderers.
export const propelNavFolderTokenMatchesName = (
  token: string,
  folderName: string,
): boolean => {
  const normalize = (value: string): string =>
    value.trim().toLowerCase().replace(/^folder/, '');
  return normalize(token) === normalize(folderName);
};
