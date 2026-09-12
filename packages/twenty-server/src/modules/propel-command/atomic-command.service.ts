import { Injectable } from '@nestjs/common';

import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

/**
 * C0 SPIKE — the one question: can this engine commit a domain change and proof
 * of that change in a single transaction that either fully happens or fully
 * does not?
 *
 * Scoping, so this is not read as more than it is:
 *  - `person.city` stands in for the ownership field. Propel's real field is
 *    `assignedAgentId`, which is not installed in the integration workspace. The
 *    subject under test is the TRANSACTION, not the field.
 *  - The workspace id comes from the caller's verified token, never from the body.
 *  - The ORM call still runs under a SYSTEM auth context. Proving that a forged
 *    member, a revoked user or a wrong workspace is rejected is the NEXT step and
 *    is not established by anything here.
 *  - The receipt table is created by the test, not by a migration. How such a
 *    table reaches a real environment is a separate, already-identified problem.
 */

export type SpikeFailurePoint = 'none' | 'domain' | 'receipt';

/**
 * 'runner' — the CHOSEN implementation: parameterised SQL on the transaction's
 *   own query runner. Proven atomic with the receipt (T0/T0b/T1/T2/T3).
 * 'orm'    — WorkspaceRepository.update, handed the transaction's manager.
 *   Retained only as a characterization case: this fork's
 *   WorkspaceEntityManager.update passes `undefined` where every read path
 *   passes `this.queryRunner`, so the write runs on a pooled connection and
 *   COMMITS THROUGH A ROLLBACK. See T7/T8.
 */
export type SpikeWriteMode = 'orm' | 'runner';

export class InjectedSpikeFailure extends Error {
  constructor(readonly at: SpikeFailurePoint) {
    super(`C0 spike: injected failure after the ${at} write`);
    this.name = 'InjectedSpikeFailure';
  }
}

export interface AssignmentStepInput {
  workspaceId: string;
  personId: string;
  nextOwner: string;
  operationId: string;
  stepKey: string;
  payloadHash: string;
  assignmentVersion: number;
  failAfter: SpikeFailurePoint;
  writeMode: SpikeWriteMode;
}

export interface CommittedSpikeStep {
  personId: string;
  ownerValue: string;
  assignmentVersion: number;
  stepKey: string;
}

const RECEIPT_TABLE = 'core."_c0SpikeStepReceipt"';

@Injectable()
export class AtomicCommandService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async commitAssignmentStep(
    input: AssignmentStepInput,
  ): Promise<CommittedSpikeStep> {
    const authContext = buildSystemAuthContext(input.workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();

        const schemaName = getWorkspaceSchemaName(input.workspaceId);

        const personRepository = await this.globalWorkspaceOrmManager.getRepository(
          input.workspaceId,
          'person',
          { shouldBypassPermissionChecks: true },
        );

        return dataSource.transaction(async (manager) => {
          const transactionManager = manager as WorkspaceEntityManager;

          // WorkspaceEntityManager.query() is deliberately overridden to throw
          // RAW_SQL_NOT_ALLOWED, so the receipt cannot be written through the
          // manager. Its underlying queryRunner IS the transactional connection
          // and is the sanctioned route for a non-domain, engine-owned table.
          const runner = transactionManager.queryRunner;

          if (!runner) {
            throw new Error('C0 spike: no transactional query runner');
          }

          // (1) the domain change
          if (input.writeMode === 'orm') {
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

          // (2) the step receipt, in core.* — a DIFFERENT schema, same database,
          //     written through the SAME transaction's manager. Whether that is
          //     genuinely one transaction is exactly what this spike measures.
          await runner.query(
            `INSERT INTO ${RECEIPT_TABLE}
               ("workspaceId","operationId","stepKey","payloadHash","assignmentVersion")
             VALUES ($1,$2,$3,$4,$5)`,
            [
              input.workspaceId,
              input.operationId,
              input.stepKey,
              input.payloadHash,
              input.assignmentVersion,
            ],
          );

          if (input.failAfter === 'receipt') {
            throw new InjectedSpikeFailure('receipt');
          }

          return {
            personId: input.personId,
            ownerValue: input.nextOwner,
            assignmentVersion: input.assignmentVersion,
            stepKey: input.stepKey,
          };
        });
      },
      authContext,
    );
  }
}
