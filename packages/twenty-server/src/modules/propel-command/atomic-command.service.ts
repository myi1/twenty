import { Injectable } from '@nestjs/common';

import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

/**
 * C0 SPIKE — the narrow assignment step.
 *
 * Step 1 established that a workspace transaction spans the workspace schema and
 * core.* together, so the domain change and its step receipt commit or roll back
 * as one. This adds the parts that decide whether the boundary can be TRUSTED:
 * a locked compare-and-set on the assignment version, a fencing token, and
 * idempotent replay keyed on (workspace, operation, step).
 *
 * Scoping, unchanged: `person.city` stands in for the ownership field, the
 * receipt/version tables are created by the test rather than a migration, and the
 * ORM's own update path is NOT used because it escapes the transaction (see
 * 01-transaction-boundary-finding.md).
 */

export type SpikeFailurePoint = 'none' | 'domain' | 'receipt' | 'commit';

export class InjectedSpikeFailure extends Error {
  constructor(readonly at: SpikeFailurePoint) {
    super(`C0 spike: injected failure at the ${at} boundary`);
    this.name = 'InjectedSpikeFailure';
  }
}

/** Maps to 409 STALE_VERSION. */
export class StaleVersionError extends Error {
  constructor(readonly expected: string, readonly actual: string) {
    super(`Expected assignment version ${expected}, found ${actual}`);
    this.name = 'StaleVersionError';
  }
}

/** Maps to 409 IDEMPOTENCY_CONFLICT. */
export class IdempotencyConflictError extends Error {
  constructor() {
    super('This command id was already used with a different payload');
    this.name = 'IdempotencyConflictError';
  }
}

/** Maps to 409 — a fencing token older than one already seen. */
export class StaleFenceError extends Error {
  constructor(readonly presented: number, readonly seen: number) {
    super(`Fence ${presented} is older than ${seen}`);
    this.name = 'StaleFenceError';
  }
}

/** Maps to 422 — the aggregate is not in this workspace. */
export class UnknownAggregateError extends Error {
  constructor(readonly personId: string) {
    super(`No such person in this workspace: ${personId}`);
    this.name = 'UnknownAggregateError';
  }
}

export interface AssignmentStepInput {
  workspaceId: string;
  personId: string;
  nextOwner: string;
  operationId: string;
  stepKey: string;
  payloadHash: string;
  expectedVersion: string;
  fence: number;
  failAfter: SpikeFailurePoint;
  useOrmWritePath: boolean;
}

export interface CommittedSpikeStep {
  personId: string;
  ownerValue: string;
  assignmentVersion: string;
  stepKey: string;
  replay: boolean;
}

const RECEIPTS = 'core."_c0SpikeStepReceipt"';
const VERSIONS = 'core."_c0SpikeAssignmentVersion"';

@Injectable()
export class AtomicCommandService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async commitAssignmentStep(
    input: AssignmentStepInput,
  ): Promise<CommittedSpikeStep> {
    const authContext = buildSystemAuthContext(input.workspaceId);
    const schemaName = getWorkspaceSchemaName(input.workspaceId);

    const committed = await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();

        const personRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            input.workspaceId,
            'person',
            { shouldBypassPermissionChecks: true },
          );

        return dataSource.transaction(async (manager) => {
          const transactionManager = manager as WorkspaceEntityManager;
          // WorkspaceEntityManager.query() throws RAW_SQL_NOT_ALLOWED by design;
          // its queryRunner IS the transactional connection.
          const runner = transactionManager.queryRunner;

          if (!runner) {
            throw new Error('C0 spike: no transactional query runner');
          }

          // ── the aggregate must exist IN THIS WORKSPACE ───────────────────
          // FOR UPDATE on the PERSON row, not the version row: the version row
          // may not exist yet on a first assignment, and a lock on a row that is
          // not there serialises nothing — two first-writers would both proceed.
          // The person row always exists, so it is the honest lock target.
          // The characterization path deliberately skips the lock. The ORM write
          // runs on a POOLED connection, so it would block on a row this very
          // transaction holds — a self-deadlock that resolves only when the
          // client read timeout fires (~10 s), after which Postgres runs the
          // queued UPDATE anyway once the rollback releases the lock. That is a
          // real finding in its own right (row locking and the ORM write path
          // cannot be combined in one command) but it is a COMPOUND of three
          // effects, and a characterization test must isolate the one it names.
          const lockClause = input.useOrmWritePath ? '' : 'FOR UPDATE';

          const person: { id: string }[] = await runner.query(
            `SELECT id FROM "${schemaName}".person
              WHERE id = $1 AND "deletedAt" IS NULL
                ${lockClause}`,
            [input.personId],
          );

          if (person.length === 0) {
            throw new UnknownAggregateError(input.personId);
          }

          // ── idempotent replay — AFTER the person lock, never before ─────────
          // A retry that arrives while the original is still inside its
          // transaction must WAIT for it, then find its receipt and replay. Looked
          // up before the lock, the retry saw no receipt, waited, then read the
          // advanced version and reported a 409 for work that had just committed
          // (A19, watched red first). It still runs before the version compare, so
          // a retry after a lost response returns the canonical result, not a 409.
          const prior: { payloadHash: string; assignmentVersion: string }[] =
            await runner.query(
              `SELECT "payloadHash", "assignmentVersion"::text AS "assignmentVersion"
                 FROM ${RECEIPTS}
                WHERE "workspaceId" = $1 AND "operationId" = $2 AND "stepKey" = $3`,
              [input.workspaceId, input.operationId, input.stepKey],
            );

          if (prior.length > 0) {
            if (prior[0].payloadHash !== input.payloadHash) {
              throw new IdempotencyConflictError();
            }

            return {
              personId: input.personId,
              ownerValue: input.nextOwner,
              assignmentVersion: prior[0].assignmentVersion,
              stepKey: input.stepKey,
              replay: true,
            };
          }

          // ── lock the assignment row, then compare-and-set ────────────────
          // SELECT ... FOR UPDATE serialises two competing commands on the same
          // aggregate: the second blocks here until the first commits, then reads
          // the NEW version and loses its compare-and-set.
          const locked: { version: string; lastFence: string }[] =
            await runner.query(
              `SELECT version::text AS version, "lastFence"::text AS "lastFence"
                 FROM ${VERSIONS}
                WHERE "workspaceId" = $1 AND "personId" = $2`,
              [input.workspaceId, input.personId],
            );

          const currentVersion = locked.length > 0 ? locked[0].version : '0';
          const lastFence = locked.length > 0 ? Number(locked[0].lastFence) : -1;

          if (input.fence < lastFence) {
            throw new StaleFenceError(input.fence, lastFence);
          }

          if (currentVersion !== input.expectedVersion) {
            throw new StaleVersionError(input.expectedVersion, currentVersion);
          }

          // BigInt(1), not the 1n literal: the engine's tsconfig targets below ES2020, where
          // bigint literals are a type error (TS2737). swc accepts it, so neither the build
          // nor the tests caught it — only the typecheck did.
          const nextVersion = (BigInt(currentVersion) + BigInt(1)).toString();

          // ── the domain change ────────────────────────────────────────────
          if (input.useOrmWritePath) {
            await personRepository.update(
              input.personId,
              { city: input.nextOwner },
              transactionManager,
            );
          } else {
            await runner.query(
              `UPDATE "${schemaName}".person SET city = $1 WHERE id = $2`,
              [input.nextOwner, input.personId],
            );
          }

          if (input.failAfter === 'domain') {
            throw new InjectedSpikeFailure('domain');
          }

          // ── the new assignment version ───────────────────────────────────
          await runner.query(
            `INSERT INTO ${VERSIONS} ("workspaceId","personId",version,"lastFence")
             VALUES ($1,$2,$3,$4)
             ON CONFLICT ("workspaceId","personId")
             DO UPDATE SET version = EXCLUDED.version, "lastFence" = EXCLUDED."lastFence"`,
            [input.workspaceId, input.personId, nextVersion, input.fence],
          );

          // ── the step receipt ─────────────────────────────────────────────
          await runner.query(
            `INSERT INTO ${RECEIPTS}
               ("workspaceId","operationId","stepKey","payloadHash","assignmentVersion")
             VALUES ($1,$2,$3,$4,$5)`,
            [
              input.workspaceId,
              input.operationId,
              input.stepKey,
              input.payloadHash,
              nextVersion,
            ],
          );

          if (input.failAfter === 'receipt') {
            throw new InjectedSpikeFailure('receipt');
          }

          return {
            personId: input.personId,
            ownerValue: input.nextOwner,
            assignmentVersion: nextVersion,
            stepKey: input.stepKey,
            replay: false,
          };
        });
      },
      authContext,
    );

    // Crash AFTER the transaction committed but BEFORE the caller is answered.
    // The work is durable; the caller cannot know that. Recovery is a retry with
    // the same command id, which must replay rather than re-apply.
    if (input.failAfter === 'commit') {
      throw new InjectedSpikeFailure('commit');
    }

    return committed;
  }

  /** The committed receipt for (workspace, operation, step), or null. Read-only. */
  async getStep(
    workspaceId: string,
    operationId: string,
    stepKey: string,
  ): Promise<{
    operationId: string;
    stepKey: string;
    payloadHash: string;
    assignmentVersion: string;
  } | null> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const runner = dataSource.createQueryRunner();

        try {
          const rows: {
            operationId: string;
            stepKey: string;
            payloadHash: string;
            assignmentVersion: string;
          }[] = await runner.query(
            `SELECT "operationId"::text AS "operationId", "stepKey", "payloadHash",
                    "assignmentVersion"::text AS "assignmentVersion"
               FROM ${RECEIPTS}
              WHERE "workspaceId" = $1 AND "operationId" = $2 AND "stepKey" = $3`,
            [workspaceId, operationId, stepKey],
          );

          return rows[0] ?? null;
        } finally {
          await runner.release();
        }
      },
      buildSystemAuthContext(workspaceId),
    );
  }
}
