import { randomUUID } from 'node:crypto';

import request from 'supertest';

import {
  SEED_APPLE_WORKSPACE_ID,
  SEED_YCOMBINATOR_WORKSPACE_ID,
} from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

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
const RECEIPTS = 'core."_c0SpikeStepReceipt"';
const VERSIONS = 'core."_c0SpikeAssignmentVersion"';
const ROUTE = '/propel/v1/spike/assignment-step';

const OWNER_A = 'C0-OWNER-A';
const OWNER_B = 'C0-OWNER-B';
const OWNER_C = 'C0-OWNER-C';

const raw = <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> =>
  global.testDataSource.query(sql, params);

const api = () => request(`http://localhost:${APP_PORT}`);

describe('C0 — the assignment command boundary (integration)', () => {
  let personId: string;
  let foreignPersonId: string;

  beforeAll(async () => {
    await raw(`
      CREATE TABLE IF NOT EXISTS ${RECEIPTS} (
        "workspaceId"       uuid        NOT NULL,
        "operationId"       uuid        NOT NULL,
        "stepKey"           text        NOT NULL,
        "payloadHash"       text        NOT NULL,
        "assignmentVersion" bigint      NOT NULL,
        "createdAt"         timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("workspaceId", "operationId", "stepKey")
      )
    `);
    await raw(`
      CREATE TABLE IF NOT EXISTS ${VERSIONS} (
        "workspaceId" uuid   NOT NULL,
        "personId"    uuid   NOT NULL,
        version       bigint NOT NULL,
        "lastFence"   bigint NOT NULL DEFAULT 0,
        PRIMARY KEY ("workspaceId", "personId")
      )
    `);
  });

  beforeEach(async () => {
    personId = randomUUID();
    foreignPersonId = randomUUID();

    await raw(`DELETE FROM ${RECEIPTS} WHERE "workspaceId" = $1`, [WORKSPACE_ID]);
    await raw(`DELETE FROM ${VERSIONS} WHERE "workspaceId" = $1`, [WORKSPACE_ID]);
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
    await raw(`DELETE FROM ${RECEIPTS} WHERE "workspaceId" = $1`, [WORKSPACE_ID]);
    await raw(`DELETE FROM ${VERSIONS} WHERE "workspaceId" = $1`, [WORKSPACE_ID]);
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
      `SELECT version::text AS version FROM ${VERSIONS}
        WHERE "workspaceId" = $1 AND "personId" = $2`,
      [WORKSPACE_ID, personId],
    );

    return rows[0]?.version ?? null;
  };

  const countReceipts = async (): Promise<number> => {
    const rows = await raw<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${RECEIPTS} WHERE "workspaceId" = $1`,
      [WORKSPACE_ID],
    );

    return Number(rows[0].n);
  };

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

  // ── Part 4: the ORM escape, pinned ────────────────────────────────────────

  // CHARACTERIZATION of current, WRONG behaviour, so the constraint is executable
  // rather than folklore. WorkspaceEntityManager.update passes `undefined` where
  // every read path passes `this.queryRunner`, so the write runs on a pooled
  // connection and survives a rollback. Verified by mutation: passing
  // `this.queryRunner` there turns this test red and is the real fix, whenever
  // the engine owners choose to review it.
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
