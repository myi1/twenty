# Current-engine human child SELECT fence — local source handoff

Status: locally implemented and committed; **not native-engine verified, not ready for activation, no live leak-closure claim**. `verified: neither`.

Commit: `b5ae6ce340f27a8eaa75919c5e0039e3f6a38814` on `codex/track2-read-fence-20260913`, parent `338b0ac971fe42200ffc57e6705ecc4919826d64`. Worktree `/Users/yahyaismail/dev/_wt/codex-track2-read-fence-20260913`. No push. Only three files committed. The approved untracked `node_modules` symlink was absent, so it was created pointing to `/Users/yahyaismail/dev/_wt/codex-track2-fence-20260913/node_modules`; it was not committed and its target was not modified.

## Implementation and dependency mapping

Upstream: the existing authenticated `WorkspaceAuthContext`, current workspace ORM EntityMetadata, and core datasource EntityMetadata. Downstream: the existing TypeORM SELECT executor, count/distinct-pagination clones and join SQL renderer. Source-only change; no schema, cohort, flags, task records, assignments, provider calls, or mutation builder changes.

- New `packages/twenty-server/src/modules/propel-rls/current-root-read-fence.ts` (282 lines). Called first from existing `WorkspaceSelectQueryBuilder.validatePermissions()` at line357, before internal permission bypass could short-circuit existing permissions.
- Existing SELECT builder has only16 added lines: one import/call plus validation forwarders for inherited `getRawAndEntities` and `stream` (lines229/237). Existing `execute`, `getMany`, `getRawOne`, `getRawMany`, `getOne`, `getOneOrFail`, `getCount`, `getManyAndCount` already validate. Existing refused `getExists` and `executeExistsQuery` remain refused.
- `type:'user'` only. Member/user/userWorkspace/workspace UUIDs must be well formed and agree with the auth member object and current internal workspace. SQL rechecks `core.userWorkspace` id+workspace+user and `core.user` plus workspaceMember id+user; all three must have `deletedAt IS NULL` (helper181). No cached membership grant.
- Manager/Admin exception is an actual SQL `core.roleTarget`→`core.role` check for the same userWorkspace/workspace, null agentId/apiKeyId, and a bound role UID (helper189). Admin comes from `STANDARD_ROLE.admin.universalIdentifier` (`20202020-02c2-43f2-b94d-cab1f2b532eb`); Manager is the app UID `20000000-0000-4000-8000-000000000001`. Request labels/tiers/roles and cached maps never grant this exception. Role/roleTarget source has no `deletedAt`; physical existence and current relation are checked.
- WhatsApp message: active child→active `_whatsAppConversation` by conversationId→active person by contactId. Current `person.assignedAgentId` is compared to memberId in actual SELECT; conversation.ownerId is never consulted (helper197–220). No assignmentVersion reads/defaults and no writes from reads.
- taskTarget: enumerate **every current ORM column** whose property or database name matches target*Id, not a fixed86 inventory. Person is direct; the12 explicit contact-object mappings match the approved registry. Every present recognized target requires an active parent/root allowed for the actor; unknown nonnull targets deny; at least one recognized nonnull target is required (helper222–241). Missing parent/column metadata refuses the SELECT, not an unscoped fallback. `EXISTS` avoids multiplying rows for duplicate links. No task-assignee fallback. A currently verified manager bypasses ownership inside a valid root; unknown/orphan/deleted roots still refuse.
- Schema/table/columns are derived from current TypeORM metadata, schema is checked against `getWorkspaceSchemaName(internalContext.workspaceId)`, names are validated/quoted, values are parameter bound. New parameter and nested-alias namespaces avoid existing query parameters/aliases. Alias metadata identity is checked against the current workspace datasource.
- Main-root predicate goes into `extraAppendedAndWhereCondition`, preserving caller WHERE/OR and any existing appended condition as separate AND terms. Protected joined aliases receive the predicate in ON; LEFT JOIN roots are retained. Revalidation replaces the helper's own previous expression instead of unbounded SQL duplication; clones retain their earlier predicate and bound parameters (helper247–278).
- Protected query result caching is disabled on every validation and retained in clones: otherwise a cached response could ignore current SQL membership/ownership altogether (helper280).
- Opaque FROM/JOIN subqueries or CTEs are refused for human SELECTs because their hidden tables cannot be scoped safely. Protected many-to-many joins, extra aliases not corresponding to supported joins, and protected-query secondary loaders/query relation strategy refuse. Relation-ID/count loaders on an otherwise unprotected parent are also refused when their inverse metadata targets a protected child (helper94–108).

## Source anchors used, without Enterprise RLS implementation

- `engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.ts:83`: current workspace AsyncLocalStorage entity metadata lookup; no global table guess.
- `engine/twenty-orm/factories/entity-schema.factory.ts:39`: schema/name/table generation; column factory maps actual join columns and deletedAt.
- `engine/workspace-datasource/utils/get-workspace-schema-name.util.ts`: workspace UUID→base36 schema.
- `engine/core-modules/user-workspace/user-workspace.entity.ts:38`, `user/user.entity.ts:32`, `modules/workspace-member/standard-objects/workspace-member.workspace-entity.ts:71`: membership/user/deletion columns.
- `engine/metadata-modules/role-target/role-target.entity.ts`, `role/role.entity.ts`, `engine/workspace-manager/types/syncable-entity.interface.ts`: current role relation and universalIdentifier.
- `engine/workspace-manager/twenty-standard-application/constants/standard-role.constant.ts:2`: Admin UID.
- Installed TypeORM `query-builder/QueryExpressionMap.js` clone copies wheres, join attributes, parameters, cache and extraAppendedAndWhereCondition; `QueryBuilder.js:538` appends mandatory AND separately; `SelectQueryBuilder.js:1710` count executes a clone; pagination also clones the fenced source.
- Approved app design `docs/superpowers/specs/2026-09-13-current-engine-assignment-design.md`; actual app registry `workspace/server/src/assignment/projection-registry.ts`; Track4 contract read with `git show 20d385d1:docs/verification/R3/u0/staging-filter-probe/C3-regression-contract.md`.
- Independent desk artifact read: `/Users/yahyaismail/remaxhub-backups/staging-pre-isolation-20260913T004110Z/desk-child-read-boundary-proof.json`. It reports both agents receiving the same5 message IDs and same2 taskTarget IDs while person roots differ. No new calls were made. These retained staging observations are the failing acceptance baseline, not proof this local patch changes those results.

## Verification actually run

New test file: `scripts/propel-command-tests/current-root-read.test.mjs` (37 tests). It transpiles the actual changed SELECT builder/helper and executes the actual installed TypeORM PostgreSQL builder/metadata. It replaces only old unrelated permission hooks, formatting, exception translation/mutation imports, and network execution. It does not load/read the Enterprise RLS implementation. Request outcomes are **not** simulated and claimed as SQL result proof: assertions concern emitted PostgreSQL SQL/parameters or pre-execution refusal only.

TDD first run, before implementation:

```text
node --max-old-space-size=768 --test scripts/propel-command-tests/current-root-read.test.mjs
2 tests / 0 pass / 2 fail
Expected /assignedAgentId/; actual WhatsApp SELECT only had caller WHERE and child.deletedAt.
Expected /assignedAgentId/; actual taskTarget SELECT only had caller WHERE and child.deletedAt.
```

The first two tests then passed after implementation. Wider runtime tests found the mainAlias-vs-cloned-alias subquery guard issue; fixed to check both. A separate regression was added first for secondary relation-ID/count reads through an unprotected parent:36 passed/1 failed (“Missing expected exception”), then37 passed after the guard was added.

Final verification command (worktree root):

```sh
/usr/bin/time -l node --max-old-space-size=768 --test scripts/propel-command-tests/assignment-root-transition.test.mjs scripts/propel-command-tests/current-root-read.test.mjs
```

Actual output:

```text
44 tests / 44 pass / 0 fail / 0 skipped / 0 todo
37 child-read tests + 7 existing assignment-transition tests
node test duration_ms 507.930958
0.53 real / 0.52 user / 0.09 sys seconds
206995456 bytes maximum resident set size (~197.4MiB)
0 swaps
exit 0
```

The existing assignment-transition TypeScript import emitted Node's `MODULE_TYPELESS_PACKAGE_JSON` warning; not suppressed or changed. The new child-read suite emitted no warning. Prettier wrote only the three changed files, and `git diff --check`/staged check exited0.

Covered SQL/refusal contracts:
-10 execution methods×2 child objects, with shouldBypassPermissionChecks=true; all emitted current member/owner predicates and bound parameters.
-Current core role UIDs, active membership/deletion checks; malformed/missing/wrong-workspace user context; missing owner/contact metadata/wrong schemas; all12 recognized contact mappings plus direct person; unknown newly added targets; caller OR and caller extra AND; withDeleted; injection aliases and parameter collisions.
-Protected LEFT JOIN ON placement and clones; contact-only conversation filter; actual TypeORM DISTINCT pagination/count clone SQL; cached read disabling; refused secondary relation-ID/count loaders and unsupported shapes; explicit preserved non-human/unprotected behavior; existing refused existence methods.

Used TDD and verification-before-completion skills and the review skill's SQL/field-safety checklist for local self-review. No subagents/reviewer process or full engine lint/typecheck was run. The brief explicitly withholds heavy engine checks and records known TS2742/lint-plugin baselines; **transpile/runtime tests are not a native typecheck**. Context7 tools were unavailable in this task; installed current TypeORM declarations/source and current engine source were read instead. No dependency installation or shared node_modules write.

## Exact unproven gaps and risks

1. **No PostgreSQL execution, server boot, authenticated HTTP request, or engine integration run.** Actual own-A/cross-B rows, native GraphQL/REST aliases and permission interactions, SQL execution validity/plans/performance, and real current ORM metadata are unproven. The44 passing lightweight tests do not close C3 or any eight-journey acceptance.
2. Current ownership transfer, membership/role revocation, pool states, continued pagination/stale cursors, orphan/deleted parent outcomes, same-root duplicates and all-roots-authorized sharing require matched real positive/negative fixtures. The SQL is designed to consult current state at each statement; a transaction holding an older PostgreSQL snapshot or already-open stream is not retroactively revoked by this patch.
3. Scope is whatsAppMessage and taskTarget. `socialMessage`, direct task-body reads, task/note/call/other child objects and arbitrary raw SQL/queryRunner callers are not fenced here. A task root with LEFT JOIN taskTargets intentionally remains present with denied targets filtered out; that does not prove task-body privacy.
4. Opaque FROM/JOIN/CTE shapes are deliberately refused for all human SELECTs, even when their hidden query is unrelated. This bounded safety refusal can reject previously working application queries. Native API smoke tests must identify affected shapes before integration. Arbitrary developer-provided SQL subqueries embedded inside SELECT/WHERE/HAVING expressions are not parsed/audited by this helper. Secondary `relationLoadStrategy:'query'` traversal beginning on an unprotected parent and then loading protected descendants is not proven end to end. Direct protected-query use of that strategy is refused.
5. Unknown task targets deny on nonnull; missing metadata for any recognized active target dependency refuses the whole protected SELECT. That favors confidentiality over availability. Admin/Manager still require a valid active root; orphan triage may need a separately approved service policy.
6. Non-user/system/API-key/application/pending-activation behavior remains existing unresolved policy, not newly authorized or proved safe. The helper is not an authorization boundary against arbitrary trusted server code changing the authContext or executing raw runner SQL.
7. No assignment epoch/version schema, enrollment or legacy-writer fence work is included. The read predicate applies to all human reads of these child objects once integrated, regardless of cohort, as required by the observed regression slice. All other C0/C3/cohort/writer/trigger work remains controller-owned.
8. A copied12-entry root mapping needs native registry/metadata agreement verification during integration. Runtime columns are enumerated rather than assuming the historical86 list. No claim is made that13 known fields or86 historical fields equal today's live target inventory.
9. Reusing already-fenced clones under a different actor can retain the original actor's restrictive predicate in addition to the new one. This can over-deny; it cannot enlarge access. Normal engine clones preserve the same auth context. Repeated validations bind fresh parameter namespaces, so long-lived reuse accumulates unused old parameters; normal per-request builders/count clones were tested.

## Native proof readiness and requested slot

**No runnable C3 native proof command exists yet. Do not run the existing C1 command as a substitute.** The actual existing config is `packages/twenty-server/jest.track2.config.ts`; it enforces local-only `/track2_fence_20260913`, Redis `127.0.0.1:16379`, server `127.0.0.1:14061`. The existing `/Users/yahyaismail/dev/_wt/codex-track2-fence-20260913/.track2-local/run-harness.py` runs only `test/integration/propel/suites/c1-fence.integration-spec.ts`, with one Jest worker and a4GiB Node heap. Its C1 manifest installs receipt/version/sibling objects, not the WhatsApp/assignment fixtures needed here. No new native integration spec was added because claiming a concrete existing fixture path would be false.

Next source prerequisite: add a real native C3 spec using that harness only after identifying/authorizing a synthetic Person assignedAgentId field, WhatsApp conversation/message schema with real contact relations, taskTarget metadata links, and two genuine authenticated Member users plus Admin/Manager controls. Include lookup/list/count/nested contact-only joins, same-root/shared/orphan/unknown-target cases, current owner transfer with stale conversation.ownerId, member/userWorkspace/user deletion and role UID revocation. Each negative needs the same query/source IDs as a successful owner control. Fixture writes need the desk-approved isolated engine environment, never ordinary staging.

Proposed resource budget for that future native run, **not measured and not allocated**: existing dedicated local DB, Redis16379, HTTP14061, one Jest worker, Node heap4GiB; allow roughly2–5min test time plus existing engine setup. DB/Redis resident budget must be supplied by the desk for its chosen clone; no new container/memory claim is inferred from Track3's released384MiB slot. Existing config's imported integration globalSetup starts the engine; it is a heavy run. Parent/desk must prepare the concrete fixture/spec and exact command before slot execution. No heavy command, DB reset, docker, image build, staging/prod read/write, install/publish, or push occurred in this subtask.

## Round1 P1 correction — preserve actual group-by-with-records producer

**Fix commit:** `b1dee166cd0d98d2524cbb18c2950e6c1891179c`, directly on candidate `b5ae6ce340f27a8eaa75919c5e0039e3f6a38814`. Locally committed, no push. Independent review finding in `read-fence-task-review.md` is accepted: the old blanket opacity refusal introduced a real regression for existing Person/Deal group-by-with-records; it was not an acceptable availability tradeoff. This section supersedes the earlier report's treatment of that concrete production path as merely a possible refusal risk.

Authorized change footprint for this round:
- `engine/api/graphql/graphql-query-runner/group-by/services/group-by-with-records.service.ts`:4 added lines, import and producer call at247 after the actual `.from(..., 'ranked_records')` wrapper is complete and metadata aliases have been removed.
- `modules/propel-rls/current-root-read-fence.ts`:122 added lines for private provenance and verification; no generic SQL allowlist or request/config flag.
- `scripts/propel-command-tests/current-root-read.test.mjs`:247 added lines exercising the **real producer method**, installed TypeORM metadata/wrapper/query generation and actual fence, plus adversarial checks.

Mechanism:
1. The real group-by producer calls `bindCurrentRootReadGroupByWrapper(completedWrapper, actualInnerBuilder)`. The helper requires matching valid human identity/workspace, the same workspace/core datasource identities, and exactly the producer's single `ranked_records` subquery alias with no extra joins/CTEs/loaders. It checks every inner alias against current metadata in the expected workspace schema; unknown/opaque inners refuse.
2. The helper runs the existing current-root fence on the inner builder **before** regenerating and embedding its SQL. Protected message/taskTarget source SELECTs therefore contain the same live membership/role/Person owner EXISTS predicates. Ordinary Person/Deal sources retain their existing SQL behavior. Wrapper parameters are recopied from the checked inner.
3. A module-private WeakMap records the exact completed outer SQL, serializable parameters, actor/workspace identity and datasource identities. No marker in the request, feature flags or query expression can mint this record. Function/symbol/undefined/bigint/nonfinite parameter values are refused rather than silently omitted from the parameter comparison.
4. At outer execution, the fence accepts only that unchanged attested wrapper. SQL, parameters, actor, workspace or source changes invalidate it before driver execution. Current owner/membership/role is evaluated by PostgreSQL inside the actual protected source SELECT; provenance does not store an allow/deny role result. Accepted wrappers have result caching disabled on every execution.
5. Clone provenance is intentionally **not** copied: direct execution of an attested wrapper's unattested clone refuses. The actual existing producer executes `getRawMany` directly and does not clone this records wrapper. Repeated execution and the `getRawOne`→`getRawMany` validation chain are supported/tested. Existing metadata-based SELECT count/distinct-pagination clone coverage remains passing. Other wrapper clone/count/entity execution shapes are not newly advertised as supported.

TDD evidence from actual producer:

```text
node --max-old-space-size=768 --test scripts/propel-command-tests/current-root-read.test.mjs
39 tests /37 pass /2 fail before production correction
real person group-by ranked_records wrapper remains executable for humans → RLS_VALIDATION_FAILED
real deal group-by ranked_records wrapper remains executable for humans → RLS_VALIDATION_FAILED
```

The first attempt exposed a test-loader default-import interop error, which was corrected before accepting the red evidence above. The test loader now uses the engine's legacy decorators/default-import interop semantics. No test expectation was weakened to accept the failure. Unused group-by dependency-injection/parser/formatting branches are stubbed; `GroupByWithRecordsService.addPartitionByToQueryBuilder`, group conditions, ROW_NUMBER partitioning, real source/wrapper SQL, and both changed modules execute. This is a real producer source/runtime-builder regression, not a source-string assertion or fabricated HTTP response.

Additional adversarial coverage now passing:
- Protected WhatsApp/taskTarget actual wrappers embed active member/core role/current assignedAgentId SQL with bound identities; a later `.cache(...)` cannot bypass those checks.
- Opaque/unknown inner FROM, wrong-workspace metadata and malformed protected actor refuse.
- Modified outer SELECT, inner SQL string, member parameter, direct function-valued parameter tampering, extra CTE/join refuse before the captured driver receives a query.
- Different member, user, userWorkspace or workspace invalidates old provenance.
- Direct clone and copied ranked_records SQL with a forged expression-map trust flag receive no provenance and refuse.
- An attested wrapper cannot itself be recycled as a trusted inner metadata query; later mutation of the original source builder cannot alter the already-bound SQL/identity values in the outer wrapper.
- Caller OR inside the actual protected group-by producer remains outside the separately appended mandatory membership/owner fence.
- Repeated raw execution/getRawOne chains retain identical source SQL/parameters.

Final round verification (same exact command as original report):

```sh
/usr/bin/time -l node --max-old-space-size=768 --test scripts/propel-command-tests/assignment-root-transition.test.mjs scripts/propel-command-tests/current-root-read.test.mjs
```

```text
56 tests /56 pass /0 fail /0 skipped /0 todo
49 current-root read tests +7 existing assignment-transition tests
duration_ms594.888875
0.61 real /0.54 user /0.10 sys seconds
225329152 bytes maximum resident set size (~214.9MiB)
0 swaps; exit0
```

Same unsuppressed pre-existing assignment-transition `MODULE_TYPELESS_PACKAGE_JSON` warning. Prettier and `git diff --check`/staged checks pass. Full local diff self-reviewed including the new producer call, identity/parameter binding, clone behavior and unchanged existing SELECT integration. Independent re-review is still controller-owned; no new reviewer agent was spawned.

No native engine/DB/HTTP test, native typecheck, fixtures, schema activation, shared dependency modification, deployment or push. The prior native proof gaps and out-of-slice objects remain. Unattested opaque subqueries remain closed; this narrowly repairs the identified existing producer, not every possible future opaque query. Arbitrary developer-written subqueries embedded in raw SELECT/WHERE/HAVING expressions and other previously documented trust-boundary gaps remain explicitly outside the claim. Native group-by authorization/metadata compatibility and PostgreSQL result/plan proof remain pending the separate native task.
