# Pooled root clock correction — scoped re-review

Reviewed `338b0ac971..0459562645f8fb4d2d17c2eb5c5282e4b2fdbb3c` in `/Users/yahyaismail/dev/_wt/codex-track2-root-clock-20260913`, against the original P2 and `root-clock-fix-brief.md`.

**Original finding: ADDRESSED. Spec compliance: PASS. Code quality: PASS.** No new actionable breakage found in this fix diff.

The stored-state condition in `packages/twenty-server/src/modules/propel-command/assignment-root-transition.ts:61–63` now requires all three current clocks to be null when assignedAgentId is null. Either non-null SLA clock therefore throws the existing DEPENDENCY_UNAVAILABLE error before transition planning, even when it contains an otherwise valid timestamp. The fix does not mutate or repair stored clocks. Validation for assigned roots remains unchanged.

The unchanged no-op return path still preserves assignmentVersion, returns the newly validated higher fence, emits no event, and supplies an empty Person patch. The new positive all-null pool test checks each of those properties and input preservation. Three negative tests independently cover slaBreachedAt, slaWarnedAt, and both clocks, with valid timestamps that exposed the original missing invariant.

Read the original review, repair brief, implementation report and complete two-file review package. Supplied evidence records three expected red regressions, then all 11 pure tests passing and an isolated strict TypeScript check passing. Tests and typechecking were not rerun. Read-only `git diff 338b0ac971..0459562645 --check` was clean; the candidate contains only the planner and its existing test file.

This verdict is limited to the pure model correction. Actual actor eligibility, Person persistence, transaction locks, receipt/event/intents, physical Check C, native write fences and activation remain outside this proof. No database, native engine, network, subagent, source edit or test execution was used in this re-review; only this report was written.
