# Autonomous build status

Operational status for the autonomous implementation loop. This file is not a product source of truth. The [MVP implementation plan](mvp-implementation-plan.md) and the [GitHub issue index](github-issue-index.md) remain the planning authorities.

| Field | Value |
|---|---|
| Total MVP work items | 52 (`MVP-001`–`MVP-052`) |
| Completed/merged items | 7 / 52. `MVP-001` (#56), `MVP-002` (#57), `MVP-003` (#60), `MVP-006` (#62, merge `7ac1b43`, issue #8 closed), `MVP-007` (#64, merge `4c39631`, issue #9 closed), `MVP-013` (#66, merge `b337689`, issue #15 closed 2026-09-29), `MVP-014` (#68, merge `5174e20`, issue #16 closed 2026-09-29) |
| Currently active item | None in progress. Next eligible AUTONOMOUS-READY item is `MVP-041` (issue #43). |
| Current phase | Idle between items. `MVP-014` is merged. Do not start `MVP-015` while `ENG-IMP-015` says the term-version model is undefined. |
| Blocked item left open | `MVP-004` pull request #61. It is still a draft and conflicts with `main`. GitHub Actions on its earlier head was green for `lint`, `frontend-test`, `backend-test`, and `migration-dry-run`. Updating ruleset `24033491` still returns HTTP 403, so those four checks are not required. Do not merge #61 until the ruleset requires them. Rebase #61 onto current `main` before that merge. `MVP-015` is also not startable: dependency `MVP-014` is merged, and the term-version record is still undefined. |
| Next dependency-ready items | `MVP-041` (issue #43) is the next AUTONOMOUS-READY item that can be implemented. Also READY: `MVP-038` (issue #40). `MVP-010` (issue #12) may implement only a local/mock storage adapter; its classification is EXTERNAL-DEPENDENCY, so a human merges that PR. `MVP-004` remains open on the ruleset permission and does not block `MVP-041`. |
| Human-decision blockers | `MVP-005`, `MVP-027`, `MVP-044`, `MVP-052`. `MVP-008` and `MVP-030` remain gated sub-scopes. `MVP-015` needs an Architecture definition of `project_term_versions` before implementation (`ENG-IMP-015`). |
| External-dependency blockers | `MVP-009` needs an email provider. `MVP-010`, `MVP-025`, and `MVP-043` have no provider; their acceptance criteria allow a local or mock adapter once dependencies merge. |
| Latest completed tests | 2026-09-29 for `MVP-014` application commit `22060ea` (squash `5174e20`, review-record `04ebd3e` included): `./.cursor/test-backend.sh` 103 pass, 0 fail. Frontend `pnpm test` 8 pass, `pnpm lint` exit 0, `pnpm build` exit 0. No invitation UI was added. |
| Active PR | #61 for `MVP-004`, not merged. #68 is MERGED. |
| Handoff for the next orchestrator | Do not start `MVP-015` / issue #17. `ENG-IMP-015` is still unresolved: `project_term_versions` is not defined, and inventing it is a stop condition. Start `MVP-041` / issue #43 on a new `cursor/…` branch from current `main`. `MVP-038` / issue #40 is also dependency-ready. Next free EDR id is `EDR-010` (`EDR-005` is still reserved on unmerged #61; `EDR-009` is on main). Next free improvement id is `ENG-IMP-036`. Do not merge #61 until ruleset `24033491` requires `lint`, `frontend-test`, `backend-test`, and `migration-dry-run`. |
| Last successful run timestamp | 2026-09-29 |
| Human intervention required | Yes, for two separate items that do not block `MVP-041`: (1) require the four CI checks on ruleset `24033491`, or grant ruleset write permission; (2) Architecture must define the project term-version record before `MVP-015` can start. |
| User-testable checkpoint | Discover search remains the last browser checkpoint. Seller invitation has no screen in this item. A named seller no longer sees the project in `GET /projects` until they accept an invitation. |
