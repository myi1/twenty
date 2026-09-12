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
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

/**
 * C1 FENCE — PREMISE CHECK. Is a fence on the receipt/version objects needed at all?
 *
 * The premise, taken from a comment in the app's agent.role.ts and never run: once
 * those two tables become APP OBJECTS, any caller holding Admin or Member can write
 * them through the ordinary data API, and only Propel's app roles (Agent, Manager)
 * are held back, by objectPermissions. If that is false, the fence may be unnecessary.
 *
 * Everything here is a GENUINE app object: an application is synced from a manifest,
 * exactly as app:install does, with two objects and two roles shaped like Propel's:
 *   · fenceProbe   — stands in for a locked table; both app roles deny writes on it
 *   · fenceSibling — no override; the CONTROL that shows a refusal comes from the
 *                    objectPermission and not from the role or the harness
 *
 * Every outcome is read twice: what the API answered, and what Postgres holds after.
 * A refusal that nonetheless changed a row would be recorded as a write.
 */

const WORKSPACE_ID = SEED_APPLE_WORKSPACE_ID;
const SCHEMA = getWorkspaceSchemaName(WORKSPACE_ID);

// Fixed identifiers, so a crashed earlier run is removed by the next one.
const APP_ID = '5f3c1e0a-0c11-4f3e-9a51-000000000f01';
const DEFAULT_ROLE_ID = '5f3c1e0a-0c11-4f3e-9a51-000000000f02';
const AGENT_SHAPED_ROLE_ID = '5f3c1e0a-0c11-4f3e-9a51-000000000f03';
const MANAGER_SHAPED_ROLE_ID = '5f3c1e0a-0c11-4f3e-9a51-000000000f04';
const LOCKED_OBJECT_ID = '5f3c1e0a-0c11-4f3e-9a51-000000000f05';
const SIBLING_OBJECT_ID = '5f3c1e0a-0c11-4f3e-9a51-000000000f06';

const ADMIN_KEY_TOKEN = API_KEY_ACCESS_TOKEN;
// The seeded key's id (the token's jti) and Jony's userWorkspace, from the dev seeder.
const ADMIN_KEY_ID = '20202020-f401-4d8a-a731-64d007c27bad';
const JONY_TOKEN = APPLE_JONY_MEMBER_ACCESS_TOKEN;
const JONY_MEMBER = WORKSPACE_MEMBER_DATA_SEED_IDS.JONY;
const JONY_USER_WORKSPACE = '20202020-3957-4908-9c36-2929a23f8353';

const AGENT_SHAPED_LABEL = 'Fence premise - Agent shape';
const MANAGER_SHAPED_LABEL = 'Fence premise - Manager shape';

const raw = <T = any>(sql: string, params?: unknown[]): Promise<T[]> =>
  global.testDataSource.query(sql, params);

const api = () => request(`http://localhost:${APP_PORT}`);

// ── the app under test ───────────────────────────────────────────────────────

const noteField = () => ({
  universalIdentifier: randomUUID(),
  type: FieldMetadataType.TEXT as const,
  name: 'note',
  label: 'Note',
});

const denyWritesOnLockedObject = () => ({
  universalIdentifier: randomUUID(),
  objectUniversalIdentifier: LOCKED_OBJECT_ID,
  canReadObjectRecords: true,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

const buildManifest = (): Manifest =>
  buildBaseManifest({
    appId: APP_ID,
    roleId: DEFAULT_ROLE_ID,
    overrides: {
      objects: [
        buildDefaultObjectManifest({
          universalIdentifier: LOCKED_OBJECT_ID,
          nameSingular: 'fenceProbe',
          namePlural: 'fenceProbes',
          labelSingular: 'Fence probe',
          labelPlural: 'Fence probes',
          additionalFields: [noteField()],
        }),
        buildDefaultObjectManifest({
          universalIdentifier: SIBLING_OBJECT_ID,
          nameSingular: 'fenceSibling',
          namePlural: 'fenceSiblings',
          labelSingular: 'Fence sibling',
          labelPlural: 'Fence siblings',
          additionalFields: [noteField()],
        }),
      ],
      roles: [
        {
          universalIdentifier: DEFAULT_ROLE_ID,
          label: 'Fence premise - app default',
          description: 'Default role of the throwaway premise app',
        },
        // Same role-level flags as src/roles/agent.role.ts in the app.
        {
          universalIdentifier: AGENT_SHAPED_ROLE_ID,
          label: AGENT_SHAPED_LABEL,
          canUpdateAllSettings: false,
          canAccessAllTools: false,
          canReadAllObjectRecords: true,
          canUpdateAllObjectRecords: true,
          canSoftDeleteAllObjectRecords: false,
          canDestroyAllObjectRecords: false,
          canBeAssignedToUsers: true,
          canBeAssignedToAgents: false,
          canBeAssignedToApiKeys: false,
          objectPermissions: [denyWritesOnLockedObject()],
        },
        // Same role-level flags as src/roles/manager.role.ts in the app.
        {
          universalIdentifier: MANAGER_SHAPED_ROLE_ID,
          label: MANAGER_SHAPED_LABEL,
          canUpdateAllSettings: false,
          canAccessAllTools: false,
          canReadAllObjectRecords: true,
          canUpdateAllObjectRecords: true,
          canSoftDeleteAllObjectRecords: true,
          canDestroyAllObjectRecords: false,
          canBeAssignedToUsers: true,
          canBeAssignedToAgents: false,
          canBeAssignedToApiKeys: false,
          objectPermissions: [denyWritesOnLockedObject()],
        },
      ],
    },
  });

// ── instruments ──────────────────────────────────────────────────────────────

type Outcome = string; // 'ALLOWED' | 'REFUSED' | 'OTHER …' — anything else is printed whole

const graphql = async (
  token: string,
  [query, variables]: [string, Record<string, unknown>],
): Promise<{ outcome: Outcome; data: any }> => {
  const response = await api()
    .post('/graphql')
    .set('Authorization', `Bearer ${token}`)
    .send({ query, variables });

  const errors = response.body?.errors;

  if (!errors || errors.length === 0) {
    return {
      outcome:
        response.status === 200 && response.body?.data
          ? 'ALLOWED'
          : `OTHER http=${response.status} ${response.text.slice(0, 300)}`,
      data: response.body?.data,
    };
  }

  const [first] = errors;

  return {
    outcome:
      first.extensions?.code === 'FORBIDDEN'
        ? 'REFUSED'
        : `OTHER ${first.extensions?.code} ${first.message}`,
    data: response.body?.data,
  };
};

const rest = async (
  token: string,
  method: 'post' | 'patch' | 'delete',
  path: string,
  body?: Record<string, unknown>,
): Promise<{ outcome: Outcome; body: any }> => {
  let call = api()[method](`/rest${path}`).set('Authorization', `Bearer ${token}`);

  if (body) {
    call = call.set('Content-Type', 'application/json').send(JSON.stringify(body));
  }

  const response = await call;

  // A REST permission refusal reaches this harness as HTTP 400 carrying
  // code PERMISSION_DENIED (the rest exception handler rethrows the permissions
  // exception unmapped), not as 403. Classify it by that code — never by status
  // alone — so an unrelated 400 still reads as OTHER.
  const refused =
    response.status === 403 ||
    (response.status >= 400 &&
      response.status < 500 &&
      response.body?.code === 'PERMISSION_DENIED');

  return {
    outcome:
      response.status >= 200 && response.status < 300
        ? 'ALLOWED'
        : refused
          ? 'REFUSED'
          : `OTHER http=${response.status} ${response.text.slice(0, 300)}`,
    body: response.body,
  };
};

const ops = (singular: string, plural: string) => {
  const S = singular[0].toUpperCase() + singular.slice(1);

  return {
    singular,
    plural,
    createKey: `create${S}`,
    // The caller supplies the id. The manifest's id field has no column default (the
    // SDK's own manifests declare `defaultValue: null` too), so without one Postgres
    // rejects the insert AFTER the permission check. Id generation is not what this
    // spec tests.
    create: (note: string): [string, Record<string, unknown>] => [
      `mutation($data: ${S}CreateInput!) { create${S}(data: $data) { id } }`,
      { data: { id: randomUUID(), note } },
    ],
    update: (id: string, note: string): [string, Record<string, unknown>] => [
      `mutation($id: UUID!, $data: ${S}UpdateInput!) { update${S}(id: $id, data: $data) { id } }`,
      { id, data: { note } },
    ],
    softDelete: (id: string): [string, Record<string, unknown>] => [
      `mutation($id: UUID!) { delete${S}(id: $id) { id } }`,
      { id },
    ],
    destroy: (id: string): [string, Record<string, unknown>] => [
      `mutation($id: UUID!) { destroy${S}(id: $id) { id } }`,
      { id },
    ],
    readAll: (): [string, Record<string, unknown>] => [
      `query { ${plural}(first: 100) { edges { node { id note } } } }`,
      {},
    ],
  };
};

const PROBE = ops('fenceProbe', 'fenceProbes');
const SIBLING = ops('fenceSibling', 'fenceSiblings');

describe('C1 fence premise — who can write an app object today (integration)', () => {
  const tables: Record<string, string> = {};
  let memberRoleId: string;
  let agentShapedRoleId: string;
  let managerShapedRoleId: string;

  const rowState = async (singular: string, id: string): Promise<string> => {
    const rows = await raw<{ note: string | null; deletedAt: Date | null }>(
      `SELECT note, "deletedAt" FROM ${tables[singular]} WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) return 'GONE';

    return `${rows[0].deletedAt ? 'SOFT_DELETED' : 'LIVE'}:${rows[0].note}`;
  };

  const countWithNote = async (singular: string, note: string) =>
    Number(
      (
        await raw<{ n: string }>(
          `SELECT count(*) AS n FROM ${tables[singular]} WHERE note = $1`,
          [note],
        )
      )[0].n,
    );

  const rolesHeldBy = async (column: 'userWorkspaceId' | 'apiKeyId', id: string) =>
    (
      await raw<{ label: string }>(
        `SELECT r.label FROM core."roleTarget" rt JOIN core.role r ON r.id = rt."roleId"
          WHERE rt."${column}" = $1 AND rt."workspaceId" = $2 ORDER BY r.label`,
        [id, WORKSPACE_ID],
      )
    ).map((row) => row.label);

  const moveJonyTo = async (roleId: string, expectedLabel: string) => {
    const response = await api()
      .post('/metadata')
      .set('Authorization', `Bearer ${APPLE_JANE_ADMIN_ACCESS_TOKEN}`)
      .send({
        query: `mutation { updateWorkspaceMemberRole(workspaceMemberId: "${JONY_MEMBER}", roleId: "${roleId}") { id } }`,
      });

    expect(response.body.errors).toBeUndefined();
    expect(await rolesHeldBy('userWorkspaceId', JONY_USER_WORKSPACE)).toEqual([
      expectedLabel,
    ]);
  };

  // A row written by the Admin key, for callers that are expected to be refused.
  const seed = async (o: ReturnType<typeof ops>, note: string) => {
    const created = await graphql(ADMIN_KEY_TOKEN, o.create(note));

    expect(created.outcome).toBe('ALLOWED');

    return created.data[o.createKey].id as string;
  };

  const roleId = async (universalIdentifier: string) =>
    (
      await raw<{ id: string }>(
        `SELECT id FROM core.role WHERE "universalIdentifier" = $1 AND "workspaceId" = $2`,
        [universalIdentifier, WORKSPACE_ID],
      )
    )[0]?.id;

  beforeAll(async () => {
    await cleanupApplicationAndAppRegistration({ applicationUniversalIdentifier: APP_ID });

    await setupApplicationForSync({
      applicationUniversalIdentifier: APP_ID,
      name: 'Fence premise app',
      description: 'Throwaway app for the C1 fence premise check',
      sourcePath: 'c1-fence-premise',
    });

    const { errors } = await syncApplication({
      manifest: buildManifest(),
      expectToFail: false,
    });

    expect(errors).toBeUndefined();

    for (const singular of [PROBE.singular, SIBLING.singular]) {
      const found = await raw<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = $1 AND lower(table_name) IN ($2, $3)`,
        [SCHEMA, singular.toLowerCase(), `_${singular.toLowerCase()}`],
      );

      expect(found).toHaveLength(1);
      tables[singular] = `${SCHEMA}."${found[0].table_name}"`;
    }

    memberRoleId = (
      await raw<{ id: string }>(
        `SELECT id FROM core.role WHERE label = $1 AND "workspaceId" = $2`,
        [MEMBER_ROLE_LABEL, WORKSPACE_ID],
      )
    )[0]?.id;
    agentShapedRoleId = await roleId(AGENT_SHAPED_ROLE_ID);
    managerShapedRoleId = await roleId(MANAGER_SHAPED_ROLE_ID);

    expect(memberRoleId).toBeDefined();
    expect(agentShapedRoleId).toBeDefined();
    expect(managerShapedRoleId).toBeDefined();
  }, 180000);

  afterAll(async () => {
    // Put Jony back whatever happened above, then remove the app and its tables.
    if (memberRoleId) {
      await api()
        .post('/metadata')
        .set('Authorization', `Bearer ${APPLE_JANE_ADMIN_ACCESS_TOKEN}`)
        .send({
          query: `mutation { updateWorkspaceMemberRole(workspaceMemberId: "${JONY_MEMBER}", roleId: "${memberRoleId}") { id } }`,
        });
    }

    await cleanupApplicationAndAppRegistration({ applicationUniversalIdentifier: APP_ID });
  }, 180000);

  it('F0 instrument: the objects are app-owned, the key holds Admin, Jony holds Member', async () => {
    const owners = await raw<{ nameSingular: string; app: string }>(
      `SELECT o."nameSingular", a."universalIdentifier" AS app
         FROM core."objectMetadata" o JOIN core.application a ON a.id = o."applicationId"
        WHERE o."universalIdentifier" = ANY($1) AND o."workspaceId" = $2
        ORDER BY o."nameSingular"`,
      [[LOCKED_OBJECT_ID, SIBLING_OBJECT_ID], WORKSPACE_ID],
    );

    expect(owners).toEqual([
      { nameSingular: 'fenceProbe', app: APP_ID },
      { nameSingular: 'fenceSibling', app: APP_ID },
    ]);

    expect(await rolesHeldBy('apiKeyId', ADMIN_KEY_ID)).toEqual(['Admin']);

    await moveJonyTo(memberRoleId, MEMBER_ROLE_LABEL);
  }, 60000);

  describe.each([
    ['F1', 'an Admin-role API key', () => ADMIN_KEY_TOKEN, false],
    ['F2', 'a Member-role user', () => JONY_TOKEN, true],
  ])('%s %s', (_id, _who, token, isJony) => {
    beforeAll(async () => {
      if (isJony) await moveJonyTo(memberRoleId, MEMBER_ROLE_LABEL);
    }, 60000);

    it('GraphQL: create, update, soft-delete and destroy the locked object', async () => {
      const first = `premise-${randomUUID()}`;
      const created = await graphql(token(), PROBE.create(first));
      const x = created.data?.[PROBE.createKey]?.id;
      const afterCreate = x ? await rowState(PROBE.singular, x) : 'NO ROW';

      const updated = await graphql(token(), PROBE.update(x, `${first}-2`));
      const afterUpdate = await rowState(PROBE.singular, x);

      const softDeleted = await graphql(token(), PROBE.softDelete(x));
      const afterSoftDelete = await rowState(PROBE.singular, x);

      const y = await seed(PROBE, `premise-${randomUUID()}`);
      const destroyed = await graphql(token(), PROBE.destroy(y));
      const afterDestroy = await rowState(PROBE.singular, y);

      expect({
        create: [created.outcome, afterCreate],
        update: [updated.outcome, afterUpdate],
        softDelete: [softDeleted.outcome, afterSoftDelete],
        destroy: [destroyed.outcome, afterDestroy],
      }).toEqual({
        create: ['ALLOWED', `LIVE:${first}`],
        update: ['ALLOWED', `LIVE:${first}-2`],
        softDelete: ['ALLOWED', `SOFT_DELETED:${first}-2`],
        destroy: ['ALLOWED', 'GONE'],
      });
    }, 60000);

    it('REST: create, update and delete the locked object', async () => {
      const first = `premise-${randomUUID()}`;
      const created = await rest(token(), 'post', `/${PROBE.plural}`, {
        id: randomUUID(),
        note: first,
      });
      const x = created.body?.data?.[PROBE.createKey]?.id;
      const afterCreate = x ? await rowState(PROBE.singular, x) : 'NO ROW';

      const updated = await rest(token(), 'patch', `/${PROBE.plural}/${x}`, {
        note: `${first}-2`,
      });
      const afterUpdate = await rowState(PROBE.singular, x);

      const deleted = await rest(token(), 'delete', `/${PROBE.plural}/${x}`);
      const afterDelete = await rowState(PROBE.singular, x);

      expect({
        create: [created.outcome, afterCreate],
        update: [updated.outcome, afterUpdate],
        delete: deleted.outcome,
      }).toEqual({
        create: ['ALLOWED', `LIVE:${first}`],
        update: ['ALLOWED', `LIVE:${first}-2`],
        delete: 'ALLOWED',
      });
      // Soft or hard is recorded, not assumed: REST DELETE goes through the common
      // delete-one runner.
      expect(afterDelete).not.toBe(`LIVE:${first}-2`);
    }, 60000);
  });

  describe.each([
    [
      'F3',
      AGENT_SHAPED_LABEL,
      () => agentShapedRoleId,
      // role-level: soft-delete and destroy are off for everything
      { create: 'ALLOWED', update: 'ALLOWED', softDelete: 'REFUSED', destroy: 'REFUSED' },
    ],
    [
      'F4',
      MANAGER_SHAPED_LABEL,
      () => managerShapedRoleId,
      // role-level: soft-delete on, destroy off
      { create: 'ALLOWED', update: 'ALLOWED', softDelete: 'ALLOWED', destroy: 'REFUSED' },
    ],
  ])('%s a user holding the app role "%s"', (_id, label, roleIdOf, siblingExpected) => {
    beforeAll(async () => {
      await moveJonyTo(roleIdOf(), label);
    }, 60000);

    it('is REFUSED every write on the object its objectPermissions deny, and nothing changes', async () => {
      const seedNote = `premise-seed-${randomUUID()}`;
      const s = await seed(PROBE, seedNote);
      const attempted = `premise-attempt-${randomUUID()}`;

      const created = await graphql(JONY_TOKEN, PROBE.create(attempted));
      const updated = await graphql(JONY_TOKEN, PROBE.update(s, attempted));
      const softDeleted = await graphql(JONY_TOKEN, PROBE.softDelete(s));
      const destroyed = await graphql(JONY_TOKEN, PROBE.destroy(s));
      const read = await graphql(JONY_TOKEN, PROBE.readAll());
      const readIds = (read.data?.[PROBE.plural]?.edges ?? []).map(
        (edge: { node: { id: string } }) => edge.node.id,
      );

      expect({
        create: created.outcome,
        update: updated.outcome,
        softDelete: softDeleted.outcome,
        destroy: destroyed.outcome,
        read: [read.outcome, readIds.includes(s)],
        rowsWithAttemptedNote: await countWithNote(PROBE.singular, attempted),
        seedRow: await rowState(PROBE.singular, s),
      }).toEqual({
        create: 'REFUSED',
        update: 'REFUSED',
        softDelete: 'REFUSED',
        destroy: 'REFUSED',
        read: ['ALLOWED', true],
        rowsWithAttemptedNote: 0,
        seedRow: `LIVE:${seedNote}`,
      });
    }, 60000);

    it('CONTROL: on the sibling object with no override, only the role-level flags apply', async () => {
      const first = `premise-${randomUUID()}`;
      const created = await graphql(JONY_TOKEN, SIBLING.create(first));
      const x = created.data?.[SIBLING.createKey]?.id ?? (await seed(SIBLING, first));
      const updated = await graphql(JONY_TOKEN, SIBLING.update(x, `${first}-2`));
      const softDeleted = await graphql(JONY_TOKEN, SIBLING.softDelete(x));
      const y = await seed(SIBLING, `premise-${randomUUID()}`);
      const destroyed = await graphql(JONY_TOKEN, SIBLING.destroy(y));

      expect({
        create: created.outcome,
        update: updated.outcome,
        softDelete: softDeleted.outcome,
        destroy: destroyed.outcome,
      }).toEqual(siblingExpected);
    }, 60000);

    it('REST applies the same denial on the locked object, and nothing changes', async () => {
      const seedNote = `premise-seed-${randomUUID()}`;
      const s = await seed(PROBE, seedNote);
      const attempted = `premise-attempt-${randomUUID()}`;

      const created = await rest(JONY_TOKEN, 'post', `/${PROBE.plural}`, {
        id: randomUUID(),
        note: attempted,
      });
      const updated = await rest(JONY_TOKEN, 'patch', `/${PROBE.plural}/${s}`, {
        note: attempted,
      });
      const deleted = await rest(JONY_TOKEN, 'delete', `/${PROBE.plural}/${s}`);

      expect({
        create: created.outcome,
        update: updated.outcome,
        delete: deleted.outcome,
        rowsWithAttemptedNote: await countWithNote(PROBE.singular, attempted),
        seedRow: await rowState(PROBE.singular, s),
      }).toEqual({
        create: 'REFUSED',
        update: 'REFUSED',
        delete: 'REFUSED',
        rowsWithAttemptedNote: 0,
        seedRow: `LIVE:${seedNote}`,
      });
    }, 60000);
  });
});
