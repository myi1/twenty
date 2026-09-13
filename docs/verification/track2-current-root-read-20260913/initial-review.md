# Child SELECT fence independent review

Candidate: `b5ae6ce340f27a8eaa75919c5e0039e3f6a38814`, base `338b0ac971`.
Worktree: `/Users/yahyaismail/dev/_wt/codex-track2-read-fence-20260913`.

**Spec compliance: changes requested.** The supported child-read predicates match the bounded privacy policy, but an unconditional refusal also breaks an existing unrelated SELECT path.

**Security/code quality: changes requested.** One concrete P1 availability regression below. No additional ownership-grant bypass was established in the supported direct/joined source paths. This is not a native security acceptance or live leak-closure verdict.

## Finding

**[P1] Preserve the existing unprotected group-by-with-records path** (confidence: 10/10 from source tracing).

Location: `packages/twenty-server/src/modules/propel-rls/current-root-read-fence.ts:82-88`:

```ts
if (
  !expression.mainAlias?.hasMetadata ||
  expression.mainAlias.subQuery ||
  expression.commonTableExpressions.length ||
  expression.aliases.some((alias) => alias.subQuery || !alias.hasMetadata)
)
  return refuse();
```

This executes for every human SELECT before determining whether a protected child participates. The existing `GroupByWithRecordsService` builds its records query with `.from(\`(${subQuery.getQuery()})\`, 'ranked_records')` at `engine/api/graphql/graphql-query-runner/group-by/services/group-by-with-records.service.ts:212-218`, keeps only the subquery aliases at lines 242–244, and executes that WorkspaceSelectQueryBuilder through `getRawMany()` at line 110. Consequently, any nonempty human group-by-with-records request for ordinary Person/Deal/etc. reaches this new refusal, even with no WhatsApp message or taskTarget involved. The same call path exists in the candidate's parent, so this is an introduced source regression, not merely an unproven native shape.

The report acknowledges possible failures for unrelated opaque queries; the existing call site makes that risk concrete. Preserve a trusted, verifiably unprotected version of the existing group-by path, or carry checked/fenced inner-query provenance into its wrapper. Do not simply exempt all opaque SQL, which could hide a protected child. If this requires changing the group-by producer outside the allowed files, report that narrow dependency before editing. Add a positive regression based on the real unprotected group-by wrapper alongside the negative protected/unknown-subquery case. Blanket rejection of normal objects is wider than the requested two-object regression slice.

## Source checks that passed

- The new helper runs before the existing permission-bypass handling. Identity inputs are shape checked and workspace-bound; SQL rechecks current user, userWorkspace, and workspaceMember identity/deletion. Core entity sources contain the referenced columns. Manager/Admin ownership exceptions use bound stable role UIDs and current roleTarget/role workspace bindings rather than request labels or cached role maps.
- Message predicates follow conversationId → active conversation.contactId → active Person.assignedAgentId. Conversation owner is not an alternative grant. taskTarget checks every target-like ORM column, denies unknown non-null columns, requires at least one recognized root, and checks each supplied root independently without a task-assignee fallback. Parent/root deletion checks and EXISTS avoid row multiplication.
- Schema/table/column/alias quoting and bound values are explicit. Mandatory root predicates are separate AND conditions; joined aliases are constrained in ON so LEFT JOIN parents survive. Cache disabling, repeated validation, clones, public execution forwarding, and refused existence methods are addressed in the source and lightweight SQL-generation tests.
- Only the three authorized files changed. No mutation builder, schema, cohort activation, or service-policy expansion was included. The parent is the stipulated clean chain, not a spike port.

## Proof boundary and remaining gaps

The supplied 44 passing tests exercise transpiled source and installed TypeORM SQL generation, with unrelated permission helpers/formatters and database execution replaced. They do not execute PostgreSQL or typecheck the native engine. Their claims are appropriately limited. Native own-A/cross-B result controls, current metadata compatibility, SQL validity/plans, role/membership revocation, transfer/pool behavior, and actual GraphQL/REST permission interactions remain required before activation.

Secondary query-strategy traversal from an unprotected parent, arbitrary subqueries embedded in raw SELECT/WHERE/HAVING expressions, raw runner callers, non-human policy, and other child/task-body privacy are expressly unresolved. Those limitations must remain visible; the supported slice must not be described as universal SELECT/privacy coverage. Reused clones retaining older restrictive predicates and existing database snapshots/streams are limitations rather than demonstrated new grants.

Reviewed the brief, report, full three-file change, actual SELECT builder, local TypeORM query/clone/loader implementation, current metadata/auth/core entity sources, and the existing group-by call site. No Enterprise RLS implementation was read or used to derive the patch. No tests were rerun, engine booted, database or network accessed, subagents spawned, or source edited. A read-only diff check is clean. Only this review artifact was written.
