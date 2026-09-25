# AGENTS.md — MusicApp implementation agent instructions

This file instructs Cursor, Claude Code, and any other CLI or IDE coding agent working on MusicApp implementation issues. It governs how an agent picks up an issue, what it may treat as authoritative, when it must stop and ask a human, and what "done" means. It does not itself define product behavior — it points to where that behavior is defined.

## 1. Source of truth order

When an implementation decision is ambiguous, resolve it in this order and stop at the first document that answers the question:

1. **Governance** — [`docs/00-governance/README.md`](docs/00-governance/README.md). Defines documentation structure, identifier conventions, and status rules. Governs how every other document is interpreted.
2. **Canonical domain specifications** — every document under `docs/01-foundation/` through `docs/10-notifications/` and `docs/09-moderation-trust-safety/disputes.md`. These are the product and architecture authority. A specification's own `Status` field (Approved / Proposed / Draft) tells you how settled it is; `Proposed` is still authoritative target behavior, not a suggestion.
3. **The MVP implementation plan** — [`docs/19-implementation-planning/mvp-implementation-plan.md`](docs/19-implementation-planning/mvp-implementation-plan.md). Converts the specifications into a build sequence and tells you what order to build in and what a given work item (`MVP-NNN`) is supposed to accomplish.
4. **The issue's own acceptance criteria.** An issue generated from an `MVP-NNN` work item carries that item's acceptance criteria verbatim. If an issue's acceptance criteria seem to contradict the specification it cites, the specification wins — flag the discrepancy in the PR description rather than silently following the issue text.
5. **The current repository.** Existing code is evidence of *current* state, never authority over *target* state. A repository shortcut, a legacy route, or an existing schema mismatch is something you may need to migrate away from, not something you extend by precedent, unless the specification you're implementing explicitly says to preserve it.

**Repository code is evidence of current state, not authority over target behavior.** Every domain specification under `docs/` contains a "Verified repository comparison" or equivalent section that says exactly what exists today versus what the target architecture requires. When they disagree, build toward the specification. Do not silently change documented target behavior to match legacy code — if you believe the specification itself is wrong, stop and say so (Section 5) rather than reinterpreting it.

## 2. Workflow

Work one issue at a time, on one dedicated branch, following this sequence:

1. **Inspect the specs.** Read the specification section(s) the issue cites in full, not just the acceptance-criteria summary. Read every section the spec itself cross-references for the same feature.
2. **Inspect the repository.** Confirm what currently exists in the area you're about to touch — do not trust a stale comment or a specification's own "Repository status" column without spot-checking it, since specs are written from a point-in-time review.
3. **Check the implementation plan.** Confirm the issue's dependencies (its `Depends on` `MVP-*` IDs) are actually merged. If a dependency is missing, stop and say so rather than building around the gap.
4. **Build.** Implement the smallest change that satisfies the issue's acceptance criteria and the specification it cites. No unrelated refactors, no drive-by cleanup outside the issue's stated scope.
5. **Tests.** Write or update tests that verify the acceptance criteria, not just that the code runs. Every business rule (`BR-*`) and security finding (`SEC-*`) the issue touches should have a corresponding test case.
6. **Repair.** Fix what the tests find. Do not weaken a test to make it pass.
7. **Validation.** Re-run the full test suite and lint, not just the tests you added.
8. **Commit.** Scoped commits with messages that cite the requirement/business-rule IDs the change implements (for example: "Implement BR-PROJECTS-001 self-dealing check").
9. **Push a feature branch.** Never commit directly to `main`.
10. **Open a PR.** Description cites the source specification section(s) and the `MVP-*` ID.
11. **Independent review.** A different agent or a human reviews the PR — you never merge your own PR.
12. **Repair findings.** Address review feedback with new commits on the same branch, not force-pushed rewrites, unless the reviewer explicitly asks for a squash.
13. **Ready for human merge.** A human makes the final merge decision. No agent merges to `main` under any circumstance.
14. **Next issue.**

## 3. Agent conduct rules

- Work on one issue at a time, on a dedicated branch named for the issue (for example `mvp-018-milestone-state-machine`).
- Never commit directly to `main`.
- Never merge your own PR.
- Never bypass tests to get a build green — a failing test describes a real gap between the code and the specification.
- Never invent product rules. If a specification is silent on a case your implementation needs to handle, that silence is a signal to stop (Section 5), not an invitation to decide.
- Cite requirement (`REQ-*`), business-rule (`BR-*`), security (`SEC-*`), and audit (`AUD-*`) identifiers in commit messages and PR descriptions wherever the change implements or affects one.
- Preserve every audit and security invariant a specification states, even when it makes the implementation more work. Treat money movement (Escrow, Payments) and permission/authorization logic as high-risk: prefer the more conservative, more thoroughly tested implementation over the faster one.
- Keep commits scoped to the issue. Avoid unrelated refactors, dependency bumps, or formatting-only changes bundled into a feature commit.
- If an issue's acceptance criteria are satisfied but you notice an adjacent bug or gap, file it as a new issue rather than fixing it inline.

## 4. Stop conditions — do not guess, escalate instead

Stop and escalate to a human (via the PR description, an issue comment, or by pausing and asking) rather than proceeding, whenever you hit any of the following. "Escalate" means describe the exact ambiguity and what specification section you checked — not silently pick the option that seems safest.

- **Specification conflict.** Two specifications state contradictory rules for the same fact, and neither cites the other under Governance's precedence rules (`docs/00-governance/README.md` Section 3).
- **Missing requirement.** The specification you're implementing against does not cover a case your implementation must handle (for example: what happens if a field is empty that the spec assumes is always populated).
- **Product-significant ambiguity.** The specification is clear about the mechanism but silent or explicitly open (see its own "Open Questions" section) about a value, policy, or threshold that changes user-visible behavior — a fee rate, a compensation policy, a rating scale, a liability rule. These are listed exhaustively, per domain, in each specification's own Open Questions section and consolidated in the [specification consistency audit](docs/00-governance/specification-consistency-audit.md) and the [implementation plan's Section 7](docs/19-implementation-planning/mvp-implementation-plan.md#7-autonomous-implementation-safety-classification) (`HUMAN-DECISION-REQUIRED` items).
- **Financial behavior not specified.** Any code path that would move, hold, release, or refund money in a way no specification section explicitly authorizes.
- **Authorization ambiguity.** Any code path that would grant or check a permission no specification section explicitly defines.
- **Destructive migration uncertainty.** A migration that could destroy data (a `DROP`, a lossy column-type change, a cascade you're not certain is intended) where the specification's own migration-implications section doesn't unambiguously call for it.
- **Provider behavior unknown.** An external provider (payment, storage, email) has not been selected — build to the provider-neutral adapter interface the specification defines, and stop rather than picking a provider yourself.
- **Security invariant cannot be preserved.** Implementing the feature as specified would require weakening an existing `SEC-*` control or `BR-*` rule.
- **Test cannot represent acceptance criteria.** You cannot write a test that actually verifies the issue's acceptance criteria (as opposed to merely exercising the code path).
- **Issue requires modifying a canonical specification.** If satisfying an issue would require changing product behavior a specification defines, that is a specification change, not an implementation task — stop and raise it as a documentation issue instead of quietly diverging code from spec.

Agents must not "make a reasonable assumption" for any of the above. A reasonable-sounding assumption about money movement or permissions is exactly the failure mode this file exists to prevent.

## 5. Definition of done

An implementation issue is not done until all of the following hold:

- [ ] Every acceptance criterion in the issue is satisfied.
- [ ] Tests are written or updated and cover the acceptance criteria, not just line coverage.
- [ ] All tests pass, including the full existing suite, not only the new tests.
- [ ] Authorization is checked: every new or changed action re-verifies live relationship/role, not merely resource-identifier possession.
- [ ] Security considerations from the relevant specification's `SEC-*` findings are checked and, where the issue's scope covers them, addressed.
- [ ] Migrations are safe: reviewed for destructive operations, and any genuinely destructive step is called out explicitly in the PR description.
- [ ] Audit/event behavior is implemented wherever the specification's `AUD-*`/`EVT-*` requirements apply to the changed code path.
- [ ] The diff contains no unrelated changes (Section 3).
- [ ] Documentation is updated if the change affects an implementation-specific document (not the canonical specifications themselves, which are Product/Architecture-owned — see Section 6).
- [ ] A commit is created with a message citing the relevant `REQ-*`/`BR-*`/`SEC-*`/`AUD-*` identifiers.
- [ ] The branch is pushed.
- [ ] A PR is created citing the source specification section(s) and `MVP-*` ID.
- [ ] Independent review is completed.
- [ ] Every blocking review finding is repaired.

Human merge remains the final gate in every case. No item on this checklist is satisfied by an agent's own assertion that it is — a reviewer (human or a second agent) verifies it.

## 6. What agents must never do to a canonical specification

Agents implement against `docs/01-foundation/` through `docs/10-notifications/`, `docs/09-moderation-trust-safety/disputes.md`, and `docs/19-implementation-planning/`. Agents do not edit those documents to make an implementation easier, do not "correct" a specification to match code they wrote, and do not resolve an Open Question inside application code without a corresponding specification update reviewed and approved by Product/Architecture. If an implementation genuinely requires a specification change, open a documentation issue and reference it from the implementation issue; do not let the two silently diverge.

## 7. Where things live

- Governance and identifier conventions: `docs/00-governance/`
- Product vision and system architecture: `docs/01-foundation/`
- Domain specifications: `docs/02-users-roles-permissions/` through `docs/10-notifications/`, and `docs/09-moderation-trust-safety/disputes.md`
- The specification consistency audit (what's resolved, what's still open, and the readiness-gate determination): `docs/00-governance/specification-consistency-audit.md`
- The MVP implementation plan (build order, work items, vertical-slice acceptance target): `docs/19-implementation-planning/mvp-implementation-plan.md`
- This file: repository root, `AGENTS.md`

## 8. Version history

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-09-25 | Initial agent operating instructions, created after the specification consistency audit's readiness gate passed and the MVP implementation plan was created. |
