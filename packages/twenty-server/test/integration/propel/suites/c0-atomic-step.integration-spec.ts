import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

/**
 * C0 — prove the transaction boundary on the deployed fork.
 *
 * The one question: can this engine change a business record and write proof of
 * that change in a SINGLE transaction that either fully happens or fully does not?
 *
 * The step is driven over the real authenticated HTTP boundary
 * (`POST /propel/v1/spike/assignment-step`), not through the DI container: an
 * integration spec cannot resolve a class provider from `global.app`, because the
 * app is built in jest's globalSetup under a different module registry and the
 * spec's class objects are not the ones Nest registered.
 *
 * Every assertion reads committed state through `global.testDataSource` — a
 * DIFFERENT connection from the one the transaction runs on. Reading through the
 * transaction's own manager would show uncommitted rows and prove nothing.
 *
 * `person.city` stands in for the ownership field: Propel's `assignedAgentId` is
 * not installed in this workspace, and the subject under test is the transaction.
 */

const WORKSPACE_ID = SEED_APPLE_WORKSPACE_ID;
const SCHEMA = getWorkspaceSchemaName(WORKSPACE_ID);
const RECEIPTS = 'core."_c0SpikeStepReceipt"';
const ROUTE = '/propel/v1/spike/assignment-step';

const OWNER_A = 'C0-OWNER-A';
const OWNER_B = 'C0-OWNER-B';

const raw = <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> =>
  global.testDataSource.query(sql, params);

const api = () => request(`http://localhost:${APP_PORT}`);

describe('C0 — atomic business change + step receipt (integration)', () => {
  let personId: string;

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
  });

  beforeEach(async () => {
    personId = randomUUID();
    await raw(`DELETE FROM ${RECEIPTS} WHERE "workspaceId" = $1`, [WORKSPACE_ID]);
    await raw(
      `INSERT INTO "${SCHEMA}".person (id, city, "position") VALUES ($1, $2, 1)`,
      [personId, OWNER_A],
    );
    await raw(
      `DELETE FROM "${SCHEMA}"."timelineActivity" WHERE "targetPersonId" = $1`,
      [personId],
    );
  });

  afterEach(async () => {
    await raw(
      `DELETE FROM "${SCHEMA}"."timelineActivity" WHERE "targetPersonId" = $1`,
      [personId],
    );
    await raw(`DELETE FROM "${SCHEMA}".person WHERE id = $1`, [personId]);
    await raw(`DELETE FROM ${RECEIPTS} WHERE "workspaceId" = $1`, [WORKSPACE_ID]);
  });

  const readCity = async (): Promise<string | null> => {
    const rows = await raw<{ city: string | null }>(
      `SELECT city FROM "${SCHEMA}".person WHERE id = $1`,
      [personId],
    );

    return rows[0]?.city ?? null;
  };

  const countReceipts = async (): Promise<number> => {
    const rows = await raw<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${RECEIPTS} WHERE "workspaceId" = $1`,
      [WORKSPACE_ID],
    );

    return Number(rows[0].n);
  };

  const countTimelineRows = async (): Promise<number> => {
    const rows = await raw<{ n: string }>(
      `SELECT count(*)::text AS n FROM "${SCHEMA}"."timelineActivity" WHERE "targetPersonId" = $1`,
      [personId],
    );

    return Number(rows[0].n);
  };

  const postStep = (
    failAfter: 'none' | 'domain' | 'receipt',
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
      assignmentVersion: 8,
      failAfter,
      ...overrides,
    });
  };

  it('T1 — a failure BETWEEN the two writes reverts the first one', async () => {
    const response = await postStep('domain');

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
  });

  it('T2 — a failure AFTER both writes leaves neither', async () => {
    const response = await postStep('receipt');

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
  });

  it('T3 — a successful transaction contains BOTH writes', async () => {
    const response = await postStep('none');

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ personId, ownerValue: OWNER_B });
    expect(await readCity()).toBe(OWNER_B);
    expect(await countReceipts()).toBe(1);
  });

  // PARKED, NOT PASSING — the probe is not sound yet. The plan requires that a
  // rollback emit no successful domain event. The intended probe was the
  // timeline-activity row an UPDATED event writes, but a COMMITTED change wrote
  // ZERO timeline rows in this fixture, so "zero rows after a rollback" would be
  // vacuous and would report a pass for a system that had not been measured.
  // Reinstate only once a committed change is observed to produce a row.
  it.skip('T4 — a rolled-back transaction must leave no durable event side effect', async () => {
    await postStep('receipt');

    expect(await readCity()).toBe(OWNER_A);
    expect(await countTimelineRows()).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CHARACTERIZATION. These assert the CURRENT, WRONG behaviour of the ORM write
  // path, so the constraint is executable rather than folklore. They are a
  // tripwire: the day WorkspaceEntityManager.update passes `this.queryRunner`
  // instead of `undefined`, they go red and the command may switch to the ORM.
  // Verified by mutation: applying that one-line change locally turned T1/T2 from
  // red to green and turned these two red.
  // ─────────────────────────────────────────────────────────────────────────
  it('T7 (characterization) — the ORM write path COMMITS THROUGH a rollback', async () => {
    const response = await postStep('domain', { writeMode: 'orm' });

    expect(response.status).toBeGreaterThanOrEqual(500);
    // The transaction threw, and the ownership change survived it anyway.
    expect(await readCity()).toBe(OWNER_B);
  });

  it('T8 (characterization) — and it does so with no receipt, the exact split C0 forbids', async () => {
    const response = await postStep('domain', { writeMode: 'orm' });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await readCity()).toBe(OWNER_B);
    expect(await countReceipts()).toBe(0);
  });

  it('T5 — identity in the body is rejected, not silently ignored', async () => {
    const response = await postStep('none', { workspaceId: WORKSPACE_ID });

    expect(response.status).toBe(400);
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
  });

  it('T6 — no bearer token performs no work', async () => {
    const response = await postStep('none', {}, null);

    expect([401, 403]).toContain(response.status);
    expect(await readCity()).toBe(OWNER_A);
    expect(await countReceipts()).toBe(0);
  });
});
