/* eslint-disable @nx/enforce-module-boundaries */
// ─────────────────────────────────────────────────────────────────────────────
// Propel — promote an app-side nav FOLDER to a top-level section (engine-only)
// ─────────────────────────────────────────────────────────────────────────────
//
// WHAT THIS IS
// The Propel CRM app (propel-crm-integration/src/navigation) defines nav FOLDERs
// (e.g. folderPipeline `name: 'Pipeline'`) whose children are OBJECT nav items
// (the pipeline lanes). By default Twenty renders a folder as a COLLAPSIBLE drawer
// nested inside the Workspace section.
//
// The config-driven nav-sections framework (propelNavConfig.ts) lets the founder
// PROMOTE a folder to its own top-level section via a `kind:'folder'` section.
// This helper is the seam that resolves a folder (named by the section's `folder`
// token — a folder name or universalIdentifier) into:
//   • the folder's id (so the Workspace renderer can EXCLUDE it — see
//     excludeFolders), and
//   • the folder's child items (so the promoted section renders them as flat,
//     top-level rows).
//
// MATCHING: the front receives only the folder `name` (no universalIdentifier on
// the GraphQL NavigationMenuItem type, and the folder UUID is install-assigned /
// not portable). So a config token is matched against the folder name via
// propelNavFolderTokenMatchesName ('folderPipeline' ≈ 'Pipeline').
//
// VISIBILITY / RLS: this helper only PARTITIONS by folder — it does no permission
// filtering. The caller reuses the SAME canReadObjectRecords filter the Workspace
// section applies, so a lane the API didn't return for this user is never shown.

import { propelNavFolderTokenMatchesName } from '@/propel/runtime/propelNavConfig';
import { NavigationMenuItemType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { type NavigationMenuItem } from '~/generated-metadata/graphql';

export type PropelPromotedFolderItems = {
  // The id of the matched folder NavigationMenuItem, or undefined if no folder
  // matches the token (e.g. a non-Propel workspace, or before install).
  folderId: string | undefined;
  // The folder's child items (lane OBJECT nav items), in resolver order
  // (position-sorted upstream). Empty when the folder is absent. NOT permission-
  // filtered — the caller applies the same RLS filter as the Workspace section.
  childItems: NavigationMenuItem[];
};

// Given the FLAT resolved nav-item list from useNavigationMenuItemSectionItems()
// (each folder item immediately followed by its children, each child carrying
// `folderId`) and a folder token (name or universalIdentifier), return the
// matched folder's id + its child items. Pure; safe to call on every render.
export const getPropelPromotedFolderItems = (
  resolvedItems: NavigationMenuItem[],
  folderToken: string,
): PropelPromotedFolderItems => {
  const folder = resolvedItems.find(
    (item) =>
      item.type === NavigationMenuItemType.FOLDER &&
      isDefined(item.name) &&
      propelNavFolderTokenMatchesName(folderToken, item.name),
  );
  if (!isDefined(folder)) {
    return { folderId: undefined, childItems: [] };
  }
  const folderId = folder.id;
  const childItems = resolvedItems.filter((item) => item.folderId === folderId);
  return { folderId, childItems };
};

// Resolve a set of excludeFolders tokens (from a kind:'workspace' section) to the
// set of matching folder ids in the resolved item list. Used by the Workspace
// renderer to DROP promoted folders (and their child rows) from its own display.
export const getPropelExcludedFolderIds = (
  resolvedItems: NavigationMenuItem[],
  folderTokens: readonly string[] | undefined,
): Set<string> => {
  const excluded = new Set<string>();
  if (!isDefined(folderTokens) || folderTokens.length === 0) {
    return excluded;
  }
  for (const item of resolvedItems) {
    if (
      item.type === NavigationMenuItemType.FOLDER &&
      isDefined(item.name) &&
      folderTokens.some((token) =>
        propelNavFolderTokenMatchesName(token, item.name as string),
      )
    ) {
      excluded.add(item.id);
    }
  }
  return excluded;
};

// Predicate: is this item part of an excluded (promoted) folder — i.e. the folder
// placeholder itself OR one of its children? Used by the Workspace read-only list
// to filter promoted folders out.
export const isPropelExcludedFolderItem = (
  item: NavigationMenuItem,
  excludedFolderIds: Set<string>,
): boolean =>
  excludedFolderIds.has(item.id) ||
  (isDefined(item.folderId) && excludedFolderIds.has(item.folderId));
