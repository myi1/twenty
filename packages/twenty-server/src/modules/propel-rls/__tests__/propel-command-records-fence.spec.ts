import { type ResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WORKSPACE_QUERY_HOOK_METADATA } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.constants';
import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { RESOLVER_METHOD_NAMES } from 'src/engine/api/graphql/workspace-resolver-builder/constants/resolver-method-names';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import {
  FENCED_WRITE_METHODS,
  PROPEL_COMMAND_RECORD_OBJECTS,
  PROPEL_COMMAND_RECORDS_FENCE_HOOKS,
} from 'src/modules/propel-rls/propel-command-records-fence.pre-query.hooks';

// The fence on the assignment command's records, tested at the decision boundary.
//
// A fence that misses one write method is not a fence, and nothing would error: the
// write would simply land. So the first two cases are about COVERAGE, derived from the
// engine's own list of resolver methods rather than from a hand-written one.

const READ_METHODS = new Set(['findMany', 'findOne', 'findDuplicates', 'groupBy']);

// The hook never inspects the caller; these stand for every kind of caller there is.
const CALLERS = {
  'a user': { type: 'user' },
  'an API key': { type: 'apiKey' },
  'an application token': { type: 'application' },
  'a system context': { type: 'system' },
} as unknown as Record<string, WorkspaceAuthContext>;

const hookMetadata = (hook: (typeof PROPEL_COMMAND_RECORDS_FENCE_HOOKS)[number]) =>
  Reflect.getMetadata(WORKSPACE_QUERY_HOOK_METADATA, hook) as {
    key: string;
    type: WorkspaceQueryHookType;
  };

describe('the fence on the assignment command records', () => {
  it('fences every write method the resolver builder knows — a new upstream write method turns this red', () => {
    const writeMethods = Object.values(RESOLVER_METHOD_NAMES)
      .filter((method) => !READ_METHODS.has(method))
      .sort();

    expect([...FENCED_WRITE_METHODS].sort()).toEqual(writeMethods);
  });

  it('registers exactly one wildcard PRE hook per fenced write method', () => {
    const registered = PROPEL_COMMAND_RECORDS_FENCE_HOOKS.map(hookMetadata);

    expect(registered.every((meta) => meta.type === WorkspaceQueryHookType.PRE_HOOK)).toBe(true);
    expect(registered.map((meta) => meta.key).sort()).toEqual(
      FENCED_WRITE_METHODS.map((method) => `*.${method}`).sort(),
    );
  });

  it('fences exactly the two command-record objects', () => {
    expect([...PROPEL_COMMAND_RECORD_OBJECTS].sort()).toEqual([
      'propelAssignmentVersion',
      'propelStepReceipt',
    ]);
  });

  describe.each(Object.entries(CALLERS))('for %s', (_caller, authContext) => {
    it.each(
      PROPEL_COMMAND_RECORDS_FENCE_HOOKS.flatMap((Hook) =>
        [...PROPEL_COMMAND_RECORD_OBJECTS].map((objectName) => [hookMetadata(Hook).key, objectName, Hook] as const),
      ),
    )('%s on %s is refused with PERMISSION_DENIED', async (_key, objectName, Hook) => {
      const refusal = new Hook().execute(authContext, objectName, {} as ResolverArgs);

      await expect(refusal).rejects.toBeInstanceOf(PermissionsException);
      await expect(refusal).rejects.toMatchObject({
        code: PermissionsExceptionCode.PERMISSION_DENIED,
      });
    });
  });

  it.each(['person', 'fenceSibling', 'propelStepReceipts', 'PropelStepReceipt', ''])(
    'leaves "%s" untouched and returns the payload it was given — the match is exact, by nameSingular',
    async (objectName) => {
      for (const Hook of PROPEL_COMMAND_RECORDS_FENCE_HOOKS) {
        const payload = { id: 'x', data: { note: 'kept' } } as unknown as ResolverArgs;

        await expect(new Hook().execute(CALLERS['a user'], objectName, payload)).resolves.toBe(payload);
      }
    },
  );
});
