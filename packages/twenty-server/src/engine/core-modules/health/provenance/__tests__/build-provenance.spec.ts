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
  const { execFileSync } = require('node:child_process');
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const { BUILD_PROVENANCE } = require('../build-provenance.generated.ts') as typeof import('../build-provenance.generated');

  const SHORT_SHA = /^[0-9a-f]{7,40}$/;
  const GENERATED_FILE = join(__dirname, '../build-provenance.generated.ts');

  const readGitHead = (): string | null => {
    try {
      const value = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: __dirname,
        encoding: 'utf8',
      }).trim();

      return value.length > 0 ? value : null;
    } catch {
      return null;
    }
  };

  describe('build provenance metadata', () => {
    it('declares the expected schema version', () => {
      assert.equal(BUILD_PROVENANCE.schemaVersion, 1);
    });

    // The rule: a committed file must never hold a commit hash it cannot know,
    // because it goes stale on the next commit. The generator must therefore
    // resolve the identity at runtime, not bake a sha into the file.
    it('does not pin a commit hash in the committed metadata file', () => {
      const source = readFileSync(GENERATED_FILE, 'utf8');

      assert.doesNotMatch(source, /[0-9a-f]{40}/);
    });

    // Asserting the rule rather than a fixed value: the recorded commit is
    // whatever this build actually is, so it can never be misattributed.
    it('records the commit the code was actually built from', () => {
      const expected = process.env.BUILD_FORK_COMMIT ?? readGitHead();

      if (expected === null) {
        // No git and no build identity: the metadata must say so rather than lie.
        assert.equal(BUILD_PROVENANCE.fork.commit, 'unknown');

        return;
      }

      assert.equal(BUILD_PROVENANCE.fork.commit, expected);
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

    it('exposes a consistent fork patch ledger including the latest patches', () => {
      assert.ok(Array.isArray(BUILD_PROVENANCE.patches));
      assert.ok(BUILD_PROVENANCE.patches.length > 0);
      assert.equal(
        BUILD_PROVENANCE.patchCount,
        BUILD_PROVENANCE.patches.length,
      );

      const ids = BUILD_PROVENANCE.patches.map((patch) => patch.id);

      assert.equal(new Set(ids).size, ids.length);
      // The two patches that were missing from the ledger.
      assert.ok(ids.includes('propel-command-build-provenance'));
      assert.ok(ids.includes('propel-command-workspace-scoping'));

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

