/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Propel — promoted-folder nav SECTION (config-driven; app-side nav UNCHANGED)
// ─────────────────────────────────────────────────────────────────────────────
//
// Renders a `kind:'folder'` nav section (propelNavConfig.ts): an app-side nav
// FOLDER promoted to a top-level section, with its children rendered as FLAT,
// top-level (non-collapsible) items instead of nested in a collapsible drawer.
//
// The default config promotes the "Pipeline" folder (folderPipeline) → a
// "Pipelines" section showing the 6 lanes (Sell, Secondary, Institutional,
// Off-plan, RCBI, Deal) as top-level items. The lanes are defined app-side as
// OBJECT nav items under folderPipeline — NOTHING about that changes; this section
// just re-renders the folder's children as a sibling top-level section, and the
// Workspace section is told (via excludeFolders) to drop that folder so the lanes
// aren't shown twice.
//
// VISIBILITY / RLS: identical to the Workspace section — a lane is kept only if
// the current user can read its target object's records
// (getObjectPermissionsForObject). A lane the API didn't return for this user is
// never rendered, exactly as today.
//
// Not shown in layout-customization (edit) mode: the stock Workspace DnD editor
// keeps the real folder structure there so the nav metadata can still be
// reordered/edited. This only changes the READ-ONLY presentation.

import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { useNavigationMenuItemSectionItems } from '@/navigation-menu-item/display/hooks/useNavigationMenuItemSectionItems';
import { getObjectMetadataForNavigationMenuItem } from '@/navigation-menu-item/display/object/utils/getObjectMetadataForNavigationMenuItem';
import { NavigationMenuItemSection } from '@/navigation-menu-item/display/sections/components/NavigationMenuItemSection';
import { WorkspaceSectionListReadOnly } from '@/navigation-menu-item/display/sections/workspace/components/WorkspaceSectionListReadOnly';
import { getPropelPromotedFolderItems } from '@/navigation-menu-item/display/utils/getPropelPromotedFolderItems';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { type PropelNavSection } from '@/propel/runtime/propelNavConfig';
import { useNavigationSection } from '@/ui/navigation/navigation-drawer/hooks/useNavigationSection';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import { NavigationMenuItemType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

// Empty map: lane items are TOP-LEVEL here (not folder parents), so no folder
// children to render. Reused identity so the prop reference is stable.
const EMPTY_FOLDER_CHILDREN = new Map();

export const NavigationDrawerPromotedFolderSection = ({
  section,
}: {
  section: PropelNavSection;
}) => {
  const resolvedItems = useNavigationMenuItemSectionItems();
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const views = useAtomStateValue(viewsSelector);
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const isLayoutCustomizationModeEnabled = useAtomStateValue(
    isLayoutCustomizationModeEnabledState,
  );

  // The section open/closed state is keyed by the section's stable config key, so
  // each promoted section remembers its own collapsed state. Defaults open.
  const { isNavigationSectionOpen, toggleNavigationSection } =
    useNavigationSection(`propel-section-${section.key}`);

  const { childItems } = getPropelPromotedFolderItems(
    resolvedItems,
    section.folder ?? '',
  );

  // Same RLS gate the Workspace section applies: keep a child only if the user can
  // read its target object's records. Non-object children (none today) keep their
  // own link and are kept as-is.
  const visibleItems = childItems.filter((item) => {
    if (
      item.type === NavigationMenuItemType.OBJECT ||
      item.type === NavigationMenuItemType.VIEW ||
      item.type === NavigationMenuItemType.RECORD
    ) {
      const objectMetadataItem = getObjectMetadataForNavigationMenuItem(
        item,
        objectMetadataItems,
        views,
      );
      return (
        isDefined(objectMetadataItem) &&
        getObjectPermissionsForObject(
          objectPermissionsByObjectMetadataId,
          objectMetadataItem.id,
        ).canReadObjectRecords
      );
    }
    return true;
  });

  // Nothing to show (non-Propel workspace, no readable children, or edit mode) ⇒
  // render nothing. In edit mode the stock Workspace editor owns the folder.
  if (isLayoutCustomizationModeEnabled || visibleItems.length === 0) {
    return null;
  }

  return (
    <NavigationMenuItemSection
      title={section.title}
      isOpen={isNavigationSectionOpen}
      onToggle={() => toggleNavigationSection()}
    >
      <WorkspaceSectionListReadOnly
        filteredItems={visibleItems}
        folderChildrenById={EMPTY_FOLDER_CHILDREN}
      />
    </NavigationMenuItemSection>
  );
};
