import { Injectable } from '@nestjs/common';

import { type QueryRunner } from 'typeorm';

import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { PROPEL_COMMAND_RECORD_OBJECTS } from 'src/modules/propel-rls/propel-command-records-fence.pre-query.hooks';

/**
 * C1 — the narrow assignment step, writing the app's command-record objects.
 *
 * C0 established that a workspace transaction spans the workspace schema, so the domain
 * change and its step receipt commit or roll back as one, and added what decides whether
 * the boundary can be TRUSTED: a locked compare-and-set on the assignment version, a
 * fencing token, and idempotent replay keyed on (operation, step).
 *
 * C1 (decision B): the receipt and the version are no longer hand-made tables. They are
 * the app's objects `propelStepReceipt` / `propelAssignmentVersion`, stored as
 * `_propelStepReceipt` / `_propelAssignmentVersion` in the workspace's OWN schema, so
 * workspace isolation is structural. Every fact this code depends on is pinned in the
 * engine spec c1-app-object-shape:
 *   · NUMBER columns are doubles, exact only to 2^53 - 1: versions are bounded at
 *     Number.MAX_SAFE_INTEGER and read as ::bigint::text, never ::text (exponential).
 *   · id, createdAt and updatedAt have no default, so they are set here.
 *   · the unique indexes are plain, not partial, so a soft-deleted receipt still holds its
 *     key; lookups therefore ignore deletedAt, and ON CONFLICT ("personId") targets the
 *     version's index.
 * The data API cannot write these objects at all (the propel-rls fence). The metadata API
 * CAN switch them off or delete them (c1-fence F10), so the step checks they are usable
 * FIRST and refuses before any write if not.
 *
 * Scoping, unchanged: `person.city` stands in for the ownership field, and the ORM's own
 * update path is NOT used because it escapes the transaction (see
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

/** Maps to 422 VALIDATION_FAILED — the next version would leave the column's exact range. */
export class VersionLimitError extends Error {
  constructor(readonly next: string) {
    super(
      `Assignment version ${next} is above ${Number.MAX_SAFE_INTEGER}, the largest a version column stores exactly`,
    );
    this.name = 'VersionLimitError';
  }
}

/**
 * Maps to 503 DEPENDENCY_UNAVAILABLE. Raised BEFORE any write, so the caller knows
 * nothing committed.
 */
export class CommandRecordsUnavailableError extends Error {
  constructor(readonly problems: string[]) {
    super(`Command records are unavailable: ${problems.join(', ')}`);
    this.name = 'CommandRecordsUnavailableError';
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

const RECEIPT_OBJECT = 'propelStepReceipt';
const VERSION_OBJECT = 'propelAssignmentVersion';

// The step writes exactly what the fence protects. If either name ever drops out of the
// fence, the engine refuses to boot rather than write an unprotected table.
for (const objectName of [RECEIPT_OBJECT, VERSION_OBJECT]) {
  if (!PROPEL_COMMAND_RECORD_OBJECTS.has(objectName)) {
    throw new Error(`${objectName} is written by the assignment step but is not fenced`);
  }
}

const MAX_SAFE_VERSION = BigInt(Number.MAX_SAFE_INTEGER);

const tableOf = (objectName: string) => `_${objectName}`;

// The unique index each table must carry, as Postgres prints it (c1-app-object-shape T2).
// A plain index ENDS at its column list; a partial one would carry a WHERE clause and fail.
const REQUIRED_UNIQUE_INDEX: Record<string, string> = {
  [RECEIPT_OBJECT]: 'USING btree ("operationId", "stepKey")',
  [VERSION_OBJECT]: 'USING btree ("personId")',
};

/**
 * Fail closed. The step's guarantees live in these two tables: exactly-once needs the
 * receipt's unique key, and "a stale command cannot reverse a newer one" needs the
 * version row. If either object is missing or switched off, its table is gone, or its
 * unique index is lost, the step refuses — before touching anything.
 */
const assertCommandRecordsUsable = async (
  runner: QueryRunner,
  workspaceId: string,
  schemaName: string,
): Promise<void> => {
  const objects: { nameSingular: string; isActive: boolean; tableExists: boolean }[] =
    await runner.query(
      `SELECT o."nameSingular", o."isActive",
              to_regclass(format('%I.%I', $2::text, '_' || o."nameSingular")) IS NOT NULL AS "tableExists"
         FROM core."objectMetadata" o
        WHERE o."workspaceId" = $1 AND o."nameSingular" = ANY($3::text[])`,
      [workspaceId, schemaName, [RECEIPT_OBJECT, VERSION_OBJECT]],
    );

  const uniqueIndexes: { tablename: string; indexdef: string }[] = await runner.query(
    `SELECT tablename, indexdef FROM pg_indexes
      WHERE schemaname = $1 AND tablename = ANY($2::text[])
        AND indexdef LIKE 'CREATE UNIQUE INDEX %'`,
    [schemaName, [tableOf(RECEIPT_OBJECT), tableOf(VERSION_OBJECT)]],
  );

  const problems: string[] = [];

  for (const objectName of [RECEIPT_OBJECT, VERSION_OBJECT]) {
    const object = objects.find((row) => row.nameSingular === objectName);

    if (!object) {
      problems.push(`OBJECT_MISSING:${objectName}`);
      continue;
    }

    if (!object.isActive) {
      problems.push(`OBJECT_INACTIVE:${objectName}`);
    }

    if (!object.tableExists) {
      problems.push(`TABLE_MISSING:${objectName}`);
      continue;
    }

    const hasUniqueIndex = uniqueIndexes.some(
      (index) =>
        index.tablename === tableOf(objectName) &&
        index.indexdef.endsWith(REQUIRED_UNIQUE_INDEX[objectName]),
    );

    if (!hasUniqueIndex) {
      problems.push(`UNIQUE_INDEX_MISSING:${objectName}`);
    }
  }

  if (problems.length > 0) {
    throw new CommandRecordsUnavailableError(problems);
  }
};

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
    const receipts = `"${schemaName}"."${tableOf(RECEIPT_OBJECT)}"`;
    const versions = `"${schemaName}"."${tableOf(VERSION_OBJECT)}"`;

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

          // ── the command records must be usable, or nothing happens ─────────
          await assertCommandRecordsUsable(runner, input.workspaceId, schemaName);

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
          // deletedAt is ignored on purpose: the unique key is held either way.
          const prior: { payloadHash: string; assignmentVersion: string }[] =
            await runner.query(
              `SELECT "payloadHash", "assignmentVersion"::bigint::text AS "assignmentVersion"
                 FROM ${receipts}
                WHERE "operationId" = $1 AND "stepKey" = $2`,
              [input.operationId, input.stepKey],
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

          // ── read the assignment version, then compare-and-set ────────────
          // The person row lock above serialises two competing commands on the same
          // aggregate: the second blocks there until the first commits, then reads
          // the NEW version here and loses its compare-and-set.
          const locked: { version: string; lastFence: string }[] =
            await runner.query(
              `SELECT version::bigint::text AS version, "lastFence"::bigint::text AS "lastFence"
                 FROM ${versions}
                WHERE "personId" = $1`,
              [input.personId],
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
          const next = BigInt(currentVersion) + BigInt(1);

          // Refused before the domain change: nothing has been written yet.
          if (next > MAX_SAFE_VERSION) {
            throw new VersionLimitError(next.toString());
          }

          const nextVersion = next.toString();

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
          // The command owns this row outright: an update also clears any soft delete.
          await runner.query(
            `INSERT INTO ${versions} (id, "personId", version, "lastFence", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, now(), now())
             ON CONFLICT ("personId")
             DO UPDATE SET version = EXCLUDED.version, "lastFence" = EXCLUDED."lastFence",
                           "updatedAt" = now(), "deletedAt" = NULL`,
            [input.personId, nextVersion, input.fence],
          );

          // ── the step receipt ─────────────────────────────────────────────
          await runner.query(
            `INSERT INTO ${receipts}
               (id, "operationId", "stepKey", "payloadHash", "assignmentVersion", "personId", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())`,
            [
              input.operationId,
              input.stepKey,
              input.payloadHash,
              nextVersion,
              input.personId,
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

  /** The committed receipt for (operation, step) in this workspace, or null. Read-only. */
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
    const schemaName = getWorkspaceSchemaName(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const runner = dataSource.createQueryRunner();

        try {
          // A lookup against unusable records could answer "never committed" for work
          // that did commit. Refuse instead; the worker keeps the outcome UNKNOWN.
          await assertCommandRecordsUsable(runner, workspaceId, schemaName);

          const rows: {
            operationId: string;
            stepKey: string;
            payloadHash: string;
            assignmentVersion: string;
          }[] = await runner.query(
            `SELECT "operationId"::text AS "operationId", "stepKey", "payloadHash",
                    "assignmentVersion"::bigint::text AS "assignmentVersion"
               FROM "${schemaName}"."${tableOf(RECEIPT_OBJECT)}"
              WHERE "operationId" = $1 AND "stepKey" = $2`,
            [operationId, stepKey],
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
