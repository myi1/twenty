import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

/**
 * C1 end to end: the real worker client (myi1/propel-crm workspace/server), in its
 * own process, driving this real engine over HTTP with its own API key.
 *
 * The client lives in a different repository, so its driver script is located by
 * PROPEL_WORKER_E2E_SCRIPT. Without it this test FAILS rather than skips — a
 * skipped end-to-end test reads like coverage and is not.
 *
 * Every outcome the child reports is re-checked in the database.
 */

const WORKSPACE_ID = SEED_APPLE_WORKSPACE_ID;
const SCHEMA = getWorkspaceSchemaName(WORKSPACE_ID);
const RECEIPTS = 'core."_c0SpikeStepReceipt"';
const VERSIONS = 'core."_c0SpikeAssignmentVersion"';

const raw = <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> =>
  global.testDataSource.query(sql, params);

describe('C1 — real worker client against the real engine (e2e)', () => {
  const people = [randomUUID(), randomUUID(), randomUUID()];

  beforeAll(async () => {
    for (const id of people) {
      await raw(`INSERT INTO "${SCHEMA}".person (id, city, "position") VALUES ($1, 'E2E-OWNER-A', 1)`, [id]);
    }
  });

  afterAll(async () => {
    await raw(`DELETE FROM ${RECEIPTS} WHERE "workspaceId" = $1 AND "payloadHash" = 'e2e-hash'`, [WORKSPACE_ID]);
    await raw(`DELETE FROM ${VERSIONS} WHERE "personId" = ANY($1::uuid[])`, [people]);
    await raw(`DELETE FROM "${SCHEMA}".person WHERE id = ANY($1::uuid[])`, [people]);
  });

  const city = async (id: string) =>
    (await raw<{ city: string }>(`SELECT city FROM "${SCHEMA}".person WHERE id = $1`, [id]))[0]?.city;

  const version = async (id: string) =>
    (await raw<{ version: string }>(
      `SELECT version::text AS version FROM ${VERSIONS} WHERE "workspaceId" = $1 AND "personId" = $2`,
      [WORKSPACE_ID, id],
    ))[0]?.version ?? null;

  const receiptsFor = async (operationId: string) =>
    Number(
      (await raw<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${RECEIPTS} WHERE "workspaceId" = $1 AND "operationId" = $2`,
        [WORKSPACE_ID, operationId],
      ))[0]?.n,
    );

  it('commits, resumes after a crash-after-commit exactly once, and refuses a non-manager', async () => {
    const script = process.env.PROPEL_WORKER_E2E_SCRIPT;

    if (!script) {
      throw new Error(
        'Set PROPEL_WORKER_E2E_SCRIPT to <propel-crm>/workspace/server/test/e2e/assign-via-engine.ts. This test fails rather than skips without it.',
      );
    }

    // Asynchronous spawn, never spawnSync: this engine may be serving from the
    // same process, and a blocked event loop could not answer the child.
    const { code, stdout, stderr } = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
      (resolve) => {
        const child = spawn(process.execPath, ['--experimental-strip-types', script], {
          env: {
            ...process.env,
            // The harness runs with NODE_OPTIONS="--import tsx/esm". The worker is a
            // plain Node process and must run as one, not through this harness's loader.
            NODE_OPTIONS: '',
            E2E_BASE_URL: `http://localhost:${APP_PORT}`,
            E2E_WORKER_TOKEN: API_KEY_ACCESS_TOKEN,
            E2E_MANAGER_MEMBER_ID: WORKSPACE_MEMBER_DATA_SEED_IDS.JANE,
            E2E_NON_MANAGER_MEMBER_ID: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
            E2E_PERSON_1: people[0],
            E2E_PERSON_2: people[1],
            E2E_PERSON_3: people[2],
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let out = '';
        let err = '';

        child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
        child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
        child.on('close', (exit) => resolve({ code: exit, stdout: out, stderr: err }));
      },
    );

    expect({ code, stderr: stderr.slice(0, 500) }).toMatchObject({ code: 0 });

    const line = stdout.split('\n').find((l) => l.startsWith('E2E_RESULTS '));

    expect(line).toBeDefined();

    // oxlint-disable-next-line @typescripttypescript/no-explicit-any
    const results: Record<string, any> = JSON.parse((line as string).slice('E2E_RESULTS '.length));

    // E1 — a normal move, landed.
    expect(results.E1).toMatchObject({ outcome: 'COMMITTED', resumed: false, assignmentVersion: '1' });
    expect(await city(people[0])).toBe('E2E-OWNER-B');
    expect(await version(people[0])).toBe('1');
    expect(await receiptsFor(results.E1.operationId)).toBe(1);

    // E2 — the engine committed and died before answering. The client did not
    // guess: it asked, found the committed step, and reported it — and the change
    // landed ONCE.
    expect(results.E2).toMatchObject({ outcome: 'COMMITTED', resumed: true, assignmentVersion: '1' });
    expect(await city(people[1])).toBe('E2E-OWNER-B');
    expect(await version(people[1])).toBe('1');
    expect(await receiptsFor(results.E2.operationId)).toBe(1);

    // E3 — acting for a non-manager: a DEFINITE refusal, classified by status, and
    // nothing moved.
    expect(results.E3).toMatchObject({ outcome: 'DEFINITE', code: 'FORBIDDEN' });
    expect(await city(people[2])).toBe('E2E-OWNER-A');
    expect(await version(people[2])).toBeNull();
    expect(await receiptsFor(results.E3.operationId)).toBe(0);
  });
});
