const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createSourceLoader } = require('./pure-source-loader.cjs');
const repository = path.resolve(__dirname, '../../..');
const { load } = createSourceLoader(
  repository,
  path.resolve(process.argv[2] || 'package.json'),
);
const app = 'src/engine/core-modules/application/application-manifest/';
const { ComputeApplicationManifestAllUniversalFlatEntityMapsService: Builder } =
  load(
    app +
      'services/compute-application-manifest-all-universal-flat-entity-maps.service',
  );
const { compareTwoFlatEntity } = load(
  'src/engine/workspace-manager/workspace-migration/universal-flat-entity/utils/compare-two-universal-flat-entity.util',
);
const { computeUniqueFieldMetadataIdsFromIndexes } = load(
  'src/engine/metadata-modules/index-metadata/utils/compute-unique-field-metadata-ids-from-indexes.util',
);
const uid = {
  object: '99000000-0000-4000-8000-000000000001',
  person: '99000000-0000-4000-8000-000000000002',
  index: '99000000-0000-4000-8000-000000000005',
};
const field = {
  universalIdentifier: uid.person,
  name: 'personId',
  label: 'Lead',
  description: 'The lead (person id) this version belongs to.',
  icon: 'IconUser',
  type: 'UUID',
  isNullable: false,
};
function manifest(
  fields = [field],
  indexes = [
    {
      universalIdentifier: uid.index,
      objectUniversalIdentifier: uid.object,
      isUnique: true,
      fields: [
        {
          universalIdentifier: '99000000-0000-4000-8000-000000000006',
          fieldUniversalIdentifier: uid.person,
        },
      ],
    },
  ],
) {
  return {
    application: { applicationVariables: {} },
    objects: [
      {
        universalIdentifier: uid.object,
        nameSingular: 'propelAssignmentVersion',
        namePlural: 'propelAssignmentVersions',
        labelSingular: 'Assignment version',
        labelPlural: 'Assignment versions',
        labelIdentifierFieldMetadataUniversalIdentifier: uid.person,
        fields,
      },
    ],
    fields: [],
    indexes,
    logicFunctions: [],
    frontComponents: [],
    roles: [],
    views: [],
    agents: [],
    skills: [],
    navigationMenuItems: [],
    applicationVariables: [],
    pageLayouts: [],
    permissionFlags: [],
    connectionProviders: [],
  };
}
function build(input = manifest()) {
  return new Builder({
    encryptVersioned: () => {
      throw new Error('Encryption is outside this test');
    },
  }).compute({
    manifest: input,
    ownerFlatApplication: { universalIdentifier: 'app-test' },
    now: '2026-09-13T00:00:00.000Z',
    workspaceId: 'workspace-test',
  });
}
const values = (maps) =>
  Object.values(maps.byUniversalIdentifier).filter(Boolean);
function assertNoFalseUpdate(result) {
  const target = result.flatFieldMetadataMaps.byUniversalIdentifier[uid.person];
  // Independent, hand-written live projection for a required field. The cache's
  // actual index helper supplies isUnique, as it does in the production cache.
  const liveUnique = computeUniqueFieldMetadataIdsFromIndexes([
    {
      isUnique: true,
      indexFieldMetadatas: [
        { fieldMetadataId: uid.person, subFieldName: null },
      ],
    },
  ]);
  const existing = {
    ...field,
    defaultValue: null,
    options: null,
    standardOverrides: null,
    universalSettings: null,
    isActive: true,
    isLabelSyncedWithName: false,
    isUnique: liveUnique.has(uid.person),
  };
  const delta = compareTwoFlatEntity({
    metadataName: 'fieldMetadata',
    fromUniversalFlatEntity: existing,
    toUniversalFlatEntity: target,
  });
  assert.equal(
    delta,
    undefined,
    `Unexpected existing-field update: ${JSON.stringify(delta)}`,
  );
  assert.equal(target.defaultValue, null);
  assert.equal(target.isNullable, false);
}
test('unchanged required UUID with declared unique index needs no metadata update', () => {
  const result = build();
  assertNoFalseUpdate(result);
  assert.deepEqual(
    values(result.flatIndexMaps).map((index) => index.universalIdentifier),
    [uid.index],
  );
});

test('repeated construction keeps the declared index identifier and member without an automatic index', () => {
  const input = manifest();
  const original = JSON.stringify(input);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = build(input);
    assertNoFalseUpdate(result);
    const indexes = values(result.flatIndexMaps);
    assert.equal(indexes.length, 1);
    assert.equal(indexes[0].universalIdentifier, uid.index);
    assert.equal(indexes[0].indexWhereClause, null);
    assert.equal(indexes[0].isUnique, true);
    assert.equal(indexes[0].universalFlatIndexFieldMetadatas.length, 1);
    const member = indexes[0].universalFlatIndexFieldMetadatas[0];
    assert.equal(member.fieldMetadataUniversalIdentifier, uid.person);
    assert.equal(member.indexMetadataUniversalIdentifier, uid.index);
    assert.equal(member.subFieldName, null);
    assert.equal(member.order, 0);
  }
  assert.equal(
    JSON.stringify(input),
    original,
    'The input manifest is immutable',
  );
});

test('explicit false cannot contradict a declared single-field unique index', () => {
  const result = build(manifest([{ ...field, isUnique: false }]));
  assertNoFalseUpdate(result);
  assert.equal(values(result.flatIndexMaps).length, 1);
});

test('top-level fields receive the same index-derived uniqueness', () => {
  const input = manifest([]);
  input.fields = [{ ...field, objectUniversalIdentifier: uid.object }];
  const result = build(input);
  assertNoFalseUpdate(result);
  assert.equal(values(result.flatIndexMaps).length, 1);
});

for (const [name, fields, index, expected] of [
  [
    'non-unique single-field index',
    [field],
    { isUnique: false, fields: [{ fieldUniversalIdentifier: uid.person }] },
    [false],
  ],
  [
    'multi-field unique index',
    [field, { ...field, universalIdentifier: 'other-field', name: 'otherId' }],
    {
      isUnique: true,
      fields: [
        { fieldUniversalIdentifier: uid.person },
        { fieldUniversalIdentifier: 'other-field' },
      ],
    },
    [false, false],
  ],
  [
    'unique composite subfield index',
    [{ ...field, type: 'ADDRESS', name: 'address' }],
    {
      isUnique: true,
      fields: [
        { fieldUniversalIdentifier: uid.person, subFieldName: 'addressCity' },
      ],
    },
    [false],
  ],
  [
    'unrelated field beside a unique scalar',
    [field, { ...field, universalIdentifier: 'other-field', name: 'otherId' }],
    {
      isUnique: true,
      fields: [{ fieldUniversalIdentifier: uid.person }],
    },
    [true, false],
  ],
]) {
  test(`${name} follows live cache uniqueness semantics`, () => {
    const result = build(
      manifest(fields, [
        {
          universalIdentifier: uid.index,
          objectUniversalIdentifier: uid.object,
          ...index,
        },
      ]),
    );
    assert.deepEqual(
      fields.map(
        (item) =>
          result.flatFieldMetadataMaps.byUniversalIdentifier[
            item.universalIdentifier
          ].isUnique,
      ),
      expected,
    );
    assert.equal(values(result.flatIndexMaps).length, 1);
  });
}

test('field-level explicit true still creates its automatic unique index', () => {
  const result = build(manifest([{ ...field, isUnique: true }], []));
  assertNoFalseUpdate(result);
  const indexes = values(result.flatIndexMaps);
  assert.equal(indexes.length, 1);
  assert.equal(indexes[0].isUnique, true);
  assert.equal(
    indexes[0].universalFlatIndexFieldMetadatas[0]
      .fieldMetadataUniversalIdentifier,
    uid.person,
  );
});

test('field-level true and a distinct non-unique declared index retain both intentions', () => {
  const input = manifest([{ ...field, isUnique: true }]);
  input.indexes[0].isUnique = false;
  const result = build(input);
  assertNoFalseUpdate(result);
  const indexes = values(result.flatIndexMaps);
  assert.equal(indexes.length, 2);
  assert.equal(
    indexes.find((index) => index.universalIdentifier === uid.index).isUnique,
    false,
  );
  assert.equal(indexes.filter((index) => index.isUnique).length, 1);
});

test('characterizes the pre-existing redundant true flag plus identical declared index conflict', () => {
  const result = build(manifest([{ ...field, isUnique: true }]));
  const indexes = values(result.flatIndexMaps);
  assert.equal(indexes.length, 2);
  assert.equal(indexes[0].name, indexes[1].name);
  assert.notEqual(
    indexes[0].universalIdentifier,
    indexes[1].universalIdentifier,
  );
  assert.equal(
    indexes.filter((index) => index.universalIdentifier === uid.index).length,
    1,
  );
});
