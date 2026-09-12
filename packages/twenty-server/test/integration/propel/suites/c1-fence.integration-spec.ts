import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { type Manifest } from 'twenty-shared/application';
import { FieldMetadataType } from 'twenty-shared/types';
import { buildBaseManifest } from 'test/integration/metadata/suites/application/utils/build-base-manifest.util';
import { buildDefaultObjectManifest } from 'test/integration/metadata/suites/application/utils/build-default-object-manifest.util';
import { cleanupApplicationAndAppRegistration } from 'test/integration/metadata/suites/application/utils/cleanup-application-and-app-registration.util';
import { setupApplicationForSync } from 'test/integration/metadata/suites/application/utils/setup-application-for-sync.util';
import { syncApplication } from 'test/integration/metadata/suites/application/utils/sync-application.util';

import { MEMBER_ROLE_LABEL } from 'src/engine/metadata-modules/permissions/constants/member-role-label.constants';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

/**
 * C1 FENCE — every data-API write on the assignment command's records is refused.
 *
 * The fence (src/modules/propel-rls/propel-command-records-fence.pre-query.hooks.ts)
 * refuses every write method on `propelStepReceipt` and `propelAssignmentVersion`, for
 * every caller. This spec sends every write the data API offers — 12 over GraphQL
 * (upsert counted separately) and 13 over REST (PUT counted separately) — as three
 * callers: an Admin-role API key, an Admin user and a Member user.
 *
 * How a "refused" here is made trustworthy:
 *  · CONTROL: the identical battery on an unfenced sibling object is ALLOWED, write for
 *    write. Every request shape therefore reaches a real write when nothing stops it.
 *  · Refusals are classified only when they carry the fence's own message, so an
 *    unrelated 400 or FORBIDDEN cannot pass as the fence.
 *  · Postgres: every row the battery targeted is byte-identical afterwards, and no row
 *    carrying an attempt marker exists.
 *  · Coverage: each battery must produce exactly 25 outcomes, so a skipped path cannot
 *    pass by absence. Three of them cannot write these objects at all (merge needs
 *    duplicate criteria; REST restore-by-id is rejected by the path parser) — named in
 *    NOT_A_WRITE_PATH and required to fail identically on the unfenced control.
 * And the command's own path — raw SQL inside a transaction — still writes (F9).
 *
 * RUNNING IT: wait a minute between runs. API-key requests share one budget of 100 per 60 s
 * per workspace, and one run sends ~83 as the API key; a back-to-back run reports THROTTLED
 * part-way through.
 *
 * What it does NOT stop, pinned so it is never mistaken for covered (F10): an Admin can
 * deactivate and delete these objects through the METADATA API. That is schema, not
 * records, and no data hook sees it.
 */

const WORKSPACE_ID = SEED_APPLE_WORKSPACE_ID;
const SCHEMA = getWorkspaceSchemaName(WORKSPACE_ID);

const APP_ID = '5f3c1e0a-0c11-4f3e-9a51-000000000d01';
const DEFAULT_ROLE_ID = '5f3c1e0a-0c11-4f3e-9a51-000000000d02';
const R = {
  object: '5f3c1e0a-0c11-4f3e-9a51-000000000d10',
  operationId: '5f3c1e0a-0c11-4f3e-9a51-000000000d11',
  stepKey: '5f3c1e0a-0c11-4f3e-9a51-000000000d12',
  payloadHash: '5f3c1e0a-0c11-4f3e-9a51-000000000d13',
  assignmentVersion: '5f3c1e0a-0c11-4f3e-9a51-000000000d14',
  personId: '5f3c1e0a-0c11-4f3e-9a51-000000000d15',
};
const V = {
  object: '5f3c1e0a-0c11-4f3e-9a51-000000000d20',
  personId: '5f3c1e0a-0c11-4f3e-9a51-000000000d21',
  version: '5f3c1e0a-0c11-4f3e-9a51-000000000d22',
  lastFence: '5f3c1e0a-0c11-4f3e-9a51-000000000d23',
};
const SIBLING = {
  object: '5f3c1e0a-0c11-4f3e-9a51-000000000d30',
  note: '5f3c1e0a-0c11-4f3e-9a51-000000000d31',
};

const ADMIN_KEY_ID = '20202020-f401-4d8a-a731-64d007c27bad';
const JANE_USER_WORKSPACE = '20202020-1e7c-43d9-a5db-685b5069d816';
const JONY_USER_WORKSPACE = '20202020-3957-4908-9c36-2929a23f8353';

const FENCE_MESSAGE = 'only by the assignment command';
const REFUSED = 'REFUSED_BY_FENCE';
const MERGE_UNAVAILABLE = 'MERGE_UNAVAILABLE';
const RESTORE_ONE_PATH_REJECTED = 'RESTORE_ONE_PATH_REJECTED';
// Twenty throttles API-KEY requests only, from ONE budget per workspace shared by every API
// key: 100 per 60 s (CommonBaseQueryRunnerService.throttleQueryExecution). One run of this
// spec sends ~83 as the API key, so a second run within a minute runs out part-way through.
// Named, so it can never be misread as a fence failure.
const THROTTLED = 'THROTTLED';

// Three of the 25 requests never reach a hook for these objects — and fail identically on
// the unfenced sibling, which is what makes them "not a write path" rather than a gap:
//  · mergeMany (GraphQL and REST): "Merge is only available for objects with duplicate
//    criteria" is validated before the pre-hooks, and app objects declare none. The merge
//    hook still exists (unit spec). If an object ever gains duplicate criteria, the
//    control flips to ALLOWED and this spec goes red.
//  · REST PATCH /rest/restore/<object>/<id>: parse-core-path.utils.ts rejects every
//    three-segment path before it reaches its own restore branch (an upstream bug:
//    `length > 2` is tested before `restore && length > 3`). restoreOne over GraphQL, and
//    restoreMany over REST, do reach the runner and are fenced.
const NOT_A_WRITE_PATH: Record<string, string> = {
  'graphql mergeMany': MERGE_UNAVAILABLE,
  'rest PATCH mergeMany': MERGE_UNAVAILABLE,
  'rest PATCH restoreOne': RESTORE_ONE_PATH_REJECTED,
};

const expectedOutcomes = (outcomes: Record<string, string>, value: string) =>
  Object.fromEntries(Object.keys(outcomes).map((key) => [key, NOT_A_WRITE_PATH[key] ?? value]));

const field = (universalIdentifier: string, type: FieldMetadataType, name: string) => ({
  universalIdentifier,
  type: type as FieldMetadataType.TEXT,
  name,
  label: name,
  isNullable: false,
});

const buildManifest = (): Manifest =>
  buildBaseManifest({
    appId: APP_ID,
    roleId: DEFAULT_ROLE_ID,
    overrides: {
      objects: [
        buildDefaultObjectManifest({
          universalIdentifier: R.object,
          labelIdentifierFieldMetadataUniversalIdentifier: R.stepKey,
          nameSingular: 'propelStepReceipt',
          namePlural: 'propelStepReceipts',
          labelSingular: 'Command step receipt',
          labelPlural: 'Command step receipts',
          additionalFields: [
            field(R.operationId, FieldMetadataType.UUID, 'operationId'),
            field(R.stepKey, FieldMetadataType.TEXT, 'stepKey'),
            field(R.payloadHash, FieldMetadataType.TEXT, 'payloadHash'),
            field(R.assignmentVersion, FieldMetadataType.NUMBER, 'assignmentVersion'),
            field(R.personId, FieldMetadataType.UUID, 'personId'),
          ],
        }),
        buildDefaultObjectManifest({
          universalIdentifier: V.object,
          labelIdentifierFieldMetadataUniversalIdentifier: V.personId,
          nameSingular: 'propelAssignmentVersion',
          namePlural: 'propelAssignmentVersions',
          labelSingular: 'Assignment version',
          labelPlural: 'Assignment versions',
          additionalFields: [
            field(V.personId, FieldMetadataType.UUID, 'personId'),
            field(V.version, FieldMetadataType.NUMBER, 'version'),
            field(V.lastFence, FieldMetadataType.NUMBER, 'lastFence'),
          ],
        }),
        buildDefaultObjectManifest({
          universalIdentifier: SIBLING.object,
          nameSingular: 'fenceSibling',
          namePlural: 'fenceSiblings',
          labelSingular: 'Fence sibling',
          labelPlural: 'Fence siblings',
          additionalFields: [field(SIBLING.note, FieldMetadataType.TEXT, 'note')],
        }),
      ],
      // Mirrors src/indexes/propel-step-receipt-operation-step.index.ts and
      // propel-assignment-version-person.index.ts in the app.
      indexes: [
        {
          universalIdentifier: '5f3c1e0a-0c11-4f3e-9a51-000000000d16',
          objectUniversalIdentifier: R.object,
          isUnique: true,
          fields: [
            { universalIdentifier: '5f3c1e0a-0c11-4f3e-9a51-000000000d17', fieldUniversalIdentifier: R.operationId },
            { universalIdentifier: '5f3c1e0a-0c11-4f3e-9a51-000000000d18', fieldUniversalIdentifier: R.stepKey },
          ],
        },
        {
          universalIdentifier: '5f3c1e0a-0c11-4f3e-9a51-000000000d24',
          objectUniversalIdentifier: V.object,
          isUnique: true,
          fields: [{ universalIdentifier: '5f3c1e0a-0c11-4f3e-9a51-000000000d25', fieldUniversalIdentifier: V.personId }],
        },
      ],
    },
  });

const raw = <T = any>(sql: string, params?: unknown[]): Promise<T[]> =>
  global.testDataSource.query(sql, params);

const api = () => request(`http://localhost:${APP_PORT}`);

const capitalize = (value: string) => value[0].toUpperCase() + value.slice(1);

// ── instruments ──────────────────────────────────────────────────────────────

const graphqlOutcome = async (
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<string> => {
  const response = await api()
    .post('/graphql')
    .set('Authorization', `Bearer ${token}`)
    .send({ query, variables });
  const errors = response.body?.errors;

  if (!errors || errors.length === 0) {
    return response.status === 200 && response.body?.data
      ? 'ALLOWED'
      : `OTHER http=${response.status} ${response.text.slice(0, 200)}`;
  }

  const [first] = errors;

  if (String(first.message).includes('Limit reached')) {
    return THROTTLED;
  }

  if (String(first.message).includes('Merge is only available for objects with duplicate criteria')) {
    return MERGE_UNAVAILABLE;
  }

  return first.extensions?.code === 'FORBIDDEN' && String(first.message).includes(FENCE_MESSAGE)
    ? REFUSED
    : `OTHER ${first.extensions?.code} ${String(first.message).slice(0, 200)}`;
};

const restOutcome = async (
  token: string,
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  body?: unknown,
): Promise<string> => {
  let call = api()[method](`/rest${path}`).set('Authorization', `Bearer ${token}`);

  if (body !== undefined) {
    call = call.set('Content-Type', 'application/json').send(JSON.stringify(body));
  }

  const response = await call;

  if (response.status >= 200 && response.status < 300) {
    return 'ALLOWED';
  }

  if (response.text.includes('Limit reached')) {
    return THROTTLED;
  }

  if (response.status === 400 && response.text.includes('Merge is only available for objects with duplicate criteria')) {
    return MERGE_UNAVAILABLE;
  }

  if (response.status === 400 && response.text.includes(`Query path '/rest/restore/`) && response.text.includes('invalid')) {
    return RESTORE_ONE_PATH_REJECTED;
  }

  return response.status >= 400 && response.status < 500 && response.text.includes(FENCE_MESSAGE)
    ? REFUSED
    : `OTHER http=${response.status} ${response.text.slice(0, 200)}`;
};

type Target = {
  singular: string;
  plural: string;
  table: string;
  createData: () => Record<string, unknown>;
  updateData: Record<string, unknown>;
  seedSql: string; // $1 id, $2 soft-deleted?
  attemptRowsSql: string;
};

const TARGETS: Record<string, Target> = {
  receipt: {
    singular: 'propelStepReceipt',
    plural: 'propelStepReceipts',
    table: `${SCHEMA}."_propelStepReceipt"`,
    createData: () => ({
      id: randomUUID(),
      operationId: randomUUID(),
      stepKey: 'ASSIGN_LEAD:1',
      payloadHash: 'fence-attempt',
      assignmentVersion: 1,
      personId: randomUUID(),
    }),
    updateData: { payloadHash: 'fence-tampered' },
    seedSql: `INSERT INTO ${SCHEMA}."_propelStepReceipt"
      (id, "operationId", "stepKey", "payloadHash", "assignmentVersion", "personId", "createdAt", "updatedAt", "deletedAt")
      VALUES ($1, gen_random_uuid(), 'ASSIGN_LEAD:1', 'seed', 1, gen_random_uuid(), now(), now(), CASE WHEN $2::boolean THEN now() END)`,
    attemptRowsSql: `SELECT count(*)::int AS n FROM ${SCHEMA}."_propelStepReceipt" WHERE "payloadHash" IN ('fence-attempt', 'fence-tampered')`,
  },
  version: {
    singular: 'propelAssignmentVersion',
    plural: 'propelAssignmentVersions',
    table: `${SCHEMA}."_propelAssignmentVersion"`,
    createData: () => ({ id: randomUUID(), personId: randomUUID(), version: 424242, lastFence: 0 }),
    updateData: { version: 999999 },
    seedSql: `INSERT INTO ${SCHEMA}."_propelAssignmentVersion"
      (id, "personId", version, "lastFence", "createdAt", "updatedAt", "deletedAt")
      VALUES ($1, gen_random_uuid(), 1, 0, now(), now(), CASE WHEN $2::boolean THEN now() END)`,
    attemptRowsSql: `SELECT count(*)::int AS n FROM ${SCHEMA}."_propelAssignmentVersion" WHERE version IN (424242, 999999)`,
  },
  sibling: {
    singular: 'fenceSibling',
    plural: 'fenceSiblings',
    table: `${SCHEMA}."_fenceSibling"`,
    createData: () => ({ id: randomUUID(), note: 'fence-attempt' }),
    updateData: { note: 'fence-tampered' },
    seedSql: `INSERT INTO ${SCHEMA}."_fenceSibling" (id, note, "createdAt", "updatedAt", "deletedAt")
      VALUES ($1, 'seed', now(), now(), CASE WHEN $2::boolean THEN now() END)`,
    attemptRowsSql: `SELECT count(*)::int AS n FROM ${SCHEMA}."_fenceSibling" WHERE note IN ('fence-attempt', 'fence-tampered')`,
  },
};

// Sends every write the data API offers against one object, each on its own fresh row
// seeded by raw SQL, and reports what happened.
const writeBattery = async (token: string, t: Target) => {
  const S = capitalize(t.singular);
  const P = capitalize(t.plural);
  const outcomes: Record<string, string> = {};
  const snapshots = new Map<string, string>();

  const snapshot = async (id: string) =>
    (await raw<{ row: string | null }>(`SELECT (SELECT t::text FROM ${t.table} t WHERE t.id = $1) AS row`, [id]))[0].row ?? 'GONE';

  const seed = async (softDeleted = false) => {
    const id = randomUUID();

    await raw(t.seedSql, [id, softDeleted]);
    snapshots.set(id, await snapshot(id));

    return id;
  };

  const eq = async (softDeleted = false) => ({ id: { eq: await seed(softDeleted) } });
  const eqQuery = async (softDeleted = false) => encodeURIComponent(`id[eq]:${await seed(softDeleted)}`);

  const gql = async (label: string, query: string, variables: Record<string, unknown>) => {
    outcomes[`graphql ${label}`] = await graphqlOutcome(token, query, variables);
  };
  const rest = async (label: string, method: 'post' | 'patch' | 'put' | 'delete', path: string, body?: unknown) => {
    outcomes[`rest ${label}`] = await restOutcome(token, method, `/${path}`, body);
  };

  await gql('createOne', `mutation($data: ${S}CreateInput!) { create${S}(data: $data) { id } }`, { data: t.createData() });
  await gql('createMany', `mutation($data: [${S}CreateInput!]!) { create${P}(data: $data) { id } }`, { data: [t.createData()] });
  await gql('createMany upsert', `mutation($data: [${S}CreateInput!]!) { create${P}(data: $data, upsert: true) { id } }`, { data: [{ ...t.createData(), id: await seed() }] });
  await gql('updateOne', `mutation($id: UUID!, $data: ${S}UpdateInput!) { update${S}(id: $id, data: $data) { id } }`, { id: await seed(), data: t.updateData });
  await gql('updateMany', `mutation($filter: ${S}FilterInput!, $data: ${S}UpdateInput!) { update${P}(filter: $filter, data: $data) { id } }`, { filter: await eq(), data: t.updateData });
  await gql('deleteOne', `mutation($id: UUID!) { delete${S}(id: $id) { id } }`, { id: await seed() });
  await gql('deleteMany', `mutation($filter: ${S}FilterInput!) { delete${P}(filter: $filter) { id } }`, { filter: await eq() });
  await gql('destroyOne', `mutation($id: UUID!) { destroy${S}(id: $id) { id } }`, { id: await seed() });
  await gql('destroyMany', `mutation($filter: ${S}FilterInput!) { destroy${P}(filter: $filter) { id } }`, { filter: await eq() });
  await gql('restoreOne', `mutation($id: UUID!) { restore${S}(id: $id) { id } }`, { id: await seed(true) });
  await gql('restoreMany', `mutation($filter: ${S}FilterInput!) { restore${P}(filter: $filter) { id } }`, { filter: await eq(true) });
  await gql('mergeMany', `mutation($ids: [UUID!]!, $conflictPriorityIndex: Int!) { merge${P}(ids: $ids, conflictPriorityIndex: $conflictPriorityIndex) { id } }`, { ids: [await seed(), await seed()], conflictPriorityIndex: 0 });

  await rest('POST createOne', 'post', t.plural, t.createData());
  await rest('POST batch createMany', 'post', `batch/${t.plural}`, [t.createData()]);
  await rest('POST batch upsert', 'post', `batch/${t.plural}?upsert=true`, [{ ...t.createData(), id: await seed() }]);
  await rest('PATCH updateOne', 'patch', `${t.plural}/${await seed()}`, t.updateData);
  await rest('PUT updateOne', 'put', `${t.plural}/${await seed()}`, t.updateData);
  await rest('PATCH updateMany', 'patch', `${t.plural}?filter=${await eqQuery()}`, t.updateData);
  await rest('DELETE soft deleteOne', 'delete', `${t.plural}/${await seed()}?soft_delete=true`);
  await rest('DELETE soft deleteMany', 'delete', `${t.plural}?filter=${await eqQuery()}&soft_delete=true`);
  await rest('DELETE destroyOne', 'delete', `${t.plural}/${await seed()}`);
  await rest('DELETE destroyMany', 'delete', `${t.plural}?filter=${await eqQuery()}`);
  await rest('PATCH restoreOne', 'patch', `restore/${t.plural}/${await seed(true)}`);
  await rest('PATCH restoreMany', 'patch', `restore/${t.plural}?filter=${await eqQuery(true)}`);
  await rest('PATCH mergeMany', 'patch', `${t.plural}/merge`, { ids: [await seed(), await seed()], conflictPriorityIndex: 0 });

  const changedRows: string[] = [];

  for (const [id, before] of snapshots) {
    if ((await snapshot(id)) !== before) changedRows.push(id);
  }

  return {
    outcomes,
    changedRows,
    attemptRows: (await raw<{ n: number }>(t.attemptRowsSql))[0].n,
  };
};

const readBattery = async (token: string, t: Target) => {
  const id = randomUUID();

  await raw(t.seedSql, [id, false]);

  const S = capitalize(t.singular);

  return {
    'graphql findMany': await graphqlOutcome(token, `query { ${t.plural}(first: 5) { edges { node { id } } } }`, {}),
    'graphql findOne': await graphqlOutcome(token, `query($filter: ${S}FilterInput!) { ${t.singular}(filter: $filter) { id } }`, { filter: { id: { eq: id } } }),
    'rest GET many': await restOutcome(token, 'get', `/${t.plural}`),
    'rest GET one': await restOutcome(token, 'get', `/${t.plural}/${id}`),
  };
};

const allOf = (outcomes: Record<string, string>, value: string) =>
  Object.fromEntries(Object.keys(outcomes).map((key) => [key, value]));

describe('C1 fence — no data-API write reaches the assignment command records (integration)', () => {
  const rolesHeldBy = async (column: 'userWorkspaceId' | 'apiKeyId', id: string) =>
    (
      await raw<{ label: string }>(
        `SELECT r.label FROM core."roleTarget" rt JOIN core.role r ON r.id = rt."roleId"
          WHERE rt."${column}" = $1 AND rt."workspaceId" = $2 ORDER BY r.label`,
        [id, WORKSPACE_ID],
      )
    ).map((row) => row.label);

  beforeAll(async () => {
    await cleanupApplicationAndAppRegistration({ applicationUniversalIdentifier: APP_ID });

    await setupApplicationForSync({
      applicationUniversalIdentifier: APP_ID,
      name: 'Fence app',
      description: 'Throwaway app for the C1 fence check',
      sourcePath: 'c1-fence',
    });

    const { errors } = await syncApplication({ manifest: buildManifest(), expectToFail: false });

    expect(errors).toBeUndefined();
  }, 180000);

  afterAll(async () => {
    await cleanupApplicationAndAppRegistration({ applicationUniversalIdentifier: APP_ID });
  }, 180000);

  it('F0 instrument: objects are app-owned; the key and Jane hold Admin; Jony holds Member', async () => {
    const owned = await raw<{ nameSingular: string }>(
      `SELECT o."nameSingular" FROM core."objectMetadata" o JOIN core.application a ON a.id = o."applicationId"
        WHERE a."universalIdentifier" = $1 AND o."workspaceId" = $2 ORDER BY o."nameSingular"`,
      [APP_ID, WORKSPACE_ID],
    );

    expect(owned.map((row) => row.nameSingular)).toEqual(['fenceSibling', 'propelAssignmentVersion', 'propelStepReceipt']);
    expect(await rolesHeldBy('apiKeyId', ADMIN_KEY_ID)).toEqual(['Admin']);
    expect(await rolesHeldBy('userWorkspaceId', JANE_USER_WORKSPACE)).toEqual(['Admin']);
    expect(await rolesHeldBy('userWorkspaceId', JONY_USER_WORKSPACE)).toEqual([MEMBER_ROLE_LABEL]);
  }, 60000);

  it('F1 CONTROL: the identical battery on an unfenced sibling is ALLOWED, write for write', async () => {
    const result = await writeBattery(API_KEY_ACCESS_TOKEN, TARGETS.sibling);

    expect(Object.keys(result.outcomes)).toHaveLength(25);
    expect(result.outcomes).toEqual(expectedOutcomes(result.outcomes, 'ALLOWED'));
    expect(result.attemptRows).toBeGreaterThan(0);
    expect(result.changedRows.length).toBeGreaterThan(0);
  }, 120000);

  describe.each([
    ['an Admin-role API key', () => API_KEY_ACCESS_TOKEN],
    ['an Admin user (Jane)', () => APPLE_JANE_ADMIN_ACCESS_TOKEN],
    ['a Member user (Jony)', () => APPLE_JONY_MEMBER_ACCESS_TOKEN],
  ])('as %s', (_caller, token) => {
    it.each([['receipt'], ['version']])(
      'every write on the %s is refused by the fence, nothing changes, and reads stay open',
      async (targetKey) => {
        const target = TARGETS[targetKey];
        const result = await writeBattery(token(), target);
        const reads = await readBattery(token(), target);

        expect(Object.keys(result.outcomes)).toHaveLength(25);
        expect({
          outcomes: result.outcomes,
          changedRows: result.changedRows,
          attemptRows: result.attemptRows,
          reads,
        }).toEqual({
          outcomes: expectedOutcomes(result.outcomes, REFUSED),
          changedRows: [],
          attemptRows: 0,
          reads: allOf(reads, 'ALLOWED'),
        });
      },
      120000,
    );
  });

  it("F9 the command's own path — raw SQL inside one transaction — still writes both records", async () => {
    const runner = global.testDataSource.createQueryRunner();
    const personId = randomUUID();
    const operationId = randomUUID();

    await runner.connect();

    try {
      await runner.startTransaction();
      await runner.query(
        `INSERT INTO ${SCHEMA}."_propelAssignmentVersion" (id, "personId", version, "lastFence", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, 1, 3, now(), now())
         ON CONFLICT ("personId") DO UPDATE SET version = EXCLUDED.version, "lastFence" = EXCLUDED."lastFence", "updatedAt" = now()`,
        [personId],
      );
      await runner.query(
        `INSERT INTO ${SCHEMA}."_propelStepReceipt" (id, "operationId", "stepKey", "payloadHash", "assignmentVersion", "personId", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, 'ASSIGN_LEAD:1', 'command', 1, $2, now(), now())`,
        [operationId, personId],
      );
      await runner.commitTransaction();
    } catch (error) {
      // Never return an aborted transaction to the shared pool: every later query on that
      // connection would fail with "current transaction is aborted".
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }

    expect({
      version: await raw(`SELECT version::bigint::text AS version, "lastFence"::bigint::text AS "lastFence" FROM ${SCHEMA}."_propelAssignmentVersion" WHERE "personId" = $1`, [personId]),
      receipt: await raw(`SELECT "payloadHash", "assignmentVersion"::bigint::text AS "assignmentVersion" FROM ${SCHEMA}."_propelStepReceipt" WHERE "operationId" = $1`, [operationId]),
    }).toEqual({
      version: [{ version: '1', lastFence: '3' }],
      receipt: [{ payloadHash: 'command', assignmentVersion: '1' }],
    });
  }, 60000);

  // Runs LAST: it deactivates one object and deletes the other. afterAll uninstalls the app.
  //
  // The path no data hook can fence, pinned. Through the METADATA API an Admin (user or
  // Admin-role API key) cannot rename or deactivate these app objects' FIELDS, but CAN
  // deactivate the receipt object, and CAN DELETE the version object, table and rows
  // included. That is schema, not records, so it never reaches a pre-query hook. It is also
  // true of every custom object in Twenty, not special to these two. Recorded, not solved:
  // what to do about it is a decision (ADR-003 addendum).
  it('F10 an Admin can deactivate and DELETE these objects through the metadata API — unfenceable by a data hook', async () => {
    const metadata = async (query: string, variables: Record<string, unknown>) => {
      const response = await api()
        .post('/metadata')
        .set('Authorization', `Bearer ${APPLE_JANE_ADMIN_ACCESS_TOKEN}`)
        .send({ query, variables });
      const [first] = response.body?.errors ?? [];

      return first ? `ERROR ${first.extensions?.code} ${String(first.message).slice(0, 240)}` : 'OK';
    };
    const idOf = async (table: 'objectMetadata' | 'fieldMetadata', universalIdentifier: string) =>
      (await raw<{ id: string }>(`SELECT id FROM core."${table}" WHERE "universalIdentifier" = $1 AND "workspaceId" = $2`, [universalIdentifier, WORKSPACE_ID]))[0]?.id;

    const receiptObjectId = await idOf('objectMetadata', R.object);
    const versionObjectId = await idOf('objectMetadata', V.object);
    const assignmentVersionFieldId = await idOf('fieldMetadata', R.assignmentVersion);

    const findings = {
      'rename a field': await metadata(
        `mutation($idToUpdate: UUID!, $updatePayload: UpdateFieldInput!) { updateOneField(input: {id: $idToUpdate, update: $updatePayload}) { id } }`,
        { idToUpdate: assignmentVersionFieldId, updatePayload: { label: 'Tampered label' } },
      ),
      'deactivate a field': await metadata(
        `mutation($idToUpdate: UUID!, $updatePayload: UpdateFieldInput!) { updateOneField(input: {id: $idToUpdate, update: $updatePayload}) { id } }`,
        { idToUpdate: assignmentVersionFieldId, updatePayload: { isActive: false } },
      ),
      'deactivate the receipt object': await metadata(
        `mutation($idToUpdate: UUID!, $updatePayload: UpdateObjectPayload!) { updateOneObject(input: {id: $idToUpdate, update: $updatePayload}) { id } }`,
        { idToUpdate: receiptObjectId, updatePayload: { isActive: false } },
      ),
      'delete the version object': await metadata(
        `mutation($idToDelete: UUID!) { deleteOneObject(input: { id: $idToDelete }) { id } }`,
        { idToDelete: versionObjectId },
      ),
    };
    const after = {
      fieldLabel: (await raw(`SELECT label, "isActive" FROM core."fieldMetadata" WHERE id = $1`, [assignmentVersionFieldId]))[0] ?? null,
      receiptObject: (await raw(`SELECT "isActive" FROM core."objectMetadata" WHERE id = $1`, [receiptObjectId]))[0] ?? null,
      versionObjectExists: (await raw(`SELECT count(*)::int AS n FROM core."objectMetadata" WHERE id = $1`, [versionObjectId]))[0].n,
      versionTable: (await raw(`SELECT to_regclass($1) AS t`, [`${SCHEMA}."_propelAssignmentVersion"`]))[0].t,
    };

    expect(receiptObjectId && versionObjectId && assignmentVersionFieldId).toBeTruthy();
    expect({
      findings: Object.fromEntries(
        Object.entries(findings).map(([what, outcome]) => [what, outcome.split(' ').slice(0, 2).join(' ')]),
      ),
      after,
    }).toEqual({
      findings: {
        'rename a field': 'ERROR METADATA_VALIDATION_FAILED',
        'deactivate a field': 'ERROR METADATA_VALIDATION_FAILED',
        'deactivate the receipt object': 'OK',
        'delete the version object': 'OK',
      },
      after: {
        fieldLabel: { label: 'assignmentVersion', isActive: true },
        receiptObject: { isActive: false },
        versionObjectExists: 0,
        versionTable: null,
      },
    });
  }, 120000);
});
