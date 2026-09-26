# AGENTS.md — MusicApp implementation agent instructions

This file instructs Cursor, Claude Code, and any other CLI or IDE coding agent working on MusicApp implementation issues. It governs how an agent picks up an issue, what it may treat as authoritative, when it must stop and ask a human, and what "done" means. It does not itself define product behavior — it points to where that behavior is defined.

## 1. Source of truth order

When an implementation decision is ambiguous, resolve it in this order and stop at the first document that answers the question:

1. **Governance** — [`docs/00-governance/README.md`](docs/00-governance/README.md). Defines documentation structure, identifier conventions, and status rules. Governs how every other document is interpreted.
2. **Canonical domain specifications** — every document under `docs/01-foundation/` through `docs/10-notifications/` and `docs/09-moderation-trust-safety/disputes.md`. These are the product and architecture authority. A specification's own `Status` field (Approved / Proposed / Draft) tells you how settled it is; `Proposed` is still authoritative target behavior, not a suggestion.
3. **The MVP implementation plan** — [`docs/19-implementation-planning/mvp-implementation-plan.md`](docs/19-implementation-planning/mvp-implementation-plan.md). Converts the specifications into a build sequence and tells you what order to build in and what a given work item (`MVP-NNN`) is supposed to accomplish.
4. **The issue's own acceptance criteria.** An issue generated from an `MVP-NNN` work item carries that item's acceptance criteria verbatim. If an issue's acceptance criteria seem to contradict the specification it cites, the specification wins — flag the discrepancy in the PR description rather than silently following the issue text.
5. **The Engineering Handbook** — [`docs/20-engineering/engineering-handbook.md`](docs/20-engineering/engineering-handbook.md). Controls *how* engineering is performed (standards for backend, frontend, database, API, security, financial, testing, and review work). It never overrides product behavior defined above it.
6. **The Engineering Build Record and its EDRs** — [`docs/20-engineering/engineering-build-record.md`](docs/20-engineering/engineering-build-record.md). Records what has actually been built and why. It is authoritative about implementation *reality* and rationale, never about target product behavior.
7. **The current repository.** Existing code is evidence of *current* state, never authority over *target* state. A repository shortcut, a legacy route, or an existing schema mismatch is something you may need to migrate away from, not something you extend by precedent, unless the specification you're implementing explicitly says to preserve it.

**Repository code is evidence of current state, not authority over target behavior.** Every domain specification under `docs/` contains a "Verified repository comparison" or equivalent section that says exactly what exists today versus what the target architecture requires. When they disagree, build toward the specification. Do not silently change documented target behavior to match legacy code — if you believe the specification itself is wrong, stop and say so (Section 4) rather than reinterpreting it.

## 2. Workflow

Work one issue at a time, on one dedicated branch, following this sequence.

**Before modifying code** — steps 1–9 are mandatory and happen in this order:

1. **Read the current issue.** Its objective, acceptance criteria, `MVP-*` ID, and `Depends on` list.
2. **Read the referenced specification requirements.** Read the specification section(s) the issue cites in full, not just the acceptance-criteria summary, and every section the spec itself cross-references for the same feature.
3. **Read the [Engineering Handbook](docs/20-engineering/engineering-handbook.md).** At minimum the sections governing the kind of work the issue involves (for example Financial engineering for any Escrow/Payments issue).
4. **Read the relevant [Engineering Build Record](docs/20-engineering/engineering-build-record.md) section(s)** for every subsystem you will touch, and every EDR those sections list. Understand what exists and why before deciding how to change it.
5. **Inspect the actual repository implementation.** Confirm what currently exists in the area you're about to touch — do not trust a stale comment, a specification's "Repository status" column, or the Build Record without spot-checking it, since each is written at a point in time.
6. **Check the [Engineering Improvements Register](docs/20-engineering/engineering-improvements.md)** for `ACCEPTED` or `PLANNED` entries relevant to the area. This is for awareness only: an entry is implemented in this issue only if the issue's acceptance criteria include it (Section 8).
7. **Verify dependencies.** Confirm the issue's `Depends on` `MVP-*` IDs are actually merged. If a dependency is missing, stop and say so rather than building around the gap.
8. **Produce an implementation plan.** Before writing code, state (in the PR draft or an issue comment) the files and modules to change, any migration, how each acceptance criterion will be tested, and which engineering documents will need updating.
9. **Only then modify code.**

**Implementation and delivery:**

10. **Build.** Implement the smallest change that satisfies the issue's acceptance criteria and the specification it cites. No unrelated refactors, no drive-by cleanup outside the issue's stated scope. Preserve existing working architecture (Section 8).
11. **Tests.** Write or update tests that verify the acceptance criteria, not just that the code runs. Every business rule (`BR-*`) and security finding (`SEC-*`) the issue touches should have a corresponding test case.
12. **Repair.** Fix what the tests find. Do not weaken a test to make it pass.
13. **Validation.** Re-run the full test suite and lint, not just the tests you added.
14. **Engineering documentation.** Update the Build Record, add EDRs, and record ENG-IMP entries as Section 5 requires.
15. **Commit.** Scoped commits with messages that cite the requirement/business-rule IDs the change implements (for example: "Implement BR-PROJECTS-001 self-dealing check").
16. **Push a feature branch.** Never commit directly to `main`.
17. **Open a PR.** Description cites the source specification section(s) and the `MVP-*` ID, maps each acceptance criterion to its test(s), and lists any EDRs and ENG-IMP entries created.
18. **Independent review.** A different agent or a human reviews the PR. The implementing agent's own assessment of its work is never the independent review.
19. **Repair findings.** Address review feedback with new commits on the same branch, not force-pushed rewrites, unless the reviewer explicitly asks for a squash.
20. **Merge under the governed merge policy.** Merge authority depends on the item's classification (Section 5.1). An AUTONOMOUS-READY PR may be marked Ready for Review and squash-merged by the MusicApp Autonomous Build Orchestrator only after every merge gate in Section 5.1 passes. HUMAN-DECISION-REQUIRED and EXTERNAL-DEPENDENCY items keep human final merge (Section 5.1).
21. **Next issue.**

## 3. Agent conduct rules

- Work on one issue at a time, on a dedicated branch named for the issue (for example `mvp-018-milestone-state-machine`).
- Never commit directly to `main`.
- Never merge a PR outside the governed merge policy (Section 5.1). Among agents, only the MusicApp Autonomous Build Orchestrator may merge, only AUTONOMOUS-READY PRs or a PR with no `MVP-*` classification that the product owner specifically authorized (Section 5.1), and only after every applicable merge gate passes. No other agent merges to `main`.
- Never bypass branch protection, repository rulesets, or required status checks, and never weaken them to make a merge possible.
- Never bypass tests to get a build green — a failing test describes a real gap between the code and the specification.
- Never invent product rules. If a specification is silent on a case your implementation needs to handle, that silence is a signal to stop (Section 4), not an invitation to decide.
- Cite requirement (`REQ-*`), business-rule (`BR-*`), security (`SEC-*`), and audit (`AUD-*`) identifiers in commit messages and PR descriptions wherever the change implements or affects one.
- Preserve every audit and security invariant a specification states, even when it makes the implementation more work. Treat money movement (Escrow, Payments) and permission/authorization logic as high-risk: prefer the more conservative, more thoroughly tested implementation over the faster one.
- Keep commits scoped to the issue. Avoid unrelated refactors, dependency bumps, or formatting-only changes bundled into a feature commit.
- If an issue's acceptance criteria are satisfied but you notice an adjacent bug or gap, file it as a new issue rather than fixing it inline. An out-of-scope technical improvement (as opposed to a bug) is recorded as an `ENG-IMP` entry instead (Section 8.1).

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
- [ ] **Engineering Build Record** — **mandatory** when implementation reality changed: the affected subsystem section(s) and a new change-history row.
- [ ] **EDR** — **mandatory** when a significant engineering decision was made (Build Record Section 6.1 defines "significant").
- [ ] **Engineering Improvements Register** — **mandatory** when an out-of-scope improvement worth preserving was discovered: a new or updated `ENG-IMP` entry, not an inline fix.
- [ ] **Engineering Handbook** — updated **only** when an approved change modifies engineering standards. Engineering documents are not updated merely to create noise.
- [ ] A commit is created with a message citing the relevant `REQ-*`/`BR-*`/`SEC-*`/`AUD-*` identifiers.
- [ ] The branch is pushed.
- [ ] A PR is created citing the source specification section(s) and `MVP-*` ID.
- [ ] Independent review is completed.
- [ ] Every blocking review finding is repaired.
- [ ] The PR is merged under the governed merge policy (Section 5.1), and GitHub reports it as `MERGED`.

No item on this checklist before the merge is satisfied by an agent's own assertion that it is — a reviewer (human or a second agent) verifies it. The merging party confirms the final item after the merge.

### 5.1 Governed merge policy

The product owner authorized this policy on 2026-09-26. It replaces the earlier rule that a human performs every final merge. It changes who may perform the merge, not what must be true before a merge: every other rule in this file, the Engineering Handbook, the specifications, and the repository's branch protection still applies in full.

Merge authority follows the item's single primary classification ([plan Section 7](docs/19-implementation-planning/mvp-implementation-plan.md#7-autonomous-implementation-safety-classification)), with the same precedence: HUMAN-DECISION-REQUIRED, then EXTERNAL-DEPENDENCY, then AUTONOMOUS-READY. A PR with no `MVP-*` classification follows the last row.

| Classification | Merge authority |
| --- | --- |
| AUTONOMOUS-READY | The MusicApp Autonomous Build Orchestrator may mark the PR Ready for Review and squash-merge it after every merge gate below passes. No human merge approval is needed. |
| HUMAN-DECISION-REQUIRED | Human authority remains required. No agent implements, defaults, or merges the decision-gated scope. A human records the decision in the owning specification (Section 6) and performs the final merge of any PR for the item. |
| EXTERNAL-DEPENDENCY | The orchestrator stops wherever the unselected or unavailable provider, system, credential, or account prevents safe completion. It may implement the provider-neutral and mock portion the issue permits, without selecting or defaulting a provider, then stops and escalates (Section 4). A human performs the final merge of any PR for the item. |
| No `MVP-*` classification (governance, documentation, or environment PRs) | A human merges, unless the product owner has explicitly authorized the orchestrator to land that specific change. The PR description quotes the authorizing instruction, limited to that change. The recorded authorization replaces gate 1; every other applicable gate below still has to pass. |

**Merge gates.** The orchestrator merges only when all of these hold (for an authorized PR with no `MVP-*` classification, the authorization replaces gate 1 as stated above). Any gate that fails blocks the merge:

1. The item is AUTONOMOUS-READY.
2. Every `Depends on` item is merged.
3. Every acceptance criterion is satisfied and mapped to tests.
4. The required backend, frontend, and integration validation passes, including required CI status checks once they exist.
5. Independent review (step 18) reports no unresolved DEFECT.
6. Every blocking review finding has been repaired and revalidated.
7. The PR is based on current `main`, or has been safely updated against it.
8. There are no merge conflicts.
9. There are no unresolved blocking PR conversations.
10. No HUMAN-DECISION-REQUIRED condition was encountered.
11. No unresolved EXTERNAL-DEPENDENCY condition prevents completion.
12. No specification ambiguity remains that would require inventing product behavior (Section 4).
13. The required Build Record, EDR, and engineering-documentation updates are included (Section 5).
14. The PR contains only the issue's authorized scope and its supporting engineering records.
15. Branch protection and repository rulesets permit the merge without a bypass.

**Merge procedure.** Mark the PR Ready for Review if it is a draft; confirm it is mergeable against current `main`; confirm the validation and review results apply to the PR's current head commit, since a later commit needs revalidation; squash-merge that head commit; and confirm GitHub reports the PR as `MERGED`. Merge credentials are used only for authorized MusicApp repository operations and are never printed, logged, committed, or exposed. If the environment lacks merge permission, report that as a permissions blocker instead of asking a human to click Merge for an AUTONOMOUS-READY item.

## 6. What agents must never do to a canonical specification

Agents implement against `docs/01-foundation/` through `docs/10-notifications/`, `docs/09-moderation-trust-safety/disputes.md`, and `docs/19-implementation-planning/`. Agents do not edit those documents to make an implementation easier, do not "correct" a specification to match code they wrote, and do not resolve an Open Question inside application code without a corresponding specification update reviewed and approved by Product/Architecture. If an implementation genuinely requires a specification change, open a documentation issue and reference it from the implementation issue; do not let the two silently diverge.

## 7. Where things live

- Governance and identifier conventions: `docs/00-governance/`
- Product vision and system architecture: `docs/01-foundation/`
- Domain specifications: `docs/02-users-roles-permissions/` through `docs/10-notifications/`, and `docs/09-moderation-trust-safety/disputes.md`
- The specification consistency audit (what's resolved, what's still open, and the readiness-gate determination): `docs/00-governance/specification-consistency-audit.md`
- The MVP implementation plan (build order, work items, vertical-slice acceptance target): `docs/19-implementation-planning/mvp-implementation-plan.md`
- Engineering Handbook (how to engineer): `docs/20-engineering/engineering-handbook.md`
- Engineering Build Record and EDRs (what was built and why): `docs/20-engineering/engineering-build-record.md`
- Engineering Improvements Register (what could be improved later — not authorized): `docs/20-engineering/engineering-improvements.md`
- This file: repository root, `AGENTS.md`

## 8. Engineering-control documents

Three documents under `docs/20-engineering/` govern engineering continuity across humans, Claude, Cursor, and future agents. Their relationship is fixed:

```text
Canonical Specifications
    ↓ define WHAT MusicApp must do
MVP Implementation Plan / GitHub Issue
    ↓ defines WHAT is being built now
Engineering Handbook
    ↓ defines HOW engineering should be performed
Engineering Build Record + EDRs
    ↓ records WHAT WAS ACTUALLY BUILT and WHY
Engineering Improvements Register
    ↓ records WHAT COULD BE IMPROVED LATER
Repository
    ↓ actual executable implementation
```

### 8.1 During implementation

- Implement only approved scope.
- Preserve existing working architecture where possible. **Do not rewrite or rebuild a working subsystem merely because you would have designed it differently** ([Handbook Section 20](docs/20-engineering/engineering-handbook.md#20-refactoring-and-replacement)). Replacement requires evidence, an approved issue, an EDR, and a migration/compatibility plan.
- Record out-of-scope technical ideas in the Engineering Improvements Register: do not implement them, add or update the `ENG-IMP` entry, continue the current issue, and mention it in the PR notes if relevant.
- Create an EDR when making a significant engineering decision.
- Update the Build Record as implementation reality changes.
- Never change product behavior through an EDR. A decision that would change a specification is a stop condition (Section 4); one that changes an Approved/Implemented document or sets a cross-cutting standard is an ADR, not an EDR ([Governance Section 4.1](docs/00-governance/README.md#41-engineering-control-documents)).

### 8.2 An ENG-IMP entry is never authorization

An `ENG-IMP` entry — whatever its status, including `ACCEPTED` — does not authorize implementation. An agent may implement one only when an approved GitHub Issue exists for it, the current issue's acceptance criteria explicitly include it, or a human has explicitly approved it where the workflow permits. Agents never move their own entries from `PROPOSED` to `ACCEPTED`.

### 8.3 Human and agent handoff

A new human engineer or AI agent must **not** begin by redesigning the repository. Before proposing structural change, they must first inspect: this file; the Engineering Handbook; the Engineering Build Record; the relevant specifications; the relevant issues; and the relevant EDRs. The Build Record exists precisely so that engineering continuity survives a change of engineer or agent.

### 8.4 Reviewer rule

Independent reviewers must classify each finding as one of:

- **DEFECT** — the implementation violates a requirement, security, correctness, or the Engineering Handbook. Blocking.
- **IMPROVEMENT** — the implementation works, but the reviewer sees a potentially better engineering approach. Non-blocking.

A reviewer must not block a PR or force a rewrite because of an IMPROVEMENT, unless the existing implementation creates a material correctness, security, or maintainability problem (which makes it a DEFECT). Non-blocking improvements are recorded in the Engineering Improvements Register.

## 9. Cursor Cloud development environment

When working in Cursor Cloud Agents, use the repository-managed configuration in `.cursor/environment.json`.

- **Bootstrap:** `./.cursor/install.sh` (dependencies) and `./.cursor/start.sh` (dev PostgreSQL on port `5432`, database `musicapp`, migrations).
- **Dev servers:** `terminals` in `.cursor/environment.json` start the backend (`npm run dev`, port `4000`) and frontend (`pnpm dev`, port `5173`) after startup.
- **Backend tests (MVP-001 characterization):** run `./.cursor/test-backend.sh` only. It provisions an isolated PostgreSQL cluster on port `5433` with database `musicapp_mvp001` and refuses the shared dev database or port `5432`. Never point `npm test` at staging, production, or a developer's local database.
- **Frontend checks:** `cd frontend && pnpm lint` and `pnpm build` (`tsc -b` plus Vite build).

Cloud agents do not require Docker Desktop or the user's Mac. Push implementation branches and open PRs through the normal GitHub workflow. Never push directly to `main`; merges happen only through a PR under Section 5.1.

## 10. Version history

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-09-25 | Initial agent operating instructions, created after the specification consistency audit's readiness gate passed and the MVP implementation plan was created. |
| 1.1.0 | 2026-09-25 | Integrated the engineering-control documents (`docs/20-engineering/`): added the Engineering Handbook and Engineering Build Record to the source-of-truth order (Section 1); expanded the workflow with a mandatory nine-step pre-implementation sequence and an engineering-documentation step (Section 2); extended the Definition of Done with Build Record, EDR, Improvements Register, and Handbook requirements (Section 5); listed the new documents (Section 7); added Section 8 (document relationship, during-implementation rules, ENG-IMP non-authorization, handoff rule, reviewer DEFECT/IMPROVEMENT rule). Corrected two stale cross-references that pointed stop conditions at Section 5 instead of Section 4. |
| 1.2.0 | 2026-09-26 | Added Cursor Cloud bootstrap, dev-server, and isolated MVP-001 test guidance (Section 9). |
| 1.3.0 | 2026-09-26 | Product-owner-authorized governance migration from human-final-merge to the governed merge policy. Added Section 5.1: merge authority by classification, fifteen merge gates, and the merge procedure, including a head-commit revalidation check. AUTONOMOUS-READY PRs may be squash-merged by the MusicApp Autonomous Build Orchestrator once every gate passes. HUMAN-DECISION-REQUIRED and EXTERNAL-DEPENDENCY items, and PRs with no `MVP-*` classification, keep human final merge. The exception is an unclassified PR the product owner specifically authorized: its PR quotes that authorization, which replaces only gate 1. Section 2 step 18 drops "you never merge your own PR", because the orchestrator now both builds and merges AUTONOMOUS-READY work. Separation of duties is kept by requiring a separate reviewer: the implementer's self-assessment never counts (step 18, gate 5). Step 20, Section 3 (which also gains a rule against bypassing branch protection, rulesets, or required checks), the Section 5 checklist, and Section 9 now defer to Section 5.1. No quality gate, test requirement, stop condition, specification-precedence rule, or human-decision requirement was weakened. |
