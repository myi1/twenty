// GENERATED FILE - DO NOT EDIT BY HAND.
// Produced by packages/twenty-server/scripts/generate-build-provenance.mjs
// Regenerate with: node scripts/generate-build-provenance.mjs

import type { BuildProvenance } from './build-provenance.type';

export const BUILD_PROVENANCE: BuildProvenance = {
  schemaVersion: 1,
  generatedAt: '2026-09-18T04:34:39.706Z',
  fork: {
    commit: '98d57a15843fa38a99c5041d18a3d3a8ae611d26',
    shortCommit: '98d57a15843f',
    branch: 'cheap/eng-propel-command',
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
  ],
  patchCount: 3,
};
