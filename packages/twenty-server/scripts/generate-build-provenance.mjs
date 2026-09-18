#!/usr/bin/env node
/**
 * Generates the build provenance metadata exposed on the twenty-server health
 * endpoint.
 *
 * The generated file records a ledger of the fork patches applied on top of
 * upstream Twenty, so that anyone holding only an image can tell which fork
 * changes produced it. It deliberately does NOT bake in the fork commit: a
 * committed file cannot know the commit it will be built from, so a hardcoded
 * sha goes stale on the very next commit. The fork identity is instead
 * resolved when the module loads, from the BUILD_FORK_* variables a build may
 * set or by reading git, so an image can never be misattributed.
 *
 * Usage (from packages/twenty-server):
 *   node scripts/generate-build-provenance.mjs
 */
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

const { FORK_PATCH_LEDGER } = await import(pathToFileURL(ledgerPath).href);

const patchesLiteral = FORK_PATCH_LEDGER.patches
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
//
// The fork commit is deliberately NOT baked in here. A committed file cannot
// know the commit it will be built from, so any hardcoded sha goes stale the
// moment the next commit lands and misattributes every later image. Instead the
// identity is resolved when the module loads: from the BUILD_FORK_* variables
// the build may set, or by reading git. The patch ledger below is historical
// and is the only part regenerated from source.

import { execFileSync } from 'node:child_process';

import type { BuildProvenance } from './build-provenance.type';

const readGit = (args: string[]): string | null => {
  try {
    const value = execFileSync('git', args, { encoding: 'utf8' }).trim();

    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
};

const forkCommit =
  process.env.BUILD_FORK_COMMIT ?? readGit(['rev-parse', 'HEAD']) ?? 'unknown';
const forkShortCommit =
  process.env.BUILD_FORK_SHORT_COMMIT ??
  readGit(['rev-parse', '--short=12', 'HEAD']) ??
  forkCommit.slice(0, 12);
const forkBranch =
  process.env.BUILD_FORK_BRANCH ??
  readGit(['rev-parse', '--abbrev-ref', 'HEAD']) ??
  'unknown';

export const BUILD_PROVENANCE: BuildProvenance = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  fork: {
    commit: forkCommit,
    shortCommit: forkShortCommit,
    branch: forkBranch,
  },
  upstream: {
    repository: '${FORK_PATCH_LEDGER.upstream.repository}',
    version: '${FORK_PATCH_LEDGER.upstream.version}',
  },
  patches: [
${patchesLiteral}
  ],
  patchCount: ${FORK_PATCH_LEDGER.patches.length},
};
`;

writeFileSync(outputPath, contents);
console.log(`Wrote ${outputPath}`);

