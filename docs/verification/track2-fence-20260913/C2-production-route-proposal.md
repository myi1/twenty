# C2 production command boundary — decision proposal for the desk

2026-09-13. Proposal only; no command module or step has been ported. `7719e54f` has no `propel-command` directory (git show negative control exits 128). The fence is independent of this decision and is prepared separately. Nothing here authorizes an engine build, live stage, app install, service deployment or new credential.

## Recommended boundary

Keep the persisted command intake/status API in the existing separate command service (`workspace/server`, propel_ops), with the engine exposing **worker-only internal commit and receipt lookup endpoints**. Do not expose the spike's direct manager-to-step path in production. Managers submit commands through the authenticated intake; only the worker can invoke the transactional engine step. This makes one receipt, retry and queue path responsible for every production assignment. The cost is that a production intake authentication adapter and C2 contract must be finished before any UI switches to it; a direct engine endpoint cannot substitute for that work.

Proposed engine endpoints: `POST /propel/internal/v1/assignment-step` and `GET /propel/internal/v1/steps/:operationId/:stepKey`. Names are proposals, not an approved public API. Both require an active dedicated worker API key whose verified jti is allowlisted. Refuse human, application, unrelated Admin-key, expired/revoked key and missing-key requests. The worker must supply onBehalfOfWorkspaceMemberId; the engine re-resolves that member in the **verified request workspace**, verifies an active core userWorkspace membership, and calls the existing PropelTierService. Missing/demoted/deleted/other-workspace actor refuses. No custom role, raw workspace ID, client acting-user field or missing-actor automation fallback.

The intake derives the manager actor from the verified user session and does not accept an actor override in browser payloads. It records actor/workspace/operation ID immutably in propel_ops. Status/receipt retrieval rechecks authority and workspace on every call; an operation UUID is not an access token. Do not publish a generic execute-SQL/execute-function endpoint. Only explicitly versioned ASSIGN_LEAD commands are accepted initially.

## Strict contract and atomic step

- Reject unknown fields and explicitly reject `failAfter`, `useOrmWritePath`, `workspaceId`, `memberId`, and spike enable flags. Crash controls belong in test dependency injection, never reachable routes. Test builds and production entry points must be separate.
- UUID validation for operation/person/next owner; fixed step key and bounded payload lengths. Verify next owner is an active eligible member of the same workspace. No empty-string/null owner coercion; unassign is a separate future command.
- Canonical expectedVersion is a decimal integer string, no leading zero/exponent/sign/whitespace; both it and numeric fence must be within Number.MAX_SAFE_INTEGER. Avoid Number() coercion accepting strings/booleans. Engine recomputes the canonical payload hash from normalized command fields; it must not accept a caller-supplied hash as independent truth.
- Check C verifies both app-owned objects active, actual tables, required columns and plain unique keys before any domain write. Missing/inactive/broken schema returns 503 `{code:'DEPENDENCY_UNAVAILABLE', message}`. Metadata deactivation/deletion is not fenced; C+A is the recorded response.
- Execute domain update, assignment version and step receipt on **one transactionManager.queryRunner**, with per-person row lock and compare-and-set. Recheck replay after acquiring the lock. Existing same-key/same-payload returns the recorded result; same key/different payload is 409 IDEMPOTENCY_CONFLICT. Stale version/fence is 409; overflow is 422. Always rollback/release on error; no workspace ORM writes that escape this transaction.
- Insert app row UUID and createdAt/updatedAt explicitly. Read versions/fences using `::bigint::text`; NUMBER storage is double. Do not use a relation that changes Person schema or deletes receipts when a person is removed.
- Worker interprets COMMIT 503+DEPENDENCY_UNAVAILABLE as definite non-commit only when that engine contract is proven. The same 503 on LOOKUP remains uncertain. Network error, unknown 5xx, malformed body, timeout and ambiguous post-commit failure stay uncertain; reconcile by receipt rather than blind retry.

## Scope split and release dependency

This fence branch contains only write-denial hooks, module registration and tests; no command route. It can be assembled by the desk as 7719e54f + task25 + fence, with no spike ancestry. The app objects (`codex/track2-command-record-objects-20260913` @ 4410e838) must be installed before enabling any engine command writer. App role overrides do not protect built-in Admin/Member/API keys before the engine fence is deployed.

A later clean C2 branch must implement the production boundary above. Do not cherry-pick the whole spike or merely remove the environment gate: it carries intentional crash inputs and a test-only direct route. Retain test scenarios by adapting them to the production module with internal injected faults. No source image may descend from spike/c0-engine-transaction.

C3 first product acceptance is larger than this atomic person update: B receives all unfinished work, A loses access, history/credit survive, and stale/repeated events cannot reverse it. Child/task handover, bounded concurrency per lead and event discipline are not proven by the present fence or receipt table tests. Do not switch the manager UI until that acceptance has its own complete proof on safe fixtures and the desk's approved live stages.

## Upgrade boundary (task 62)

Q2 remains the current-line clean base 7719e54f; no decision moved all fence work to v2. The desk decides D-3 release ordering. Portability boundary:

1. Keep the HTTP command contract, error meanings, worker credential/actor checks and integer bounds stable across upgrade.
2. Current line uses transactionManager.queryRunner. At the proposed 2.39.5 target the old WorkspaceEntityManager no longer exists: port the atomic implementation to WorkspaceOrmManager.runInWorkspaceTransaction(scope), scope.executeRawQuery and scope.getRepository. Repeat rollback, replay, stale fence, dependency and error-body attacks on the selected tag. Do not call this an automatic source port.
3. Re-prove wildcard data-write coverage, registration and effective permissions under ORM v2 and MCP/tool services. A source method-list match is not runtime proof. Include added upstream methods and the read controls.
4. Keep app schema installation before writer activation in every environment, regardless of D-3 ordering. No old engine rollback below the recorded permission-loading floor. The desk owns the final assembled engine tests, including actual dialer-dock test counts.

## C+A daily alarm proposal (not installed)

Add a small read-only health job to the independent operations service, not to the command transaction itself. Once daily it checks active metadata, tables, expected columns/unique keys for every configured workspace and records a timestamped healthy/unhealthy result. This must run even when no assignments occur. A separate desk monitor alerts if no fresh result exists after the daily window, so a dead worker cannot report itself healthy.

Proposed destination: the deployment desk's operational alert inbox, with Yahya's nominated email as escalation, via the existing Postmark transactional infrastructure (no SMTP dependency). **Exact recipient and sender/stream are a desk/founder decision still open.** Do not reuse a marketing send queue or infer an email address. Send one alert per incident and one recovery notification; reminders follow a desk-approved cadence. Include only workspace ID, failed check and evidence reference, never tokens or customer data. A metadata/API/DB timeout is UNKNOWN/alert, never a healthy empty result. Use a read-only credential separate from the worker write key.

Local acceptance: missing/deactivated object, missing table/index, permission error, stale heartbeat and provider-send failure each fail with a durable alarm record; a healthy-control fixture clears correctly. No scheduler or email is installed/sent in this lane.

## Decision requested from the desk before step port

Approve or revise the worker-only internal commit/lookup boundary and require the C2 intake adapter before production use. Confirm D-3 current-line versus upgraded-line writer timing with task62. Choose alarm recipient/destination later; that choice does not block independent fence verification. Until the route decision, the step switch/Check C/bound remain saved WIP, never release code.
