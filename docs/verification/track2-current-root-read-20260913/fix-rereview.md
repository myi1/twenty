# Child SELECT fence — scoped P1 re-review

Fix: `b5ae6ce340f27a8eaa75919c5e0039e3f6a38814..b1dee166cd0d98d2524cbb18c2950e6c1891179c` in `/Users/yahyaismail/dev/_wt/codex-track2-read-fence-20260913`.

**Original P1: ADDRESSED. Spec compliance: PASS for this correction. Security/code quality: PASS for this correction.** No new actionable breakage was established in the fix diff. These verdicts concern the local source increment, not native leak closure or activation readiness.

## Original regression

The actual `GroupByWithRecordsService` now registers its completed ranked_records wrapper at line 247, after the existing metadata-alias removal. The helper fences the actual inner builder, regenerates its embedded SQL, and transfers its parameters before recording private provenance for this exact wrapper. The existing production path executes that wrapper directly through getRawMany. Ordinary metadata-backed Person/Deal group-by records therefore have a supported route through validation instead of the prior unconditional opaque-FROM refusal.

The producer expansion is the authorized four-line import/call change. It does not add a generic opaque-query exception, SQL parser, caller flag, or externally supplied authorization marker.

## Scoped security and regression checks

- Registration requires the single expected ranked_records subquery wrapper, no joins/CTEs/secondary loaders, matching actor/workspace bindings, and identical workspace/core datasource identities. The inner query must pass the existing fence, and every inner alias must have current datasource metadata in the expected workspace schema. Opaque or metadata-forged inners refuse. An already attested wrapper cannot be recycled as a metadata-backed inner because the independent alias checks still reject it.
- Protected inner SELECTs retain live membership, role, parent/root deletion and current Person owner predicates. Provenance records query construction, not the result of an authorization decision. Caller OR remains inside the independently appended mandatory AND fence.
- Execution compares the completed SQL, serialized parameters, actor/workspace and datasource identities against the private WeakMap record. Changing SELECT/subquery text, joins/CTEs, ordinary parameter values or identity bindings refuses. Function/symbol/undefined/bigint/nonfinite parameter values are explicitly rejected rather than disappearing from JSON comparison. No request/expression-map trust marker can create provenance.
- Source-builder mutation after registration cannot replace the wrapper's already embedded SQL. Primitive identity parameters are copied into the wrapper; subsequent source parameter replacement cannot change them. Changes to serialized nested parameter values would invalidate the stored parameter snapshot at execution.
- Clones and copied wrapper strings receive no provenance and remain refused. This is explicitly documented and does not break the identified producer, which executes getRawMany directly. Repeated raw execution and getRawOne forwarding retain the exact checked wrapper. General wrapper clone/count/entity support is not claimed by this fix.
- Protected wrapper cache use is disabled during binding and on each execution. Existing ordinary permission validation still runs after the helper; this correction does not change mutation permissions or non-human policy.

## Evidence and limits

Read the original brief/review, appended implementation report, complete fix package, current helper, SELECT integration, and actual group-by producer/call path. The new tests invoke the actual producer method with real installed TypeORM SQL generation, including positive ordinary Person/Deal wrappers and negative forged/reused/altered wrapper cases. The supplied evidence records red producer regressions followed by **56 passing pure tests** (49 read tests and seven existing root model tests). Tests were not rerun. Read-only `git diff b5ae6ce340..b1dee166cd --check` was clean.

Native engine typechecking, current physical metadata compatibility, PostgreSQL result/plan execution, genuine user authorization/revocation, and real A/B ownership controls remain unproven. Previously documented arbitrary raw-expression subqueries, secondary traversal, non-human policy and other out-of-slice privacy limitations remain open; this re-review does not broaden or waive them. No Enterprise RLS implementation was used, no native engine/network/database/test execution occurred, and no subagents or source edits were made. Only this report was written.
