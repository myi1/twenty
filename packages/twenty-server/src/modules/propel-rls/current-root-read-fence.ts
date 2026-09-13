import {
  type EntityMetadata,
  type ObjectLiteral,
  type SelectQueryBuilder,
} from 'typeorm';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceInternalContext } from 'src/engine/twenty-orm/interfaces/workspace-internal-context.interface';
import {
  TwentyORMException,
  TwentyORMExceptionCode,
} from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

// Bounded read policy copied from the approved app projection-registry V1.
// Unknown metadata targets never acquire a root resolver by naming convention.
const CONTACT_TARGETS: Readonly<Record<string, string>> = Object.freeze({
  targetWhatsAppConversationId: 'whatsAppConversation',
  targetSocialConversationId: 'socialConversation',
  targetSecondaryOpportunityId: 'secondaryOpportunity',
  targetSellOpportunityId: 'sellOpportunity',
  targetOffPlanOpportunityId: 'offPlanOpportunity',
  targetRcbiOpportunityId: 'rcbiOpportunity',
  targetInstitutionalOpportunityId: 'institutionalOpportunity',
  targetDealId: 'deal',
  targetCallId: 'call',
  targetChainLinkId: 'chainLink',
  targetOffPlanInterestId: 'offPlanInterest',
  targetOffPlanPitchId: 'offPlanPitch',
});
const PROTECTED = new Set(['whatsAppMessage', 'taskTarget']);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const refuse = (): never => {
  throw new TwentyORMException(
    'Current-root read boundary unavailable',
    TwentyORMExceptionCode.RLS_VALIDATION_FAILED,
  );
};
const quote = (value: string): string => {
  if (!IDENTIFIER.test(value) || value.length > 63) return refuse();
  return `"${value}"`;
};
const column = (
  metadata: EntityMetadata,
  alias: string,
  property: string,
): string => {
  const matches = metadata.columns.filter(
    (candidate) => candidate.propertyName === property,
  );
  if (matches.length !== 1) return refuse();
  return `${quote(alias)}.${quote(matches[0].databaseName)}`;
};
const table = (metadata: EntityMetadata, schema: string): string => {
  if (metadata.schema !== schema) return refuse();
  return `${quote(schema)}.${quote(metadata.tableName)}`;
};

type AppliedFence = {
  before: string;
  after: string;
  joins: Map<object, { before: string | undefined; after: string }>;
};
// Refresh per execution; never memoize authorization or a role decision. Clones
// already retain SQL predicates and parameters through TypeORM's expression map.
const previousFences = new WeakMap<object, AppliedFence>();

export const applyCurrentRootReadFence = <T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  internalContext: WorkspaceInternalContext,
  authContext: WorkspaceAuthContext,
): void => {
  // Existing service/system policy is intentionally unresolved by this human slice.
  if (authContext?.type !== 'user') return;
  const expression = queryBuilder.expressionMap;
  // Opaque FROM/JOIN/CTE SQL cannot be inspected safely for hidden child reads.
  // TypeORM's internal pagination wraps an already-fenced SELECT separately.
  if (
    !expression.mainAlias?.hasMetadata ||
    expression.mainAlias.subQuery ||
    expression.commonTableExpressions.length ||
    expression.aliases.some((alias) => alias.subQuery || !alias.hasMetadata)
  )
    return refuse();
  const protectedAliases = expression.aliases.filter(
    (alias) =>
      PROTECTED.has(String(alias.metadata.target)) ||
      ['_whatsAppMessage', 'taskTarget'].includes(alias.metadata.tableName),
  );
  if (!protectedAliases.length) {
    // These loaders make separate plain TypeORM queries; their target is absent
    // from the parent's alias list and must not silently evade this boundary.
    const secondaryReads = [
      ...expression.relationIdAttributes,
      ...expression.relationCountAttributes,
    ];
    if (
      secondaryReads.some((attribute) =>
        PROTECTED.has(String(attribute.relation.inverseEntityMetadata.target)),
      )
    )
      return refuse();
    return;
  }
  if (
    expression.relationIdAttributes.length ||
    expression.relationCountAttributes.length ||
    expression.relationLoadStrategy === 'query'
  )
    return refuse();
  const workspaceId = internalContext.workspaceId;
  const memberId = authContext.workspaceMemberId;
  const userId = authContext.user?.id;
  const userWorkspaceId = authContext.userWorkspaceId;
  if (
    ![workspaceId, memberId, userId, userWorkspaceId].every(
      (value) => typeof value === 'string' && UUID.test(value),
    ) ||
    authContext.workspace?.id !== workspaceId ||
    authContext.workspaceMember?.id !== memberId ||
    authContext.workspaceMember?.userId !== userId
  )
    return refuse();
  const schema = getWorkspaceSchemaName(workspaceId);
  const workspaceMetadata = (name: string): EntityMetadata => {
    const metadata = queryBuilder.connection.getMetadata(name);
    if (metadata.target !== name) return refuse();
    table(metadata, schema);
    return metadata;
  };
  const coreMetadata = (name: string): EntityMetadata => {
    const metadata = internalContext.coreDataSource.getMetadata(name);
    table(metadata, 'core');
    return metadata;
  };
  const person = workspaceMetadata('person');
  const member = workspaceMetadata('workspaceMember');
  const user = coreMetadata('UserEntity');
  const userWorkspace = coreMetadata('UserWorkspaceEntity');
  const role = coreMetadata('RoleEntity');
  const roleTarget = coreMetadata('RoleTargetEntity');
  const parameters = queryBuilder.getParameters();
  let sequence = 0;
  let prefix: string;
  do {
    prefix = `pcr${sequence++}`;
  } while (
    Object.keys(parameters).some((key) => key.startsWith(`${prefix}_`)) ||
    expression.aliases.some((alias) => alias.name.startsWith(prefix))
  );
  const aliases = {
    person: `${prefix}_person`,
    member: `${prefix}_member`,
    user: `${prefix}_user`,
    userWorkspace: `${prefix}_user_workspace`,
    role: `${prefix}_role`,
    roleTarget: `${prefix}_role_target`,
  };
  const bound = (key: string, value: string): string => {
    const name = `${prefix}_${key}`;
    queryBuilder.setParameter(name, value);
    return `:${name}`;
  };
  const actor = bound('member_id', memberId);
  const userParameter = bound('user_id', userId);
  const membership = bound('membership_id', userWorkspaceId);
  const workspace = bound('workspace_id', workspaceId);
  const managerUid = bound(
    'manager_uid',
    '20000000-0000-4000-8000-000000000001',
  );
  const adminUid = bound('admin_uid', STANDARD_ROLE.admin.universalIdentifier);
  const from = (metadata: EntityMetadata, alias: string, schemaName = schema) =>
    `${table(metadata, schemaName)} ${quote(alias)}`;
  const active = (metadata: EntityMetadata, alias: string) =>
    `${column(metadata, alias, 'deletedAt')} IS NULL`;
  const memberCheck = `EXISTS (SELECT 1 FROM ${from(userWorkspace, aliases.userWorkspace, 'core')}
    INNER JOIN ${from(user, aliases.user, 'core')} ON ${column(user, aliases.user, 'id')} = ${column(userWorkspace, aliases.userWorkspace, 'userId')}
    INNER JOIN ${from(member, aliases.member)} ON ${column(member, aliases.member, 'userId')} = ${column(user, aliases.user, 'id')}
    WHERE ${column(userWorkspace, aliases.userWorkspace, 'id')} = ${membership}
      AND ${column(userWorkspace, aliases.userWorkspace, 'workspaceId')} = ${workspace}
      AND ${column(user, aliases.user, 'id')} = ${userParameter}
      AND ${column(member, aliases.member, 'id')} = ${actor}
      AND ${active(userWorkspace, aliases.userWorkspace)} AND ${active(user, aliases.user)} AND ${active(member, aliases.member)})`;
  const managerCheck = `EXISTS (SELECT 1 FROM ${from(roleTarget, aliases.roleTarget, 'core')}
    INNER JOIN ${from(role, aliases.role, 'core')} ON ${column(role, aliases.role, 'id')} = ${column(roleTarget, aliases.roleTarget, 'roleId')}
    WHERE ${column(roleTarget, aliases.roleTarget, 'userWorkspaceId')} = ${membership}
      AND ${column(roleTarget, aliases.roleTarget, 'workspaceId')} = ${workspace}
      AND ${column(roleTarget, aliases.roleTarget, 'agentId')} IS NULL
      AND ${column(roleTarget, aliases.roleTarget, 'apiKeyId')} IS NULL
      AND ${column(role, aliases.role, 'workspaceId')} = ${workspace}
      AND ${column(role, aliases.role, 'universalIdentifier')} IN (${adminUid}, ${managerUid}))`;
  const personCheck = (
    reference: string,
  ): string => `EXISTS (SELECT 1 FROM ${from(person, aliases.person)}
    WHERE ${column(person, aliases.person, 'id')} = ${reference} AND ${active(person, aliases.person)}
    AND (${column(person, aliases.person, 'assignedAgentId')} = ${actor} OR ${managerCheck}))`;
  let parentSequence = 0;
  const contactCheck = (name: string, reference: string): string => {
    const metadata = workspaceMetadata(name);
    const alias = `${prefix}_parent${parentSequence++}`;
    return `EXISTS (SELECT 1 FROM ${from(metadata, alias)} WHERE ${column(metadata, alias, 'id')} = ${reference}
      AND ${active(metadata, alias)} AND ${personCheck(column(metadata, alias, 'contactId'))})`;
  };
  const predicates = protectedAliases.map((alias) => {
    quote(alias.name);
    const metadata = workspaceMetadata(String(alias.metadata.target));
    if (alias.metadata !== metadata || !PROTECTED.has(String(metadata.target)))
      return refuse();
    let roots: string;
    if (metadata.target === 'whatsAppMessage') {
      roots = contactCheck(
        'whatsAppConversation',
        column(metadata, alias.name, 'conversationId'),
      );
    } else {
      // Enumerate every actual ORM target column, including newly added fields.
      const targets = metadata.columns.filter(
        (candidate) =>
          /^target.*Id$/.test(candidate.propertyName) ||
          /^target.*Id$/.test(candidate.databaseName),
      );
      if (!targets.length) return refuse();
      const present: string[] = [];
      const allowed = targets.map((target) => {
        const reference = column(metadata, alias.name, target.propertyName);
        if (target.propertyName === 'targetPersonId') {
          present.push(`${reference} IS NOT NULL`);
          return `(${reference} IS NULL OR ${personCheck(reference)})`;
        }
        const name = CONTACT_TARGETS[target.propertyName];
        if (!name) return `${reference} IS NULL`;
        present.push(`${reference} IS NOT NULL`);
        return `(${reference} IS NULL OR ${contactCheck(name, reference)})`;
      });
      roots = `(${present.length ? present.join(' OR ') : 'FALSE'}) AND ${allowed.join(' AND ')}`;
    }
    return {
      alias,
      predicate: `(${active(metadata, alias.name)} AND ${memberCheck} AND (${roots}))`,
    };
  });
  const previous = previousFences.get(queryBuilder);
  let before = expression.extraAppendedAndWhereCondition;
  if (previous?.after === before) before = previous.before;
  const rootPredicates: string[] = [];
  const joins: AppliedFence['joins'] = new Map();
  for (const { alias, predicate } of predicates) {
    if (alias.name === expression.mainAlias?.name) {
      rootPredicates.push(predicate);
    } else {
      const join = expression.joinAttributes.find(
        (candidate) => candidate.alias.name === alias.name,
      );
      if (
        !join ||
        !['LEFT', 'INNER'].includes(join.direction) ||
        join.relation?.isManyToMany
      )
        return refuse();
      const old = previous?.joins.get(join);
      const condition =
        old?.after === join.condition ? old.before : join.condition;
      const after = condition ? `(${condition}) AND ${predicate}` : predicate;
      joins.set(join, { before: condition, after });
      // Filtering ON preserves unrelated roots of a LEFT JOIN.
      join.condition = after;
    }
  }
  const after = [before, ...rootPredicates]
    .filter(Boolean)
    .map((part) => `(${part})`)
    .join(' AND ');
  expression.extraAppendedAndWhereCondition = after;
  // A cached result would bypass the current membership/ownership SELECT entirely.
  expression.cache = false;
  previousFences.set(queryBuilder, { before, after, joins });
};
