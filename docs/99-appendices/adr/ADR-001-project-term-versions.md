# Project term versions belong to each Project

| Metadata | Value |
| --- | --- |
| Document ID | `ADR-001` |
| Type | Decision Record (ADR) |
| Status | Accepted |
| Owner | Product and Architecture |
| Version | 1.0.0 |
| Last Reviewed | 2026-09-30 |
| Applies To | `project_term_versions` and the Projects, Milestones, and Escrow references to a Project term version |
| Supersedes / Superseded By | None |

## 1. Context

[Projects §14](../../05-projects-milestones/projects.md#14-commercial-terms-and-currency) already requires an immutable numbered proposal snapshot and an immutable agreed snapshot. [Projects §9.1](../../05-projects-milestones/projects.md#91-project-field-matrix) stores `proposal_version` and `agreed_term_version` as positive integer references. [Projects §18](../../05-projects-milestones/projects.md#18-milestone-relationship) shows one Project recording many term versions and says Milestone line items stay on Milestones. [Projects §26.1](../../05-projects-milestones/projects.md#261-target-model-matrix) required ownership of the term-version record to be explicit before implementation and allowed it to be shared infrastructure until that decision. [Milestones `DATA-PROJECTS-009`](../../05-projects-milestones/milestones.md) and [Escrow `DATA-ESCROW-001`](../../06-payments-escrow/escrow.md) already reference a Project term version. `DATA-PROJECTS-008` through `DATA-PROJECTS-017` are already assigned, so this record is `DATA-PROJECTS-018`.

The product owner resolved the open model on 2026-09-30. This record does not change Milestone revision enforcement ([Milestones `REQ-PROJECTS-060`](../../05-projects-milestones/milestones.md)) and does not create a multi-project contract aggregate.

## 2. Decision

1. `project_term_versions` is a Projects-owned model, `DATA-PROJECTS-018`. It is not shared infrastructure.
2. Proposal and agreed project-term snapshots share one immutable version sequence per Project. `proposal_version` and `agreed_term_version` point into that sequence. Acceptance creates the next version in the sequence with represented state `agreed`, copying the proposal version's project-level commercial terms. An accepted later change creates or references the next appropriate version in the same sequence.
3. Each version stores only title, brief, service snapshot, genre IDs, skill IDs, currency, currency exponent, one total amount, start date, due date, and the project-level revision limit. The total means the proposed or agreed total according to that version's represented state. Milestone-specific terms stay on the Milestone snapshot. The stored project-level revision limit does not replace the per-Milestone revision allowance.
4. Every Project has its own sequence. A commercial relationship that covers multiple Projects is a separate parent that points at those Projects and does not own one shared sequence. `project_term_versions` has no engagement-model field. Retainer or ongoing engagement stays future scope.

## 3. Alternatives considered

| Alternative | Why it was not selected |
| --- | --- |
| Leave term versions as unnamed shared infrastructure | [Projects §26.1](../../05-projects-milestones/projects.md#261-target-model-matrix) forbids implementation before ownership is explicit. |
| Separate proposal-version and agreed-version streams | The product decision requires one historical sequence. Two streams would make `proposal_version` and `agreed_term_version` ambiguous. |
| Copy Milestone line items into the project snapshot | Milestones already owns those terms. Duplicating them would let one side change without the other. |
| Add `engagement_model` to distinguish one-shot, milestone, and multi-project deals | A multi-project contract is above the Project. One field on the snapshot would mix three different relationships. |

## 4. Consequences

- [Projects](../../05-projects-milestones/projects.md) 1.1.0 defines `DATA-PROJECTS-018` and `BR-PROJECTS-081`. The effects are Approved and were not yet implemented when this record was accepted.
- Milestone and Escrow specifications keep their existing references. They do not gain a second project-term sequence.
- MVP-015 can create the table and the Project state machine. It does not create the multi-project parent, a retainer, or Milestone line snapshots.
- Historical versions stay immutable when the live Project changes.

## 5. Affected identifiers

`REQ-PROJECTS-004`, `REQ-PROJECTS-008`, `REQ-PROJECTS-009`, `REQ-PROJECTS-012`, `REQ-PROJECTS-020`, `REQ-PROJECTS-060`, `BR-PROJECTS-008`, `BR-PROJECTS-015`, `BR-PROJECTS-017`, `BR-PROJECTS-081`, `DATA-PROJECTS-001`, `DATA-PROJECTS-004`, `DATA-PROJECTS-009`, `DATA-PROJECTS-018`, `DATA-ESCROW-001`.

## 6. Version history

| Version | Date | Change | Author |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-30 | Accepted the product decision for Projects-owned, per-Project, single-sequence term versions. | Product and Architecture |
