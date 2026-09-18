import type { ForkPatch } from './build-provenance.type';

export type ForkPatchLedger = {
  upstream: {
    repository: string;
    version: string;
  };
  patches: ForkPatch[];
};

/**
 * Hand maintained ledger of the patches the Propel fork applies on top of
 * upstream Twenty. Every fork change that ships in an image should be listed
 * here so the generated build provenance can point at it.
 */
export const FORK_PATCH_LEDGER: ForkPatchLedger = {
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
};
