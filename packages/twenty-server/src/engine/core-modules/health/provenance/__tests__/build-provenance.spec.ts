/**
 * Shape spec for the generated build provenance metadata.
 *
 * The file is intentionally framework agnostic: it runs under the repository
 * jest runner and under `node --test --experimental-strip-types` alike.
 */
(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>;

  if (typeof globalScope.describe !== 'function') {
    const nodeTest = require('node:test');

    globalScope.describe = nodeTest.describe;
    globalScope.it = nodeTest.it;
  }

  const assert = require('node:assert/strict');
  const { BUILD_PROVENANCE } = require('../build-provenance.generated.ts') as typeof import('../build-provenance.generated');

  const FULL_SHA = /^[0-9a-f]{40}$/;
  const SHORT_SHA = /^[0-9a-f]{7,40}$/;

  describe('build provenance metadata', () => {
    it('declares the expected schema version', () => {
      assert.equal(BUILD_PROVENANCE.schemaVersion, 1);
    });

    it('records a well formed fork identity', () => {
      assert.match(BUILD_PROVENANCE.fork.commit, FULL_SHA);
      assert.match(BUILD_PROVENANCE.fork.shortCommit, SHORT_SHA);
      assert.ok(
        BUILD_PROVENANCE.fork.commit.startsWith(
          BUILD_PROVENANCE.fork.shortCommit,
        ),
      );
      assert.ok(BUILD_PROVENANCE.fork.branch.length > 0);
    });

    it('records a generatedAt ISO-8601 timestamp', () => {
      assert.ok(!Number.isNaN(Date.parse(BUILD_PROVENANCE.generatedAt)));
      assert.equal(
        new Date(BUILD_PROVENANCE.generatedAt).toISOString(),
        BUILD_PROVENANCE.generatedAt,
      );
    });

    it('records the upstream base', () => {
      assert.ok(BUILD_PROVENANCE.upstream.repository.length > 0);
      assert.ok(BUILD_PROVENANCE.upstream.version.length > 0);
    });

    it('exposes a consistent fork patch ledger', () => {
      assert.ok(Array.isArray(BUILD_PROVENANCE.patches));
      assert.ok(BUILD_PROVENANCE.patches.length > 0);
      assert.equal(
        BUILD_PROVENANCE.patchCount,
        BUILD_PROVENANCE.patches.length,
      );

      const ids = BUILD_PROVENANCE.patches.map((patch) => patch.id);

      assert.equal(new Set(ids).size, ids.length);

      for (const patch of BUILD_PROVENANCE.patches) {
        assert.ok(patch.id.length > 0);
        assert.ok(patch.title.length > 0);
        assert.match(patch.forkCommit, SHORT_SHA);
        assert.ok(patch.upstreamRef.length > 0);
        assert.ok(Array.isArray(patch.files));
        assert.ok(patch.files.length > 0);
      }
    });
  });
})();

