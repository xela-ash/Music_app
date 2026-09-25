# Specification consistency audit

| Field | Value |
| --- | --- |
| Document ID | `REF-GOV-000` (provisional; Governance defines no `REF-*` family) |
| Type | Reference (REF) |
| Domain | Cross-cutting; audits the complete `docs/` specification tree |
| Status | Proposed |
| Version | 0.1.0 |
| Owner | Documentation Working Group |
| Last Reviewed | 2026-09-25 |
| Applies To | Every document under `docs/` at the time of this audit |
| Supersedes / Superseded By | None |

## 1. Executive summary

**Placement rationale:** Governance's Document Types table ([Governance Section 5](README.md#5-document-types)) does not name a "cross-document audit" type. Of the six defined types, **Reference (REF)** — "supporting material that is not itself normative" — is the closest fit: this document records findings and does not itself impose new MUST/MUST NOT rules on any domain. Governance's own directory table describes `00-governance/` as "This standard and any governance sub-documents" ([Governance Section 4](README.md#4-directory-structure)), which a specification-consistency audit against that same standard reasonably is. This document is therefore placed at `docs/00-governance/specification-consistency-audit.md` per the task's stated default, since nothing in Governance forbids it. `99-appendices/` was considered as the conventional home for REF material but was not chosen, since this audit is a governance-compliance instrument reviewed alongside Governance itself, not historical/reference material.

This audit reviews the complete `docs/` specification tree as it stands after this batch's work: three confirmed product decisions reconciled across Milestones, Deliverables, and Escrow; a blocked-and-recorded Disputes ownership decision; and three new canonical specifications (Ratings and Reputation, Messaging and Collaboration, Notifications). It is not a product-redesign exercise; it verifies structural and cross-document consistency and classifies what it finds.

**Headline result:** zero duplicate identifier definitions, zero unresolved broken links or anchors, and zero contradictions between this batch's new or edited content and any existing Approved or Proposed document. Two small, pre-existing structural defects were found and automatically fixed (Section 6). One real architectural gap — Disputes ownership — remains a genuine **BLOCKER** requiring a Governance decision, exactly as anticipated going into this batch; it is not a defect this audit introduces or could resolve. A small number of P1/P2 items request Product, Governance, or Architecture decisions this batch correctly declined to invent.

The specification baseline is **not** implementation-ready in the sense of "ready to hand to engineering for a full build," because BLOCKER and several P0 items remain (Section 8). It **is** ready for continued documentation work and for scoped implementation planning of the domains that have no blocking dependency (Section 14).

## 2. Baseline inventory

| Document | Status | Version | Governed token(s) | Notes |
| --- | --- | --- | --- | --- |
| `00-governance/README.md` | Approved | 1.1.0 | (governance) | Unmodified this batch |
| `01-foundation/product-overview.md` | Approved | 1.0.0 | `FOUNDATION` (provisional) | Unmodified this batch |
| `01-foundation/system-architecture.md` | Approved | 1.3.0 | `ARCH` (provisional) | Unmodified this batch |
| `02-users-roles-permissions/authentication.md` | Approved | 1.2.0 | `AUTH` | Unmodified this batch |
| `02-users-roles-permissions/authorization.md` | Approved | 1.1.1 | `AUTHZ` | **Modified**: heading-level fix (Section 6) |
| `02-users-roles-permissions/profiles.md` | Approved | 1.0.0 | `USERS` | Unmodified this batch |
| `02-users-roles-permissions/roles.md` | Approved | 1.0.0 | `ADMIN`/`USERS` | Unmodified this batch |
| `02-users-roles-permissions/users.md` | Approved | 1.2.1 | `USERS` | **Modified**: broken-link fix (Section 6) |
| `03-identity-profiles-verification/assets-and-media.md` | Approved | 1.0.0 | `IDENTITY` | Unmodified this batch |
| `03-identity-profiles-verification/user-settings.md` | Approved | 1.0.0 | `USERS` | Unmodified this batch |
| `03-identity-profiles-verification/verification.md` | Approved | 1.0.0 | `IDENTITY` | Unmodified this batch |
| `05-projects-milestones/deliverables.md` | Proposed | 0.2.0 | `PROJECTS` | **Modified**: Phase 1 reconciliation |
| `05-projects-milestones/milestones.md` | Proposed | 1.1.0 | `PROJECTS` | **Modified**: Phase 1 reconciliation |
| `05-projects-milestones/projects.md` | Approved | 1.0.1 | `PROJECTS` | **Modified**: Open-question pointer fix |
| `06-payments-escrow/escrow.md` | Proposed | 0.2.0 | `ESCROW` | **Modified**: Phase 1 reconciliation |
| `06-payments-escrow/payments.md` | Proposed | 0.1.0 | `ESCROW` | Unmodified this batch |
| `07-messaging-collaboration/messaging.md` | Proposed | 0.1.0 | `MESSAGING` | **New this batch** |
| `08-ratings-reputation/ratings.md` | Proposed | 0.1.0 | `RATINGS` | **New this batch** |
| `10-notifications/notifications.md` | Proposed | 0.1.0 | `NOTIFICATIONS` | **New this batch** |

Empty scaffold directories remaining: `04-marketplace/`, `09-moderation-trust-safety/`, `11-admin-operations/` through `18-deployment/`, `99-appendices/`. None were populated by this batch, consistent with its scope.

## 3. Identifier audit

### 3.1 Duplicate identifiers

A complete scan for identifier definitions (`REQ`, `BR`, `SEC`, `DATA`, `INT`, `AUD`, `EVT`, `OPS`, `API`, `ADR`, `SPEC`, `GOV` families) across every `.md` file under `docs/` found **zero unintentional duplicate definitions**. Every identifier this batch introduced (Section 5) is unique against the complete tree at the time of writing.

One recurring, pre-existing pattern is not a defect: `milestones.md` Section 33.1 ("Existing business-rule identifiers") quotes `BR-PROJECTS-002`, `003`, `004`, `005`, and `017` in a table explicitly captioned "This table records, and does not redefine, inherited identifiers." This is the established, correct citation convention used throughout the repository (the same pattern this batch itself used for `BR-RATINGS-001`, and that `escrow.md`/`payments.md` already used for `BR-ESCROW-001`/`002`), not a duplicate-definition bug.

### 3.2 Conflicting identifier meanings (inherited collisions)

Three pre-existing Layer 0/Layer 1 identifier collisions remain on record, all already disclosed and resolved by precedent before this batch began, and none touched or worsened by this batch:

| Identifier | Governance/Layer 0 meaning | Layer 1 (Foundation) meaning | Resolution on record |
| --- | --- | --- | --- |
| `BR-PROJECTS-002` | Locked Milestone commercial terms immutable | Milestone total equals Project price | Governance controls; total equality re-expressed as `BR-PROJECTS-035` ([Milestones Section 3.1](../05-projects-milestones/milestones.md#31-identifier-ranges-and-the-inherited-collision)) |
| `BR-ESCROW-001` | Allocation totals invariant | Budget held in escrow, released only against approved milestones | Governance controls; Product Overview meaning re-expressed as `BR-ESCROW-013`/`014` ([Escrow Section 3.3](../06-payments-escrow/escrow.md#33-identifier-ranges-and-inherited-collision)) |
| `BR-RATINGS-001` | (One consistent meaning across all three citing documents) | Same | Cited, not redefined, by this batch's new `ratings.md` ([Ratings Section 3.1](../08-ratings-reputation/ratings.md#31-ownership-analysis)) |

No new collision was found or introduced.

### 3.3 Provisional identifier families

`SPEC-*`, `EVT-*`, and `OPS-*` remain ungoverned by Governance Section 11/11.1 across every document that uses them (`projects.md`, `milestones.md`, `deliverables.md`, `escrow.md`, `payments.md`, and this batch's `ratings.md`, `messaging.md`, `notifications.md`). Every use is consistently disclosed as provisional pending a Governance amendment. This is a **Governance gap** (Section 9), not an inconsistency: the disclosure pattern itself is uniform across all eight documents that need it.

### 3.4 Identifier range self-consistency

Every document's own "range defined here" table was checked against the identifiers actually used in that document's body. Two minor headroom-vs-usage mismatches from this batch were caught and corrected before commit: `ratings.md`'s `BR-RATINGS-*` range table now explicitly discloses reserved headroom (002–016) versus actually-defined identifiers (002–006), and `messaging.md`'s `BR-MESSAGING-*`/`EVT-MESSAGING-*` ranges were corrected in place to match actual usage exactly. No remaining mismatch was found anywhere in the tree.

## 4. Ownership audit

| Question | Finding |
| --- | --- |
| Does every populated directory have a document whose governed token matches Governance's directory map? | Yes, for all eight populated domain directories (02, 03, 05 ×3, 06 ×2, 07, 08, 10). |
| Assets' "Project Deliverable"/"Project Revision" owner label ("Projects") vs. Deliverables' actual ownership | Already resolved by precedent before this batch ([Deliverables Section 3.3](../05-projects-milestones/deliverables.md#33-reconciliation-items), item DR1); unaffected by this batch. |
| Assets' "Review Evidence" owner label ("Unresolved — Ratings or Moderation") | **Resolved by this batch**: assigned to Ratings, exercised jointly with a future Moderation case ([Ratings Section 13.2](../08-ratings-reputation/ratings.md#132-review-evidence-asset-purpose)). Assets' own "Unresolved" text is not edited (documentation debt, per the same non-edit convention `DR1` already established) — see Section 6.2. |
| Assets' "Dispute Evidence" owner label ("Unresolved — case domain or Moderation") | **Correctly remains unresolved.** This batch did not create a Disputes specification (Section 7), so resolving this label would be guessing at an owner that does not yet exist. No action taken; this is not a defect, it is the accurate reflection of the Disputes blocker. |
| Milestones' "Project Manager" (Organization Role) — could it participate in Messaging? | **Resolved by this batch**: an acting Project Manager participates exactly as the Buyer/Seller it represents ([Messaging Section 3.3](../07-messaging-collaboration/messaging.md#33-reconciliation-items), item MR4). No existing document is edited; Roles' own text is unaffected. |
| Does any document claim ownership of a fact another document already owns? | No new instance found. Every new document in this batch explicitly disclaims ownership of Project, Milestone, Escrow, Payment, Deliverable, or Dispute state in its own "canonical principles" section. |

## 5. Terminology, lifecycle/state, and naming audit

| Check | Finding |
| --- | --- |
| "Review Overdue" (new, Milestones Section 11.3) vs. "Overdue" (existing, `due_at`-based) | Deliberately kept as two distinct, separately named derived values; Milestones Section 11.3 states the distinction explicitly. No collision. |
| "Buyer review" (Deliverables, the act of inspecting a Submission) vs. "review text"/"Review Evidence" (Ratings, written feedback content) | Both are ordinary English phrases, not Governance-defined terms in the same namespace; no cross-reference in either document conflates them. Recorded as a minor **EDITORIAL/P2** observation only: a future glossary (Section 9) should disambiguate "review" as a verb (Deliverables) from "Review" as a Rating noun, once it exists. |
| "Conversation"/"Message" (new, Messaging) vs. any existing term | No prior document defined either term. No collision. |
| "Notification Intent"/"Delivery Attempt" (new, Notifications) vs. any existing term | No prior document defined either term. No collision. |
| State-machine enum fidelity (Governance Section 20) | All new/edited Mermaid state diagrams use exact schema or target-architecture value names, consistent with the existing convention; none paraphrase. |
| `buyer_approved` meaning, post-Decision-2 | Milestones Section 19.1 now explicitly states `buyer_approved` is reachable via ordinary approval (M07) **or** platform non-response authorization (M18); Deliverables, Escrow, and Ratings were each checked and none assume M07 is the only path. Consistent. |

## 6. Automatically fixed items

Per the task's explicit allowance to fix "broken links," "obvious stale cross-references," and "duplicate definitions accidentally introduced in this batch," the following were corrected and are included in this phase's commit:

### 6.1 Broken relative links (pre-existing, unrelated to this batch's new content)

`docs/02-users-roles-permissions/users.md` contained four relative links to `system-architecture.md` and `product-overview.md` missing the required `../01-foundation/` path segment (lines formerly reading `[`system-architecture.md`](system-architecture.md)` etc.). Fixed to `../01-foundation/system-architecture.md` and `../01-foundation/product-overview.md`. PATCH bump 1.2.0 → 1.2.1, version history entry added. This was a genuine broken link (Governance Section 21 calls broken internal links "a review blocker"), not a stale cross-reference this batch created.

### 6.2 Heading-level skip (pre-existing, unrelated to this batch's new content)

`docs/02-users-roles-permissions/authorization.md` Section 4 contained `#### 4.1 Identifier Governance Note` and `#### 4.2 Domain Terms` directly under `## 4.`, skipping H3 in violation of Governance Section 7. Both raised to `### 4.1`/`### 4.2`. Heading text is unchanged, so no anchor slug changed and no existing internal link (checked repository-wide) was broken by this fix. PATCH bump 1.1.0 → 1.1.1, version history entry added.

### 6.3 Missing-glossary disclosure gap in this batch's own new documents

`ratings.md`, `messaging.md`, and `notifications.md` each define local terminology (Section 4 of each) without the same "provisional pending the glossary" disclosure that `milestones.md`/`deliverables.md` already carry, even though `docs/99-appendices/glossary.md` does not exist (the directory is empty). Added one sentence to each new document's Section 3.1, citing the identical Milestones precedent. No version bump needed (these are first-commit documents at 0.1.0; the fix landed before this batch's own commit).

### 6.4 Identifier-range headroom disclosure (this batch's own new documents)

Corrected `ratings.md`'s and `messaging.md`'s declared-vs-actual identifier ranges (Section 3.3 above), before either document's first commit.

### 6.5 Open Questions resolved by this batch, reclassified rather than left stale

- `milestones.md` Questions Q2 (partially) and Q10 (fully) — reclassified Resolved with pointers (Milestones 1.1.0).
- `deliverables.md` Questions EQ1, EQ2, EQ3 — reclassified Resolved with pointers (Deliverables 0.2.0).
- `projects.md`'s P0 row on the Ratings timeout/waiver policy — reclassified Resolved with a pointer to `ratings.md` Section 11 (Projects 1.0.1, PATCH, no described behavior changed).

These were performed as part of Phases 1 and 3's own commits, not this audit commit, since they were direct, in-scope consequences of the work those phases did. They are listed here for completeness per the task's open-question-consolidation requirement.

## 7. BLOCKER

| ID | Finding | Classification | Decision required from |
| --- | --- | --- | --- |
| BLOCKER-1 | **Disputes has no governed owner.** Governance Section 4/11 defines no `09.5`-equivalent directory or `DISPUTES` token; Governance's numbered directory list (00 through 18) is fixed with no open slot, and Governance Section 4 states new top-level directories "MUST NOT be added without updating this section." Foundation ([System Architecture Section 18](../01-foundation/system-architecture.md#18-open-questions), "Is there a dedicated Disputes entity planned?") independently flags the same gap as unresolved. Every domain document that touches disputes (`projects.md`, `milestones.md`, `deliverables.md`, `escrow.md`) already treats this as "Foundation-current Escrow dispute policy... Planned future architecture that requires a Foundation change or ADR" — this batch confirmed that framing rather than discovering it. | Requires Governance Decision | Governance/Architecture: either add a governed `DISPUTES` token and directory (most likely `09.5-disputes/` or a renumbering), or explicitly assign Disputes to an existing token (Escrow or Moderation) with a Foundation-level ADR. |

Per the task's explicit instruction, this batch did **not** guess an owner and did **not** create a Disputes specification. This is the single reason the specification baseline is not fully implementation-ready (Section 14).

## 8. P0 (requires a decision before implementation planning can proceed for the affected domain)

| ID | Finding | Classification | Decision required from |
| --- | --- | --- | --- |
| P0-1 | Ratings' exact score scale (for example, 1–5) is not established anywhere and is not invented by `ratings.md` (Open Question EQ1). | Requires Product Decision | Product |
| P0-2 | Notifications' first email provider is not selected (Open Question EQ1); the email channel adapter cannot be finalized without it. | Requires Product/Engineering Decision | Product, Engineering |
| P0-3 | The exact review-period and platform-intervention operational values (duration, contact-attempt count, channels) for Milestones' Buyer non-response process are deliberately left as configuration, not invented (Milestones Question Q18). | Requires Product/Operations Decision | Product, Operations |
| P0-4 | Every pre-existing Projects/Milestones/Escrow P0 this batch did not touch remains open exactly as before (for example, Escrow EQ6: "who adjudicates a Milestone dispute... timeout behavior," which depends on BLOCKER-1). | Requires Product/Governance Decision (varies by item) | See each document's own Section 36/31.3 |

## 9. P1

| ID | Finding | Classification |
| --- | --- | --- |
| P1-1 | Ratings' collection-window duration (Ratings Question EQ2) before a direction resolves to `WAIVED_TIMEOUT`. | Requires Product Decision |
| P1-2 | Whether push and/or SMS are adopted for MVP notification channels (Notifications Question EQ2). | Requires Product Decision |
| P1-3 | Notifications' exact retry schedule (attempt count, backoff) (Notifications Question EQ3). | Requires Product/Operations Decision |
| P1-4 | Messaging's real-time-vs-poll delivery choice (Messaging Question EQ1). | Requires Engineering Decision (not a documentation blocker) |
| P1-5 | Whether Messaging read state is ever shown to the counterparty as a receipt (Messaging Question EQ2). | Requires Product Decision |
| P1-6 | A future governed change/add-on mechanism for voluntary work beyond a locked per-Milestone revision allowance (Milestones Question Q19). | Requires Product/Architecture Decision |
| P1-7 | The `09-moderation-trust-safety/` domain remains entirely unwritten; Ratings' and Messaging's moderation contracts (Sections 13/15 of each) are forward-looking and cannot be implemented until it exists. | Requires future documentation work (not a defect) |

## 10. P2

| ID | Finding | Classification |
| --- | --- | --- |
| P2-1 | The required glossary at `docs/99-appendices/glossary.md` still does not exist; every domain document's local Terminology section remains provisional pending it (tracked previously in Milestones Q16, Projects P2, Deliverables EQ9; this batch's three new documents now disclose the same gap, Section 6.3 above). | Requires Governance/future documentation work |
| P2-2 | `milestones.md` carries version `1.1.0` while Status remains `Proposed`; Governance Section 10.2 explicitly permits `0.x.y` for Draft but is silent on whether a `1.x` version is appropriate for Proposed. Not a defect this batch introduced (the document was already at `1.0.0` Proposed before this batch); flagged for a future Governance clarification. | Requires Governance Decision |
| P2-3 | "Review" is used as an ordinary word in Deliverables (the inspection act) and as part of a Ratings-owned term ("Review Evidence," "review text") without a glossary to disambiguate (Section 5 above). | Editorial, deferred to the future glossary |
| P2-4 | `roles.md` line 201 contains a literal "TBD" ("bootstrap process TBD (§30)"), pointing to its own further-detail section. Pre-existing, low severity, not touched by this batch. | Editorial, Requires Product/Engineering follow-up in a future `roles.md` revision |
| P2-5 | Which governed families should replace the provisional `SPEC-*`/`EVT-*`/`OPS-*` identifiers used by eight documents across the tree (repeated in every affected document's own Open Questions). | Requires Governance Decision |

## 11. Requires Legal/Risk decision

No new Legal/Risk-classified finding was produced by this batch. Every pre-existing Legal/Risk item (fee/tax policy, chargeback liability, retention periods, jurisdiction-specific rules) remains exactly where Escrow, Payments, and Assets already recorded it, untouched and not duplicated here.

## 12. Implementation-only gaps (no decision needed, only engineering work)

- Every table, route, and UI component for Ratings, Messaging, and Notifications: **Not Implemented**, verified directly (each document's own repository-comparison section).
- The Phase 1 reconciliation's new fields (`revision_allowance`, `submission_requirements`, `DATA-PROJECTS-017`) and new Milestones transition (M18): **Not Implemented**, schema and route work only, no further decision required beyond the P0/P1 items already listed.
- Escrow's `BR-ESCROW-049` (treat both release-eligibility sources identically): **Not Implemented**, and requires no design decision — the two source Milestones records already exist as separate types.

## 13. Repository-status audit

Every new or reconciled document's repository claims were checked directly against `backend/db/*.sql` (all eight migrations), `backend/Index.js` (all twelve routes), `frontend/src/App.tsx`, both `package.json` files, and a repository-wide search for a `tests` directory, following the same method each document's own "Verified repository comparison" section discloses. No claim of existing behavior was found unsupported by that evidence, and no target behavior is mislabeled as implemented anywhere in this batch's output. `git status --short` before this audit's own commit showed no unrelated tracked modification and `.vscode/` untracked throughout.

## 14. MVP specification readiness assessment

| Domain | Readiness for implementation planning |
| --- | --- |
| Projects, Milestones, Deliverables, Escrow, Payments | Ready to plan, subject to their own pre-existing P0/P1 items (unchanged by this batch except where this batch closed three of them) |
| Ratings and Reputation | Ready to plan **except** the rating scale (P0-1); everything else is a documented, self-consistent target |
| Messaging and Collaboration | Ready to plan; MVP scope is deliberately narrow and self-contained; no blocking dependency on Disputes (evidence contract is additive, not required for MVP send/read) |
| Notifications | Ready to plan for in-app delivery; email delivery additionally needs a provider decision (P0-2) |
| Disputes | **Not ready.** Cannot be planned until BLOCKER-1 is resolved. |
| Moderation | Not written this batch; Ratings' and Messaging's moderation contracts are forward-compatible stubs, not blockers to those two domains' own MVP send/rate/read paths. |

**Overall:** the specification baseline is not implementation-ready as a whole, because of BLOCKER-1. It is implementation-ready piecemeal for every domain except Disputes, with the P0 items in Section 8 as the next gating decisions for Ratings and Notifications specifically.

## 15. Version history

| Version | Date | Change | Author |
| --- | --- | --- | --- |
| 0.1.0 | 2026-09-25 | Initial cross-document specification-consistency audit following the specification-foundation batch (Phase 1 reconciliation; Disputes ownership blocker recorded; Ratings, Messaging, and Notifications created). Zero duplicate identifiers found; two pre-existing structural defects found and fixed (a broken-link set in `users.md`, a heading-level skip in `authorization.md`); one architectural BLOCKER recorded (Disputes ownership); open-question consolidation completed. | Documentation Working Group |
