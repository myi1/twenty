# Review branch trigger inspection

Inspected the workflow files at pinned base `7719e54f` on 2026-09-13.

| Workflow | Trigger relevant to publication |
| --- | --- |
| `.github/workflows/cd-deploy-main.yaml` | Push to `main` only |
| `.github/workflows/cd-deploy-tag.yaml` | Push of `v*` tags only |
| `.github/workflows/preview-env-dispatch.yaml` | Pull-request events and author/label conditions; not a branch-push trigger |
| Remaining workflows declaring `push` | The inspected branch filters select `main` |

Only `refs/heads/codex/manifest-explicit-uniqueness-20260913` will be pushed to the `myfork` remote (`https://github.com/myi1/twenty.git`). No `main`, tag, pull request, repository dispatch, engine build or deployment action is requested. The local workflow inspection establishes that this branch push does not match the repository's deployment workflows; it is not a claim to have audited every external integration.
