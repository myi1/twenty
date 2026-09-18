// GENERATED FILE - DO NOT EDIT BY HAND.
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
    repository: 'twentyhq/twenty',
    version: '0.2.1',
  },
  patches: [
    {
      id: 'propel-command-engine',
      title: 'Atomic command engine with receipts and migration',
      forkCommit: 'fe42e5d978',
      upstreamRef: 'twenty@0.2.1',
      files: ['src/engine/core-modules/propel-command/**'],
    },
    {
      id: 'propel-command-stage-advance',
      title: 'Typed stage advance step with atomic receipt',
      forkCommit: '54432940a6',
      upstreamRef: 'twenty@0.2.1',
      files: ['src/engine/core-modules/propel-command/**'],
    },
    {
      id: 'propel-command-durable-effects',
      title: 'Durable effect receipts with exactly-once resume',
      forkCommit: '98d57a1584',
      upstreamRef: 'twenty@0.2.1',
      files: ['src/engine/core-modules/propel-command/**'],
    },
    {
      id: 'propel-command-build-provenance',
      title: 'Expose engine build provenance on the health endpoint',
      forkCommit: 'b7a3ed0847',
      upstreamRef: 'twenty@0.2.1',
      files: ['src/engine/core-modules/health/**', 'scripts/generate-build-provenance.mjs'],
    },
    {
      id: 'propel-command-workspace-scoping',
      title: 'Scope command receipts to the calling workspace',
      forkCommit: '8aa38d06b3',
      upstreamRef: 'twenty@0.2.1',
      files: ['src/engine/core-modules/propel-command/**', 'src/database/typeorm/core/migrations/common/17763*.ts'],
    },
  ],
  patchCount: 5,
};
