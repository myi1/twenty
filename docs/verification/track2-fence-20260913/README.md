# Track 2 fence — local evidence, 2026-09-13

verified: neither. Feature branch only; no image, publish, install or deploy.

Base: 7719e54f1c2d892849b984873c310508cdac7bfe. The four-file fence diff is ported from d15b9090 without the spike module or its ancestry. No production assignment-step route is added. C2 boundary is approved for contract/intake design and local tests only; D-3 timing/target and production step port remain unapproved. See C2-production-route-proposal.md.

- Unit: 96/96 pass (`unit.txt`).
- Restored runtime: 10/10 pass (`integration.txt`). Same synthetic fixture batteries over real GraphQL/REST, three caller types and both command objects. Removing module provider registration yields six failed batteries and four passing controls (`sabotage-registration.txt`); restored runtime rerun passes. Three merge/restore parser nonpaths are explicitly distinguished in the tests.
- Native Nx typecheck stalled before tasks executed; lane process terminated. Direct `node_modules/.bin/tsgo -p packages/twenty-server/tsconfig.json` exits 2 on both clean 7719e54f and changed source, with byte-identical SIX TS2742 diagnostics in unrelated integration utilities. Baseline temporarily moved the added files out of scope and restored the exact base module in this same dedicated worktree, compiler and module resolution; all files then restored. Logs: typecheck-baseline.txt and typecheck-direct.txt. Temporary harness typing error was fixed before final compile/runtime checks. No clean typecheck claim.
- Native scoped oxlint cannot load the unbuilt local twenty-oxlint-rules plugin (`lint.txt`). No dependency installation or shared rebuild attempted. Lint incomplete; this is not deployment-ready.

Isolation: source local test DB and its dedicated clone were checked read-only for exact synthetic workspaces/users (isolation.json). Runtime used only track2_fence_20260913, dedicated Redis 16379 and server 14061, sanitized process environment, 4GiB heap and in-band execution. No staging/prod/real vendor calls. Isolated integration logs retain ClickHouse localhost connection failures and synthetic timeline metadata warnings; these are not silently removed and the test assertions still pass. The dedicated Redis is stopped after checks. Test database retained inactive for evidence/reuse. The local harness config is committed without secrets; credentials are read privately from the tracked synthetic test configuration by the uncommitted runner.

Remaining: CI/native gate environment must resolve compiler portability and build the local lint plugin, rerun gates; no deployment authority is implied. Application object schema must precede any future command writer. Existing app role denies are insufficient without this fence for built-in privileged callers.
