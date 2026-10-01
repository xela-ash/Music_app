# Specification consistency audit

| Field | Value |
| --- | --- |
| Document ID | `REF-GOV-000` (provisional; Governance defines no `REF-*` family) |
| Type | Reference (REF) |
| Domain | Cross-cutting; audits the complete `docs/` specification tree |
| Status | Proposed |
| Version | 0.2.2 |
| Owner | Documentation Working Group |
| Last Reviewed | 2026-09-25 |
| Applies To | Every document under `docs/` at the time of this audit |
| Supersedes / Superseded By | None |

## 1. Executive summary

**Placement rationale:** unchanged from version 0.1.0 (see the reasoning retained below); this remains a Reference (REF) instrument reviewed alongside Governance itself.

Governance's Document Types table ([Governance Section 5](README.md#5-document-types)) does not name a "cross-document audit" type. Of the six defined types, **Reference (REF)** — "supporting material that is not itself normative" — is the closest fit: this document records findings and does not itself impose new MUST/MUST NOT rules on any domain. Governance's own directory table describes `00-governance/` as "This standard and any governance sub-documents" ([Governance Section 4](README.md#4-directory-structure)), which a specification-consistency audit against that same standard reasonably is.

This revision (0.2.0) re-runs the complete audit after a second batch of work: the single remaining **BLOCKER** from version 0.1.0 — Disputes had no governed owner — is resolved by a minimal Governance amendment (a new `DISPUTES` token sharing the existing, still-empty `09-moderation-trust-safety/` directory) and a new canonical [Disputes specification](../09-moderation-trust-safety/disputes.md). Five existing documents received small, targeted corrections to remove stale forward-references to "a future Disputes specification" now that one exists (Section 6). No document's normative behavior was rewritten, and no prior finding from version 0.1.0 was silently dropped.

**Headline result:** zero duplicate identifier definitions (including the entire new `DISPUTES` family, verified against the complete tree before assignment), zero unresolved broken links or anchors, and zero contradictions between this batch's new or edited content and any existing Approved or Proposed document. `BLOCKER-1` is **Resolved**. The 2026-10-01 decisions close the rating scale, collection window, email provider, push/SMS, retry bound, fee schedule, funded-cancellation compensation, and first-Administrator bootstrap. Items those decisions do not name stay open.

The specification baseline **passes the MVP implementation-planning readiness gate** (Section 15): no remaining BLOCKER prevents decomposing the MVP into a build sequence. Product decisions on 2026-10-01 resolved the fee rate, funded-cancellation compensation, the rating scale, the email provider, and provider selection for Cashfree, Cloudflare R2, and Resend. Post-payout recovery beyond the affected transaction stays open. Sections 8, 14, and 15 record the current classification.

## 2. Baseline inventory

| Document | Status | Version | Governed token(s) | Notes |
| --- | --- | --- | --- | --- |
| `00-governance/README.md` | Approved | 1.2.0 | (governance) | **Modified**: `DISPUTES` token and directory-map entry added (Section 6) |
| `01-foundation/product-overview.md` | Approved | 1.0.0 | `FOUNDATION` (provisional) | Unmodified this batch |
| `01-foundation/system-architecture.md` | Approved | 1.4.0 | `ARCH` (provisional) | **Modified**: Disputes Open Question resolved, stale gap language corrected (Section 6) |
| `02-users-roles-permissions/authentication.md` | Approved | 1.2.0 | `AUTH` | Unmodified this batch |
| `02-users-roles-permissions/authorization.md` | Approved | 1.1.1 | `AUTHZ` | Unmodified this batch |
| `02-users-roles-permissions/profiles.md` | Approved | 1.0.0 | `USERS` | Unmodified this batch |
| `02-users-roles-permissions/roles.md` | Approved | 1.0.0 | `ADMIN`/`USERS` | Unmodified this batch |
| `02-users-roles-permissions/users.md` | Approved | 1.2.1 | `USERS` | Unmodified this batch |
| `03-identity-profiles-verification/assets-and-media.md` | Approved | 1.1.0 | `IDENTITY` | **Modified**: "Dispute Evidence" owner resolved (Section 6) |
| `03-identity-profiles-verification/user-settings.md` | Approved | 1.0.0 | `USERS` | Unmodified this batch |
| `03-identity-profiles-verification/verification.md` | Approved | 1.0.0 | `IDENTITY` | Unmodified this batch |
| `05-projects-milestones/deliverables.md` | Proposed | 0.2.0 | `PROJECTS` | Unmodified this batch |
| `05-projects-milestones/milestones.md` | Proposed | 1.1.1 | `PROJECTS` | **Modified**: stale Notifications link fix (Section 6) |
| `05-projects-milestones/projects.md` | Approved | 1.0.1 | `PROJECTS` | Unmodified this batch |
| `06-payments-escrow/escrow.md` | Proposed | 0.2.0 | `ESCROW` | Unmodified this batch |
| `06-payments-escrow/payments.md` | Proposed | 0.1.0 | `ESCROW` | Unmodified this batch |
| `07-messaging-collaboration/messaging.md` | Proposed | 0.1.0 | `MESSAGING` | Unmodified this batch |
| `08-ratings-reputation/ratings.md` | Proposed | 0.1.0 | `RATINGS` | Unmodified this batch |
| `09-moderation-trust-safety/disputes.md` | Proposed | 0.1.0 | `DISPUTES` | **New this batch**; resolves `BLOCKER-1` |
| `10-notifications/notifications.md` | Proposed | 0.1.1 | `NOTIFICATIONS` | **Modified**: Dispute topic row unblocked (Section 6) |

Empty scaffold directories remaining: `04-marketplace/`, `11-admin-operations/` through `18-deployment/`, `99-appendices/`. `09-moderation-trust-safety/` is no longer empty — it now holds `disputes.md`; Moderation itself remains unwritten within that same directory, consistent with Governance's amended directory-map entry (Section 6).

## 3. Identifier audit

### 3.1 Duplicate identifiers

A complete scan for identifier definitions (`REQ`, `BR`, `SEC`, `DATA`, `INT`, `AUD`, `EVT`, `OPS`, `API`, `ADR`, `SPEC`, `GOV` families) across every `.md` file under `docs/` found **zero unintentional duplicate definitions**. This includes the entire new `DISPUTES` family (`REQ-DISPUTES-001`–`028`, `BR-DISPUTES-001`–`034`, `SEC-DISPUTES-001`–`022`, `DATA-DISPUTES-001`–`005`, `INT-DISPUTES-001`–`014`, `AUD-DISPUTES-001`–`008`, provisional `EVT-DISPUTES-001`–`012` and `OPS-DISPUTES-001`–`008`), verified by direct repository-wide search to have zero prior uses before [`disputes.md`](../09-moderation-trust-safety/disputes.md) was authored ([Disputes Section 3.2](../09-moderation-trust-safety/disputes.md#32-identifier-ranges)) — the token is entirely new, so there is no continuation-ceiling risk the way there is for `PROJECTS` or `ESCROW`.

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

`SPEC-*`, `EVT-*`, and `OPS-*` remain ungoverned by Governance Section 11/11.1 across every document that uses them (`projects.md`, `milestones.md`, `deliverables.md`, `escrow.md`, `payments.md`, `ratings.md`, `messaging.md`, `notifications.md`, and now `disputes.md`). Every use is consistently disclosed as provisional pending a Governance amendment. This is a **Governance gap** (Section 9), not an inconsistency: the disclosure pattern itself is uniform across all nine documents that need it. `REQ-DISPUTES-*`, `BR-DISPUTES-*`, `SEC-DISPUTES-*`, `DATA-DISPUTES-*`, `INT-DISPUTES-*`, and `AUD-DISPUTES-*` are, by contrast, fully governed as of this batch's Governance amendment (Section 6.6) — `DISPUTES` was added to Governance Section 11's domain-token list in the same change that resolved `BLOCKER-1`, so these six families carry no provisional-gap disclosure, unlike `EVT-DISPUTES-*`/`OPS-DISPUTES-*`, which remain provisional along with every sibling document's own event/operations identifiers.

### 3.4 Identifier range self-consistency

Every document's own "range defined here" table was checked against the identifiers actually used in that document's body. Two minor headroom-vs-usage mismatches from this batch were caught and corrected before commit: `ratings.md`'s `BR-RATINGS-*` range table now explicitly discloses reserved headroom (002–016) versus actually-defined identifiers (002–006), and `messaging.md`'s `BR-MESSAGING-*`/`EVT-MESSAGING-*` ranges were corrected in place to match actual usage exactly. No remaining mismatch was found anywhere in the tree.

## 4. Ownership audit

| Question | Finding |
| --- | --- |
| Does every populated directory have a document whose governed token matches Governance's directory map? | Yes, for all nine populated domain directories (02, 03, 05 ×3, 06 ×2, 07, 08, 09, 10). `09-moderation-trust-safety/` now holds `disputes.md` under the `DISPUTES` token added to Governance's directory-map row for that directory this batch (Section 6.6); Moderation itself remains unwritten in the same directory. |
| Assets' "Project Deliverable"/"Project Revision" owner label ("Projects") vs. Deliverables' actual ownership | Already resolved by precedent before this batch ([Deliverables Section 3.3](../05-projects-milestones/deliverables.md#33-reconciliation-items), item DR1); unaffected by this batch. |
| Assets' "Review Evidence" owner label ("Unresolved — Ratings or Moderation") | Already resolved before this batch: assigned to Ratings, exercised jointly with a future Moderation case ([Ratings Section 13.2](../08-ratings-reputation/ratings.md#132-review-evidence-asset-purpose)); unaffected by this batch. |
| Assets' "Dispute Evidence" owner label ("Unresolved — case domain or Moderation") | **Resolved by this batch**: assigned to Disputes, exercised jointly with a future Moderation case ([Disputes Section 3.3](../09-moderation-trust-safety/disputes.md#33-reconciliation-items), item `DIR4`). Unlike the Review Evidence precedent, Assets' own label cell *is* edited here, directly, from "Unresolved" to "Disputes" (Section 6.6) — the owner was genuinely unresolved, not merely under-labeled, and this document is precisely the resolution the audit's prior `BLOCKER-1` required. |
| Milestones' "Project Manager" (Organization Role) — could it participate in Messaging? | Already resolved before this batch ([Messaging Section 3.3](../07-messaging-collaboration/messaging.md#33-reconciliation-items), item MR4); unaffected by this batch. |
| Does any document claim ownership of a fact another document already owns? | No new instance found. `disputes.md` explicitly disclaims ownership of Project, Milestone, Escrow, Payment, Deliverable, Message, Rating, and Notification state in its own "canonical principles" section (Section 5), and Escrow's own ownership text was narrowed, not expanded, to hand adjudication to Disputes (Section 6.6). |
| Does the new Disputes domain duplicate a fact Escrow, Milestones, Deliverables, Messaging, or Assets already owns? | No. `disputes.md` Section 4 states the boundary explicitly and Section 12 defines evidence as references only, never copies; verified directly against each cited section during authoring. |

## 5. Terminology, lifecycle/state, and naming audit

| Check | Finding |
| --- | --- |
| "Review Overdue" (new, Milestones Section 11.3) vs. "Overdue" (existing, `due_at`-based) | Deliberately kept as two distinct, separately named derived values; Milestones Section 11.3 states the distinction explicitly. No collision. |
| "Buyer review" (Deliverables, the act of inspecting a Submission) vs. "review text"/"Review Evidence" (Ratings, written feedback content) | Both are ordinary English phrases, not Governance-defined terms in the same namespace; no cross-reference in either document conflates them. Recorded as a minor **EDITORIAL/P2** observation only: a future glossary (Section 9) should disambiguate "review" as a verb (Deliverables) from "Review" as a Rating noun, once it exists. |
| "Conversation"/"Message" (new, Messaging) vs. any existing term | No prior document defined either term. No collision. |
| "Notification Intent"/"Delivery Attempt" (new, Notifications) vs. any existing term | No prior document defined either term. No collision. |
| State-machine enum fidelity (Governance Section 20) | All new/edited Mermaid state diagrams use exact schema or target-architecture value names, consistent with the existing convention; none paraphrase. |
| `buyer_approved` meaning, post-Decision-2 | Milestones Section 19.1 now explicitly states `buyer_approved` is reachable via ordinary approval (M07) **or** platform non-response authorization (M18); Deliverables, Escrow, and Ratings were each checked and none assume M07 is the only path. Consistent. |
| "Decision" (Disputes, the adjudicator's recorded outcome) vs. "resolution instruction" (Disputes, the immutable Escrow-facing record) vs. "resolution" (Escrow, its own hold-resolving instruction concept, [Escrow Section 17.1](../06-payments-escrow/escrow.md#171-hold-model)) | Deliberately distinct, cross-referenced terms, not a collision: Disputes' "resolution instruction" is defined as, and reuses without renaming, Escrow's pre-existing "resolution instruction" concept and its exact `AWARD_BUYER`/`AWARD_SELLER`/`SPLIT`/`DISMISS` outcome vocabulary ([Disputes Section 15.1](../09-moderation-trust-safety/disputes.md#151-resolution-instruction-contract)); "decision" is a new, Disputes-only term for the fact that precedes it. Checked directly against Escrow's own text; no redefinition found. |
| `dispute_state` enum values (`opened`, `under_review`, `decision_issued`, `execution_blocked`, `resolved`, `dismissed`, `withdrawn`) vs. the pre-existing bare `disputed` value on `project_state`/`milestone_state`/`escrow_status` | No collision: the three existing enums are repository artifacts predating this document and are cited in Section 28 of `disputes.md` as the current (narrow) repository state, not redefined as the target enum. The target `dispute_state` type is new and does not reuse or alias any existing enum value. |

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

### 6.6 This batch's changes (Disputes governance and specification)

| Change | Document(s) | Nature |
| --- | --- | --- |
| Added `DISPUTES` to the permitted domain-token list (Section 11) and updated the `09-moderation-trust-safety/` directory-map row (Documentation Map and Section 4) to name Disputes alongside the still-unwritten Moderation domain | `00-governance/README.md` | Minimal Governance amendment resolving `BLOCKER-1`; MINOR bump 1.1.0 → 1.2.0 |
| Created the canonical Disputes domain specification | `09-moderation-trust-safety/disputes.md` | New document, Proposed, 0.1.0 |
| Corrected the "Dispute Evidence" purpose's Owner Domain cell from "Unresolved — case domain or Moderation" to Disputes | `03-identity-profiles-verification/assets-and-media.md` | One-cell correction; MINOR bump 1.0.0 → 1.1.0 |
| Corrected the "Dispute opened / response required / resolved" topic row's Source domain cell to reference `disputes.md`, removing the "blocked pending Governance ownership decision" language | `10-notifications/notifications.md` | One-cell correction; PATCH bump 0.1.0 → 0.1.1 |
| Fixed a stale `../10-notifications/` directory link (predating `notifications.md`'s existence) to point at its canonical topic-matrix anchor | `05-projects-milestones/milestones.md` | Link-target fix; PATCH bump 1.1.0 → 1.1.1 |
| Resolved the "dedicated Disputes entity" Open Question; corrected two "gap, not resolved" Notes passages (Projects and Escrow domain write-ups) and the Escrow ownership-matrix row and domain-map edge label to reflect that Disputes is now a governed sibling domain, not an unresolved gap | `01-foundation/system-architecture.md` | Targeted corrections to five passages; MINOR bump 1.3.0 → 1.4.0 |

No other document required a change: `projects.md`, `milestones.md` (beyond the link fix above), `escrow.md`, `ratings.md`, and `messaging.md` each already correctly deferred to "a future Disputes specification" by description, and every specific citation this batch checked (Milestones Question Q11, Escrow Question EQ6, the Projects/Milestones/Escrow cancellation matrices' "resolution" language) is confirmed satisfied by `disputes.md`, not contradicted by it ([Disputes Section 3.3](../09-moderation-trust-safety/disputes.md#33-reconciliation-items), items `DIR2`, `DIR3`, `DIR7`).

## 7. BLOCKER

| ID | Finding | Classification | Resolution |
| --- | --- | --- | --- |
| BLOCKER-1 | ~~Disputes has no governed owner.~~ | **RESOLVED, 2026-09-25** | Governance Section 11 now includes `DISPUTES` as a permitted domain token (version 1.2.0); Governance Section 4's `09-moderation-trust-safety/` directory-map row now names Disputes alongside the still-unwritten Moderation domain, without renaming, renumbering, or displacing Moderation's own future assignment ([Governance Section 6.6](#66-this-batchs-changes-disputes-governance-and-specification)). The canonical [Disputes specification](../09-moderation-trust-safety/disputes.md) now exists, Proposed, 0.1.0, with its own governed identifier families, a complete lifecycle, eligibility, evidence, adjudication, and financial-resolution model, and explicit cross-domain contracts with Projects, Milestones, Escrow, Assets, Messaging, Ratings, and Notifications. |

`BLOCKER-1` is marked Resolved only because governed Disputes ownership and its canonical specification now exist *consistently* with every domain that already referred to "a future Disputes specification" — verified section by section in [Disputes Section 3.3](../09-moderation-trust-safety/disputes.md#33-reconciliation-items) (items `DIR1`–`DIR9`) and cross-checked independently by this audit (Sections 4, 6.6 above). Funded-cancellation compensation (Escrow EQ3, Disputes EQ2) was decided on 2026-10-01. Broader post-payout recovery (Escrow EQ5, Disputes EQ1) stays open. Milestones' Question Q11 and Escrow's Question EQ6 are answered by `disputes.md` (Sections 8, 15, 17).

## 8. P0 (requires a decision before implementation planning can proceed for the affected domain)

| ID | Finding | Classification | Decision required from |
| --- | --- | --- | --- |
| P0-1 | Resolved 2026-10-01. The rating scale is whole integers from 1 through 5 (Ratings EQ1). | Resolved | Product decision |
| P0-2 | Resolved 2026-10-01. Resend is the email provider (Notifications EQ1). Live delivery waits on credentials. | Resolved | Product decision |
| P0-3 | The exact review-period and platform-intervention operational values (duration, contact-attempt count, channels) for Milestones' Buyer non-response process are deliberately left as configuration, not invented (Milestones Question Q18). | Requires Product/Operations Decision | Product, Operations |
| P0-4 | Escrow EQ6 is answered by `disputes.md`. Funded-cancellation compensation is resolved 2026-10-01 (Escrow EQ3, Disputes EQ2): a mutual award, no automatic percentage. Broader post-payout recovery stays open (Escrow EQ5, Disputes EQ1). | Recovery beyond the affected transaction remains a Product/Legal/Finance decision | [Disputes Section 33.3](../09-moderation-trust-safety/disputes.md#333-prioritized-open-questions), EQ1 |

## 9. P1

| ID | Finding | Classification |
| --- | --- | --- |
| P1-1 | Resolved 2026-10-01. The collection window is 14 calendar days (Ratings EQ2). | Resolved |
| P1-2 | Resolved 2026-10-01. Push and SMS are out of MVP (Notifications EQ2). | Resolved |
| P1-3 | Resolved 2026-10-01. Maximum external delivery attempts are 3 (Notifications EQ3). | Resolved |
| P1-4 | Messaging's real-time-vs-poll delivery choice (Messaging Question EQ1). | Requires Engineering Decision (not a documentation blocker) |
| P1-5 | Whether Messaging read state is ever shown to the counterparty as a receipt (Messaging Question EQ2). | Requires Product Decision |
| P1-6 | A future governed change/add-on mechanism for voluntary work beyond a locked per-Milestone revision allowance (Milestones Question Q19). | Requires Product/Architecture Decision |
| P1-7 | Moderation itself remains entirely unwritten within `09-moderation-trust-safety/`; Ratings' and Messaging's moderation contracts (Sections 13/15 of each) and Disputes' own Moderator-evidence-access role (Disputes Section 13.1) are forward-looking and cannot be implemented until it exists. | Requires future documentation work (not a defect) |
| P1-8 | Disputes' exact response-window, review-assignment, and rate-limiting durations are deliberately left as configuration (Disputes Questions EQ3, EQ4), consistent with how Milestones and Ratings treat their own analogous durations. | Requires Product/Operations Decision |
| P1-9 | Disputes' case-assignment mechanism (round-robin, queue, or manual) is not decided (Disputes Question EQ5). | Requires Product/Operations Decision |

## 10. P2

| ID | Finding | Classification |
| --- | --- | --- |
| P2-1 | The required glossary at `docs/99-appendices/glossary.md` still does not exist; every domain document's local Terminology section remains provisional pending it (tracked previously in Milestones Q16, Projects P2, Deliverables EQ9; this batch's three new documents now disclose the same gap, Section 6.3 above). | Requires Governance/future documentation work |
| P2-2 | `milestones.md` carries version `1.1.1` while Status remains `Proposed`; Governance Section 10.2 explicitly permits `0.x.y` for Draft but is silent on whether a `1.x` version is appropriate for Proposed. Not a defect this batch introduced (the document was already at `1.0.0` Proposed before the prior batch); flagged for a future Governance clarification. | Requires Governance Decision |
| P2-3 | "Review" is used as an ordinary word in Deliverables (the inspection act) and as part of a Ratings-owned term ("Review Evidence," "review text") without a glossary to disambiguate (Section 5 above). | Editorial, deferred to the future glossary |
| P2-4 | Resolved 2026-10-01. `roles.md` 1.0.2 records the non-public first-Administrator bootstrap. The earlier "bootstrap process TBD" text is gone. | Resolved |
| P2-5 | Which governed families should replace the provisional `SPEC-*`/`EVT-*`/`OPS-*` identifiers used by nine documents across the tree (repeated in every affected document's own Open Questions, including Disputes Question EQ10). | Requires Governance Decision |
| P2-6 | Whether a decision may ever be corrected after issuance under documented exceptional policy, whether a follow-up Dispute needs its own narrower eligibility review, and whether a `PROJECT`-scope resolution instruction carries a per-allocation breakdown or is issued per-allocation (Disputes Questions EQ6, EQ7, EQ8). | Requires Product/Legal/Architecture Decision |
| P2-7 | Whether a Dispute finding should be able to request Ratings moderation review, and whether dispute history should ever feed a reputation projection (Disputes Question EQ9). | Requires Product Decision |

## 11. Requires Legal/Risk decision

Funded-cancellation compensation and the MVP fee schedule were decided on 2026-10-01. Broader post-payout chargeback recovery (Escrow EQ5, Disputes EQ1) stays open. MusicApp does not calculate tax withholding. Retention periods stay open.

## 12. Implementation-only gaps (no decision needed, only engineering work)

- Every table, route, and UI component for Ratings, Messaging, and Notifications: **Not Implemented**, verified directly (each document's own repository-comparison section).
- The Phase 1 reconciliation's new fields (`revision_allowance`, `submission_requirements`, `DATA-PROJECTS-017`) and new Milestones transition (M18): **Not Implemented**, schema and route work only, no further decision required beyond the P0/P1 items already listed.
- Escrow's `BR-ESCROW-049` (treat both release-eligibility sources identically): **Not Implemented**, and requires no design decision — the two source Milestones records already exist as separate types.

## 13. Repository-status audit

Every new or reconciled document's repository claims were checked directly against `backend/db/*.sql` (all eight migrations), `backend/Index.js` (all twelve routes), `frontend/src/App.tsx`, both `package.json` files, and a repository-wide search for a `tests` directory, following the same method each document's own "Verified repository comparison" section discloses. No claim of existing behavior was found unsupported by that evidence, and no target behavior is mislabeled as implemented anywhere in this batch's output. `git status --short` before this audit's own commit showed no unrelated tracked modification and `.vscode/` untracked throughout.

`disputes.md`'s own repository comparison (its Section 28) was independently spot-checked: `projects.dispute_reason TEXT` and the bare `disputed` value on `project_state`, `milestone_state`, and `escrow_status` are confirmed as the complete Dispute-adjacent repository footprint, with no table, route, service, or test found beyond them — classified correctly as Not Implemented throughout, with the single `disputed` enum value correctly labeled Schema Implemented rather than overclaimed.

## 14. MVP specification readiness assessment

| Domain | Readiness for implementation planning |
| --- | --- |
| Projects, Milestones, Deliverables, Escrow, Payments | Ready to plan, subject to their own pre-existing P0/P1 items |
| Ratings and Reputation | Ready to plan. The scale is 1–5 and the window is 14 calendar days |
| Messaging and Collaboration | Ready to plan; MVP scope is deliberately narrow and self-contained |
| Notifications | Ready to plan. Resend is selected. Push and SMS are out of MVP. Live email delivery waits on credentials |
| Disputes | **Ready to plan.** `BLOCKER-1` is resolved. Funded-cancellation compensation is the mutual award. Broader post-payout recovery stays open and gates only that recovery path. |
| Moderation | Not written this batch; Ratings', Messaging's, and Disputes' moderation contracts are forward-compatible stubs, not blockers to those domains' own MVP paths. |

**Overall:** with `BLOCKER-1` resolved, the specification baseline is implementation-ready piecemeal for every domain. The rating scale and the email provider are decided. Milestones Q18 and broader post-payout recovery remain open. Section 15 makes the explicit readiness-gate determination for planning as a whole.

## 15. Readiness gate determination

**Question:** is the MusicApp MVP specification baseline sufficiently defined to begin implementation planning?

**Determination: PASS.**

**Rationale.** `BLOCKER-1` is resolved (Section 7). The 2026-10-01 decisions resolved the rating scale, the email provider, the fee schedule, funded-cancellation compensation, and the Cashfree, Cloudflare R2, and Resend selections. Milestones Q18 durations and post-payout recovery beyond the affected transaction remain open. Neither blocks decomposing the MVP into a build sequence.

**Classification of every remaining unresolved item**, per the task's required A/B/C/D framework:

| Item | Classification | Reasoning |
| --- | --- | --- |
| P0-1 (Ratings score scale) | Resolved 2026-10-01 | Whole integers 1 through 5 |
| P0-2 (Notifications email provider) | Resolved 2026-10-01 | Resend. Live delivery waits on credentials |
| P0-3 (Milestones review-period/intervention durations) | **B** — does not block planning | Blocks tuning the non-response scheduled job's exact timing; the state machine, transitions, and every other domain's planning proceed unaffected |
| P0-4 (Disputes/Escrow: post-payout liability, funded-cancellation compensation) | Compensation resolved 2026-10-01. Broader recovery stays open | Mutual award is decided. Recovery beyond the affected transaction is not |
| P1-1, P1-2, P1-3 | Resolved 2026-10-01 | 14-day window, push and SMS out of MVP, maximum 3 delivery attempts |
| P1-4–P1-9 (real-time-vs-poll, read receipts, change-order mechanism, Moderation unwritten, Disputes durations, Disputes assignment mechanism) | **B** — do not block planning | These items were not decided on 2026-10-01 |
| P2-4 | Resolved 2026-10-01 | The first-Administrator bootstrap is recorded. The `roles.md` TBD text is gone |
| P2-1–P2-3 and P2-5–P2-7 (glossary, milestones.md version-vs-status, "review" terminology, provisional `SPEC`/`EVT`/`OPS` families, Disputes decision-correction/follow-up/instruction-schema questions, Disputes-Ratings interaction) | **D** — implementation detail / documentation debt | These items were not decided on 2026-10-01 |
| Moderation itself (unwritten) | **C** — future / post-MVP | No MVP transaction step (Section 26 of the implementation plan, if this gate passes) requires Moderation; Ratings, Messaging, and Disputes each degrade gracefully with Moderation absent, exactly as their own specifications already state |
| Payment provider selection (Escrow/Payments Question EQ13) | Resolved 2026-10-01 | Cashfree. The adapter stays provider-neutral. Production activation waits for Cashfree approval |
| Fee rates and kinds (Escrow Question EQ1) | Resolved 2026-10-01 | Seller commission 10%. Buyer fee 0%. Activation fee 0% |

No item is classified **A** (blocks implementation planning). The 2026-10-01 decisions resolved the examples this section previously used for an unknown payment provider and an unresolved compensation policy.

## 16. Version history

| Version | Date | Change | Author |
| --- | --- | --- | --- |
| 0.1.0 | 2026-09-25 | Initial cross-document specification-consistency audit following the specification-foundation batch (Phase 1 reconciliation; Disputes ownership blocker recorded; Ratings, Messaging, and Notifications created). Zero duplicate identifiers found; two pre-existing structural defects found and fixed (a broken-link set in `users.md`, a heading-level skip in `authorization.md`); one architectural BLOCKER recorded (Disputes ownership); open-question consolidation completed. | Documentation Working Group |
| 0.2.2 | 2026-10-01 | The headline, readiness summary, and Section 15 rows no longer list the decided P0/P1/P2 items as open. | Product |
| 0.2.1 | 2026-10-01 | Marked the 2026-10-01 Product decisions resolved in Sections 8–11, 14, and 15. Broader post-payout recovery and Milestones Q18 stay open. The readiness gate stays PASS. | Product |
| 0.2.0 | 2026-09-25 | Re-run following governed Disputes ownership resolution and the creation of `disputes.md`. `BLOCKER-1` marked Resolved (Section 7); baseline inventory updated for six modified documents and one new document (Section 2); identifier audit extended to the new `DISPUTES` family with zero collisions found (Section 3); ownership audit updated for the resolved "Dispute Evidence" purpose (Section 4); terminology audit extended for Disputes-introduced terms (Section 5); this batch's five targeted cross-document fixes recorded (Section 6.6); two inherited P0 items and eight new P1/P2 items added from Disputes' own Open Questions (Sections 8–10); repository-status audit extended to `disputes.md` (Section 13); MVP readiness assessment updated, Disputes reclassified Ready to plan (Section 14); added Section 15, the explicit readiness-gate determination required before implementation planning may begin — **PASS**, with every remaining item classified A/B/C/D and none classified A. | Documentation Working Group |
