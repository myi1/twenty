import { Test, type TestingModule } from '@nestjs/testing';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';

// Focused unit tests for the buildTierFilter `ownerField` extension. The
// 14 original custom-object hooks rely on the default 'ownerId' column;
// person/task/timelineActivity hooks pass non-default field names through
// `options.ownerField`. A regression here would either ship a fail-open
// (filter on a non-existent column → no filter → see all) or a fail-closed
// (wrong column → match nothing).
describe('PropelTierService.buildTierFilter — ownerField extension', () => {
  let service: PropelTierService;

  const userAuthContext = (
    memberId: string | null,
  ): WorkspaceAuthContext =>
    ({
      type: 'user',
      workspace: { id: 'ws-1' },
      userWorkspaceId: 'uw-1',
      workspaceMemberId: memberId,
    }) as unknown as WorkspaceAuthContext;

  const apiKeyAuthContext = (): WorkspaceAuthContext =>
    ({
      type: 'apiKey',
      workspace: { id: 'ws-1' },
    }) as unknown as WorkspaceAuthContext;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PropelTierService,
        { provide: RoleService, useValue: { getRoleById: jest.fn() } },
        { provide: UserRoleService, useValue: { getRoleIdForUserWorkspace: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(PropelTierService);
  });

  it('AGENT + default options → filter on ownerId (preserves 14 legacy hooks)', async () => {
    jest.spyOn(service, 'resolveTier').mockResolvedValue('AGENT');

    const filter = await service.buildTierFilter(userAuthContext('member-1'));

    expect(filter).toEqual({ ownerId: { eq: 'member-1' } });
  });

  it('AGENT + ownerField: assignedAgentId → filter on assignedAgentId (Person hook)', async () => {
    jest.spyOn(service, 'resolveTier').mockResolvedValue('AGENT');

    const filter = await service.buildTierFilter(userAuthContext('member-1'), {
      ownerField: 'assignedAgentId',
    });

    expect(filter).toEqual({ assignedAgentId: { eq: 'member-1' } });
  });

  it('AGENT + ownerField: assigneeId → filter on assigneeId (Task hook)', async () => {
    jest.spyOn(service, 'resolveTier').mockResolvedValue('AGENT');

    const filter = await service.buildTierFilter(userAuthContext('member-1'), {
      ownerField: 'assigneeId',
    });

    expect(filter).toEqual({ assigneeId: { eq: 'member-1' } });
  });

  it('AGENT + ownerField: workspaceMemberId → filter on workspaceMemberId (TimelineActivity hook)', async () => {
    jest.spyOn(service, 'resolveTier').mockResolvedValue('AGENT');

    const filter = await service.buildTierFilter(userAuthContext('member-1'), {
      ownerField: 'workspaceMemberId',
    });

    expect(filter).toEqual({ workspaceMemberId: { eq: 'member-1' } });
  });

  it('MANAGER → null (sees all), regardless of ownerField', async () => {
    jest.spyOn(service, 'resolveTier').mockResolvedValue('MANAGER');

    expect(
      await service.buildTierFilter(userAuthContext('member-1')),
    ).toBeNull();
    expect(
      await service.buildTierFilter(userAuthContext('member-1'), {
        ownerField: 'assignedAgentId',
      }),
    ).toBeNull();
  });

  it('non-user context (apiKey) → null (integrations unfiltered)', async () => {
    const spy = jest.spyOn(service, 'resolveTier');

    expect(await service.buildTierFilter(apiKeyAuthContext())).toBeNull();
    expect(spy).not.toHaveBeenCalled(); // short-circuit before tier resolution
  });

  it('AGENT + hasOwner: false → null (object opted out of owner axis)', async () => {
    jest.spyOn(service, 'resolveTier').mockResolvedValue('AGENT');

    const filter = await service.buildTierFilter(userAuthContext('member-1'), {
      hasOwner: false,
      ownerField: 'assignedAgentId',
    });

    expect(filter).toBeNull();
  });

  it('AGENT + missing workspaceMemberId → null (defensive, no filter to bind)', async () => {
    jest.spyOn(service, 'resolveTier').mockResolvedValue('AGENT');

    const filter = await service.buildTierFilter(userAuthContext(null), {
      ownerField: 'assignedAgentId',
    });

    expect(filter).toBeNull();
  });
});
