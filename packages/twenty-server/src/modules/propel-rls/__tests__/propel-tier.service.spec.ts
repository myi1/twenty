import { type RoleService } from 'src/engine/metadata-modules/role/role.service';
import { type UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';

// Proves role → tier resolution + fail-closed behavior WITHOUT getWorkspaceContext().
// Role is resolved via UserRoleService.getRoleIdForUserWorkspace (request-time,
// cache-backed) — the same path the rest of Twenty's RLS uses at hook time.

const WS = 'ws-1';
const UWS = 'uws-1';
const MEMBER = 'member-1';

const userCtx = {
  type: 'user' as const,
  workspace: { id: WS },
  userWorkspaceId: UWS,
  workspaceMemberId: MEMBER,
  user: {},
  workspaceMember: {},
} as never;

const makeService = ({
  roleId = 'role-1',
  role,
  throwOnRoleId = false,
}: {
  roleId?: string;
  role?: { universalIdentifier: string; label: string } | null;
  throwOnRoleId?: boolean;
}) => {
  const userRoleService = {
    getRoleIdForUserWorkspace: jest.fn(async () => {
      if (throwOnRoleId) throw new Error('no role for user workspace');

      return roleId;
    }),
  } as unknown as UserRoleService;
  const roleService = {
    getRoleById: jest.fn(async () => role ?? null),
  } as unknown as RoleService;

  return new PropelTierService(userRoleService, roleService);
};

describe('PropelTierService', () => {
  describe('resolveTier', () => {
    it('Admin (standard universalIdentifier) → MANAGER', async () => {
      const svc = makeService({
        role: {
          universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
          label: 'Admin',
        },
      });

      expect(await svc.resolveTier(userCtx)).toBe('MANAGER');
    });

    it('custom "Manager" label → MANAGER', async () => {
      const svc = makeService({
        role: { universalIdentifier: 'other', label: 'Manager' },
      });

      expect(await svc.resolveTier(userCtx)).toBe('MANAGER');
    });

    it.each(['Agent', 'Member', 'Citerra', 'SomethingUnknown'])(
      '%s label → AGENT (fail-closed)',
      async (label) => {
        const svc = makeService({
          role: { universalIdentifier: 'other', label },
        });

        expect(await svc.resolveTier(userCtx)).toBe('AGENT');
      },
    );

    it('no role assigned (getRoleIdForUserWorkspace throws) → AGENT', async () => {
      const svc = makeService({ throwOnRoleId: true });

      expect(await svc.resolveTier(userCtx)).toBe('AGENT');
    });

    it('role lookup miss (getRoleById null) → AGENT', async () => {
      const svc = makeService({ role: null });

      expect(await svc.resolveTier(userCtx)).toBe('AGENT');
    });

    it('non-user context → AGENT (callers handle see-all separately)', async () => {
      const svc = makeService({ role: null });

      expect(
        await svc.resolveTier({ type: 'apiKey' } as never),
      ).toBe('AGENT');
    });
  });

  describe('buildTierFilter', () => {
    it('MANAGER → null (sees all)', async () => {
      const svc = makeService({
        role: {
          universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
          label: 'Admin',
        },
      });

      expect(await svc.buildTierFilter(userCtx)).toBeNull();
    });

    it('AGENT → ownerId == self by default', async () => {
      const svc = makeService({
        role: { universalIdentifier: 'other', label: 'Agent' },
      });

      expect(await svc.buildTierFilter(userCtx)).toEqual({
        ownerId: { eq: MEMBER },
      });
    });

    it('AGENT honors the ownerField option (person → assignedAgentId)', async () => {
      const svc = makeService({
        role: { universalIdentifier: 'other', label: 'Agent' },
      });

      expect(
        await svc.buildTierFilter(userCtx, { ownerField: 'assignedAgentId' }),
      ).toEqual({ assignedAgentId: { eq: MEMBER } });
    });

    it('non-user context → null', async () => {
      const svc = makeService({ role: null });

      expect(
        await svc.buildTierFilter({ type: 'system' } as never),
      ).toBeNull();
    });
  });

  describe('gateBypasses', () => {
    it('MANAGER → true; AGENT → false; non-user → true', async () => {
      const mgr = makeService({
        role: {
          universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
          label: 'Admin',
        },
      });
      const agent = makeService({
        role: { universalIdentifier: 'other', label: 'Agent' },
      });

      expect(await mgr.gateBypasses(userCtx)).toBe(true);
      expect(await agent.gateBypasses(userCtx)).toBe(false);
      expect(await agent.gateBypasses({ type: 'system' } as never)).toBe(true);
    });
  });
});
