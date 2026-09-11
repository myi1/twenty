import { Test, type TestingModule } from '@nestjs/testing';

import { CommonQueryRunnerExceptionCode } from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';
import { PropelWritePolicyService } from 'src/modules/propel-rls/propel-write-policy.service';

// The write half of propel-rls, tested at the decision boundary.
//
// This exists because the gap it closes was PROVEN, not suspected: on staging,
// 2026-09-12, agent A could not read agent B's lead by id, could not list it and could
// not count it — then changed it twice, with updateOne and updateMany, both confirmed in
// Postgres. An agent could not read a record they could overwrite.
//
// Every case below is named for the thing that goes wrong if it regresses, because a
// fail-open here is invisible: nothing errors, the write simply lands.

describe('PropelWritePolicyService.assertMayUpdateRecord', () => {
  const ME = 'member-me';
  const SOMEONE_ELSE = 'member-other';

  let service: PropelWritePolicyService;
  let gateBypasses: jest.Mock;
  let findOne: jest.Mock;

  const userContext = (memberId: string | null = ME): WorkspaceAuthContext =>
    ({
      type: 'user',
      workspace: { id: 'ws-1' },
      userWorkspaceId: 'uw-1',
      workspaceMemberId: memberId,
    }) as unknown as WorkspaceAuthContext;

  const apiKeyContext = (): WorkspaceAuthContext =>
    ({ type: 'apiKey', workspace: { id: 'ws-1' } }) as unknown as WorkspaceAuthContext;

  beforeEach(async () => {
    gateBypasses = jest.fn().mockResolvedValue(false); // AGENT tier unless a test says otherwise
    findOne = jest.fn();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PropelWritePolicyService,
        { provide: PropelTierService, useValue: { gateBypasses } },
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: {
            executeInWorkspaceContext: (fn: () => unknown) => fn(),
            getRepository: jest.fn().mockResolvedValue({ findOne }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(PropelWritePolicyService);
  });

  const expectRefusal = async (p: Promise<void>) => {
    // The refusal must look exactly like the READ refusal — RECORD_NOT_FOUND — so the
    // error cannot be used to probe whether a record exists or who owns it.
    await expect(p).rejects.toMatchObject({
      code: CommonQueryRunnerExceptionCode.RECORD_NOT_FOUND,
    });
  };

  it('refuses an update to a record owned by somebody else — the proven hole', async () => {
    findOne.mockResolvedValue({ id: 'rec-1', assignedAgentId: SOMEONE_ELSE });

    await expectRefusal(service.assertMayUpdateRecord(userContext(), 'person', 'rec-1'));
  });

  it('allows an update to a record the caller owns — or agents cannot do their job', async () => {
    findOne.mockResolvedValue({ id: 'rec-1', assignedAgentId: ME });

    await expect(
      service.assertMayUpdateRecord(userContext(), 'person', 'rec-1'),
    ).resolves.toBeUndefined();
  });

  it('reads the owner column named by the convention, not a hardcoded ownerId', async () => {
    // person → assignedAgentId, task → assigneeId, lanes → ownerId. Filtering on a column
    // the object does not have would return undefined and compare unequal to everything,
    // which fails CLOSED and would block all agent writes — loud, but still a regression.
    findOne.mockResolvedValue({ id: 't-1', assigneeId: ME, ownerId: SOMEONE_ELSE });

    await expect(
      service.assertMayUpdateRecord(userContext(), 'task', 't-1'),
    ).resolves.toBeUndefined();
  });

  it('refuses an UNASSIGNED record, because an agent cannot read one either', async () => {
    // The read filter is `ownerField == me`; null never satisfies it. A pool lead is
    // claimed through the assignment route, not by editing it into your own name.
    findOne.mockResolvedValue({ id: 'rec-1', assignedAgentId: null });

    await expectRefusal(service.assertMayUpdateRecord(userContext(), 'person', 'rec-1'));
  });

  it('does NOT pre-empt a missing record — the resolver answers that', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      service.assertMayUpdateRecord(userContext(), 'person', 'rec-1'),
    ).resolves.toBeUndefined();
  });

  it('refuses a user context carrying no workspace member', async () => {
    // Fail closed. Comparing an absent member against an absent owner would be
    // `undefined === undefined`, handing this caller every unowned record.
    findOne.mockResolvedValue({ id: 'rec-1', assignedAgentId: null });

    await expectRefusal(service.assertMayUpdateRecord(userContext(null), 'person', 'rec-1'));
  });

  it('leaves non-user contexts alone, and does not even look the record up', async () => {
    // Integrations and cron legitimately write across owners, exactly as they READ across
    // owners. Their reads pass the tier filter untouched; their writes must too.
    await expect(
      service.assertMayUpdateRecord(apiKeyContext(), 'person', 'rec-1'),
    ).resolves.toBeUndefined();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('leaves MANAGER tier alone — closing the hole must not break permitted work', async () => {
    gateBypasses.mockResolvedValue(true);

    await expect(
      service.assertMayUpdateRecord(userContext(), 'person', 'rec-1'),
    ).resolves.toBeUndefined();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('ignores objects outside the convention, and costs them no lookup', async () => {
    // An object this module does not read-scope is not write-scoped either. Silently
    // scoping one here would make it stricter to write than to read, which nobody
    // reviewing the read convention would expect.
    await expect(
      service.assertMayUpdateRecord(userContext(), 'whatsAppConversation', 'rec-1'),
    ).resolves.toBeUndefined();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('ignores an empty record id rather than throwing on it', async () => {
    await expect(
      service.assertMayUpdateRecord(userContext(), 'person', ''),
    ).resolves.toBeUndefined();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('bypasses cost nothing — the lookup happens only for a scoped agent', async () => {
    // One indexed primary-key read per agent update is the whole runtime cost of this
    // fence. If a refactor ever moves the lookup above the bypasses, every manager action
    // and every integration write pays for it too.
    findOne.mockResolvedValue({ id: 'rec-1', assignedAgentId: ME });
    await service.assertMayUpdateRecord(userContext(), 'person', 'rec-1');
    expect(findOne).toHaveBeenCalledTimes(1);
  });
});
