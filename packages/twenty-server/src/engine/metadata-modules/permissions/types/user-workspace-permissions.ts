import { type ObjectsPermissions } from 'twenty-shared/types';
import { type PermissionFlagType } from 'twenty-shared/constants';

export type UserWorkspacePermissions = {
  permissionFlags: Record<PermissionFlagType, boolean>;
  objectsPermissions: ObjectsPermissions;
  // Propel hero-gating: effective app-flag key set (non-core keys), computed
  // server-side. See PermissionsService.getUserWorkspacePermissions.
  propelEffectiveFlags: string[];
};
