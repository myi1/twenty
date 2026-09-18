#!/usr/bin/env node
/**
 * Generates the build provenance metadata baked into a twenty-server image.
 *
 * The generated file records the fork commit the image was built from plus a
 * ledger of the fork patches applied on top of upstream Twenty, so that
 * anyone holding only an image can tell which fork commit produced it.
 *
 * Usage (from packages/twenty-server):
 *   node scripts/generate-build-provenance.mjs
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDir, '..');
const provenanceDir = join(
  packageRoot,
  'src/engine/core-modules/health/provenance',
);
const ledgerPath = join(provenanceDir, 'fork-patch-ledger.ts');
const outputPath = join(provenanceDir, 'build-provenance.generated.ts');

const git = (args) =>
  execFileSync('git', args, { cwd: packageRoot, encoding: 'utf8' }).trim();

const { FORK_PATCH_LEDGER } = await import(pathToFileURL(ledgerPath).href);

const provenance = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  fork: {
    commit: git(['rev-parse', 'HEAD']),
    shortCommit: git(['rev-parse', '--short=12', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
  },
  upstream: {
    repository: FORK_PATCH_LEDGER.upstream.repository,
    version: FORK_PATCH_LEDGER.upstream.version,
  },
  patches: FORK_PATCH_LEDGER.patches,
  patchCount: FORK_PATCH_LEDGER.patches.length,
};

const patchesLiteral = provenance.patches
  .map(
    (patch) => `    {
      id: '${patch.id}',
      title: '${patch.title}',
      forkCommit: '${patch.forkCommit}',
      upstreamRef: '${patch.upstreamRef}',
      files: [${patch.files.map((file) => `'${file}'`).join(', ')}],
    },`,
  )
  .join('\n');

const contents = `// GENERATED FILE - DO NOT EDIT BY HAND.
// Produced by packages/twenty-server/scripts/generate-build-provenance.mjs
// Regenerate with: node scripts/generate-build-provenance.mjs

import type { BuildProvenance } from './build-provenance.type';

export const BUILD_PROVENANCE: BuildProvenance = {
  schemaVersion: 1,
  generatedAt: '${provenance.generatedAt}',
  fork: {
    commit: '${provenance.fork.commit}',
    shortCommit: '${provenance.fork.shortCommit}',
    branch: '${provenance.fork.branch}',
  },
  upstream: {
    repository: '${provenance.upstream.repository}',
    version: '${provenance.upstream.version}',
  },
  patches: [
${patchesLiteral}
  ],
  patchCount: ${provenance.patchCount},
};
`;

writeFileSync(outputPath, contents);
console.log(`Wrote ${outputPath}`);

