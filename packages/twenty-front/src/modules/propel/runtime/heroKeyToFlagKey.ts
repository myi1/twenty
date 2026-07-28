// Map a nav.config.json `key` (the runtime-loaded hero key — `inbox`,
// `marketing-hub`, etc.) to the propel-crm app's permission-flag `key`
// (PROPEL_INBOX, PROPEL_MARKETING_HUB, …). The hero gate uses this to
// decide which permission flag (if any) is required to see each hero in
// the navigation drawer.
//
// Heroes NOT in this map are NOT gated — they appear for everyone (matches
// the existing fail-open posture of the propel-nav-filter service for items
// it doesn't know about). Adding a new hero requires:
//   1. Defining its permission flag in the propel-crm app
//      (src/permission-flags/<hero>.permission-flag.ts)
//   2. Adding the (heroKey → flagKey) pair here
//   3. Assigning the flag to the appropriate roles via /settings/members/roles
//
// The flag KEYS are stable strings (uppercase snake-case) defined by the
// propel-crm app — they survive UID rotations and are the canonical
// identifier across the engine + frontend + workspaceMember override fields.
export const HERO_KEY_TO_FLAG_KEY: Readonly<Record<string, string>> =
  Object.freeze({
    inbox: 'PROPEL_INBOX',
    'listing-studio': 'PROPEL_LISTING_STUDIO',
    'a2a-studio': 'PROPEL_A2A_STUDIO',
    'one-on-one-runner': 'PROPEL_ONE_ON_ONE_RUNNER',
    'marketing-hub': 'PROPEL_MARKETING_HUB',
    'campaign-builder': 'PROPEL_CAMPAIGN_BUILDER',
    'sequence-editor': 'PROPEL_SEQUENCE_EDITOR',
    'social-calendar': 'PROPEL_SOCIAL_CALENDAR',
    'settings-hub': 'PROPEL_SETTINGS_HUB',
  });

export const getRequiredFlagKeyForHero = (
  heroKey: string,
): string | undefined => HERO_KEY_TO_FLAG_KEY[heroKey];
