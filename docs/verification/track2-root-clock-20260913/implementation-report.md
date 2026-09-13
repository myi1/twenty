# Root pool clock invariant repair report

## Outcome

Fixed the single P2 review finding in `/Users/yahyaismail/dev/_wt/codex-track2-root-clock-20260913` on branch `codex/track2-root-clock-20260913`, based at `338b0ac971fe42200ffc57e6705ecc4919826d64`.

The stored-state validator now rejects a pooled assignment root (`assignedAgentId: null`) unless `assignedAt`, `slaBreachedAt`, and `slaWarnedAt` are all null. It throws the existing `AssignmentTransitionError` with code `DEPENDENCY_UNAVAILABLE`; it does not repair or clear malformed stored clocks. A valid all-null pool-to-pool request remains a no-op: assignment version stays unchanged, the higher fence is returned, no event is emitted, `personPatch` is empty, and the input root is not mutated.

Dependency mapping found no production caller or registration for this inactive pure planner. Its current direct consumer is the existing pure Node model test. The returned plan remains limited to assignment-root fields, event type, assignment version, and fence.

## Changed files

- `packages/twenty-server/src/modules/propel-command/assignment-root-transition.ts`
- `scripts/propel-command-tests/assignment-root-transition.test.mjs`

No other engine file was changed. No dependency was added or installed.

## TDD red evidence

Tests were changed first. Three regressions cover pooled roots with only `slaBreachedAt`, only `slaWarnedAt`, and both SLA clocks set. A fourth test covers the valid all-null pool-to-pool no-op and input preservation.

Command:

```text
node --test --experimental-strip-types scripts/propel-command-tests/assignment-root-transition.test.mjs
```

Exit: `1`

Relevant output:

```text
✔ real assignedAgentId/clocks transition increments once and leaves unrelated fields outside patch
✔ pool return clears current assignment clocks and advances; pool-to-agent is assigned event
✔ same owner retains version/clocks and creates no event; expected version still checked
✔ epoch cannot be absent/mismatched and owner eligibility is required even for same owner
✔ new command requires higher fence; malformed physical versions and unsafe growth refuse
✔ golden root versions 7 to 11 across A→B→C→pool→B without mutation on stale replay
✔ missing or malformed committed clocks are dependency failures, never reconstructed on no-op
✖ pooled root with only slaBreachedAt set is a dependency failure
✖ pooled root with only slaWarnedAt set is a dependency failure
✖ pooled root with both SLA clocks set is a dependency failure
✔ valid all-null pool no-op retains version, advances fence and emits no mutation
ℹ tests 11
ℹ pass 8
ℹ fail 3
```

Each failure was `AssertionError [ERR_ASSERTION]: Missing expected exception`, which is the expected symptom of the missing stored-pool validation.

## Green and final verification

Final pure Node model test after the commit:

```text
node --test --experimental-strip-types scripts/propel-command-tests/assignment-root-transition.test.mjs
```

Exit: `0`

```text
✔ real assignedAgentId/clocks transition increments once and leaves unrelated fields outside patch
✔ pool return clears current assignment clocks and advances; pool-to-agent is assigned event
✔ same owner retains version/clocks and creates no event; expected version still checked
✔ epoch cannot be absent/mismatched and owner eligibility is required even for same owner
✔ new command requires higher fence; malformed physical versions and unsafe growth refuse
✔ golden root versions 7 to 11 across A→B→C→pool→B without mutation on stale replay
✔ missing or malformed committed clocks are dependency failures, never reconstructed on no-op
✔ pooled root with only slaBreachedAt set is a dependency failure
✔ pooled root with only slaWarnedAt set is a dependency failure
✔ pooled root with both SLA clocks set is a dependency failure
✔ valid all-null pool no-op retains version, advances fence and emits no mutation
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 76.039
```

Node emitted the already-documented `MODULE_TYPELESS_PACKAGE_JSON` warning for importing this TypeScript ES module from the CommonJS engine package. Global module configuration was not changed.

Final isolated strict single-file TypeScript check after the commit:

```text
./node_modules/.bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck packages/twenty-server/src/modules/propel-command/assignment-root-transition.ts
```

Exit: `0`; no stdout or stderr.

Final diff check:

```text
git diff HEAD^ --check
```

Exit: `0`; no stdout or stderr.

## Commit

`0459562645f8fb4d2d17c2eb5c5282e4b2fdbb3c fix(propel): reject pooled assignment clocks`

Commit contains exactly the two allowed engine files. It was not pushed. The worktree still has the pre-existing untracked `node_modules` symlink, which was not committed or modified.

## Limits and open gates

This proves only pure stored-state validation and transition planning. It does not prove actual Person persistence, actor authentication or eligibility resolution, database transactions or locks, immutable intents/receipts/events, physical Check C, engine write fences, projections, or replay storage. No full-engine typecheck/lint/test, engine boot, database, container, network, dependency install, deployment, activation, or push was run. Existing native/full-engine gates remain open and are not waived by these focused checks.

The report is outside the engine worktree as required and is intentionally not part of the engine commit.
