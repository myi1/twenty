import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { transpileModule, ModuleKind, ScriptTarget } = require('typescript');
const { DataSource, EntitySchema, SelectQueryBuilder } = require('typeorm');
const root = path.resolve(import.meta.dirname, '../..');
const server = path.join(root, 'packages/twenty-server');
// Only unrelated permissions, formatting, exception translation and mutation builders
// are replaced. The SELECT builder, read fence, TypeORM metadata and SQL driver run.
const stubs = {
  'src/engine/twenty-orm/repository/permissions.utils': {
    validateQueryIsPermittedOrThrow() {},
  },
  'src/engine/twenty-orm/utils/apply-row-level-permission-predicates.util': {
    applyRowLevelPermissionPredicates() {},
  },
  'src/engine/twenty-orm/error-handling/compute-twenty-orm-exception': {
    computeTwentyORMException: async (error) => error,
  },
  'src/engine/twenty-orm/utils/format-result.util': {
    formatResult: (value) => value,
  },
  'src/engine/twenty-orm/utils/get-object-metadata-from-entity-target.util': {
    getObjectMetadataFromEntityTarget: () => ({}),
  },
};
for (const name of ['delete', 'insert', 'soft-delete', 'update'])
  stubs[`src/engine/twenty-orm/repository/workspace-${name}-query-builder`] =
    {};
class TestPermissionError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
stubs['src/engine/metadata-modules/permissions/permissions.exception'] = {
  PermissionsException: TestPermissionError,
  PermissionsExceptionCode: { METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED' },
};
stubs['src/engine/twenty-orm/exceptions/twenty-orm.exception'] = {
  TwentyORMException: TestPermissionError,
  TwentyORMExceptionCode: {
    MALFORMED_METADATA: 'MALFORMED_METADATA',
    RLS_VALIDATION_FAILED: 'RLS_VALIDATION_FAILED',
  },
};
const loaded = new Map();
function loadTypeScript(file) {
  if (loaded.has(file)) return loaded.get(file);
  const output = transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ES2022,
      experimentalDecorators: true,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  loaded.set(file, exports);
  const localRequire = (id) =>
    stubs[id] ??
    (id.startsWith('src/')
      ? loadTypeScript(path.join(server, `${id}.ts`))
      : id.startsWith('.')
        ? loadTypeScript(path.resolve(path.dirname(file), `${id}.ts`))
        : require(id));
  new Function('require', 'exports', output)(localRequire, exports);
  return exports;
}
const { WorkspaceSelectQueryBuilder } = loadTypeScript(
  path.join(
    server,
    'src/engine/twenty-orm/repository/workspace-select-query-builder.ts',
  ),
);
const workspaceId = '11111111-1111-4111-8111-111111111111';
const memberId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const userWorkspaceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const schema = `workspace_${BigInt(`0x${workspaceId.replaceAll('-', '')}`).toString(36)}`;
const entity = (name, tableName, schemaName, fields) =>
  new EntitySchema({
    name,
    tableName,
    schema: schemaName,
    columns: Object.fromEntries(
      ['id', ...fields].map((field) => [
        field,
        {
          type: field === 'deletedAt' ? 'timestamptz' : 'uuid',
          primary: field === 'id',
          nullable: field !== 'id',
          deleteDate: field === 'deletedAt',
        },
      ]),
    ),
  });
async function fixture(target = 'whatsAppMessage', extraTargets = []) {
  const workspace = new DataSource({
    type: 'postgres',
    entities: [
      entity('person', 'person', schema, ['deletedAt', 'assignedAgentId']),
      entity('workspaceMember', 'workspaceMember', schema, [
        'deletedAt',
        'userId',
      ]),
      entity('whatsAppConversation', '_whatsAppConversation', schema, [
        'deletedAt',
        'contactId',
        'ownerId',
      ]),
      entity('whatsAppMessage', '_whatsAppMessage', schema, [
        'deletedAt',
        'conversationId',
      ]),
      entity('deal', '_deal', schema, ['deletedAt', 'contactId', 'ownerId']),
      entity('taskTarget', 'taskTarget', schema, [
        'deletedAt',
        'taskId',
        'targetPersonId',
        'targetDealId',
        ...extraTargets,
      ]),
    ],
  });
  const core = new DataSource({
    type: 'postgres',
    schema: 'core',
    entities: [
      entity('UserEntity', 'user', 'core', ['deletedAt']),
      entity('UserWorkspaceEntity', 'userWorkspace', 'core', [
        'deletedAt',
        'userId',
        'workspaceId',
      ]),
      entity('RoleEntity', 'role', 'core', [
        'workspaceId',
        'universalIdentifier',
      ]),
      entity('RoleTargetEntity', 'roleTarget', 'core', [
        'workspaceId',
        'userWorkspaceId',
        'roleId',
        'apiKeyId',
        'agentId',
      ]),
    ],
  });
  await workspace.buildMetadatas();
  await core.buildMetadatas();
  const auth = {
    type: 'user',
    workspace: { id: workspaceId },
    user: { id: userId },
    workspaceMemberId: memberId,
    workspaceMember: { id: memberId, userId },
    userWorkspaceId,
  };
  const context = { workspaceId, coreDataSource: core };
  const builder = new WorkspaceSelectQueryBuilder(
    workspace.createQueryBuilder(target, 'child'),
    {},
    context,
    true,
    auth,
    {},
  );
  return { builder, auth, context, workspace, core };
}

for (const target of ['whatsAppMessage', 'taskTarget'])
  test(`${target} actual SELECT cannot rely on caller filter instead of current owner`, async () => {
    const { builder } = await fixture(target);
    builder.where('child.id = :id OR 1=1', { id: userId });
    builder.validatePermissions();
    const [sql, values] = builder.getQueryAndParameters();
    assert.match(sql, /assignedAgentId/);
    assert.match(sql, /"core"\."userWorkspace"/);
    assert.match(sql, /"core"\."user"/);
    assert.match(sql, /"workspaceMember"/);
    assert.ok(values.includes(memberId));
    assert.ok(values.includes(userWorkspaceId));
    assert.ok(values.includes(workspaceId));
    assert.doesNotMatch(sql, /ownerId|assigneeId/);
  });

test('missing, malformed and mismatched human identity refuses before SQL even with permission bypass', async () => {
  for (const change of [
    (auth) => {
      delete auth.workspaceMemberId;
    },
    (auth) => {
      auth.user.id = 'injected';
    },
    (auth) => {
      auth.userWorkspaceId = '';
    },
    (auth) => {
      auth.workspace.id = userId;
    },
    (auth) => {
      auth.workspaceMember.id = userId;
    },
    (auth) => {
      auth.workspaceMember.userId = memberId;
    },
  ]) {
    const { builder, auth } = await fixture();
    change(auth);
    assert.throws(
      () => builder.validatePermissions(),
      /Current-root read boundary/,
    );
  }
});

test('manager exception uses live bound role UIDs and active membership, never request role/cache', async () => {
  const { builder, auth, context } = await fixture();
  auth.role = { label: 'Manager', universalIdentifier: 'forged' };
  context.userWorkspaceRoleMap = { [userWorkspaceId]: 'stale-admin' };
  builder.validatePermissions();
  const [sql, values] = builder.getQueryAndParameters();
  assert.match(sql, /"core"\."roleTarget"/);
  assert.match(sql, /"core"\."role"/);
  assert.match(sql, /"universalIdentifier" IN \(\$\d+, \$\d+\)/);
  assert.ok(values.includes('20202020-02c2-43f2-b94d-cab1f2b532eb'));
  assert.ok(values.includes('20000000-0000-4000-8000-000000000001'));
  assert.ok(!values.includes('stale-admin') && !values.includes('forged'));
  for (const name of ['user_workspace', 'user', 'member', 'person', 'parent0'])
    assert.match(sql, new RegExp(`"pcr0_${name}"\\."deletedAt" IS NULL`));
});

test('all metadata targets must be null or have active allowed roots; newly introduced targets deny when present', async () => {
  const { builder } = await fixture('taskTarget', [
    'targetBrandNewId',
    'targetCompanyId',
  ]);
  builder.validatePermissions();
  const [sql] = builder.getQueryAndParameters();
  assert.match(sql, /"child"\."targetBrandNewId" IS NULL/);
  assert.match(sql, /"child"\."targetCompanyId" IS NULL/);
  assert.match(
    sql,
    /"child"\."targetPersonId" IS NOT NULL OR "child"\."targetDealId" IS NOT NULL/,
  );
  assert.match(sql, /"child"\."targetPersonId" IS NULL OR EXISTS/);
  assert.match(sql, /"child"\."targetDealId" IS NULL OR EXISTS/);
  assert.match(sql, /"pcr0_parent0"\."contactId"/);
  assert.match(sql, /AND \("child"\."targetDealId" IS NULL OR EXISTS/);
});

test('absent parent/owner metadata and wrong workspace schemas fail closed', async () => {
  for (const mutate of [
    (workspace) => {
      workspace.getMetadata('person').columns = workspace
        .getMetadata('person')
        .columns.filter((field) => field.propertyName !== 'assignedAgentId');
    },
    (workspace) => {
      workspace.getMetadata('whatsAppConversation').schema = 'public';
    },
    (workspace) => {
      workspace.getMetadata('whatsAppMessage').tableName = 'malicious";SELECT';
    },
    (workspace) => {
      workspace.getMetadata('whatsAppConversation').columns = workspace
        .getMetadata('whatsAppConversation')
        .columns.filter((field) => field.propertyName !== 'contactId');
    },
  ]) {
    const { builder, workspace } = await fixture();
    mutate(workspace);
    assert.throws(
      () => builder.validatePermissions(),
      /Current-root read boundary/,
    );
  }
});

test('caller OR and caller extra AND remain outside the mandatory scope, including withDeleted', async () => {
  const { builder } = await fixture();
  builder.withDeleted().where('child.id = :id', { id: userId }).orWhere('1=1');
  builder.expressionMap.extraAppendedAndWhereCondition = '2=2';
  builder.validatePermissions();
  const [sql] = builder.getQueryAndParameters();
  assert.match(
    sql,
    /WHERE \( "child"\."id" = \$1 OR 1=1 \) AND \( \(2=2\) AND/,
  );
  assert.match(sql, /"child"\."deletedAt" IS NULL AND EXISTS/);
});

test('joined protected targets restrict ON, retain unrelated LEFT JOIN roots and survive clones', async () => {
  for (const target of ['whatsAppMessage', 'taskTarget']) {
    const { builder, workspace, auth, context } = await fixture();
    const joined = new WorkspaceSelectQueryBuilder(
      workspace.createQueryBuilder('person', 'root'),
      {},
      context,
      true,
      auth,
      {},
    );
    joined.leftJoinAndSelect(target, 'child', 'child.id = :id OR 1=1', {
      id: userId,
    });
    joined.validatePermissions();
    const [sql] = joined.getQueryAndParameters();
    const on = sql.slice(sql.indexOf(' ON '), sql.lastIndexOf(' WHERE '));
    assert.match(on, /assignedAgentId/);
    assert.match(on, /"child"\."id" = \$1 OR 1=1/);
    assert.doesNotMatch(sql.slice(sql.lastIndexOf(' WHERE ')), /pcr\d+_member/);
    assert.match(joined.clone().getQueryAndParameters()[0], /assignedAgentId/);
    assert.match(joined.clone().getQueryAndParameters()[0], /LEFT JOIN/);
    assert.equal(builder.shouldBypassPermissionChecks, true);
  }
});

test('quoted injection aliases refuse and parameter/alias namespaces cannot collide', async () => {
  const { builder, workspace, auth, context } = await fixture();
  const bad = new WorkspaceSelectQueryBuilder(
    workspace.createQueryBuilder('whatsAppMessage', 'bad" OR true --'),
    {},
    context,
    true,
    auth,
    {},
  );
  assert.throws(() => bad.validatePermissions(), /Current-root read boundary/);
  builder.setParameter('pcr0_member_id', 'untrusted');
  builder.validatePermissions();
  assert.equal(builder.getParameters().pcr0_member_id, 'untrusted');
  assert.equal(builder.getParameters().pcr1_member_id, memberId);
  const oldSqlLength = builder.getQuery().length;
  builder.validatePermissions();
  assert.ok(builder.getQuery().length < oldSqlLength + 100);
});

test('protected reads always disable result caching so transfer/revocation is checked in SQL', async () => {
  const { builder } = await fixture();
  builder.cache('shared-privacy-cache', 60000);
  builder.validatePermissions();
  assert.equal(builder.expressionMap.cache, false);
  assert.equal(builder.clone().expressionMap.cache, false);
});

test('unsupported raw FROM/subquery/CTE and secondary relation loaders refuse', async () => {
  for (const change of [
    (builder) => {
      builder.expressionMap.mainAlias.subQuery = '(SELECT * FROM arbitrary)';
    },
    (builder) => {
      builder.addCommonTableExpression('SELECT 1', 'opaque');
    },
    (builder) => {
      builder.expressionMap.relationLoadStrategy = 'query';
    },
    (builder) => {
      builder.expressionMap.relationCountAttributes.push({});
    },
    (builder) => {
      builder.expressionMap.relationIdAttributes.push({});
    },
  ]) {
    const { builder } = await fixture();
    change(builder);
    assert.throws(
      () => builder.validatePermissions(),
      /Current-root read boundary/,
    );
  }
});

test('non-human and ordinary unprotected entity reads retain existing behavior', async () => {
  for (const type of [
    'system',
    'apiKey',
    'application',
    'pendingActivationUser',
  ]) {
    const { builder, auth } = await fixture();
    auth.type = type;
    builder.validatePermissions();
    assert.doesNotMatch(builder.getQuery(), /pcr0/);
  }
  const { builder } = await fixture('person');
  builder.validatePermissions();
  assert.doesNotMatch(builder.getQuery(), /pcr0/);
});

// Driver capture replaces only network execution. It proves emitted SQL for each
// real public execution path; it cannot prove PostgreSQL row-level outcomes.
for (const method of [
  'execute',
  'getMany',
  'getRawOne',
  'getRawMany',
  'getOne',
  'getOneOrFail',
  'getCount',
  'getManyAndCount',
  'getRawAndEntities',
  'stream',
]) {
  for (const target of ['whatsAppMessage', 'taskTarget'])
    test(`${method} ${target} emits the fenced PostgreSQL SELECT even with internal permission bypass`, async () => {
      const { builder, workspace } = await fixture(target);
      const queries = [];
      const runner = workspace.createQueryRunner();
      runner.query = async (sql, values, structured) => {
        queries.push({ sql, values });
        const records = /COUNT\(/.test(sql) ? [{ cnt: '0' }] : [];
        return structured
          ? { records, raw: records, affected: records.length }
          : records;
      };
      runner.stream = async (sql, values) => {
        queries.push({ sql, values });
        return null;
      };
      builder.setQueryRunner(runner);
      try {
        await builder[method]();
      } catch (error) {
        assert.equal(method, 'getOneOrFail');
        assert.equal(error.name, 'EntityNotFoundError');
      }
      assert.ok(queries.length >= 1);
      for (const { sql, values } of queries) {
        assert.match(sql, /assignedAgentId/);
        assert.match(sql, /"core"\."userWorkspace"/);
        assert.ok(values.includes(memberId));
      }
      if (method === 'getCount') assert.match(queries[0].sql, /COUNT\(/);
      if (method === 'getManyAndCount')
        assert.ok(queries.some(({ sql }) => /COUNT\(/.test(sql)));
    });
}

test('exists methods remain refused', async () => {
  const { builder } = await fixture();
  assert.throws(() => builder.getExists(), /not supported/);
  assert.throws(() => builder.executeExistsQuery(), /not supported/);
});

test('nested contact-only caller join still fences raw message read without trusting conversation owner', async () => {
  const { builder } = await fixture();
  builder.leftJoin(
    'whatsAppConversation',
    'conversation',
    'conversation.id = child.conversationId',
  );
  builder.where('conversation.contactId = :contact', { contact: userId });
  builder.validatePermissions();
  const [sql, values] = builder.getQueryAndParameters();
  assert.match(sql, /"conversation"\."contactId" = \$1/);
  assert.match(sql, /"pcr0_parent0"\."id" = "child"\."conversationId"/);
  assert.match(sql, /"pcr0_person"\."id" = "pcr0_parent0"\."contactId"/);
  assert.ok(values.includes(memberId));
  assert.doesNotMatch(sql, /ownerId/);
});

test('paginated joined entity read emits fenced inner SQL in TypeORM distinct/count clones', async () => {
  const { builder, workspace } = await fixture('taskTarget');
  const runner = workspace.createQueryRunner();
  const queries = [];
  runner.query = async (sql, values, structured) => {
    queries.push({ sql, values });
    const records = /COUNT\(/.test(sql) ? [{ cnt: '0' }] : [];
    return structured
      ? { records, raw: records, affected: records.length }
      : records;
  };
  builder
    .setQueryRunner(runner)
    .leftJoin('person', 'root', 'root.id = child.targetPersonId')
    .take(1)
    .skip(1);
  await builder.getManyAndCount();
  assert.ok(queries.some(({ sql }) => /SELECT DISTINCT/.test(sql)));
  assert.ok(queries.some(({ sql }) => /COUNT\(/.test(sql)));
  for (const { sql, values } of queries) {
    assert.match(sql, /assignedAgentId/);
    assert.match(sql, /"core"\."userWorkspace"/);
    assert.ok(values.includes(memberId));
  }
});

test('every approved contact target in runtime metadata gets its own active root check', async () => {
  const mapping = {
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
  };
  const { builder, workspace } = await fixture(
    'taskTarget',
    Object.keys(mapping).filter((key) => key !== 'targetDealId'),
  );
  const additional = Object.values(mapping)
    .filter((name) => !['whatsAppConversation', 'deal'].includes(name))
    .map((name) =>
      entity(name, `_${name}`, schema, ['deletedAt', 'contactId']),
    );
  workspace.setOptions({
    entities: [...workspace.options.entities, ...additional],
  });
  await workspace.buildMetadatas();
  // Recreate the builder so aliases bind the rebuilt metadata, as the engine does.
  const current = new WorkspaceSelectQueryBuilder(
    workspace.createQueryBuilder('taskTarget', 'child'),
    {},
    builder.internalContext,
    true,
    builder.authContext,
    {},
  );
  current.validatePermissions();
  const [sql] = current.getQueryAndParameters();
  for (const [field, name] of Object.entries(mapping)) {
    assert.match(sql, new RegExp(`"child"\\."${field}" IS NULL OR EXISTS`));
    assert.ok(sql.includes(`"_${name}"`));
  }
  assert.equal((sql.match(/"assignedAgentId"/g) ?? []).length, 13);
});

test('relation count and ID loaders on unprotected parents cannot hide protected child reads', async () => {
  const { builder, workspace } = await fixture('person');
  workspace.options.entities.find(
    (candidate) => candidate.options.name === 'person',
  ).options.relations = {
    taskTargets: {
      type: 'one-to-many',
      target: 'taskTarget',
      inverseSide: 'targetPerson',
    },
  };
  workspace.options.entities.find(
    (candidate) => candidate.options.name === 'taskTarget',
  ).options.relations = {
    targetPerson: {
      type: 'many-to-one',
      target: 'person',
      joinColumn: { name: 'targetPersonId' },
    },
  };
  await workspace.buildMetadatas();
  for (const method of ['loadRelationIdAndMap', 'loadRelationCountAndMap']) {
    const current = new WorkspaceSelectQueryBuilder(
      workspace.createQueryBuilder('person', 'root'),
      {},
      builder.internalContext,
      true,
      builder.authContext,
      {},
    );
    current[method]('root.targetCount', 'root.taskTargets');
    assert.throws(
      () => current.validatePermissions(),
      /Current-root read boundary/,
    );
  }
});

// Invoke the real group-by producer method. These injected services/parser branches
// are unused by the no-orderBy fixture; query construction and partitioning are real.
stubs['@nestjs/common'] = {
  Inject: () => () => {},
  Injectable: () => (target) => target,
};
for (const id of [
  'src/engine/api/common/common-nested-relations-processor/process-nested-relations.helper',
  'src/engine/api/common/common-result-getters/common-result-getters.service',
  'src/engine/api/graphql/graphql-query-runner/graphql-query-parsers/graphql-query.parser',
  'src/engine/api/graphql/graphql-query-runner/graphql-query-parsers/utils/add-relation-join-alias.util',
  'src/engine/api/graphql/graphql-query-runner/group-by/resolvers/utils/format-result-with-group-by-dimension-values.util',
  'src/engine/api/graphql/graphql-query-runner/utils/build-columns-to-select',
])
  stubs[id] = {};
const { GroupByWithRecordsService } = loadTypeScript(
  path.join(
    server,
    'src/engine/api/graphql/graphql-query-runner/group-by/services/group-by-with-records.service.ts',
  ),
);
async function groupByFixture(target = 'person', changeInner = () => {}) {
  const { builder, workspace, auth, context } = await fixture(target);
  const create = () =>
    new WorkspaceSelectQueryBuilder(
      workspace.createQueryBuilder(target, target),
      {},
      context,
      true,
      auth,
      {},
    );
  const inner = create().where(`${target}.id = :id`, { id: userId });
  changeInner(inner);
  const wrapper = new GroupByWithRecordsService().addPartitionByToQueryBuilder({
    queryBuilderForSubQuery: inner,
    columnsToSelect: { id: true },
    groupsResult: [{ group_id: userId }],
    groupByDefinitions: [{ alias: 'group_id', expression: `"${target}"."id"` }],
    repository: { createQueryBuilder: create },
    orderByForRecords: {},
    flatObjectMetadata: { nameSingular: target },
    flatObjectMetadataMaps: {},
    flatFieldMetadataMaps: {},
  });
  const queries = [];
  const runner = workspace.createQueryRunner();
  runner.query = async (sql, values, structured) => {
    queries.push({ sql, values });
    return structured ? { records: [], raw: [], affected: 0 } : [];
  };
  wrapper.setQueryRunner(runner);
  return { wrapper, inner, queries, auth, context, workspace, builder };
}

for (const target of ['person', 'deal'])
  test(`real ${target} group-by ranked_records wrapper remains executable for humans`, async () => {
    const { wrapper, queries } = await groupByFixture(target);
    assert.equal(wrapper.expressionMap.aliases.length, 1);
    assert.ok(wrapper.expressionMap.mainAlias.subQuery);
    await wrapper.getRawMany();
    assert.equal(queries.length, 1);
    assert.match(queries[0].sql, /JSON_AGG/);
    assert.match(queries[0].sql, /ROW_NUMBER\(\) OVER/);
    assert.match(queries[0].sql, /ranked_records/);
    assert.ok(queries[0].values.includes(userId));
  });

for (const target of ['whatsAppMessage', 'taskTarget'])
  test(`real protected ${target} group-by wrapper embeds current SQL checks and cannot cache them away`, async () => {
    const { wrapper, queries } = await groupByFixture(target);
    wrapper.cache('unsafe-group-cache', 60000);
    await wrapper.getRawMany();
    assert.equal(wrapper.expressionMap.cache, false);
    assert.equal(queries.length, 1);
    assert.match(queries[0].sql, /JSON_AGG/);
    assert.match(queries[0].sql, /assignedAgentId/);
    assert.match(queries[0].sql, /"core"\."userWorkspace"/);
    assert.match(queries[0].sql, /"core"\."roleTarget"/);
    assert.ok(queries[0].values.includes(memberId));
    assert.ok(queries[0].values.includes(workspaceId));
    assert.ok(queries[0].values.includes(userWorkspaceId));
    assert.doesNotMatch(queries[0].sql, /ownerId|assigneeId/);
  });

test('the group-by producer cannot certify an opaque inner or wrong-workspace metadata', async () => {
  await assert.rejects(
    () =>
      groupByFixture('person', (inner) => {
        inner.from('(SELECT * FROM "unknown"."_whatsAppMessage")', 'opaque');
      }),
    /Current-root read boundary/,
  );
  await assert.rejects(
    () =>
      groupByFixture('person', (inner) => {
        inner.expressionMap.mainAlias.metadata.schema = 'workspace_wrong';
      }),
    /Current-root read boundary/,
  );
  await assert.rejects(
    () =>
      groupByFixture('whatsAppMessage', (inner) => {
        inner.authContext.workspaceMemberId = '';
      }),
    /Current-root read boundary/,
  );
});

test('tampered group-by SQL and parameters refuse before driver execution', async () => {
  for (const change of [
    (wrapper) => {
      wrapper.select('(SELECT id FROM "unknown"."_whatsAppMessage" LIMIT 1)');
    },
    (wrapper) => {
      wrapper.expressionMap.mainAlias.subQuery =
        '(SELECT * FROM "unknown"."_whatsAppMessage")';
    },
    (wrapper) => {
      wrapper.setParameter('pcr0_member_id', userId);
    },
    (wrapper) => {
      wrapper.expressionMap.parameters.id = () => 'NULL OR TRUE';
    },
    (wrapper) => {
      wrapper.addCommonTableExpression('SELECT 1', 'extra');
    },
    (wrapper) => {
      wrapper.leftJoin('person', 'extra', '1=1');
    },
  ]) {
    const { wrapper, queries } = await groupByFixture('whatsAppMessage');
    change(wrapper);
    await assert.rejects(
      () => wrapper.getRawMany(),
      /Current-root read boundary/,
    );
    assert.equal(queries.length, 0);
  }
});

test('group-by provenance cannot be reused by a different actor or workspace', async () => {
  for (const change of [
    (auth, context) => {
      auth.workspaceMemberId = userId;
      auth.workspaceMember.id = userId;
    },
    (auth, context) => {
      auth.userWorkspaceId = memberId;
    },
    (auth, context) => {
      auth.user.id = memberId;
      auth.workspaceMember.userId = memberId;
    },
    (auth, context) => {
      auth.workspace.id = userId;
      context.workspaceId = userId;
    },
    (auth, context) => {
      auth.workspaceMember.userId = memberId;
    },
  ]) {
    const { wrapper, queries, auth, context } =
      await groupByFixture('whatsAppMessage');
    change(auth, context);
    await assert.rejects(
      () => wrapper.getRawMany(),
      /Current-root read boundary/,
    );
    assert.equal(queries.length, 0);
  }
});

test('an unattested clone or a copied ranked_records string never inherits producer trust', async () => {
  const { wrapper, queries, workspace, auth, context } =
    await groupByFixture('whatsAppMessage');
  await assert.rejects(
    () => wrapper.clone().getRawMany(),
    /Current-root read boundary/,
  );
  const copy = new WorkspaceSelectQueryBuilder(
    workspace.createQueryBuilder('person', 'person'),
    {},
    context,
    true,
    auth,
    {},
  );
  copy.from(wrapper.expressionMap.mainAlias.subQuery, 'ranked_records');
  copy.expressionMap.aliases = copy.expressionMap.aliases.filter(
    (alias) => alias.subQuery,
  );
  copy.setParameters(wrapper.getParameters());
  copy.expressionMap.trustedCurrentRoot = true;
  await assert.rejects(() => copy.getRawMany(), /Current-root read boundary/);
  assert.equal(queries.length, 0);
});

test('getRawOne revalidation and repeated real group-by executions preserve the same fenced SQL', async () => {
  const { wrapper, queries } = await groupByFixture('taskTarget');
  await wrapper.getRawOne();
  await wrapper.getRawMany();
  assert.equal(queries.length, 2);
  assert.equal(queries[0].sql, queries[1].sql);
  assert.deepEqual(queries[0].values, queries[1].values);
  assert.match(queries[1].sql, /assignedAgentId/);
});

test('caller OR inside real protected group-by cannot escape the appended owner/member fence', async () => {
  const { wrapper, queries } = await groupByFixture(
    'whatsAppMessage',
    (inner) => inner.orWhere('1=1'),
  );
  await wrapper.getRawMany();
  assert.equal(queries.length, 1);
  assert.match(
    queries[0].sql,
    /OR 1=1.*?\) AND \( "whatsAppMessage"\."deletedAt" IS NULL \) AND \( \(\("whatsAppMessage"\."deletedAt" IS NULL AND EXISTS/s,
  );
  assert.match(queries[0].sql, /"assignedAgentId" = \$\d+ OR EXISTS/);
  assert.ok(queries[0].values.includes(memberId));
});

test('an attested wrapper cannot be recycled as a trusted inner metadata query', async () => {
  const { wrapper, queries } = await groupByFixture('whatsAppMessage');
  const { bindCurrentRootReadGroupByWrapper } = loadTypeScript(
    path.join(server, 'src/modules/propel-rls/current-root-read-fence.ts'),
  );
  assert.throws(
    () => bindCurrentRootReadGroupByWrapper(wrapper, wrapper),
    /Current-root read boundary/,
  );
  assert.equal(queries.length, 0);
});

test('later source-builder mutation cannot alter the already-bound protected wrapper', async () => {
  const { wrapper, inner, queries } = await groupByFixture('whatsAppMessage');
  inner.where('1=1').setParameter('pcr0_member_id', userId);
  inner.expressionMap.extraAppendedAndWhereCondition = '';
  await wrapper.getRawMany();
  assert.match(queries[0].sql, /assignedAgentId/);
  assert.ok(queries[0].values.includes(memberId));
  assert.equal(wrapper.getParameters().pcr0_member_id, memberId);
});
