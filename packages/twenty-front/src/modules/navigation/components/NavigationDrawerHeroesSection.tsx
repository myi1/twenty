import { useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { IconHelpCircle, IconSettings } from 'twenty-ui/display';
import { AnimatedExpandableContainer } from 'twenty-ui/layout';

// Propel: the graduated hero hub nav entries (Inbox, Marketing, Weekly 1:1,
// Listing Studio, …) are gated behind a build/runtime flag so they only appear
// where the engine image enables them. Same dual mechanism as the dialer dock
// (window._env_ for the Docker runtime injection, import.meta.env for vite dev).
// The hero routes themselves register unconditionally (they 404 when nav-hidden);
// only these nav ITEMS are gated.
const PROPEL_MARKETING_HUB_ENABLED =
  Boolean(window._env_?.REACT_APP_PROPEL_MARKETING_HUB) ||
  Boolean(import.meta.env.REACT_APP_PROPEL_MARKETING_HUB);

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import {
  getEnabledNavEntries,
  type PropelNavEntry,
} from '@/propel/runtime/propelNavConfig';
import {
  resolvePropelNavIcon,
  usePropelNavConfig,
} from '@/propel/runtime/usePropelNavConfig';
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
const PropelHeroNavItem = ({ entry }: { entry: PropelNavEntry }) => (
  <NavigationDrawerItem
    label={entry.label}
    to={entry.route}
    Icon={resolvePropelNavIcon(entry.icon)}
  />
);

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
  const propelNavEntries = getEnabledNavEntries(navConfig);

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
            Gated by REACT_APP_PROPEL_MARKETING_HUB exactly as before. */}
        {PROPEL_MARKETING_HUB_ENABLED &&
          propelNavEntries.map((entry) => (
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
