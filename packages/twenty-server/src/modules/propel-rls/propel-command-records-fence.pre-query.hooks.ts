import { msg } from '@lingui/core/macro';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type ResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';

// ── The fence on the assignment command's records (C1, decision B) ───────────────────
//
// WHAT. Two app objects — the step receipt and the assignment version — are written by
// exactly one writer: the assignment command. It writes them with raw SQL on the lead
// transaction's own query runner, which never passes through the data API. These hooks
// refuse EVERY data-API write on them: every write method, over GraphQL, REST and the
// record services behind workflows and tools, for every caller. That includes Admin API
// keys, application tokens and system contexts. Reads stay open.
//
// WHY IT IS NEEDED — proven, not assumed (engine spec c1-fence-premise, 2026-09-13). On a
// genuine app install, an Admin-role API key and a Member-role user created, updated,
// soft-deleted and destroyed an app object freely; objectPermissions restrain only app
// roles. Without this, any API key could rewrite a lead's assignment version or forge a
// "done" receipt, and the command's exactly-once and no-reversal guarantees would be
// words. The founder chose to lock them (2026-09-13).
//
// WHY HERE. All data-API writes reach CommonBaseQueryRunnerService.processArgs, which
// runs the pre-query hooks for `<object>.<method>` with the object's nameSingular.
// Wildcard hooks run first (WorkspaceQueryHookStorage prepends them), so the fence speaks
// before any other hook. The method list is checked against RESOLVER_METHOD_NAMES in the
// unit spec, so a write method added upstream turns that spec red instead of arriving
// unfenced.
//
// WHY A PERMISSION ERROR. A refusal reads exactly like an objectPermissions refusal:
// GraphQL FORBIDDEN, and REST code PERMISSION_DENIED. A caller cannot tell the fence from
// an ordinary missing permission, and needs no new handling.
//
// WHAT THIS CANNOT FENCE — named, because the premise brief asked for it:
//   · engine code that writes these tables through the workspace ORM or raw SQL outside
//     the data API (the command itself does this on purpose; nothing else does today)
//   · app:install / uninstall, which create and drop the tables as schema
//   · metadata-API operations on the objects themselves (deactivate, delete, alter a
//     field), which are schema, not records; see engine spec c1-fence for what Twenty
//     allows there
//   · direct database access
//
// COUPLING. The names below must equal nameSingular in the app's
// src/objects/propel-step-receipt.object.ts and propel-assignment-version.object.ts.
// Renaming an object there without changing it here leaves that object UNFENCED. The
// app's propel-command-records.test.ts pins the names on that side.
//
// FORK-ONLY. This is Propel code in the fork's propel-rls module. Any engine upgrade must
// carry it (docs/architecture/decisions/ADR-001, "Upgrade note"; ADR-003 addendum).

export const PROPEL_COMMAND_RECORD_OBJECTS: ReadonlySet<string> = new Set([
  'propelStepReceipt',
  'propelAssignmentVersion',
]);

export const FENCED_WRITE_METHODS = [
  'createOne',
  'createMany',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'destroyOne',
  'destroyMany',
  'restoreOne',
  'restoreMany',
  'mergeMany',
] as const;

export const assertNotAssignmentCommandRecord = (objectName: string): void => {
  if (!PROPEL_COMMAND_RECORD_OBJECTS.has(objectName)) {
    return;
  }

  throw new PermissionsException(
    `${objectName} records are written only by the assignment command`,
    PermissionsExceptionCode.PERMISSION_DENIED,
    {
      userFriendlyMessage: msg`These records are written only by the assignment command.`,
    },
  );
};

// No branch on authContext, deliberately: there is no caller for whom a data-API write
// to these objects is legitimate.
abstract class AssignmentCommandRecordsFence implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    objectName: string,
    payload: ResolverArgs,
  ): Promise<ResolverArgs> {
    assertNotAssignmentCommandRecord(objectName);

    return payload;
  }
}

@WorkspaceQueryHook(`*.createOne`)
export class CommandRecordsFenceCreateOnePreQueryHook extends AssignmentCommandRecordsFence {}

@WorkspaceQueryHook(`*.createMany`)
export class CommandRecordsFenceCreateManyPreQueryHook extends AssignmentCommandRecordsFence {}

@WorkspaceQueryHook(`*.updateOne`)
export class CommandRecordsFenceUpdateOnePreQueryHook extends AssignmentCommandRecordsFence {}

@WorkspaceQueryHook(`*.updateMany`)
export class CommandRecordsFenceUpdateManyPreQueryHook extends AssignmentCommandRecordsFence {}

@WorkspaceQueryHook(`*.deleteOne`)
export class CommandRecordsFenceDeleteOnePreQueryHook extends AssignmentCommandRecordsFence {}

@WorkspaceQueryHook(`*.deleteMany`)
export class CommandRecordsFenceDeleteManyPreQueryHook extends AssignmentCommandRecordsFence {}

@WorkspaceQueryHook(`*.destroyOne`)
export class CommandRecordsFenceDestroyOnePreQueryHook extends AssignmentCommandRecordsFence {}

@WorkspaceQueryHook(`*.destroyMany`)
export class CommandRecordsFenceDestroyManyPreQueryHook extends AssignmentCommandRecordsFence {}

@WorkspaceQueryHook(`*.restoreOne`)
export class CommandRecordsFenceRestoreOnePreQueryHook extends AssignmentCommandRecordsFence {}

@WorkspaceQueryHook(`*.restoreMany`)
export class CommandRecordsFenceRestoreManyPreQueryHook extends AssignmentCommandRecordsFence {}

@WorkspaceQueryHook(`*.mergeMany`)
export class CommandRecordsFenceMergeManyPreQueryHook extends AssignmentCommandRecordsFence {}

export const PROPEL_COMMAND_RECORDS_FENCE_HOOKS = [
  CommandRecordsFenceCreateOnePreQueryHook,
  CommandRecordsFenceCreateManyPreQueryHook,
  CommandRecordsFenceUpdateOnePreQueryHook,
  CommandRecordsFenceUpdateManyPreQueryHook,
  CommandRecordsFenceDeleteOnePreQueryHook,
  CommandRecordsFenceDeleteManyPreQueryHook,
  CommandRecordsFenceDestroyOnePreQueryHook,
  CommandRecordsFenceDestroyManyPreQueryHook,
  CommandRecordsFenceRestoreOnePreQueryHook,
  CommandRecordsFenceRestoreManyPreQueryHook,
  CommandRecordsFenceMergeManyPreQueryHook,
];
