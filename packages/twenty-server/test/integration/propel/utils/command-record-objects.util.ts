import { type Manifest } from 'twenty-shared/application';
import { FieldMetadataType } from 'twenty-shared/types';
import { buildBaseManifest } from 'test/integration/metadata/suites/application/utils/build-base-manifest.util';
import { buildDefaultObjectManifest } from 'test/integration/metadata/suites/application/utils/build-default-object-manifest.util';
import { cleanupApplicationAndAppRegistration } from 'test/integration/metadata/suites/application/utils/cleanup-application-and-app-registration.util';
import { setupApplicationForSync } from 'test/integration/metadata/suites/application/utils/setup-application-for-sync.util';
import { syncApplication } from 'test/integration/metadata/suites/application/utils/sync-application.util';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

/**
 * Installs the assignment command's record objects into the Apple test workspace as a
 * GENUINE app: the same object names, field types, NOT NULLs and unique indexes as the
 * Propel app's src/objects/propel-step-receipt.object.ts,
 * src/objects/propel-assignment-version.object.ts and the two src/indexes files. The
 * C0/C1 command specs run against these tables, not hand-made ones, so they test the
 * table the step will really meet.
 *
 * Only one app may own these object names at a time: the shape and fence specs install
 * their own copies and must not run concurrently with a command spec.
 */

const APP_ID = '5f3c1e0a-0c11-4f3e-9a51-000000000c01';
const ROLE_ID = '5f3c1e0a-0c11-4f3e-9a51-000000000c02';
const R = {
  object: '5f3c1e0a-0c11-4f3e-9a51-000000000c10',
  operationId: '5f3c1e0a-0c11-4f3e-9a51-000000000c11',
  stepKey: '5f3c1e0a-0c11-4f3e-9a51-000000000c12',
  payloadHash: '5f3c1e0a-0c11-4f3e-9a51-000000000c13',
  assignmentVersion: '5f3c1e0a-0c11-4f3e-9a51-000000000c14',
  personId: '5f3c1e0a-0c11-4f3e-9a51-000000000c15',
  index: '5f3c1e0a-0c11-4f3e-9a51-000000000c16',
  indexOperationId: '5f3c1e0a-0c11-4f3e-9a51-000000000c17',
  indexStepKey: '5f3c1e0a-0c11-4f3e-9a51-000000000c18',
};
const V = {
  object: '5f3c1e0a-0c11-4f3e-9a51-000000000c20',
  personId: '5f3c1e0a-0c11-4f3e-9a51-000000000c21',
  version: '5f3c1e0a-0c11-4f3e-9a51-000000000c22',
  lastFence: '5f3c1e0a-0c11-4f3e-9a51-000000000c23',
  index: '5f3c1e0a-0c11-4f3e-9a51-000000000c24',
  indexPersonId: '5f3c1e0a-0c11-4f3e-9a51-000000000c25',
};

/** The two tables, fully quoted, in a workspace's own schema. */
export const commandRecordTables = (workspaceId: string) => {
  const schema = getWorkspaceSchemaName(workspaceId);

  return {
    receipts: `"${schema}"."_propelStepReceipt"`,
    versions: `"${schema}"."_propelAssignmentVersion"`,
  };
};

const field = (universalIdentifier: string, type: FieldMetadataType, name: string) => ({
  universalIdentifier,
  type: type as FieldMetadataType.TEXT,
  name,
  label: name,
  isNullable: false,
});

const buildManifest = (): Manifest =>
  buildBaseManifest({
    appId: APP_ID,
    roleId: ROLE_ID,
    overrides: {
      objects: [
        buildDefaultObjectManifest({
          universalIdentifier: R.object,
          labelIdentifierFieldMetadataUniversalIdentifier: R.stepKey,
          nameSingular: 'propelStepReceipt',
          namePlural: 'propelStepReceipts',
          labelSingular: 'Command step receipt',
          labelPlural: 'Command step receipts',
          additionalFields: [
            field(R.operationId, FieldMetadataType.UUID, 'operationId'),
            field(R.stepKey, FieldMetadataType.TEXT, 'stepKey'),
            field(R.payloadHash, FieldMetadataType.TEXT, 'payloadHash'),
            field(R.assignmentVersion, FieldMetadataType.NUMBER, 'assignmentVersion'),
            field(R.personId, FieldMetadataType.UUID, 'personId'),
          ],
        }),
        buildDefaultObjectManifest({
          universalIdentifier: V.object,
          labelIdentifierFieldMetadataUniversalIdentifier: V.personId,
          nameSingular: 'propelAssignmentVersion',
          namePlural: 'propelAssignmentVersions',
          labelSingular: 'Assignment version',
          labelPlural: 'Assignment versions',
          additionalFields: [
            field(V.personId, FieldMetadataType.UUID, 'personId'),
            field(V.version, FieldMetadataType.NUMBER, 'version'),
            field(V.lastFence, FieldMetadataType.NUMBER, 'lastFence'),
          ],
        }),
      ],
      indexes: [
        {
          universalIdentifier: R.index,
          objectUniversalIdentifier: R.object,
          isUnique: true,
          fields: [
            { universalIdentifier: R.indexOperationId, fieldUniversalIdentifier: R.operationId },
            { universalIdentifier: R.indexStepKey, fieldUniversalIdentifier: R.stepKey },
          ],
        },
        {
          universalIdentifier: V.index,
          objectUniversalIdentifier: V.object,
          isUnique: true,
          fields: [{ universalIdentifier: V.indexPersonId, fieldUniversalIdentifier: V.personId }],
        },
      ],
    },
  });

export const installCommandRecordObjects = async (): Promise<void> => {
  await cleanupApplicationAndAppRegistration({ applicationUniversalIdentifier: APP_ID });

  await setupApplicationForSync({
    applicationUniversalIdentifier: APP_ID,
    name: 'Command records (test)',
    description: 'The assignment command record objects, installed for the command specs',
    sourcePath: 'c1-command-records',
  });

  const { errors } = await syncApplication({ manifest: buildManifest(), expectToFail: false });

  if (errors) {
    throw new Error(`installing the command-record objects failed: ${JSON.stringify(errors)}`);
  }
};

export const uninstallCommandRecordObjects = (): Promise<void> =>
  cleanupApplicationAndAppRegistration({ applicationUniversalIdentifier: APP_ID });
