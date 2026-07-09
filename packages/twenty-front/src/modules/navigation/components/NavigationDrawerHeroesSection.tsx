import { useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { IconHelpCircle, IconSettings, useIcons } from 'twenty-ui/icon';
import { AnimatedExpandableContainer } from 'twenty-ui/layout';

// Propel: the graduated hero hub nav entries (Inbox, Marketing, Weekly 1:1,
// Listing Studio, …) render from the runtime nav registry (baked defaults ∪
// mounted nav.config.json) filtered by the user's effective permission flags.
//
// HISTORY (recurring "heroes vanished from nav" bug, fixed 2026-07-08): these
// items used to ALSO be gated behind window._env_.REACT_APP_PROPEL_MARKETING_HUB,
// a module-level const read from the server-stamped index.html. Any page copy
// without that stamp (proxy/CDN-cached index.html, server-restart window, stale
// tab) evaluated it false and hid EVERY hero for the whole session — only a
// re-login (fresh page loads) recovered. The env flag was redundant belt-and-
// suspenders over the registry (whose baked default already ships enabled
// entries and whose mounted JSON can disable them), so it was removed rather
// than patched. Do not reintroduce an env gate here.

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { usePropelEffectiveFlags } from '@/propel/hooks/usePropelEffectiveFlags';
import { getRequiredFlagKeyForHero } from '@/propel/runtime/heroKeyToFlagKey';
import {
  getEnabledNavEntries,
  type PropelNavEntry,
} from '@/propel/runtime/propelNavConfig';
import { usePropelNavConfig } from '@/propel/runtime/usePropelNavConfig';
import { getDocumentationUrl } from '@/support/utils/getDocumentationUrl';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

import { NavigationDrawerAnimatedCollapseWrapper } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerAnimatedCollapseWrapper';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { NavigationDrawerSection } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerSection';
import { NavigationDrawerSectionTitle } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerSectionTitle';
import { useNavigationSection } from '@/ui/navigation/navigation-drawer/hooks/useNavigationSection';
import { isNavigationSectionOpenFamilyState } from '@/ui/navigation/navigation-drawer/states/isNavigationSectionOpenFamilyState';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

// One Propel hero nav item, rendered from a runtime config entry. The label is a
// plain string straight from the config (NOT the t`` Lingui macro): these are
// Propel-custom strings absent from the compiled catalog, so the macro would
// render the hashed message id ("vo2a+a") instead of the text — the very bug
// (TM#14) this config approach fixes. The CRM is English-only, so a literal is
// correct and catalog-independent. The icon name is resolved against
// twenty-ui/display at render so config can name any Tabler icon.
const PropelHeroNavItem = ({ entry }: { entry: PropelNavEntry }) => {
  // Icons resolve through Twenty's lazy icon registry (useIcons → the
  // AllIcons chunk loaded into iconsState by IconsProvider), NOT a static
  // namespace lookup — the static twenty-ui/display namespace only carries a
  // curated subset, so dynamic name lookups against it rendered the generic
  // fallback dot for most hero icons (2026-07-08). getIcon re-renders with
  // the real icon once the registry loads.
  const { getIcon } = useIcons();
  return (
    <NavigationDrawerItem
      label={entry.label}
      to={entry.route}
      Icon={getIcon(entry.icon)}
    />
  );
};

// The Propel "heroes" nav section — the hero hub items + Settings + Documentation.
// Formerly NavigationDrawerOtherSection (hardcoded title "Other"); now the title
// is config-driven so a `kind:'heroes'` section can retitle it via nav.config.json.
// The section open/closed state stays keyed 'Other' so existing users keep their
// collapsed preference.
export const NavigationDrawerHeroesSection = ({
  title = 'Other',
}: {
  title?: string;
}) => {
  const { t } = useLingui();
  const navigateSettings = useNavigateSettings();
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);

  // Runtime nav config — read from the host-mounted nav.config.json (loaded at
  // boot, baked default until then). usePropelNavConfig re-renders this section
  // when the mounted config arrives. See modules/propel/runtime/propelNavConfig.ts.
  const navConfig = usePropelNavConfig();
  // Track 2 v2 hero gating: filter entries by the user's effective permission
  // flag set ((role flags ∪ workspaceMember.additionalFlags) \ excludedFlags).
  // Heroes not mapped in HERO_KEY_TO_FLAG_KEY pass through (fail-open) — matches
  // the existing propel-nav-filter posture on the server. Backend routes remain
  // the security boundary; this is cosmetic-only.
  const effectiveFlags = usePropelEffectiveFlags();
  const propelNavEntries = getEnabledNavEntries(navConfig).filter((entry) => {
    const required = getRequiredFlagKeyForHero(entry.key);
    return required === undefined || effectiveFlags.has(required);
  });

  const { toggleNavigationSection } = useNavigationSection('Other');
  const isNavigationSectionOpen = useAtomFamilyStateValue(
    isNavigationSectionOpenFamilyState,
    'Other',
  );

  const handleSettingsClick = () => {
    navigateSettings(SettingsPath.ProfilePage);
  };

  return (
    <NavigationDrawerSection>
      <NavigationDrawerAnimatedCollapseWrapper>
        <NavigationDrawerSectionTitle
          label={title}
          onClick={toggleNavigationSection}
          isOpen={isNavigationSectionOpen}
        />
      </NavigationDrawerAnimatedCollapseWrapper>
      <AnimatedExpandableContainer
        isExpanded={isNavigationSectionOpen}
        dimension="height"
        mode="fit-content"
        containAnimation
        initial={false}
      >
        {/* Propel hero nav items, rendered from the runtime config. Labels,
            icons, order and routes are all config-driven — editing them needs only
            a nav.config.json edit on the heroes mount + a refresh (NO rebuild).
            No env-flag gate (see header comment): visibility = registry `enabled`
            ∩ the user's effective permission flags, nothing else. */}
        {propelNavEntries.map((entry) => (
          <PropelHeroNavItem key={entry.key} entry={entry} />
        ))}
        <NavigationDrawerItem
          label={t`Settings`}
          Icon={IconSettings}
          onClick={handleSettingsClick}
        />
        <NavigationDrawerItem
          label={t`Documentation`}
          to={getDocumentationUrl({
            locale: currentWorkspaceMember?.locale,
          })}
          Icon={IconHelpCircle}
        />
      </AnimatedExpandableContainer>
    </NavigationDrawerSection>
  );
};
