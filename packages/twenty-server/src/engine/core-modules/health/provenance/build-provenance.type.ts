/**
 * Shape of the build provenance metadata baked into a twenty-server image.
 *
 * It answers the question "which fork commit produced this image?" without
 * access to the git repository, and lists the fork patches that were applied
 * on top of upstream Twenty.
 */
export type ForkPatch = {
  /** Stable identifier of the patch within the fork ledger. */
  id: string;
  /** Human readable summary of the fork change. */
  title: string;
  /** Fork commit that introduced the patch (short or full sha). */
  forkCommit: string;
  /** Upstream ref the patch applies against, e.g. twenty@0.2.1. */
  upstreamRef: string;
  /** Glob-ish paths touched by the patch. */
  files: string[];
};

export type ForkProvenance = {
  /** Full 40 characters commit sha of the fork build. */
  commit: string;
  /** Abbreviated commit sha for display. */
  shortCommit: string;
  /** Branch or ref the image was built from. */
  branch: string;
};

export type UpstreamProvenance = {
  /** Upstream repository the fork is based on. */
  repository: string;
  /** Upstream package version tracked by the fork. */
  version: string;
};

export type BuildProvenance = {
  /** Version of the metadata shape itself. */
  schemaVersion: 1;
  /** ISO-8601 timestamp of when the metadata was generated. */
  generatedAt: string;
  /** Identity of the fork commit that produced the image. */
  fork: ForkProvenance;
  /** Identity of the upstream base the fork tracks. */
  upstream: UpstreamProvenance;
  /** Ledger of fork patches applied on top of upstream. */
  patches: ForkPatch[];
  /** Convenience mirror of the patches length. */
  patchCount: number;
};
