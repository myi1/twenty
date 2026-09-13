import { randomUUID } from 'node:crypto';

import { gql } from 'graphql-tag';
import request from 'supertest';

import {
  SEED_APPLE_WORKSPACE_ID,
  SEED_YCOMBINATOR_WORKSPACE_ID,
} from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';
import { generateApiKeyToken } from 'test/integration/graphql/utils/generate-api-key-token.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import {
  commandRecordTables,
  installCommandRecordObjects,
  uninstallCommandRecordObjects,
} from 'test/integration/propel/utils/command-record-objects.util';

/**
 * C0 — can the assignment boundary be TRUSTED?
 *
 * Part 1 (A1–A3) is the transaction: a domain change and its step receipt commit
 * or roll back as one.
 * Part 2 (A4–A9) is the adversarial set: replay, changed payload under the same
 * key, stale version, stale fence, two competing writers, and an aggregate in
 * another workspace.
 * Part 3 (A10–A13) is identity: expired, invalid, absent and body-supplied.
 * Part 4 (A14) pins the ORM write path's known escape.
 *
 * Every assertion reads committed state through `global.testDataSource` — a
 * DIFFERENT connection from the one the transaction runs on.
 *
 * `person.city` stands in for the ownership field; the subject under test is the
 * command boundary, not the field.
 */

const WORKSPACE_ID = SEED_APPLE_WORKSPACE_ID;
const SCHEMA = getWorkspaceSchemaName(WORKSPACE_ID);
const OTHER_SCHEMA = getWorkspaceSchemaName(SEED_YCOMBINATOR_WORKSPACE_ID);
// The app's command-record objects, installed as a genuine app in beforeAll (decision B).
const { receipts: RECEIPTS, versions: VERSIONS } = commandRecordTables(WORKSPACE_ID);
const ROUTE = '/propel/v1/spike/assignment-step';

const OWNER_A = 'C0-OWNER-A';
const OWNER_B = 'C0-OWNER-B';
const OWNER_C = 'C0-OWNER-C';

// The seeded API key is on the worker allowlist in .env.test (by its jti).
const WORKER_TOKEN = API_KEY_ACCESS_TOKEN;
const JANE_MEMBER = WORKSPACE_MEMBER_DATA_SEED_IDS.JANE; // Admin  -> MANAGER
const JONY_MEMBER = WORKSPACE_MEMBER_DATA_SEED_IDS.JONY; // Member -> AGENT
// Jane's userWorkspace in Apple: read from her access token, confirmed in core."userWorkspace".
const JANE_USER_WORKSPACE = '20202020-1e7c-43d9-a5db-685b5069d816';

const raw = <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> =>
  global.testDataSource.query(sql, params);

const api = () => request(`http://localhost:${APP_PORT}`);

describe('C0 — the assignment command boundary (integration)', () => {
  let personId: string;
  let foreignPersonId: string;
  let freshKeyId: string;
  let freshKeyToken: string;
  const foreignOnlyMemberId = randomUUID();

  beforeAll(async () => {
    await installCommandRecordObjects();

    // A NEW key, deliberately given the Admin role: even an all-powerful key that
    // is not on the worker allowlist must be refused by the command route.
    const roles = await makeMetadataAPIRequest({
      query: gql`query { getRoles { id label } }`,
    });
    const adminRoleId = roles.body.data?.getRoles?.find(
      (role: { label: string }) => role.label === 'Admin',
    )?.id;

    if (!adminRoleId) {
      throw new Error(`no Admin role: ${JSON.stringify(roles.body)}`);
    }

    const created = await makeMetadataAPIRequest({
      query: gql`
        mutation CreateApiKey($input: CreateApiKeyInput!) {
          createApiKey(input: $input) { id }
        }
      `,
      variables: {
        input: { name: 'C0 not-a-worker key', expiresAt: '2030-01-01T00:00:00Z', roleId: adminRoleId },
      },
    });

    freshKeyId = created.body.data?.createApiKey?.id;

    if (!freshKeyId) {
      throw new Error(`createApiKey failed: ${JSON.stringify(created.body)}`);
    }

    const minted = await generateApiKeyToken({
      apiKeyId: freshKeyId,
      accessToken: APPLE_JANE_ADMIN_ACCESS_TOKEN,
    });

    freshKeyToken = minted.body.data?.generateApiKeyToken?.token;

    if (!freshKeyToken) {
      throw new Error(`generateApiKeyToken failed: ${JSON.stringify(minted.body)}`);
    }

    // A member that exists ONLY in the other workspace. Seeded member ids repeat
    // across workspaces, so borrowing a seeded id would not test scoping at all.
    await raw(
      `INSERT INTO "${OTHER_SCHEMA}"."workspaceMember" (id, "userId") VALUES ($1, $2)`,
      [foreignOnlyMemberId, randomUUID()],
    );
  }, 180000);

  afterAll(async () => {
    if (freshKeyId) {
      await raw('DELETE FROM core."apiKey" WHERE id = $1', [freshKeyId]);
    }
    await raw(`DELETE FROM "${OTHER_SCHEMA}"."workspaceMember" WHERE id = $1`, [
      foreignOnlyMemberId,
    ]);
    await uninstallCommandRecordObjects();
  }, 180000);

  beforeEach(async () => {
    personId = randomUUID();
    foreignPersonId = randomUUID();

    await raw(`DELETE FROM ${RECEIPTS}`);
    await raw(`DELETE FROM ${VERSIONS}`);
    await raw(
      `INSERT INTO "${SCHEMA}".person (id, city, "position") VALUES ($1, $2, 1)`,
      [personId, OWNER_A],
    );
    // An aggregate that exists, but in a DIFFERENT workspace.
    await raw(
      `INSERT INTO "${OTHER_SCHEMA}".person (id, city, "position") VALUES ($1, $2, 1)`,
      [foreignPersonId, OWNER_A],
    );
  });

  afterEach(async () => {
    await raw(`DELETE FROM "${SCHEMA}".person WHERE id = $1`, [personId]);
    await raw(`DELETE FROM "${OTHER_SCHEMA}".person WHERE id = $1`, [
      foreignPersonId,
    ]);
    await raw(`DELETE FROM ${RECEIPTS}`);
    await raw(`DELETE FROM ${VERSIONS}`);
  });

  const readCity = async (id = personId, schema = SCHEMA) => {
    const rows = await raw<{ city: string | null }>(
      `SELECT city FROM "${schema}".person WHERE id = $1`,
      [id],
    );

    return rows[0]?.city ?? null;
  };

  const readVersion = async (): Promise<string | null> => {
    const rows = await raw<{ version: string }>(
      `SELECT version::bigint::text AS version FROM ${VERSIONS} WHERE "personId" = $1`,
      [personId],
    );

    return rows[0]?.version ?? null;
  };

  const countReceipts = async (): Promise<number> => {
    const rows = await raw<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${RECEIPTS}`,
      [],
    );

    return Number(rows[0].n);
  };

  // Refusal REASONS are read from `response.text`, not `response.body`. This
  // harness registers MockedUnhandledExceptionFilter, which rethrows; Express then
  // renders the error as text/html ("ForbiddenException: <message>") and the JSON
  // body arrives as {}. Production registers UnhandledExceptionFilter, which keeps
  // { code, message } — proven in src/modules/propel-command/production-error-body.spec.ts.
  // Checking status alone would pass for a refusal made for the WRONG reason.
  const postStep = (
    overrides: Record<string, unknown> = {},
    token: string | null = APPLE_JANE_ADMIN_ACCESS_TOKEN,
  ) => {
    const call = api().post(ROUTE);

    if (token !== null) {
      call.set('Authorization', `Bearer ${token}`);
    }

    return call.send({
      personId,
      nextOwner: OWNER_B,
      operationId: randomUUID(),
      stepKey: 'ASSIGN_LEAD:1',
      payloadHash: 'hash-1',
      expectedVersion: '0',
      fence: 1,
      failAfter: 'none',
      ...overrides,
    });
  };

  const getStep = (
    operationId: string,
    stepKey: string,
    token: string,
    onBehalfOf?: string,
  ) => {
    const query = onBehalfOf ? `?onBehalfOfWorkspaceMemberId=${onBehalfOf}` : '';

    return api()
      .get(`/propel/v1/spike/steps/${operationId}/${encodeURIComponent(stepKey)}${query}`)
      .set('Authorization', `Bearer ${token}`);
  };

  // ── Part 1: the transaction ───────────────────────────────────────────────

  it('A1 — a failure BETWEEN the two writes reverts the first one', async () => {
    const response = await postStep({ failAfter: 'domain' });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
    expect(await readVersion()).toBeNull();
  });

  it('A2 — a failure AFTER both writes leaves neither', async () => {
    const response = await postStep({ failAfter: 'receipt' });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
    expect(await readVersion()).toBeNull();
  });

  it('A3 — a successful command advances the version 0 → 1 with its receipt', async () => {
    const response = await postStep();

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ownerValue: OWNER_B,
      assignmentVersion: '1',
      replay: false,
    });
    expect(await readCity()).toBe(OWNER_B);
    expect(await readVersion()).toBe('1');
    expect(await countReceipts()).toBe(1);
  });

  // ── Part 2: the adversarial set ───────────────────────────────────────────

  it('A4 — a crash after commit, then a retry, applies the change ONCE', async () => {
    const operationId = randomUUID();

    // The engine commits, then dies before answering. The caller cannot tell
    // whether the work landed.
    const lost = await postStep({ operationId, failAfter: 'commit' });

    expect(lost.status).toBeGreaterThanOrEqual(500);
    expect(await readCity()).toBe(OWNER_B);
    expect(await readVersion()).toBe('1');

    // The recovery path: same command id, same payload.
    const retry = await postStep({ operationId });

    expect(retry.status).toBe(201);
    expect(retry.body).toMatchObject({ assignmentVersion: '1', replay: true });
    // One mutation, one receipt — not two.
    expect(await readVersion()).toBe('1');
    expect(await countReceipts()).toBe(1);
  });

  it('A5 — the same command id with a DIFFERENT payload is a conflict', async () => {
    const operationId = randomUUID();

    expect((await postStep({ operationId })).status).toBe(201);

    const changed = await postStep({
      operationId,
      nextOwner: OWNER_C,
      payloadHash: 'hash-2',
      expectedVersion: '1',
    });

    expect(changed.status).toBe(409);
    expect(await readCity()).toBe(OWNER_B);
    expect(await readVersion()).toBe('1');
    expect(await countReceipts()).toBe(1);
  });

  it('A6 — a stale expected version is refused and changes nothing', async () => {
    expect((await postStep()).status).toBe(201);

    const stale = await postStep({ expectedVersion: '0', nextOwner: OWNER_C });

    expect(stale.status).toBe(409);
    // The reason, from the raw text (see the note above postStep). The `code` the
    // worker classifies by is proven against PRODUCTION's filter in
    // src/modules/propel-command/production-error-body.spec.ts.
    expect(stale.text).toContain('Expected assignment version 0, found 1');
    expect(await readCity()).toBe(OWNER_B);
    expect(await readVersion()).toBe('1');
  });

  it('A7 — a fencing token older than one already seen is refused', async () => {
    expect((await postStep({ fence: 5 })).status).toBe(201);

    const stale = await postStep({
      fence: 4,
      expectedVersion: '1',
      nextOwner: OWNER_C,
    });

    expect(stale.status).toBe(409);
    expect(await readCity()).toBe(OWNER_B);
    expect(await readVersion()).toBe('1');
  });

  it('A8 — two competing commands at version 0: exactly one advances it', async () => {
    const [first, second] = await Promise.all([
      postStep({ nextOwner: OWNER_B }),
      postStep({ nextOwner: OWNER_C }),
    ]);

    const statuses = [first.status, second.status].sort();

    expect(statuses).toEqual([201, 409]);
    expect(await readVersion()).toBe('1');
    expect(await countReceipts()).toBe(1);

    const winner = first.status === 201 ? OWNER_B : OWNER_C;

    expect(await readCity()).toBe(winner);
  });

  it('A9 — an aggregate in ANOTHER workspace cannot be touched', async () => {
    const response = await postStep({ personId: foreignPersonId });

    expect(response.status).toBe(422);
    expect(await readCity(foreignPersonId, OTHER_SCHEMA)).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
  });

  // ── Part 3: identity ──────────────────────────────────────────────────────

  it('A10 — an expired token performs no work', async () => {
    const response = await postStep({}, EXPIRED_ACCESS_TOKEN);

    expect([401, 403]).toContain(response.status);
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
  });

  it('A11 — a forged/invalid token performs no work', async () => {
    const response = await postStep({}, INVALID_ACCESS_TOKEN);

    expect([401, 403]).toContain(response.status);
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
  });

  it('A12 — no token performs no work', async () => {
    const response = await postStep({}, null);

    expect([401, 403]).toContain(response.status);
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
  });

  it('A13 — identity in the body is rejected, not silently ignored', async () => {
    const response = await postStep({ workspaceId: WORKSPACE_ID });

    expect(response.status).toBe(400);
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
  });

  // ── Part 3b: AUTHORISATION, not merely authentication ─────────────────────
  // A10-A12 only prove that BROKEN tokens do nothing. These prove that VALID
  // tokens belonging to people who are not managers do nothing either. Without
  // A18, a gate that denied everyone would pass A15-A17.

  it('A15 — a valid MEMBER token cannot move a lead', async () => {
    const response = await postStep({}, APPLE_JONY_MEMBER_ACCESS_TOKEN);

    expect(response.status).toBe(403);
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
    expect(await readVersion()).toBeNull();
  });

  it('A16 — a valid GUEST token cannot move a lead', async () => {
    const response = await postStep({}, APPLE_PHIL_GUEST_ACCESS_TOKEN);

    expect(response.status).toBe(403);
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
    expect(await readVersion()).toBeNull();
  });

  it('A17 — an API key NOT on the worker allowlist cannot move a lead, even with the Admin role', async () => {
    // CONTROL: the fresh key genuinely authenticates. Without this, a 403 below
    // could just be Twenty refusing an unknown key, and would prove nothing about
    // the allowlist.
    const control = await api()
      .post('/graphql')
      .set('Authorization', `Bearer ${freshKeyToken}`)
      .send({ query: '{ people(first: 1) { edges { node { id } } } }' });

    expect(control.status).toBe(200);
    expect(control.body.errors).toBeUndefined();

    const response = await postStep(
      { onBehalfOfWorkspaceMemberId: JANE_MEMBER },
      freshKeyToken,
    );

    expect(response.status).toBe(403);
    expect(response.text).toContain('not authorised to issue assignment commands');
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
  });

  it('A18 (control) — an ADMIN token still can, so the gate is not blanket-deny', async () => {
    const response = await postStep();

    expect(response.status).toBe(201);
    expect(await readCity()).toBe(OWNER_B);
    expect(await readVersion()).toBe('1');
  });

  // ── Part 3c: the COMMAND WORKER credential ───────────────────────────────
  // Founder decision 2026-09-13: the worker uses its OWN key, accepted only if the
  // key id is on PROPEL_COMMAND_WORKER_API_KEY_IDS, and the manager it acts for is
  // re-checked at the moment of the step. No custom role anywhere.

  it('W1 — the worker key acting for a MANAGER can move a lead', async () => {
    const response = await postStep({ onBehalfOfWorkspaceMemberId: JANE_MEMBER }, WORKER_TOKEN);

    expect(response.status).toBe(201);
    expect(await readCity()).toBe(OWNER_B);
    expect(await readVersion()).toBe('1');
  });

  it('W2 — the worker key acting for someone who is NOT a manager is refused at the step', async () => {
    const response = await postStep({ onBehalfOfWorkspaceMemberId: JONY_MEMBER }, WORKER_TOKEN);

    expect(response.status).toBe(403);
    expect(response.text).toContain('NOT_A_MANAGER');
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
  });

  it('W3 — the worker key must name who it acts for', async () => {
    const response = await postStep({}, WORKER_TOKEN);

    expect(response.status).toBe(400);
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
  });

  it('W4 — a member who exists only in ANOTHER workspace is refused', async () => {
    const response = await postStep({ onBehalfOfWorkspaceMemberId: foreignOnlyMemberId }, WORKER_TOKEN);

    expect(response.status).toBe(403);
    expect(response.text).toContain('NOT_A_MEMBER_OF_THIS_WORKSPACE');
    expect(await readCity()).toBe(OWNER_A);
  });

  it('W5 — a member id that exists nowhere is refused', async () => {
    const response = await postStep({ onBehalfOfWorkspaceMemberId: randomUUID() }, WORKER_TOKEN);

    expect(response.status).toBe(403);
    expect(await readCity()).toBe(OWNER_A);
  });

  it('W6 — a signed-in USER cannot act on behalf of anyone else', async () => {
    const response = await postStep({ onBehalfOfWorkspaceMemberId: JONY_MEMBER });

    expect(response.status).toBe(400);
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
  });

  it('W7 — a manager whose login in this workspace was REMOVED is refused', async () => {
    await raw('UPDATE core."userWorkspace" SET "deletedAt" = now() WHERE id = $1', [JANE_USER_WORKSPACE]);

    try {
      const response = await postStep({ onBehalfOfWorkspaceMemberId: JANE_MEMBER }, WORKER_TOKEN);

      expect(response.status).toBe(403);
      expect(response.text).toContain('NO_ACTIVE_LOGIN_IN_THIS_WORKSPACE');
      expect(await readCity()).toBe(OWNER_A);
    } finally {
      await raw('UPDATE core."userWorkspace" SET "deletedAt" = NULL WHERE id = $1', [JANE_USER_WORKSPACE]);
    }
  });

  it('G1 — the worker can look up a committed step to resume after an unknown outcome', async () => {
    const operationId = randomUUID();

    expect((await postStep({ operationId, onBehalfOfWorkspaceMemberId: JANE_MEMBER }, WORKER_TOKEN)).status).toBe(201);

    const found = await getStep(operationId, 'ASSIGN_LEAD:1', WORKER_TOKEN, JANE_MEMBER);

    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({ operationId, stepKey: 'ASSIGN_LEAD:1', assignmentVersion: '1' });
  });

  it('G2 — a step that never committed is 404, not an error', async () => {
    const found = await getStep(randomUUID(), 'ASSIGN_LEAD:1', WORKER_TOKEN, JANE_MEMBER);

    expect(found.status).toBe(404);
  });

  it('G3 — a step committed in ANOTHER workspace is invisible', async () => {
    // Receipts live in each workspace's OWN schema, so isolation is structural. To prove the
    // lookup never reads another schema, give the other workspace a receipt table holding
    // this very operation, then ask through this workspace.
    const operationId = randomUUID();
    const { receipts: otherReceipts } = commandRecordTables(SEED_YCOMBINATOR_WORKSPACE_ID);

    await raw(`CREATE TABLE ${otherReceipts} (LIKE ${RECEIPTS} INCLUDING DEFAULTS)`);

    try {
      await raw(
        `INSERT INTO ${otherReceipts} (id, "operationId", "stepKey", "payloadHash", "assignmentVersion", "personId")
         VALUES (gen_random_uuid(), $1, 'ASSIGN_LEAD:1', 'hash-1', 1, gen_random_uuid())`,
        [operationId],
      );

      const found = await getStep(operationId, 'ASSIGN_LEAD:1', WORKER_TOKEN, JANE_MEMBER);

      expect(found.status).toBe(404);
    } finally {
      await raw(`DROP TABLE IF EXISTS ${otherReceipts}`);
    }
  });

  it('G4 — a step lookup re-authorises: acting for a non-manager is refused', async () => {
    const operationId = randomUUID();

    expect((await postStep({ operationId, onBehalfOfWorkspaceMemberId: JANE_MEMBER }, WORKER_TOKEN)).status).toBe(201);

    const found = await getStep(operationId, 'ASSIGN_LEAD:1', WORKER_TOKEN, JONY_MEMBER);

    expect(found.status).toBe(403);
  });

  it('A19 — the SAME command sent twice at once: one change, and BOTH callers get the committed result', async () => {
    const operationId = randomUUID();

    const [first, second] = await Promise.all([
      postStep({ operationId }),
      postStep({ operationId }),
    ]);

    // A retry that arrives while the original is still inside its transaction must
    // wait for it and then REPLAY — not read the advanced version and report a
    // conflict for work that just committed. A worker that got 409 here would
    // record FAILED for a change that happened.
    expect([first.status, second.status]).toEqual([201, 201]);
    expect([first.body.replay, second.body.replay].sort()).toEqual([false, true]);
    expect(await readVersion()).toBe('1');
    expect(await countReceipts()).toBe(1);
  });

  // ── Part 4: the ORM escape, pinned ────────────────────────────────────────

  // CHARACTERIZATION of current, WRONG behaviour, so the constraint is executable
  // rather than folklore. WorkspaceEntityManager.update passes `undefined` where
  // every read path passes `this.queryRunner`, so the write runs on a pooled
  // connection and survives a rollback. Verified by mutation: passing
  // `this.queryRunner` there turns this test red on THIS fork.
  // Upstream never made that fix: Twenty 2.34 moved transactions to
  // runInWorkspaceTransaction, and 2.35 DELETED WorkspaceEntityManager (#24182,
  // #24718). On an upgrade past 2.35 this test will not go red — it will not
  // compile — and the engine step must be ported (ADR-001, "Upgrade note").
  // ── Part 5: the command records must be usable, or nothing happens (C1) ───
  //
  // Through the metadata API an Admin CAN switch these objects off or delete them (engine
  // spec c1-fence, F10), and a unique index can be lost. The step checks FIRST and refuses
  // with 503 DEPENDENCY_UNAVAILABLE before any write, rather than write into tables that no
  // longer guarantee exactly-once. Each case breaks one thing, restores it in `finally`,
  // then proves the restore with a successful command.

  const withBrokenRecords = async (breakIt: string, restore: string) => {
    await raw(breakIt);

    try {
      return {
        step: await postStep(),
        lookup: await getStep(randomUUID(), 'ASSIGN_LEAD:1', WORKER_TOKEN, JANE_MEMBER),
      };
    } finally {
      await raw(restore);
    }
  };

  const expectRefusedBeforeAnyWrite = async (
    outcome: { step: { status: number; text: string; body: { code?: string } }; lookup: { status: number; text: string; body: { code?: string } } },
    problem: string,
  ) => {
    expect({
      step: [outcome.step.status, outcome.step.text.includes(problem), outcome.step.body.code],
      lookup: [outcome.lookup.status, outcome.lookup.text.includes(problem), outcome.lookup.body.code],
      city: await readCity(),
      version: await readVersion(),
      receipts: await countReceipts(),
    }).toEqual({
      step: [503, true, 'DEPENDENCY_UNAVAILABLE'],
      lookup: [503, true, 'DEPENDENCY_UNAVAILABLE'],
      city: OWNER_A,
      version: null,
      receipts: 0,
    });

    // Restored: the very next command lands.
    expect((await postStep()).status).toBe(201);
  };

  it('S1 — the receipt table is gone: the step and the lookup refuse 503, nothing is written', async () => {
    const outcome = await withBrokenRecords(
      `ALTER TABLE ${RECEIPTS} RENAME TO "_propelStepReceiptGone"`,
      `ALTER TABLE "${SCHEMA}"."_propelStepReceiptGone" RENAME TO "_propelStepReceipt"`,
    );

    await expectRefusedBeforeAnyWrite(outcome, 'TABLE_MISSING:propelStepReceipt');
  });

  it('S2 — the version object is switched off: refused 503, nothing is written', async () => {
    const where = `"workspaceId" = '${WORKSPACE_ID}' AND "nameSingular" = 'propelAssignmentVersion'`;
    const outcome = await withBrokenRecords(
      `UPDATE core."objectMetadata" SET "isActive" = false WHERE ${where}`,
      `UPDATE core."objectMetadata" SET "isActive" = true WHERE ${where}`,
    );

    await expectRefusedBeforeAnyWrite(outcome, 'OBJECT_INACTIVE:propelAssignmentVersion');
  });

  it('S3 — the receipt unique index is lost: refused 503, nothing is written', async () => {
    const [index] = await raw<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = $1 AND tablename = '_propelStepReceipt' AND indexname LIKE 'IDX_UNIQUE_%'`,
      [SCHEMA],
    );

    expect(index).toBeDefined();

    const outcome = await withBrokenRecords(`DROP INDEX "${SCHEMA}"."${index.indexname}"`, index.indexdef);

    await expectRefusedBeforeAnyWrite(outcome, 'UNIQUE_INDEX_MISSING:propelStepReceipt');
  });

  it('S4 — a version already at the exact limit cannot advance: refused 422, nothing changes', async () => {
    const max = String(Number.MAX_SAFE_INTEGER);

    await raw(
      `INSERT INTO ${VERSIONS} (id, "personId", version, "lastFence", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 0, now(), now())`,
      [personId, max],
    );

    const response = await postStep({ expectedVersion: max });

    expect({
      status: response.status,
      reason: response.text.includes('the largest a version column stores exactly'),
      city: await readCity(),
      version: await readVersion(),
      receipts: await countReceipts(),
    }).toEqual({ status: 422, reason: true, city: OWNER_A, version: max, receipts: 0 });
  });

  it('S5 — a version or fence outside the exact range, or a padded version, is refused at the door', async () => {
    const outcomes = [];

    for (const overrides of [
      { expectedVersion: '9007199254740992' },
      { expectedVersion: '007' },
      { fence: 9007199254740992 },
    ]) {
      outcomes.push([overrides, (await postStep(overrides)).status]);
    }

    expect({
      outcomes,
      city: await readCity(),
      version: await readVersion(),
      receipts: await countReceipts(),
    }).toEqual({
      outcomes: [
        [{ expectedVersion: '9007199254740992' }, 422],
        [{ expectedVersion: '007' }, 422],
        [{ fence: 9007199254740992 }, 422],
      ],
      city: OWNER_A,
      version: null,
      receipts: 0,
    });
  });

  it('A14 (characterization) — the ORM write path COMMITS THROUGH a rollback', async () => {
    const response = await postStep({
      failAfter: 'domain',
      useOrmWritePath: true,
    });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await readCity()).toBe(OWNER_B);
    expect(await countReceipts()).toBe(0);
    expect(await readVersion()).toBeNull();
  });
});
