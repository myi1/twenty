# Pure assignment root transition review

Reviewed candidate `338b0ac971` against parent `7fa6d2b1c0` in `/Users/yahyaismail/dev/_wt/codex-track2-fence-20260913`. Scope: the new pure transition, its model tests, and supplied evidence. Authority: `root-model-review-brief.md` and the approved current-engine assignment design's transaction/root rules.

**Spec compliance: CHANGES REQUESTED. Code quality: CHANGES REQUESTED.** One bounded source defect; no native boundary acceptance is implied.

## Finding

### P2 — Reject non-null current SLA clocks on a stored pool root

File: `packages/twenty-server/src/modules/propel-command/assignment-root-transition.ts`, lines **61–63**. Confidence: high.

The stored-state check requires `assignedAt === null` for an unassigned Person, but permits any valid timestamp in `slaBreachedAt` or `slaWarnedAt`. For example, an enrolled state with `assignedAgentId: null`, `assignedAt: null`, `slaWarnedAt: '2026-09-13T01:00:00.000Z'`, version `'7'`, and fence `'4'` passes validation. A new pool request with matching expected version and fence `'5'` then returns `changed: false`, `personPatch: {}`, and the higher fence (lines 81–95). Applying that plan preserves a current assignment SLA clock on a pooled root.

This contradicts the brief's pool-null-clocks invariant and the model's existing refusal of malformed stored assignment state. Reject either non-null SLA clock with `DEPENDENCY_UNAVAILABLE` when the stored owner is null. Do not silently clear them in a no-op, since no-op clock preservation is also required. Add coverage for each valid-but-non-null pooled SLA clock, plus a valid all-null pool-to-pool no-op that retains its version and advances the fence.

## Other scoped checks

- Only the supported authority epoch is accepted. Non-null owners require canonical UUIDs and an exact `true` eligibility assertion; the comments correctly place real eligibility and actor resolution inside the trusted outer transaction.
- Expected version and strictly higher fence are checked before both changed and same-owner results. Changed ownership advances the bounded safe-integer version exactly once; a same-owner request can retain the maximum version while advancing the fence.
- Changed owner plans touch only assignedAgentId and the three current assignment clocks. They preserve unrelated fields and lifetime analytics by omission. Returning to pool clears all three clocks; assigning from pool produces LEAD_ASSIGNED and other changes produce LEAD_REASSIGNED.
- Same-owner plans emit no event and return an empty Person patch. No task/effect creation exists in this pure increment. Replay lookup is explicitly required before planning a new intent; this function does not reconstruct immutable old results from current state.
- No registration, database writes, deployment, or cohort activation is introduced in this diff.

## Evidence and limits

Read the complete review package and `docs/verification/track2-root-model-20260913/README.md` plus `tests.txt`. Supplied evidence records seven passing pure Node tests and a dedicated strict TypeScript check. No tests were rerun. Read-only `git diff 7fa6d2b1c0..338b0ac971 --check` was clean.

These tests do not establish actual Person persistence, authentication, transaction locks, immutable receipts/events/intents, physical Check C, engine write fences, or current-root projection enforcement. The evidence accurately keeps those gates open, including the full-engine typecheck/lint limitations. This review neither waives those gates nor derives anything from Enterprise RLS or spike code. No source edits, network access, database operations, engine boot, or subagents were used; only this review artifact was written.
