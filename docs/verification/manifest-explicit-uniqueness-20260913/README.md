# Explicit-index uniqueness comparison repair — source-only packet

Base: `7719e54f1c2d892849b984873c310508cdac7bfe`.
Branch: `codex/manifest-explicit-uniqueness-20260913`.
Status: prepared for independent review; no activation or engine deployment.

## Failure and proven cause

The desk reported that staging app 0.7.69 (`1601a7ae`) published but installation failed on existing `propelAssignmentVersion.personId` (`99000000-0000-4000-8000-000000000002`) with `Default value cannot be null for non-nullable fields`. The desk's read-only inspection reported the previous required/no-default column and plain unique index still present, zero new identity metadata/physical schema, and app version already advanced. This packet does not independently inspect that database.

At the pinned engine base:

1. `workspace-flat-field-metadata-map-cache.service.ts:156–185` derives live field uniqueness using `computeUniqueFieldMetadataIdsFromIndexes`: a unique index with exactly one field and null subFieldName makes its field unique.
2. `from-field-manifest-to-universal-flat-field-metadata.util.ts:100` defaults the omitted manifest field flag to false. Omitted UUID defaultValue becomes null at lines 74–81; it was not an SDK-added default.
3. `compute-application-manifest-all-universal-flat-entity-maps.service.ts:202–244` constructs explicit indexes without propagating their uniqueness to the field map. The actual comparator therefore generates `{isUnique:false}` against the live cache, even though the app field source is unchanged.
4. `flat-field-metadata-validator.service.ts:193–202` unconditionally rejects the merged required/no-default field on an update. Creation lacks this blanket check.

Installed SDK 2.9.0's `login-oauth-Bx8Y2JGa.mjs:10597–10603` copies custom fields; object assembly at 10712–10731 applies the option-ID helper, which returns UUID fields unchanged (10342). The cause is an engine target/cache representation mismatch.

The application version updates before metadata migration in `application-sync.service.ts`. Version visibility is not proof of successful schema installation. The desk classified the failed installation as partially applied files/version, not a clean rollback.

## Repair

The sole production change normalizes target field uniqueness **after** all index construction, using the same existing helper as the live cache. Universal field identifiers are adapted to the helper's fieldMetadataId slots. No new interpretation of composite or subfield uniqueness is introduced.

This ordering preserves explicit index identifiers and avoids automatic index creation for inferred flags. It changes no column, default, nullability, index membership, index identifier, validation rule, engine transaction route, or SDK file. Explicit field-level true continues to generate its existing automatic index when applicable.

Adding `isUnique:true` to the app field alone is not this repair: the base builder synthesizes another index with a random identifier before adding the explicit index. Identical declared and automatic indexes have the same deterministic name and encounter the same-name index validator. Removing the explicit index would introduce pruning/recreation. Relaxing the default validator alone leaves the false uniqueness update and its index-removal path intact.

The pre-existing contradictory declaration of field-level true **and** an identical explicit unique index remains outside this normalization-only patch. No index deduplication or default-validator redesign is included.

## Failure-first pure regression

Run from this worktree, pointing the second argument at an existing engine dependency installation:

```sh
node docs/verification/manifest-explicit-uniqueness-20260913/target-builder.test.cjs /Users/yahyaismail/dev/twenty/package.json
```

No dependency installation is required or performed. The loader transpiles the actual checked-out target builder, object/field/index converters, index naming and uniqueness helpers, and actual field comparator/configuration. It does not substitute a copied builder model. A hand-written existing-field projection uses the production cache's pure index helper for its uniqueness flag.

The loader executes only allowlisted source paths and external pure libraries. Imports are deferred until used, so unused application converters do not execute. Nest's Injectable decorator and translation tags are inert test adapters; no Nest application/container is loaded. The constructor's encryption dependency throws if used. The loader invokes no repository Jest configuration, global setup, dotenv, datasource, database, Docker, provider, or native harness. It does not import the Track2 harness or any of its configuration.

- `red.log`: before the production edit, 10 tests ran; 5 passed and 5 failed with the unwanted uniqueness delta / incorrect uniqueness flag. Test-loader setup errors were resolved before this recorded red run. Trailing whitespace in the captured failure output was stripped for git hygiene; messages and results are preserved.
- `green.log`: after the production edit, all 11 tests passed (the original 10 plus a separately added characterization of the pre-existing redundant-declaration conflict).
- `git diff --check`: passed.

Coverage: unchanged required UUID and no default; retained plain unique index UID/member/column/order; repeated manifest construction without input mutation or an extra automatic index; explicit false with a declared unique index; top-level fields; non-unique index; multi-field unique index; unique composite subfield; unrelated field isolation; existing explicit true generation; explicit true plus a distinct non-unique index; and the pre-existing identical-declaration conflict.

This is runtime execution of pure source units, not a full TypeScript typecheck, engine build, database integration test, migration execution, rollback proof, or deployment proof. The native engine harness remains blocked and was not resumed or bypassed. Independent review and separately authorized native-boundary verification remain necessary before activation.

## Review publication

Only the review branch is to be pushed to `myfork` (`myi1/twenty`). The pinned repository's push workflows deploy `main` or `v*` tags; this review branch is neither. No pull request, tag, dispatch, release, navigation, or task mutation is part of this packet. Production access and engine activation remain on hold.
