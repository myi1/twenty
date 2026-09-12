import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';
import {
  commandRecordTables,
  installCommandRecordObjects,
  uninstallCommandRecordObjects,
} from 'test/integration/propel/utils/command-record-objects.util';

/**
 * C1 end to end THROUGH THE QUEUE: the real worker (myi1/propel-crm workspace/server)
 * accepts an ASSIGN_LEAD command into its operations store, claims it with a real
 * lease and fence, drives this real engine, and records the outcome — in its own
 * process. Both databases are then checked directly.
 *
 * The driver is located by PROPEL_QUEUE_E2E_SCRIPT and this test FAILS without it.
 */

const WORKSPACE_ID = SEED_APPLE_WORKSPACE_ID;
const SCHEMA = getWorkspaceSchemaName(WORKSPACE_ID);
// The app's command-record objects, installed as a genuine app in beforeAll (decision B).
const { receipts: RECEIPTS, versions: VERSIONS } = commandRecordTables(WORKSPACE_ID);

const raw = <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> =>
  global.testDataSource.query(sql, params);

describe('C1 — accept, claim, engine, record: the real queue against the real engine (e2e)', () => {
  const people = [randomUUID(), randomUUID(), randomUUID()];
  const nextOwnerId = randomUUID();
  let operationIds: string[] = [];

  beforeAll(async () => {
    await installCommandRecordObjects();

    for (const id of people) {
      await raw(`INSERT INTO "${SCHEMA}".person (id, city, "position") VALUES ($1, 'QUEUE-OWNER-A', 1)`, [id]);
    }
  }, 180000);

  afterAll(async () => {
    if (operationIds.length > 0) {
      await raw('DELETE FROM propel_ops.operator_action WHERE operation_id = ANY($1::uuid[])', [operationIds]);
      await raw('DELETE FROM propel_ops.command_receipt WHERE operation_id = ANY($1::uuid[])', [operationIds]);
    }
    await raw(`DELETE FROM ${RECEIPTS} WHERE "payloadHash" LIKE 'e2e-queue-%'`);
    await raw(`DELETE FROM ${VERSIONS} WHERE "personId" = ANY($1::uuid[])`, [people]);
    await raw(`DELETE FROM "${SCHEMA}".person WHERE id = ANY($1::uuid[])`, [people]);
    await uninstallCommandRecordObjects();
  }, 180000);

  const city = async (id: string) =>
    (await raw<{ city: string }>(`SELECT city FROM "${SCHEMA}".person WHERE id = $1`, [id]))[0]?.city;

  const version = async (id: string) =>
    (await raw<{ version: string }>(
      `SELECT version::bigint::text AS version FROM ${VERSIONS} WHERE "personId" = $1`,
      [id],
    ))[0]?.version ?? null;

  const receipts = async (operationId: string) =>
    Number((await raw<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${RECEIPTS} WHERE "operationId" = $1`,
      [operationId],
    ))[0]?.n);

  const opsRow = async (operationId: string) =>
    (await raw<{ status: string; error_code: string | null; attempt: number; fence: string; result: Record<string, unknown> | null }>(
      'SELECT status, error_code, attempt, fence::text AS fence, result FROM propel_ops.command_receipt WHERE operation_id = $1',
      [operationId],
    ))[0];

  it('a manager command lands, a non-manager is refused, and a crashed worker is recovered without moving the lead twice', async () => {
    const script = process.env.PROPEL_QUEUE_E2E_SCRIPT;

    if (!script) {
      throw new Error('Set PROPEL_QUEUE_E2E_SCRIPT to <propel-crm>/workspace/server/test/e2e/queue-assign-via-engine.ts. This test fails rather than skips without it.');
    }

    const { code, stdout, stderr } = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(process.execPath, ['--experimental-strip-types', script], {
        env: {
          ...process.env,
          NODE_OPTIONS: '',
          E2E_OPS_DATABASE_URL: process.env.PG_DATABASE_URL,
          E2E_BASE_URL: `http://localhost:${APP_PORT}`,
          E2E_WORKER_TOKEN: API_KEY_ACCESS_TOKEN,
          E2E_WORKSPACE_ID: WORKSPACE_ID,
          E2E_MANAGER_MEMBER_ID: WORKSPACE_MEMBER_DATA_SEED_IDS.JANE,
          E2E_NON_MANAGER_MEMBER_ID: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
          E2E_NEXT_OWNER_ID: nextOwnerId,
          E2E_PERSON_1: people[0],
          E2E_PERSON_2: people[1],
          E2E_PERSON_3: people[2],
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      let err = '';

      child.stdout.on('data', (c: Buffer) => (out += c.toString()));
      child.stderr.on('data', (c: Buffer) => (err += c.toString()));
      child.on('close', (exit) => resolve({ code: exit, stdout: out, stderr: err }));
    });

    expect({ code, stderr: stderr.slice(0, 600) }).toMatchObject({ code: 0 });

    const line = stdout.split('\n').find((l) => l.startsWith('QUEUE_E2E '));

    expect(line).toBeDefined();

    // oxlint-disable-next-line @typescripttypescript/no-explicit-any
    const r: Record<string, any> = JSON.parse((line as string).slice('QUEUE_E2E '.length));

    operationIds = [r.Q1.operationId, r.Q2.operationId, r.Q3.operationId];

    // Q1 — landed, recorded COMPLETED.
    expect(await city(people[0])).toBe(nextOwnerId);
    expect(await version(people[0])).toBe('1');
    expect(await receipts(r.Q1.operationId)).toBe(1);
    expect(await opsRow(r.Q1.operationId)).toMatchObject({ status: 'COMPLETED' });

    // Q2 — refused at the step, recorded as a DEFINITE failure, nothing moved.
    expect(await city(people[1])).toBe('QUEUE-OWNER-A');
    expect(await version(people[1])).toBeNull();
    expect(await receipts(r.Q2.operationId)).toBe(0);
    expect(await opsRow(r.Q2.operationId)).toMatchObject({ status: 'FAILED', error_code: 'FORBIDDEN' });

    // Q3 — worker A got the step committed and died before recording it. Worker B
    // took over with a HIGHER fence; the engine replayed. The lead moved ONCE.
    const q3 = await opsRow(r.Q3.operationId);

    expect(await city(people[2])).toBe(nextOwnerId);
    expect(await version(people[2])).toBe('1');
    expect(await receipts(r.Q3.operationId)).toBe(1);
    expect(q3).toMatchObject({ status: 'COMPLETED', attempt: 2 });
    // resumed:false is load-bearing. Through this harness a 409 arrives WITHOUT its code, so
    // if the engine failed to replay, the client would call the outcome uncertain, look the
    // step up, find worker A's receipt and still report COMPLETED — masking the defect. In
    // production the 409 carries STALE_VERSION, and the same defect would record a move that
    // happened as FAILED. So the replay must come straight from the engine's answer.
    expect(q3?.result).toMatchObject({ assignmentVersion: '1', replay: true, resumed: false });
    expect(BigInt(q3!.fence) > BigInt(r.Q3.fenceA)).toBe(true);
  });
});
