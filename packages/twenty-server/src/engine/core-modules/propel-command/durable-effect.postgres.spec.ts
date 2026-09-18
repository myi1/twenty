import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { DataSource } from 'typeorm';

import { AssignmentStepService } from 'src/engine/core-modules/propel-command/assignment-step.service';
import { CommandKind } from 'src/engine/core-modules/propel-command/command-receipt.entity';
import { DurableEffectService } from 'src/engine/core-modules/propel-command/durable-effect.service';
import {
  EffectReceiptEntity,
  EffectStatus,
} from 'src/engine/core-modules/propel-command/effect-receipt.entity';
import { StageStepService } from 'src/engine/core-modules/propel-command/stage-step.service';

// This spec is deliberately DB-backed. The in-memory doubles used by the other
// propel specs simulate the pessimistic_write lock and the composite unique
// index, so they cannot prove that Postgres actually serialises concurrent
// resumes or rejects the loser. This spec runs the real DurableEffectService
// against Postgres.
//
// It refuses to touch an existing core.effect_receipt (a migrated database)
// and skips itself when no database is reachable, so a DB-less unit run is not
// broken and a real database is never mutated.
loadEnv({ path: join(__dirname, '../../../../.env.test') });

const CONNECTION_STRING =
  process.env.PG_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/test';

const CREATE_TABLE = `CREATE TABLE "core"."effect_receipt" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL,
  "commandId" text NOT NULL,
  "kind" text NOT NULL,
  "status" text NOT NULL DEFAULT 'CLAIMED',
  "result" jsonb,
  "claimedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "appliedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "PK_effect_receipt" PRIMARY KEY ("id")
)`;

const CREATE_INDEX = `CREATE UNIQUE INDEX "IDX_EFFECT_RECEIPT_WORKSPACE_COMMAND_ID" ON "core"."effect_receipt" ("workspaceId", "commandId")`;

describe('DurableEffectService against Postgres', () => {
  jest.useRealTimers();

  let admin: Client;
  let dataSource: DataSource;
  let dbReady = false;
  let assignmentStepService: { execute: jest.Mock };
  let service: DurableEffectService;

  const command = (workspaceId: string, commandId: string) => ({
    workspaceId,
    commandId,
    kind: CommandKind.ASSIGNMENT,
    payload: { recordId: 'record-1', assigneeWorkspaceMemberId: 'member-2' },
  });

  const insertClaimed = async (workspaceId: string, commandId: string) => {
    await admin.query(
      `INSERT INTO "core"."effect_receipt" ("workspaceId", "commandId", "kind", "status", "claimedAt") VALUES ($1, $2, $3, 'CLAIMED', now())`,
      [workspaceId, commandId, CommandKind.ASSIGNMENT],
    );
  };

  beforeAll(async () => {
    admin = new Client({ connectionString: CONNECTION_STRING });

    try {
      await admin.connect();
    } catch (error) {
      console.warn(
        `Skipping Postgres-backed durable effect spec: ${(error as Error).message}`,
      );

      return;
    }

    const existing = await admin.query(
      "SELECT to_regclass('core.effect_receipt') AS table",
    );

    if (existing.rows[0]?.table) {
      console.warn(
        'Skipping Postgres-backed durable effect spec: core.effect_receipt already exists and must not be mutated',
      );

      return;
    }

    await admin.query(CREATE_TABLE);
    await admin.query(CREATE_INDEX);

    dataSource = new DataSource({
      type: 'postgres',
      url: CONNECTION_STRING,
      entities: [EffectReceiptEntity],
      synchronize: false,
      logging: false,
    });

    await dataSource.initialize();

    assignmentStepService = { execute: jest.fn() };
    service = new DurableEffectService(
      dataSource.getRepository(EffectReceiptEntity),
      dataSource,
      assignmentStepService as unknown as AssignmentStepService,
      { execute: jest.fn() } as unknown as StageStepService,
    );
    dbReady = true;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }

    if (dbReady) {
      await admin.query('DROP TABLE IF EXISTS "core"."effect_receipt"');
    }

    if (admin) {
      await admin.end().catch(() => undefined);
    }
  });

  beforeEach(async () => {
    if (!dbReady) {
      return;
    }

    await admin.query('DELETE FROM "core"."effect_receipt"');
    assignmentStepService.execute.mockReset();
  });

  it('rejects a duplicate (workspaceId, commandId) but allows the same commandId in another workspace', async () => {
    if (!dbReady) {
      return;
    }

    const workspaceA = '11111111-1111-4111-8111-111111111111';
    const workspaceB = '22222222-2222-4222-8222-222222222222';

    await insertClaimed(workspaceA, 'shared-command');

    await expect(
      insertClaimed(workspaceA, 'shared-command'),
    ).rejects.toMatchObject({ code: '23505' });

    // The same commandId in a different workspace is a different command: the
    // composite index must not reject it.
    await expect(
      insertClaimed(workspaceB, 'shared-command'),
    ).resolves.toBeUndefined();
  });

  it('serialises concurrent resumes on the claim row so the effect runs exactly once', async () => {
    if (!dbReady) {
      return;
    }

    const workspaceId = '33333333-3333-4333-8333-333333333333';
    const commandId = 'resume-race';

    await insertClaimed(workspaceId, commandId);

    let releaseStep: () => void = () => undefined;
    const stepGate = new Promise<void>((resolve) => {
      releaseStep = resolve;
    });
    let markStepStarted: () => void = () => undefined;
    const stepStarted = new Promise<void>((resolve) => {
      markStepStarted = resolve;
    });

    assignmentStepService.execute.mockImplementation(async () => {
      markStepStarted();
      await stepGate;

      return { assignmentId: randomUUID() };
    });

    const first = service.execute(command(workspaceId, commandId));
    await stepStarted;

    const second = service.execute(command(workspaceId, commandId));
    let secondSettled = false;

    second
      .then(() => {
        secondSettled = true;
      })
      .catch(() => {
        secondSettled = true;
      });

    // Give the second resume time to reach the FOR UPDATE. It must be blocked
    // on the first transaction's row lock, not racing past it.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(secondSettled).toBe(false);

    releaseStep();

    const [firstReceipt, secondReceipt] = await Promise.all([first, second]);

    expect(assignmentStepService.execute).toHaveBeenCalledTimes(1);
    expect(firstReceipt.status).toBe(EffectStatus.APPLIED);
    expect(secondReceipt.status).toBe(EffectStatus.APPLIED);
    expect(secondReceipt.appliedAt).not.toBeNull();
  });
});
