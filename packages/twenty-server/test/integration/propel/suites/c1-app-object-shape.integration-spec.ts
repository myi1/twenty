import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { type Manifest } from 'twenty-shared/application';
import { FieldMetadataType } from 'twenty-shared/types';
import { buildBaseManifest } from 'test/integration/metadata/suites/application/utils/build-base-manifest.util';
import { buildDefaultObjectManifest } from 'test/integration/metadata/suites/application/utils/build-default-object-manifest.util';
import { cleanupApplicationAndAppRegistration } from 'test/integration/metadata/suites/application/utils/cleanup-application-and-app-registration.util';
import { setupApplicationForSync } from 'test/integration/metadata/suites/application/utils/setup-application-for-sync.util';
import { syncApplication } from 'test/integration/metadata/suites/application/utils/sync-application.util';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

/**
 * C1 / decision B — the table an APP OBJECT becomes, pinned.
 *
 * The step receipt and the assignment version move from core."_c0Spike*" into two app
 * objects (src/**, created by app:install). The engine step writes them with raw SQL
 * inside the lead's transaction, so it depends on facts about the real table that no
 * type checks. Each one is pinned here, so an engine upgrade that changes one goes red
 * instead of silently corrupting a hand-over:
 *
 *  T1 names and column types. Every NUMBER field is `double precision`, whatever
 *     `dataType` it declares: field-metadata-type-to-column-type.util.ts maps NUMBER
 *     to float. id, createdAt and updatedAt have NO default, so the engine sets them.
 *  T2 a unique index compiles to a PLAIN unique index, not partial on deletedAt.
 *  T3 a minimal raw insert is a valid record to the data API, and a duplicate is
 *     refused even after the original is soft-deleted.
 *  T4 ON CONFLICT ("personId") can target the version's unique index.
 *  T5 precision: a double is exact only to 2^53 − 1, and its ::text form turns
 *     exponential. The engine must refuse a version or fence beyond
 *     Number.MAX_SAFE_INTEGER and read them as ::bigint::text.
 *  T6 NUMERIC, the exact type, is refused for app fields, which is why NUMBER + T5.
 *
 * History: a discovery run with NUMBER + dataType BIGINT showed the float column and
 * the lost digit; a second run with NUMERIC was refused at sync. Both are pinned below.
 */

const WORKSPACE_ID = SEED_APPLE_WORKSPACE_ID;
const SCHEMA = getWorkspaceSchemaName(WORKSPACE_ID);

// Test-only identifiers — the app's own blocks (98/99) are not used here.
const APP_ID = '5f3c1e0a-0c11-4f3e-9a51-000000000e01';
const DEFAULT_ROLE_ID = '5f3c1e0a-0c11-4f3e-9a51-000000000e02';
const R = {
  object: '5f3c1e0a-0c11-4f3e-9a51-000000000e10',
  operationId: '5f3c1e0a-0c11-4f3e-9a51-000000000e11',
  stepKey: '5f3c1e0a-0c11-4f3e-9a51-000000000e12',
  payloadHash: '5f3c1e0a-0c11-4f3e-9a51-000000000e13',
  assignmentVersion: '5f3c1e0a-0c11-4f3e-9a51-000000000e14',
  personId: '5f3c1e0a-0c11-4f3e-9a51-000000000e15',
  index: '5f3c1e0a-0c11-4f3e-9a51-000000000e16',
  indexOperationId: '5f3c1e0a-0c11-4f3e-9a51-000000000e17',
  indexStepKey: '5f3c1e0a-0c11-4f3e-9a51-000000000e18',
};
const V = {
  object: '5f3c1e0a-0c11-4f3e-9a51-000000000e20',
  personId: '5f3c1e0a-0c11-4f3e-9a51-000000000e21',
  version: '5f3c1e0a-0c11-4f3e-9a51-000000000e22',
  lastFence: '5f3c1e0a-0c11-4f3e-9a51-000000000e23',
  index: '5f3c1e0a-0c11-4f3e-9a51-000000000e24',
  indexPersonId: '5f3c1e0a-0c11-4f3e-9a51-000000000e25',
};
const NUMERIC_APP_ID = '5f3c1e0a-0c11-4f3e-9a51-000000000e30';
const NUMERIC_ROLE_ID = '5f3c1e0a-0c11-4f3e-9a51-000000000e31';

const uuidField = (universalIdentifier: string, name: string, label: string) => ({
  universalIdentifier,
  type: FieldMetadataType.UUID as const,
  name,
  label,
  isNullable: false,
});
const textField = (universalIdentifier: string, name: string, label: string) => ({
  universalIdentifier,
  type: FieldMetadataType.TEXT as const,
  name,
  label,
  isNullable: false,
});
const numberField = (universalIdentifier: string, name: string, label: string) => ({
  universalIdentifier,
  type: FieldMetadataType.NUMBER as const,
  name,
  label,
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
          // Mirrors src/objects/propel-step-receipt.object.ts in the app.
          labelIdentifierFieldMetadataUniversalIdentifier: R.stepKey,
          nameSingular: 'propelStepReceipt',
          namePlural: 'propelStepReceipts',
          labelSingular: 'Command step receipt',
          labelPlural: 'Command step receipts',
          additionalFields: [
            uuidField(R.operationId, 'operationId', 'Operation'),
            textField(R.stepKey, 'stepKey', 'Step'),
            textField(R.payloadHash, 'payloadHash', 'Payload hash'),
            numberField(R.assignmentVersion, 'assignmentVersion', 'Assignment version'),
            uuidField(R.personId, 'personId', 'Lead'),
          ],
        }),
        buildDefaultObjectManifest({
          universalIdentifier: V.object,
          // Mirrors src/objects/propel-assignment-version.object.ts: a UUID field as the label.
          labelIdentifierFieldMetadataUniversalIdentifier: V.personId,
          nameSingular: 'propelAssignmentVersion',
          namePlural: 'propelAssignmentVersions',
          labelSingular: 'Assignment version',
          labelPlural: 'Assignment versions',
          additionalFields: [
            uuidField(V.personId, 'personId', 'Lead'),
            numberField(V.version, 'version', 'Version'),
            numberField(V.lastFence, 'lastFence', 'Last fence'),
          ],
        }),
      ],
      indexes: [
        {
          universalIdentifier: R.index,
          objectUniversalIdentifier: R.object,
          isUnique: true,
          fields: [
            { universalIdentifier: R.indexOperationId, fieldUniversalIdentifier: R.operationId },
            { universalIdentifier: R.indexStepKey, fieldUniversalIdentifier: R.stepKey },
          ],
        },
        {
          universalIdentifier: V.index,
          objectUniversalIdentifier: V.object,
          isUnique: true,
          fields: [{ universalIdentifier: V.indexPersonId, fieldUniversalIdentifier: V.personId }],
        },
      ],
    },
  });

const raw = <T = any>(sql: string, params?: unknown[]): Promise<T[]> =>
  global.testDataSource.query(sql, params);

const attempt = async (sql: string, params: unknown[]): Promise<string> => {
  try {
    await raw(sql, params);

    return 'OK';
  } catch (error) {
    return `ERROR ${(error as { code?: string }).code}`;
  }
};

describe('C1 — the table an app object becomes (integration)', () => {
  const RECEIPTS = `${SCHEMA}."_propelStepReceipt"`;
  const VERSIONS = `${SCHEMA}."_propelAssignmentVersion"`;

  const columns = async (tableName: string, names: string[]) =>
    Object.fromEntries(
      (
        await raw<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
          `SELECT column_name, data_type, is_nullable, column_default
             FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2 AND column_name = ANY($3)`,
          [SCHEMA, tableName, names],
        )
      ).map((c) => [c.column_name, `${c.data_type} nullable=${c.is_nullable} default=${c.column_default}`]),
    );

  beforeAll(async () => {
    for (const applicationUniversalIdentifier of [APP_ID, NUMERIC_APP_ID]) {
      await cleanupApplicationAndAppRegistration({ applicationUniversalIdentifier });
    }

    await setupApplicationForSync({
      applicationUniversalIdentifier: APP_ID,
      name: 'App object shape app',
      description: 'Throwaway app for the C1 app-object shape check',
      sourcePath: 'c1-app-object-shape',
    });

    const { errors } = await syncApplication({ manifest: buildManifest(), expectToFail: false });

    expect(errors).toBeUndefined();
  }, 180000);

  afterAll(async () => {
    for (const applicationUniversalIdentifier of [APP_ID, NUMERIC_APP_ID]) {
      await cleanupApplicationAndAppRegistration({ applicationUniversalIdentifier });
    }
  }, 180000);

  it('T1 the tables are _propelStepReceipt / _propelAssignmentVersion, with these column types', async () => {
    const system = ['id', 'createdAt', 'updatedAt', 'deletedAt'];

    expect(
      await columns('_propelStepReceipt', [...system, 'operationId', 'stepKey', 'payloadHash', 'assignmentVersion', 'personId']),
    ).toEqual({
      id: 'uuid nullable=NO default=null',
      createdAt: 'timestamp with time zone nullable=YES default=null',
      updatedAt: 'timestamp with time zone nullable=YES default=null',
      deletedAt: 'timestamp with time zone nullable=YES default=null',
      operationId: 'uuid nullable=NO default=null',
      stepKey: 'text nullable=NO default=null',
      payloadHash: 'text nullable=NO default=null',
      assignmentVersion: 'double precision nullable=NO default=null',
      personId: 'uuid nullable=NO default=null',
    });

    expect(await columns('_propelAssignmentVersion', [...system, 'personId', 'version', 'lastFence'])).toEqual({
      id: 'uuid nullable=NO default=null',
      createdAt: 'timestamp with time zone nullable=YES default=null',
      updatedAt: 'timestamp with time zone nullable=YES default=null',
      deletedAt: 'timestamp with time zone nullable=YES default=null',
      personId: 'uuid nullable=NO default=null',
      version: 'double precision nullable=NO default=null',
      lastFence: 'double precision nullable=NO default=null',
    });
  }, 60000);

  it('T2 each unique index is a plain unique index on exactly its fields — not partial on deletedAt', async () => {
    const uniqueIndexes = async (tableName: string) =>
      (
        await raw<{ indexdef: string }>(
          `SELECT indexdef FROM pg_indexes
            WHERE schemaname = $1 AND tablename = $2 AND indexname LIKE 'IDX_UNIQUE_%'`,
          [SCHEMA, tableName],
        )
      ).map((row) => row.indexdef.replace(/^CREATE UNIQUE INDEX .* USING /, 'UNIQUE USING '));

    expect(await uniqueIndexes('_propelStepReceipt')).toEqual(['UNIQUE USING btree ("operationId", "stepKey")']);
    expect(await uniqueIndexes('_propelAssignmentVersion')).toEqual(['UNIQUE USING btree ("personId")']);
  }, 60000);

  it('T3 a minimal raw receipt is a valid record; a duplicate is refused, even after a soft delete', async () => {
    const id = randomUUID();
    const operationId = randomUUID();
    const personId = randomUUID();
    const insert = `INSERT INTO ${RECEIPTS} (id, "operationId", "stepKey", "payloadHash", "assignmentVersion", "personId")
                    VALUES ($1, $2, $3, $4, $5, $6)`;

    const first = await attempt(insert, [id, operationId, 'ASSIGN_LEAD:1', 'hash-1', '1', personId]);
    const stored = (await raw(`SELECT "createdAt", "createdBySource", "createdByName" FROM ${RECEIPTS} WHERE id = $1`, [id]))[0];
    const duplicate = await attempt(insert, [randomUUID(), operationId, 'ASSIGN_LEAD:1', 'hash-2', '2', personId]);

    const response = await request(`http://localhost:${APP_PORT}`)
      .post('/graphql')
      .set('Authorization', `Bearer ${API_KEY_ACCESS_TOKEN}`)
      .send({
        query: `query($id: UUID!) { propelStepReceipts(filter: { id: { eq: $id } }) { edges { node { id operationId stepKey payloadHash assignmentVersion personId createdBy { source name } } } } }`,
        variables: { id },
      });

    await raw(`UPDATE ${RECEIPTS} SET "deletedAt" = now() WHERE id = $1`, [id]);
    const duplicateAfterSoftDelete = await attempt(insert, [randomUUID(), operationId, 'ASSIGN_LEAD:1', 'hash-3', '3', personId]);

    expect({
      first,
      stored,
      duplicate,
      dataApi: [response.status, response.body?.errors ?? null, response.body?.data?.propelStepReceipts?.edges],
      duplicateAfterSoftDelete,
    }).toEqual({
      first: 'OK',
      // Nothing stamps a raw insert: the engine must set createdAt / updatedAt itself.
      stored: { createdAt: null, createdBySource: 'MANUAL', createdByName: 'System' },
      duplicate: 'ERROR 23505',
      dataApi: [
        200,
        null,
        [
          {
            node: {
              id,
              operationId,
              stepKey: 'ASSIGN_LEAD:1',
              payloadHash: 'hash-1',
              assignmentVersion: 1,
              personId,
              createdBy: { source: 'MANUAL', name: 'System' },
            },
          },
        ],
      ],
      duplicateAfterSoftDelete: 'ERROR 23505',
    });
  }, 60000);

  it('T4 the version upserts in place with ON CONFLICT ("personId"); a second row for a person is refused', async () => {
    const personId = randomUUID();
    const insert = `INSERT INTO ${VERSIONS} (id, "personId", version, "lastFence") VALUES ($1, $2, $3, $4)`;

    const first = await attempt(insert, [randomUUID(), personId, '1', '7']);
    const duplicate = await attempt(insert, [randomUUID(), personId, '2', '8']);
    const upsert = await attempt(
      `${insert} ON CONFLICT ("personId") DO UPDATE SET version = EXCLUDED.version, "lastFence" = EXCLUDED."lastFence"`,
      [randomUUID(), personId, '3', '9'],
    );
    const rows = await raw(`SELECT version::bigint::text AS version, "lastFence"::bigint::text AS "lastFence" FROM ${VERSIONS} WHERE "personId" = $1`, [personId]);

    expect({ first, duplicate, upsert, rows }).toEqual({
      first: 'OK',
      duplicate: 'ERROR 23505',
      upsert: 'OK',
      rows: [{ version: '3', lastFence: '9' }],
    });
  }, 60000);

  it('T5 precision: exact to 2^53 − 1, silently wrong beyond; ::text turns exponential', async () => {
    const safeId = randomUUID();
    const beyondId = randomUUID();
    const insert = `INSERT INTO ${VERSIONS} (id, "personId", version, "lastFence") VALUES ($1, $2, $3, 0)`;

    await raw(insert, [safeId, randomUUID(), String(Number.MAX_SAFE_INTEGER)]);
    await raw(insert, [beyondId, randomUUID(), '9007199254740993']);

    const read = async (id: string) =>
      (await raw<{ asBigint: string; asText: string }>(
        `SELECT version::bigint::text AS "asBigint", version::text AS "asText" FROM ${VERSIONS} WHERE id = $1`,
        [id],
      ))[0];

    expect({ safe: await read(safeId), beyond: await read(beyondId) }).toEqual({
      safe: { asBigint: '9007199254740991', asText: '9.007199254740991e+15' },
      beyond: { asBigint: '9007199254740992', asText: '9.007199254740992e+15' },
    });
  }, 60000);

  it('T6 NUMERIC — the exact type — is refused for an app field at sync', async () => {
    await setupApplicationForSync({
      applicationUniversalIdentifier: NUMERIC_APP_ID,
      name: 'NUMERIC refusal app',
      description: 'Throwaway app proving NUMERIC app fields are refused',
      sourcePath: 'c1-numeric-refusal',
    });

    const { errors } = await syncApplication({
      manifest: buildBaseManifest({
        appId: NUMERIC_APP_ID,
        roleId: NUMERIC_ROLE_ID,
        overrides: {
          objects: [
            buildDefaultObjectManifest({
              nameSingular: 'numericProbe',
              namePlural: 'numericProbes',
              labelSingular: 'Numeric probe',
              labelPlural: 'Numeric probes',
              additionalFields: [
                { universalIdentifier: randomUUID(), type: FieldMetadataType.NUMERIC as const, name: 'amount', label: 'Amount' },
              ],
            }),
          ],
        },
      }),
      expectToFail: true,
    });

    expect(errors?.[0]?.extensions?.code).toBe('METADATA_VALIDATION_FAILED');
    expect(JSON.stringify(errors)).toContain('Field type NUMERIC is not supported for field creation');
  }, 120000);
});
