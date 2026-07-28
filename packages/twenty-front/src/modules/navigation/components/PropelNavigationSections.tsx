/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Propel — config-driven nav SECTIONS orchestrator (engine-only)
// ─────────────────────────────────────────────────────────────────────────────
//
// Composes the sidebar from the ORDERED `sections` of the runtime nav config
// (propelNavConfig.ts → getNavSections). Each section renders by `kind`:
//   • 'favorites' → native Favorites (wrapped, not reimplemented)
//   • 'workspace' → native Workspace object/folder nav, minus excludeFolders
//   • 'folder'    → an app-side folder promoted to a flat top-level section
//   • 'heroes'    → the Propel hero entries (today's "Other" section)
//
// BACK-COMPAT: getNavSections returns [] when the config carries no usable
// sections (e.g. a mounted config disabled them all). In that case this component
// renders the HARDCODED composition — Favorites → Workspace → Other — identical to
// the pre-sections engine. So a bad/empty/missing config NEVER breaks the nav.
//
// HOT-UPDATE: usePropelNavConfig subscribes this component to the same config
// cache the hero nav uses, so editing the mounted nav.config.json `sections` and
// hard-refreshing re-renders the whole composition with NO rebuild.
//
// The native Favorites + Workspace dispatchers are lazy; we keep them under the
// same <Suspense> boundary the stock drawer used.

import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { NavigationDrawerHeroesSection } from '@/navigation/components/NavigationDrawerHeroesSection';
import { NavigationDrawerPromotedFolderSection } from '@/navigation/components/NavigationDrawerPromotedFolderSection';
import { NavigationDrawerWorkspaceSectionSkeletonLoader } from '@/object-metadata/components/NavigationDrawerWorkspaceSectionSkeletonLoader';
import {
  getNavSections,
  type PropelNavSection,
} from '@/propel/runtime/propelNavConfig';
import { usePropelNavConfig } from '@/propel/runtime/usePropelNavConfig';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { lazy, Suspense } from 'react';

const FavoritesSectionDispatcher = lazy(() =>
  import('@/navigation-menu-item/display/sections/favorites/components/FavoritesSectionDispatcher').then(
    (module) => ({ default: module.FavoritesSectionDispatcher }),
  ),
);

const WorkspaceSection = lazy(() =>
  import('@/navigation-menu-item/display/sections/workspace/components/WorkspaceSection').then(
    (module) => ({ default: module.WorkspaceSection }),
  ),
);

// Render a single config section by kind. 'favorites'/'workspace' are returned
// already wrapped in the shared Suspense boundary by the parent (they're lazy);
// the others render synchronously.
const renderSection = (section: PropelNavSection) => {
  switch (section.kind) {
    case 'favorites':
      return <FavoritesSectionDispatcher key={section.key} />;
    case 'workspace':
      return (
        <WorkspaceSection
          key={section.key}
          excludeFolders={section.excludeFolders}
        />
      );
    case 'folder':
      return (
        <NavigationDrawerPromotedFolderSection
          key={section.key}
          section={section}
        />
      );
    case 'heroes':
      return (
        <NavigationDrawerHeroesSection key={section.key} title={section.title} />
      );
    default:
      return null;
  }
};

export const PropelNavigationSections = () => {
  const navConfig = usePropelNavConfig();
  const sections = getNavSections(navConfig);
  const isLayoutCustomizationModeEnabled = useAtomStateValue(
    isLayoutCustomizationModeEnabledState,
  );

  // ── Back-compat fallback: no usable config sections → hardcoded composition ──
  if (sections.length === 0) {
    return (
      <Suspense
        fallback={<NavigationDrawerWorkspaceSectionSkeletonLoader />}
      >
        <FavoritesSectionDispatcher />
        <WorkspaceSection />
        {!isLayoutCustomizationModeEnabled && (
          <NavigationDrawerHeroesSection title="Other" />
        )}
      </Suspense>
    );
  }

  // The 'heroes' section is hidden in layout-customization mode (it has no editable
  // workspace items), matching the prior behavior of NavigationDrawerOtherSection.
  const visibleSections = isLayoutCustomizationModeEnabled
    ? sections.filter((section) => section.kind !== 'heroes')
    : sections;

  return (
    <Suspense fallback={<NavigationDrawerWorkspaceSectionSkeletonLoader />}>
      {visibleSections.map(renderSection)}
    </Suspense>
  );
};
