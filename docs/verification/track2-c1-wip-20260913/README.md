# C1 saved-WIP controls — NEVER IMAGE BUILD

verified: neither. This dedicated branch starts from saved8f6806f4ce371c3dec407bade490d876d292fa32 and therefore contains historical spike ancestry and crash switches. It is evidence only, NEVER an image/deploy/release candidate. Production fence is the independent7fa6d2b1 branch on7719e54f. No production step port, route switch or engine service change is included here.

The native integration harness installs the real UnhandledExceptionFilter from main.ts via its app initialization hook, keeping isolated test services/queues and synthetic credentials. S1–S3 now assert top-level DEPENDENCY_UNAVAILABLE on both commit and lookup responses, which the previous mocked filter does not preserve.

| Run | Result |
|---|---|
| Restored atomic step + C1 fence, production filter |45/45 pass,2suites |
| Remove Check C from commit AND lookup only |S1missingtable,S2inactiveobject,S3missinguniqueindex fail;32pass |
| Remove next-version exact-integer bound only |S4 fails;34pass |
| Remove real production filter registration only |S1/S2/S3 fail because top-level error code is missing;32pass |

Every sabotage was restored in finally; final45/45 run follows all controls. atomic-command.service.ts has zero diff from saved8f6806f4. Tests verify committed city/version/receipt state through a separate DB connection, replay/concurrency/rollback/identity and fence batteries. person.city is the historical domain surrogate, NOT assignedAgent ownership/handover/history/credits/SLA event proof. C2/C3 production assignment behavior remains separate work.

Native direct compiler exits2 with six TS2742 diagnostics in the same unrelated integration utilities recorded by clean-fence baseline. Lint is not rerun here: local lint plugin remains unbuilt; no dependency installation/shared rebuild. No clean native build/typecheck/lint claim. Runtime logs retain local ClickHouse refusal and synthetic timeline metadata/FK warnings; these do not invalidate the stated assertions but are not hidden.

Isolation claim WITHDRAWN after the desk's independent audit (2026-09-13). The retained45/45 native assertion result and sabotage controls remain evidence of those assertions; dedicated DB/Redis isolation was not established. The launcher's server cwd/NODE_ENV=test permits raw/core datasource dotenv reloads with override:true to select the tracked localhost:5432/test and Redis6379 instead of the intended clone and Redis16379. Evidence strongly favors shared synthetic test services; no staging or production target was observed. Historical effective pool identity and external egress cannot be certified.

isolation.json inventories and shutdown.json connection/listener observations do not establish which endpoints the running pools used. Preserve all raw results without calling them dedicated-isolation proof. Do not rerun the old launcher. A guarded rerun must attest every actual pool/server/database/synthetic marker before mutations, Redis endpoint/namespace and API listener in setup and worker processes, and block external egress. This historical spike branch remains evidence only and must never supply a production engine image.

Compatibility finding: strict worker receipts on612253e6 require operation/step/person/payload/owner/version; saved spike commit omits operation/hash and lookup omits person/owner. Worker correctly leaves these shapes UNKNOWN. Final response/receipt schema contract must be reviewed before integration; no writer/schema modification is made here.
