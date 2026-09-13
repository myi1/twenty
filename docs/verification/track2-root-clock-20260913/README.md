# Reject inconsistent pooled assignment clocks

Candidate0459562645 integrated asa08a7ecf31. A stored pooled root must have assignedAt, slaBreachedAt and slaWarnedAt all null. The model now refuses breached-only, warned-only or both non-null SLA clocks with DEPENDENCY_UNAVAILABLE. It does not silently rewrite historical state or report a no-op. A valid all-null pool-to-pool no-op retains assignment version, advances a valid higher fence, emits no event and returns an empty patch.

Independent initial review identified P2; scoped re-review: original finding ADDRESSED, spec PASS, code quality PASS, no new breakage. Implementer red3/11 failed as expected, green11/11 pure Node tests and isolated strict single-file TypeScript check exit0. Fresh combined source tests recorded here after integration. No database/actor/transaction/Check C/projection/endpoint proof or full-engine typecheck is claimed. verified: neither
