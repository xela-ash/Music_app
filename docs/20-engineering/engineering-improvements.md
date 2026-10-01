# MusicApp engineering improvements register

| Field | Value |
|---|---|
| Document ID | `ENG-IMPROVEMENTS` (provisional; entries use the non-governed `ENG-IMP-NNN` family, [Governance §4.1](../00-governance/README.md#41-engineering-control-documents)) |
| Type | Reference (REF): engineering backlog, not a requirement specification |
| Status | Proposed |
| Owner | Engineering (interim: repository maintainers) |
| Version | 0.7.29 |
| Last Reviewed | 2026-10-01 |
| Applies To | Technical improvements recommended by any human engineer or AI agent working in this repository |
| Supersedes / Superseded By | None |

## 1. Purpose

This is MusicApp's permanent backlog of recommended technical improvements. When Claude, Cursor, or a human engineer finds something worth improving that is outside the current issue's scope, they record it here instead of fixing it inline or forgetting it.

> **An improvement entry is not authorization to implement it.**
>
> An entry may be implemented only when one of the following is true:
>
> 1. an approved GitHub Issue exists for it; or
> 2. the current issue's acceptance criteria explicitly include it; or
> 3. a human has explicitly approved it, where the workflow permits.
>
> An agent MUST NOT implement an entry because it is recorded here, marked `ACCEPTED`, or looks small.

This register does not restate findings the canonical specifications already own. If a specification records a `SEC-*` finding, an Open Question, or a gap in its repository comparison, the specification is where that item is tracked, and it is listed in Section 6 only as a cross-reference. Product behavior is never decided here. An entry with `Product behavior impact: Yes` or `Specification impact: Yes` needs the owning specification changed first.

## 2. How to use this register

### 2.1 During every issue

If you discover something technically worth improving that is outside your issue's scope:

1. **Do not implement it.**
2. Add a new `ENG-IMP` entry, or update the existing one if it is already recorded, using the format in Section 4.
3. Continue the current issue.
4. Mention the entry in the PR notes if it is relevant to reviewers.

Reviewers do the same for non-blocking **improvements** they raise in review ([Handbook §19](engineering-handbook.md#19-code-review)).

### 2.2 Rules

- IDs are sequential, stable, and never reused. A rejected or superseded entry keeps its ID.
- Record only improvements backed by concrete evidence: a file and line, a reproducible behavior, or a measurement. Do not add generic best-practice wishes.
- Search the register and the relevant specification before adding an entry, to avoid duplicates.
- New entries start as `PROPOSED`. Only a human reviewer moves an entry to `ACCEPTED` or `REJECTED`. An agent never promotes its own entry.
- When an entry is implemented, set `IMPLEMENTED`, fill in `Related GitHub Issue`, `Related PR`, and `Resolution`, and add a line to the build record's change history.

### 2.3 Statuses

| Status | Meaning |
|---|---|
| `PROPOSED` | Recorded with evidence. Not reviewed. Not authorized. |
| `ACCEPTED` | A human agrees it is worth doing. Still not authorized until it has an issue or explicit approval. |
| `PLANNED` | An approved GitHub Issue exists, or the item is in an issue's acceptance criteria. |
| `IMPLEMENTED` | Merged. The resolution is recorded. |
| `REJECTED` | A human decided not to do it. The reason is recorded. |
| `SUPERSEDED` | Replaced by another entry, a specification item, or a plan item, which the entry names. |

## 3. Categories

Architecture · Security · Performance · Reliability · Database · Testing · Observability · Developer Experience · CI/CD · Dependency · Maintainability · Scalability · Accessibility · Technical Debt · Cost · Documentation

## 4. Entry format

Copy this template for each new entry:

```markdown
### ENG-IMP-NNN Short title

| Field | Value |
|---|---|
| ID | ENG-IMP-NNN |
| Title | |
| Date identified | YYYY-MM-DD |
| Identified by | Name or agent (and the issue or PR being worked on) |
| Category | One or more of Section 3 |
| Affected subsystem | Build record subsystem name |
| Current state | What exists today (cite files and lines) |
| Evidence / problem | Concrete evidence |
| Suggested improvement | |
| Expected benefit | |
| Risk of doing nothing | |
| Implementation risk | |
| Estimated scope | S / M / L, with a one-line reason |
| Dependencies | MVP-* / ENG-IMP-* / decisions |
| Product behavior impact | Yes / No |
| Specification impact | Yes / No |
| Migration impact | Yes / No |
| Security impact | |
| Performance impact | |
| Priority suggestion | Low / Medium / High |
| Recommended timing | |
| Status | PROPOSED |
| Related GitHub Issue | — |
| Related PR | — |
| Resolution | — |
```

## 5. Register

### 5.1 Index

| ID | Title | Category | Priority suggestion | Status |
|---|---|---|---|---|
| [ENG-IMP-001](#eng-imp-001-migration-runner-cannot-detect-edited-migrations-and-records-applied-state-non-atomically) | Migration runner cannot detect edited migrations and records applied state non-atomically | Database, Reliability | Medium | PROPOSED |
| [ENG-IMP-002](#eng-imp-002-frontend-api-client-is-untyped-and-outside-lint-scope) | Frontend API client is untyped and outside lint scope | Maintainability, Developer Experience | Low | PROPOSED |
| [ENG-IMP-003](#eng-imp-003-frontend-api-base-url-is-hardcoded) | Frontend API base URL is hardcoded | Developer Experience, CI/CD | Medium | PROPOSED |
| [ENG-IMP-004](#eng-imp-004-no-backend-lint-and-no-repository-formatter) | No backend lint and no repository formatter | Developer Experience, CI/CD | Medium | PROPOSED |
| [ENG-IMP-005](#eng-imp-005-configuration-is-loaded-implicitly-and-silently-falls-back-to-defaults) | Configuration is loaded implicitly and silently falls back to defaults | Reliability, Security | Medium | PROPOSED |
| [ENG-IMP-006](#eng-imp-006-transaction-boilerplate-is-duplicated-and-rollback-can-mask-the-original-error) | Transaction boilerplate is duplicated and ROLLBACK can mask the original error | Reliability, Maintainability | Medium | PROPOSED |
| [ENG-IMP-007](#eng-imp-007-no-central-error-handling-unhandled-and-body-parse-errors-reach-expresss-default-handler) | No central error handling; unhandled and body-parse errors reach Express's default handler | Security, Reliability | High | PROPOSED |
| [ENG-IMP-008](#eng-imp-008-toolchain-versions-are-not-pinned) | Toolchain versions are not pinned | Developer Experience | Low | PROPOSED |
| [ENG-IMP-009](#eng-imp-009-mvp-implementation-plan-has-incorrect-dependency-cross-references) | MVP implementation plan has incorrect dependency cross-references | Documentation | High | IMPLEMENTED |
| [ENG-IMP-010](#eng-imp-010-mvp-plan-summary-statements-contradicted-its-own-dependency-table) | MVP plan summary statements contradicted its own dependency table | Documentation | High | IMPLEMENTED |
| [ENG-IMP-011](#eng-imp-011-mvp-plan-has-no-work-item-for-the-payout-workflow-required-by-the-vertical-slice) | MVP plan has no work item for the payout workflow required by the vertical slice | Documentation, Architecture | High | IMPLEMENTED |
| [ENG-IMP-012](#eng-imp-012-mvp-plan-is-ambiguous-about-the-single-classification-of-mixed-scope-items) | MVP plan is ambiguous about the single classification of mixed-scope items | Documentation | Medium | IMPLEMENTED |
| [ENG-IMP-013](#eng-imp-013-release-and-financial-commands-are-not-wired-to-verification-and-idempotency-foundations) | Release and financial commands are not wired to verification and idempotency foundations | Documentation, Architecture | Medium | PROPOSED |
| [ENG-IMP-014](#eng-imp-014-mvp-009-cites-the-login-section-instead-of-the-email-verification-and-password-reset-sections) | MVP-009 cites the login section instead of the email-verification and password-reset sections | Documentation | Medium | IMPLEMENTED |
| [ENG-IMP-015](#eng-imp-015-project-term-version-record-required-by-mvp-015-is-not-defined-by-the-projects-specification) | Project term-version record required by MVP-015 is not defined by the Projects specification | Documentation, Architecture, Database | High | IMPLEMENTED |
| [ENG-IMP-016](#eng-imp-016-password-reset-requires-session-revocation-that-no-mvp-work-item-builds) | Password reset requires session revocation that no MVP work item builds | Documentation, Architecture, Security | Medium | PROPOSED |
| [ENG-IMP-017](#eng-imp-017-characterization-suite-binds-a-fixed-port-4000) | Characterization suite binds a fixed port 4000 | Testing, Reliability | Medium | IMPLEMENTED |
| [ENG-IMP-018](#eng-imp-018-characterization-db_port-guard-misses-an-omitted-port) | Characterization `DB_PORT` guard misses an omitted port | Testing, Reliability | Medium | IMPLEMENTED |
| [ENG-IMP-019](#eng-imp-019-frontend-comments-still-cite-backendindexjs-for-moved-constants) | Frontend comments still cite `backend/Index.js` for moved constants | Documentation, Maintainability | Low | PROPOSED |
| [ENG-IMP-020](#eng-imp-020-build-record-section-4-verification-stamp-predates-the-mvp-001-baseline) | Build Record Section 4 verification stamp predates the MVP-001 baseline | Documentation | Low | PROPOSED |
| [ENG-IMP-021](#eng-imp-021-cloud-image-corepack-cannot-follow-current-releases-on-node-22140) | Cloud image corepack cannot follow current releases on Node 22.14.0 | Developer Experience, Dependency | Low | PROPOSED |
| [ENG-IMP-022](#eng-imp-022-handbook-current-state-snapshots-predate-mvp-001-and-mvp-002) | Handbook current-state snapshots predate MVP-001 and MVP-002 | Documentation | Low | PROPOSED |
| [ENG-IMP-023](#eng-imp-023-outbox-dispatcher-has-no-process-runner-transport-or-alerting) | Outbox dispatcher has no process runner, transport, or alerting | Reliability, Observability, Architecture | Medium | PROPOSED |
| [ENG-IMP-024](#eng-imp-024-shared-infrastructure-helper-edge-cases-from-the-mvp-003-review) | Shared infrastructure helper edge cases from the MVP-003 review | Reliability, Security, Maintainability | Low | PROPOSED |
| [ENG-IMP-028](#eng-imp-028-future-authenticatable-statuses-are-not-covered-by-an-http-test) | Future authenticatable statuses are not covered by an HTTP test | Testing | Low | PROPOSED |
| [ENG-IMP-029](#eng-imp-029-projectcreate-seller-eligibility-is-a-boolean-the-caller-supplies) | project.create seller eligibility is a boolean the caller supplies | Authorization | Low | PROPOSED |
| [ENG-IMP-030](#eng-imp-030-profile-search-uses-an-unindexed-leading-wildcard) | Profile search uses an unindexed leading wildcard | Database, Performance | Low | PROPOSED |
| [ENG-IMP-031](#eng-imp-031-profile-search-dimensions-cannot-be-combined-with-and) | Profile search dimensions cannot be combined with AND | API, Discovery | Low | PROPOSED |
| [ENG-IMP-032](#eng-imp-032-project-creation-still-writes-seller_user_id-before-acceptance) | Project creation still writes seller_user_id before acceptance | Database, Authorization | Medium | PROPOSED |
| [ENG-IMP-033](#eng-imp-033-seller-invitation-expiry-has-no-maximum-duration) | Seller invitation expiry has no maximum duration | API, Security | Low | PROPOSED |
| [ENG-IMP-034](#eng-imp-034-terminal-invitation-rows-can-be-updated) | Terminal invitation rows can be updated | Database | Medium | PROPOSED |
| [ENG-IMP-035](#eng-imp-035-invitation-review-returns-the-full-proposal-after-a-terminal-outcome) | Invitation review returns the full proposal after a terminal outcome | API, Security | Low | PROPOSED |
| [ENG-IMP-036](#eng-imp-036-three-notification-topics-have-no-single-mandatory-class) | Three notification topics have no single mandatory class | Documentation, Architecture | Medium | PROPOSED |
| [ENG-IMP-037](#eng-imp-037-verified-notification-events-do-not-check-the-topics-owning-domain) | Verified notification events do not check the topic's owning domain | Architecture | Low | PROPOSED |
| [ENG-IMP-038](#eng-imp-038-notification-intent-class-is-not-tied-to-the-topic) | Notification intent class is not tied to the topic | Database | Low | PROPOSED |
| [ENG-IMP-039](#eng-imp-039-notification-preferences-have-no-user-settings-store) | Notification preferences have no User Settings store | Architecture | Medium | PROPOSED |
| [ENG-IMP-040](#eng-imp-040-quiet-hours-and-digest-are-not-applied) | Quiet hours and digest are not applied | Architecture | Low | PROPOSED |
| [ENG-IMP-042](#eng-imp-042-completed-send-idempotency-payloads-keep-the-pre-tombstone-body) | Completed send idempotency payloads keep the pre-tombstone body | Security, Database | Low | PROPOSED |
| [ENG-IMP-043](#eng-imp-043-an-active-seller-receives-409-on-a-buyer-only-project-command) | An active seller receives 409 on a buyer-only project command | Authorization | Low | PROPOSED |
| [ENG-IMP-044](#eng-imp-044-invite-checks-an-accepted-seller-before-the-idempotency-store) | Invite checks an accepted seller before the idempotency store | API, Idempotency | Low | PROPOSED |
| [ENG-IMP-045](#eng-imp-045-project-transition-audit-and-outbox-omit-named-fact-fields) | Project transition audit and outbox omit named fact fields | Audit | Low | PROPOSED |
| [ENG-IMP-046](#eng-imp-046-amendment-expiry-has-no-maximum-duration) | Amendment expiry has no maximum duration | API, Security | Low | PROPOSED |
| [ENG-IMP-047](#eng-imp-047-amendment-relationship-checks-are-not-in-authorize) | Amendment relationship checks are not in authorize() | Authorization | Low | PROPOSED |
| [ENG-IMP-048](#eng-imp-048-amendment-transition-table-is-not-called-by-the-service) | Amendment transition table is not called by the service | Maintainability | Low | PROPOSED |
| [ENG-IMP-049](#eng-imp-049-a-matching-later-snapshot-can-move-the-agreed-pointer-without-an-amendment) | A matching later snapshot can move the agreed pointer without an amendment | Database | Low | PROPOSED |

### ENG-IMP-001 Migration runner cannot detect edited migrations and records applied state non-atomically

| Field | Value |
|---|---|
| ID | ENG-IMP-001 |
| Title | Migration runner cannot detect edited migrations and records applied state non-atomically |
| Date identified | 2026-09-25 |
| Identified by | Claude Code (Opus 5.5), engineering-controls setup, initial repository review |
| Category | Database, Reliability |
| Affected subsystem | Database / migrations |
| Current state | `backend/db/migrate.js:10-36` records only `filename` in `schema_migrations`. It applies each file with one `client.query(sql)` (each file does its own `BEGIN`/`COMMIT`), then inserts the tracking row in a separate statement. |
| Evidence / problem | (a) There is no checksum, so editing an already-applied migration is silently ignored on databases that already ran it but applied on fresh ones. The two schemas then diverge with no error. (b) If the process stops after a file's `COMMIT` and before the tracking `INSERT`, the next run re-applies the file. The existing files are written idempotently (`IF NOT EXISTS`, `pg_type`/`pg_constraint` guards), which reduces the damage today, but nothing requires future files to be idempotent. |
| Suggested improvement | Store a content hash per applied migration and fail when an applied file's hash changes. Record the tracking row inside the same transaction as the migration body, which requires the runner to own `BEGIN`/`COMMIT` instead of each file. |
| Expected benefit | Enforces the handbook's "never edit an applied migration" rule mechanically. Removes the re-apply window. |
| Risk of doing nothing | Schema drift between environments that no one notices. Financial and audit tables could differ from what reviewers approved. |
| Implementation risk | Low to medium. Changing who owns `BEGIN`/`COMMIT` affects all eight existing files. Hashes for existing rows need a one-time backfill. |
| Estimated scope | S: one runner file plus one tracking-column migration |
| Dependencies | Best done with or after MVP-004 (the CI migration dry-run) |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | Yes: adds a column to `schema_migrations` |
| Security impact | Indirect: protects the integrity of the reviewed schema |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | Before the first financial-table migration (MVP-024/MVP-026) |
| Status | PROPOSED |
| Related GitHub Issue | — |
| Related PR | — |
| Resolution | — |

### ENG-IMP-002 Frontend API client is untyped and outside lint scope

| Field | Value |
|---|---|
| ID | ENG-IMP-002 |
| Title | Frontend API client is untyped and outside lint scope |
| Date identified | 2026-09-25 |
| Identified by | Claude Code (Opus 5.5), engineering-controls setup, initial repository review |
| Category | Maintainability, Developer Experience |
| Affected subsystem | Frontend |
| Current state | `frontend/src/api/api.js` is the only channel to the backend and is plain JavaScript. `tsconfig.app.json` sets `allowJs` without `checkJs`. `eslint.config.js` lints `**/*.{ts,tsx}` only. `App.tsx` casts every response (`as Session`, `as CreateProjectResponse`). |
| Evidence / problem | The one module every request passes through gets neither type checking nor linting. Every response type is an unchecked cast, so a backend shape change (money or state fields included) compiles cleanly and fails at runtime. |
| Suggested improvement | Convert the client to TypeScript (`api.ts`) with typed `apiGet<T>`/`apiPost<T>` signatures. Consider narrowing or validating money and state fields at the boundary. |
| Expected benefit | Compile-time detection of client-side contract drift. The strict tsconfig and lint rules then cover the whole frontend. |
| Risk of doing nothing | Silent contract drift between tiers as more endpoints are added. |
| Implementation risk | Low: a small file, and callers already pass typed values |
| Estimated scope | S |
| Dependencies | None. Could accompany MVP-002 (frontend test runner) or the first frontend issue that touches the client. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | None directly |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | The next approved issue that changes the API client |
| Status | PROPOSED |
| Related GitHub Issue | — |
| Related PR | — |
| Resolution | — |

### ENG-IMP-003 Frontend API base URL is hardcoded

| Field | Value |
|---|---|
| ID | ENG-IMP-003 |
| Title | Frontend API base URL is hardcoded |
| Date identified | 2026-09-25 |
| Identified by | Claude Code (Opus 5.5), engineering-controls setup, initial repository review |
| Category | Developer Experience, CI/CD |
| Affected subsystem | Frontend, Deployment / infrastructure |
| Current state | `frontend/src/api/api.js:1` has `const API_BASE = "http://localhost:4000";`. [System Architecture §4.1](../01-foundation/system-architecture.md#41-deployment-topology) records this fact. No plan item changes it. |
| Evidence / problem | Every build only works against a local backend. An end-to-end test environment (plan §9 prerequisite state), a staging environment, or production cannot be targeted without editing source. |
| Suggested improvement | Read the base URL from a Vite environment variable (`import.meta.env.VITE_API_BASE_URL`) and keep the current value as the local-development default. |
| Expected benefit | The same code runs locally, in CI end-to-end runs, and in deployed environments. |
| Risk of doing nothing | MVP-051 (vertical-slice end-to-end suite) and any deployment will need source edits or workarounds. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | Should land before MVP-051, or before any non-local deployment |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | Enables HTTPS API origins outside local development. It pairs with the CORS allowlist in `SEC-AUTH-004`. |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | Before MVP-051 or the first deployment issue |
| Status | PROPOSED |
| Related GitHub Issue | — |
| Related PR | — |
| Resolution | — |

### ENG-IMP-004 No backend lint and no repository formatter

| Field | Value |
|---|---|
| ID | ENG-IMP-004 |
| Title | No backend lint and no repository formatter |
| Date identified | 2026-09-25 |
| Identified by | Claude Code (Opus 5.5), engineering-controls setup, initial repository review |
| Category | Developer Experience, CI/CD |
| Affected subsystem | Backend, Frontend, CI |
| Current state | `backend/package.json` has no lint script and no ESLint dependency. There is no `.prettierrc`, `.editorconfig`, or other formatter configuration anywhere. Style is inconsistent inside the frontend: `main.tsx`/`eslint.config.js` use single quotes and no semicolons, while `App.tsx` uses double quotes and semicolons. |
| Evidence / problem | MVP-004's acceptance criteria require a lint gate in CI, but the backend has no linter for that gate to run. Without a formatter, every contributor's editor settings can create formatting churn, which the handbook forbids in feature PRs. |
| Suggested improvement | Add ESLint (flat config, `@eslint/js` recommended, Node globals) to the backend. Adopt a single formatter repository-wide in one dedicated formatting-only PR, so that later feature diffs stay clean. |
| Expected benefit | Mechanical catching of common defects (unused variables, unreachable code, accidental globals) in the backend. No formatting disputes in review. |
| Risk of doing nothing | MVP-004's lint gate stays frontend-only. Formatting noise hides real changes in diffs. |
| Implementation risk | Low. The one-time formatting PR touches every file, so it should be merged while no feature branches are open. |
| Estimated scope | S (backend lint) + S (formatter PR) |
| Dependencies | Coordinate with MVP-001 (which moves backend code) and MVP-004 (CI) |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | Minor positive: lint catches some defect classes |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | With MVP-004, or immediately after MVP-001 so the formatting PR does not conflict with the decomposition |
| Status | PROPOSED |
| Related GitHub Issue | — |
| Related PR | — |
| Resolution | — |

### ENG-IMP-005 Configuration is loaded implicitly and silently falls back to defaults

| Field | Value |
|---|---|
| ID | ENG-IMP-005 |
| Title | Configuration is loaded implicitly and silently falls back to defaults |
| Date identified | 2026-09-25 |
| Identified by | Claude Code (Opus 5.5), engineering-controls setup, initial repository review |
| Category | Reliability, Security |
| Affected subsystem | Backend |
| Current state | `dotenv` is loaded only inside `backend/db/db.js:1`. `backend/Index.js` reads `process.env.JWT_SECRET` at line 11, which works only because `require("./db/db")` at line 6 runs first. `db.js:4-10` falls back to hardcoded `localhost`/`musicapp`/`musicapp` for every database setting, the password included. The port is hardcoded (`Index.js:922`, `const PORT = 4000`). |
| Evidence / problem | Moving the `require` (which MVP-001's decomposition will do) can silently leave `JWT_SECRET` unset at read time. The startup check at `Index.js:16` would then exit, or, if config moves to a module read earlier, behave differently. A misconfigured deployment connects with the development password instead of failing. |
| Suggested improvement | One config module, loaded first, that reads and validates every variable (`DB_*`, `JWT_*`, `PORT`, and later provider settings). It fails fast when a variable is missing outside local development, and every other module imports config from it instead of reading `process.env`. |
| Expected benefit | Predictable startup, no import-order coupling, and misconfiguration caught at boot. |
| Risk of doing nothing | Config regressions during MVP-001 and later decomposition. A production connection with development credentials. |
| Implementation risk | Low. Behavior must stay unchanged for the local `.env.example` setup. |
| Estimated scope | S |
| Dependencies | Natural companion to MVP-001. Weak-secret rejection is separately owned by `SEC-AUTH-006` and is not duplicated here. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | Positive: removes the silent default database password in non-local environments |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | During or immediately after MVP-001, only if that issue's scope is extended explicitly |
| Status | PROPOSED |
| Related GitHub Issue | — |
| Related PR | — |
| Resolution | — |

### ENG-IMP-006 Transaction boilerplate is duplicated and ROLLBACK can mask the original error

| Field | Value |
|---|---|
| ID | ENG-IMP-006 |
| Title | Transaction boilerplate is duplicated and ROLLBACK can mask the original error |
| Date identified | 2026-09-25 |
| Identified by | Claude Code (Opus 5.5), engineering-controls setup, initial repository review |
| Category | Reliability, Maintainability |
| Affected subsystem | Backend |
| Current state | Three routes repeat `pool.connect()` → `BEGIN` → … → `COMMIT`/`ROLLBACK` → `release()` by hand: `POST /auth/signup` (`Index.js:204-313`), `POST /projects` (`611-770`), and lock-milestones (`837-919`). In signup and `POST /projects`, work runs before `BEGIN` (`bcrypt.hash` at 247, and the seller lookup at 679), but the shared `catch` always issues `ROLLBACK`. The catch blocks call `await client.query("ROLLBACK")` without protecting it. |
| Evidence / problem | (a) If the connection itself has failed, `ROLLBACK` throws inside `catch`. The original error is lost, and the rejection escapes to Express's default handler (see ENG-IMP-007). (b) A `ROLLBACK` with no open transaction only produces a server warning today, but it shows the code does not track whether a transaction is open. (c) Every financial command in Stages 7–9 will need this pattern with idempotency, locking, and outbox writes added. Hand-copying it grows the chance of an error. |
| Suggested improvement | A small `withTransaction(fn)` helper that owns connect/`BEGIN`/`COMMIT`/`ROLLBACK`/`release`, never masks the original error, and is the only way services open a transaction. |
| Expected benefit | One correct implementation of the boundary that every money-moving command relies on. |
| Risk of doing nothing | Divergent transaction handling across financial commands, and lost error context in exactly the failures that need diagnosis. |
| Implementation risk | Low to medium. It touches three working routes and must be behavior-preserving (needs MVP-002's tests first). |
| Estimated scope | S |
| Dependencies | MVP-001 (module structure), MVP-002 (tests to prove no behavior change). Should precede MVP-003. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | Indirect: better failure containment in financial paths |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | Between MVP-002 and MVP-003 |
| Status | PROPOSED |
| Related GitHub Issue | — |
| Related PR | — |
| Resolution | — |

### ENG-IMP-007 No central error handling; unhandled and body-parse errors reach Express's default handler

| Field | Value |
|---|---|
| ID | ENG-IMP-007 |
| Title | No central error handling; unhandled and body-parse errors reach Express's default handler |
| Date identified | 2026-09-25 |
| Identified by | Claude Code (Opus 5.5), engineering-controls setup, initial repository review |
| Category | Security, Reliability |
| Affected subsystem | Backend |
| Current state | `backend/Index.js` registers no error-handling middleware (`(err, req, res, next)`). `express.json()` (`Index.js:52`) rejects malformed JSON by passing the error to the next error handler. `pool.connect()` sits outside `try` in three routes. Each route maps PostgreSQL codes on its own, and the mappings differ: `POST /users` maps `23505`/`23514`, `POST /profiles` maps `23505`/`23503`, `POST /projects` maps six codes, and lock-milestones maps none. |
| Evidence / problem | With no application error handler, those errors reach Express 5's default handler (`finalhandler` 2.1.1 per `backend/package-lock.json`). When `NODE_ENV` is not `production` (nothing in the repository sets it), that handler responds with an HTML page containing the error stack trace, not the `{ error }` JSON contract. Any client can trigger this by sending a malformed JSON body to any `POST` route. *Verified from locked dependency versions and `finalhandler`'s documented behavior. The server was not run for this review because the local `backend/node_modules` is incomplete.* The authentication specification's "public errors omit … stack traces" row ([Authentication §22](../02-users-roles-permissions/authentication.md#22-failure-handling)) covers `err.detail` echoing but not this path. |
| Suggested improvement | A final JSON error-handling middleware that maps body-parse errors to `400 { error }`, known PostgreSQL codes to their client errors in one table, and everything else to `500 { error: "Internal server error" }`, logging the full error on the server only. |
| Expected benefit | One consistent error contract, no stack-trace disclosure, and the same code mapped the same way on every route. |
| Risk of doing nothing | Internal paths and library internals leak to any client, and error responses become more inconsistent as routes multiply. |
| Implementation risk | Low. Existing per-route responses must remain unchanged unless an issue says otherwise. |
| Estimated scope | S |
| Dependencies | Fits MVP-001's decomposition. Consistent with the existing `err.detail` finding in [Authentication §22](../02-users-roles-permissions/authentication.md#22-failure-handling), which it would help close but does not redefine. |
| Product behavior impact | No: error bodies become the already-documented `{ error }` shape |
| Specification impact | No |
| Migration impact | No |
| Security impact | Positive: removes stack-trace disclosure |
| Performance impact | None |
| Priority suggestion | High |
| Recommended timing | With or immediately after MVP-001. Before any environment is reachable outside localhost. |
| Status | PROPOSED |
| Related GitHub Issue | — |
| Related PR | — |
| Resolution | — |

### ENG-IMP-008 Toolchain versions are not pinned

| Field | Value |
|---|---|
| ID | ENG-IMP-008 |
| Title | Toolchain versions are not pinned |
| Date identified | 2026-09-25 |
| Identified by | Claude Code (Opus 5.5), engineering-controls setup, initial repository review |
| Category | Developer Experience |
| Affected subsystem | Repository / tooling |
| Current state | `README.md` says "Node.js (v20+)". Neither `package.json` declares `engines`. The frontend declares no `packageManager`. There is no `.nvmrc` or `.node-version`. The reviewing machine ran Node 24.12.0 and pnpm 10.26.1. The Cursor Cloud image now pins Node.js 22.14.0, corepack 0.34.7, and pnpm 12.5.1 ([EDR-002](engineering-build-record.md#edr-002-cloud-agent-node-toolchain)). That pin is the image only; the manifests are still unpinned. |
| Evidence / problem | CI (MVP-004), human engineers, and agents can each run different Node and pnpm majors against the same lockfiles, so toolchain-dependent failures cannot be reproduced reliably. |
| Suggested improvement | Declare `engines.node` in both manifests, add `packageManager` to the frontend, and add a `.nvmrc` that CI also reads. |
| Expected benefit | The same toolchain locally and in CI. |
| Risk of doing nothing | "Works on my machine" failures once CI exists. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | MVP-004 |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | With MVP-004 |
| Status | PROPOSED |
| Related GitHub Issue | — |
| Related PR | — |
| Resolution | — |

### ENG-IMP-009 MVP implementation plan has incorrect dependency cross-references

| Field | Value |
|---|---|
| ID | ENG-IMP-009 |
| Title | MVP implementation plan has incorrect dependency cross-references |
| Date identified | 2026-09-25 |
| Identified by | Claude Code (Opus 5.5), engineering-controls setup, reading the plan before issue generation |
| Category | Documentation |
| Affected subsystem | Implementation planning (not code) |
| Current state | In [plan §5](../19-implementation-planning/mvp-implementation-plan.md#5-work-items), `MVP-009`'s *Depends on* cell reads "external email provider (MVP-044)", but the email-provider item is `MVP-043` and `MVP-044` is Rating eligibility. `MVP-023`'s *Depends on* cell reads "MVP-034 (in-app notification)", but the in-app notification item is `MVP-041` and `MVP-034` is Dispute response and staff review. Separately, [plan §2](../19-implementation-planning/mvp-implementation-plan.md#2-source-of-truth-and-identifier-conventions) paraphrases `AGENTS.md`'s five-item source-of-truth order. `AGENTS.md` 1.1.0 now adds the engineering handbook and build record between the issue and the repository, so the paraphrase is incomplete but not contradictory. |
| Evidence / problem | GitHub issues are generated one-to-one from these rows, and `AGENTS.md` Section 2 requires dependencies to be merged before an issue starts. As written, `MVP-023` would wait for the wrong item, and `MVP-009` would wait on Ratings instead of the email adapter. |
| Suggested improvement | A Product/Architecture-approved PATCH to the plan correcting the two IDs, and optionally updating the §2 paraphrase to reference `AGENTS.md` rather than restate it. |
| Expected benefit | Correct dependency gating in the generated issues. |
| Risk of doing nothing | Issues are blocked on, or unblocked by, the wrong work. |
| Implementation risk | None: documentation only |
| Estimated scope | S |
| Dependencies | Product/Architecture approval. Agents must not edit the plan themselves ([`AGENTS.md`](../../AGENTS.md) Section 6). |
| Product behavior impact | No |
| Specification impact | Yes: plan-document edit, Product/Architecture-owned |
| Migration impact | No |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | High |
| Recommended timing | Before GitHub issues are generated. At minimum, the generated `MVP-009` and `MVP-023` issues should carry the corrected dependency with this entry cited. |
| Status | IMPLEMENTED (2026-09-25). Corrected directly under an explicit human-approved task ("correct the two known dependency defects"), so the ACCEPTED/PLANNED steps were covered by that approval rather than skipped by an agent. |
| Related GitHub Issue | None. The correction preceded issue generation. |
| Related PR | None. Committed to `docs/specification-foundation` (no PR, per task instruction). |
| Resolution | [`mvp-implementation-plan.md`](../19-implementation-planning/mvp-implementation-plan.md) 0.1.1 (2026-09-25): `MVP-009` *Depends on* now reads "MVP-006, external email provider (MVP-043)", and `MVP-023` now reads "MVP-022, MVP-041 (in-app notification)". Each target was verified by reading the item definitions: `MVP-043` is "Email channel adapter", `MVP-044` is "Rating eligibility and submission", `MVP-041` is "Notification Intent/Delivery schema, in-app channel", and `MVP-034` is Dispute "Response and staff review". Section 4 now notes the two resulting cross-stage item dependencies. The §2 source-of-truth paraphrase was left unchanged: it is incomplete but not contradictory, and it is outside this correction's scope. Correction commit: see [change record](#7-change-record). |

### ENG-IMP-010 MVP plan summary statements contradicted its own dependency table

| Field | Value |
|---|---|
| ID | ENG-IMP-010 |
| Title | MVP plan summary statements contradicted its own dependency table |
| Date identified | 2026-09-25 |
| Identified by | Claude Code (Opus 5.5), full dependency-graph validation before issue generation |
| Category | Documentation |
| Affected subsystem | Implementation planning (not code) |
| Current state | Before the correction, [plan §6](../19-implementation-planning/mvp-implementation-plan.md#6-dependency-matrix-and-critical-path) described its critical path as "the longest true dependency chain": MVP-001 → 003 → 006 → 007 → 011 → 017 → 018 → 019 → 020 → 021 → 022 → 024 → 026 → 028 → 044 → 045 → 051. The same section said the blocking product decisions ("MVP-005 … MVP-044") do not block any other item. |
| Evidence / problem | A topological analysis of the §5 *Depends on* column showed five adjacent pairs in the stated path that are not dependencies: 003→006, 007→011, 011→017, 022→024, 045→051. The actual longest chain is unique: MVP-001 → 006 → 007 → 014 → 015 → 017 → 018 → 019 → 020 → 021 → 022 → 023 → 028 → 044 → 045 → 048 → 049 → 050 → 051 (19 items). Also, `MVP-045`–`047` depend on `MVP-044` (HUMAN-DECISION-REQUIRED, rating scale), and `MVP-048`–`051` depend on it through `MVP-045`, so the "blocks no other item" claim was false for `MVP-044`. |
| Suggested improvement | Replace both statements with what the §5 table actually says. No dependency edge is added or removed. |
| Expected benefit | Issue sequencing and the queue's critical path match the real graph. The rating-scale decision is visibly on the critical path. |
| Risk of doing nothing | Work gets prioritized on a path that is not critical. Product does not see that P0-1 (rating scale) gates the vertical slice. |
| Implementation risk | None: documentation only |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | No |
| Specification impact | Yes: plan-document text (Product/Architecture-owned) |
| Migration impact | No |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | High |
| Recommended timing | Before issue generation |
| Status | IMPLEMENTED (2026-09-25), under the same explicit task approval as ENG-IMP-009. That approval covered correcting objectively wrong references whose intended value is unambiguous. The longest chain is unique, and the `MVP-044` blocking relationship comes directly from the table. |
| Related GitHub Issue | None |
| Related PR | None. Committed to `docs/specification-foundation`. |
| Resolution | Plan 0.1.1: the §6 critical path was replaced with the computed unique longest chain, and the §6 blocking-decisions sentence now states that only `MVP-044`'s decision blocks other items. Correction commit: see [change record](#7-change-record). |

### ENG-IMP-011 MVP plan has no work item for the payout workflow required by the vertical slice

| Field | Value |
|---|---|
| ID | ENG-IMP-011 |
| Title | MVP plan has no work item for the payout workflow required by the vertical slice |
| Date identified | 2026-09-25 |
| Identified by | Claude Code (Opus 5.5), full dependency-graph validation before issue generation |
| Category | Documentation, Architecture |
| Affected subsystem | Implementation planning; Payments, Escrow, and Identity Verification once built |
| Current state | [Plan §3](../19-implementation-planning/mvp-implementation-plan.md#3-the-first-complete-mvp-transaction) step 11 and [§9](../19-implementation-planning/mvp-implementation-plan.md#9-mvp-vertical-slice-checkpoint) require the Seller payout: "Payments pays out `S`", "one completed `payments` payout row", and "a payout-confirmation event". §9's prerequisite also requires "a mock payment provider" and a Seller who is "Identity Verified". [Payments §24](../06-payments-escrow/payments.md#24-staged-implementation-plan) lists the payout workflow as its own Payments-owned stage (12: payout-account model, live gate re-check, provider transfer, per [Payments §11](../06-payments-escrow/payments.md#11-payouts)). Secure webhook processing and the provider-confirmed funding workflow are stages 7–8. |
| Evidence / problem | (1) No `MVP-*` item implements payout execution. `MVP-025` builds only the adapter interface and a mock provider, and its acceptance criterion covers funding confirmation only. `MVP-028` implements Escrow *release*, which [Payments §11.1](../06-payments-escrow/payments.md#111-payout-as-a-separate-operation) defines as a separate operation from payout. (2) `MVP-025` has no dependents, so neither the MVP-045 testability point nor `MVP-051` (the end-to-end suite that requires the mock provider) depends on it, even transitively. (3) `MVP-012` (Identity Verification), which the payout gate and the "Identity Verified" test Seller need, also has no dependents. As planned, `MVP-051`'s acceptance criterion cannot be met by completing its dependency closure. |
| Suggested improvement | A Product/Architecture planning decision is required. The options include: add a new work item for the payout workflow (and possibly webhook-confirmed funding) with explicit dependencies (for example on `MVP-025`, `MVP-028`, `MVP-012`) and make `MVP-048` or `MVP-051` depend on it; **or** expand `MVP-025`/`MVP-028`'s scope and acceptance criteria and add the missing edges. Either way, restate the MVP-045 testability point in §6 afterwards. |
| Expected benefit | The vertical slice is reachable by completing the plan's own dependency graph. Money movement to Sellers has an owned, reviewable work item. |
| Risk of doing nothing | Issues generated from the plan would have no issue owning payout execution, the highest-risk money movement in the transaction. `MVP-051` would be unsatisfiable, or an implementation agent would invent the payout scope, which `AGENTS.md` Section 4 forbids. |
| Implementation risk | None for the documentation change itself |
| Estimated scope | S (documentation) |
| Dependencies | Product/Architecture decision. Agents must not decide it ([`AGENTS.md`](../../AGENTS.md) Sections 4 and 6). |
| Product behavior impact | No: the behavior is already specified in Payments §11. Only its planning is missing. |
| Specification impact | Yes: plan-document change |
| Migration impact | No |
| Security impact | High relevance: payout is a money-movement path that must have explicit authorization, idempotency, and gate re-check work |
| Performance impact | None |
| Priority suggestion | High |
| Recommended timing | **Before GitHub issue generation.** Issue generation was halted on 2026-09-25 pending this decision. |
| Status | IMPLEMENTED (2026-09-25). Product/Architecture decided (Decision 1) that Seller payout execution is its own work item and must not be folded into `MVP-025` or `MVP-028`; the plan change implements that decision. |
| Related GitHub Issue | None. Resolved before issue generation. |
| Related PR | None. Committed to `docs/specification-foundation`. |
| Resolution | [`mvp-implementation-plan.md`](../19-implementation-planning/mvp-implementation-plan.md) 0.2.0 adds `MVP-052` Seller payout execution in Stage 8, classified HUMAN-DECISION-REQUIRED on Payments Question PQ3 (payout schedule and trigger). It depends on `MVP-003` (idempotency and inbox deduplication), `MVP-012` (Identity Verified for the live payout gate), `MVP-025` (adapter `createPayout` and mock provider), and `MVP-028` (release creates the `SELLER_ENTITLEMENT` that payout moves). `MVP-048` now depends on `MVP-052`, so `MVP-048`–`MVP-051` include payout. Plan §6 now defines checkpoint A (through release, without payout: `MVP-045`, `MVP-025`, and `MVP-012` landed) and checkpoint B (including payout: `MVP-045` and `MVP-052` landed; `MVP-048` is the first single item whose dependency chain contains both). The §9 prerequisite includes `MVP-052` and forbids claiming a completed payout before it. Real rails (PQ1/EQ13), post-payout liability (EQ5), and withholding (EQ9) remain unresolved, as in the specifications. Correction commit: see [change record](#7-change-record). |

### ENG-IMP-012 MVP plan is ambiguous about the single classification of mixed-scope items

| Field | Value |
|---|---|
| ID | ENG-IMP-012 |
| Title | MVP plan is ambiguous about the single classification of mixed-scope items |
| Date identified | 2026-09-25 |
| Identified by | Claude Code (Opus 5.5), classification validation before issue generation |
| Category | Documentation |
| Affected subsystem | Implementation planning (not code) |
| Current state | Five items carry two classifications in their [§5](../19-implementation-planning/mvp-implementation-plan.md#5-work-items) row: `MVP-008` (HUMAN-DECISION-REQUIRED bootstrap / AUTONOMOUS-READY schema), `MVP-010`, `MVP-025`, `MVP-043` (AUTONOMOUS-READY interface / EXTERNAL-DEPENDENCY provider), and `MVP-030` (row classification only "AUTONOMOUS-READY (every row except one)"). [§7](../19-implementation-planning/mvp-implementation-plan.md#7-autonomous-implementation-safety-classification) counts 42 / 5 / 4, which partitions all 51 items only if each of these five counts under its non-autonomous class. Yet §7 says the external items' autonomous sub-scopes are "already counted above", and §6 says the recommended first ten items (which include `MVP-010`) contain "zero … EXTERNAL-DEPENDENCY items". |
| Evidence / problem | Issue generation needs exactly one classification label per item. Under the §7 partition, `MVP-010` (on the path to `MVP-011` and 24 other dependents) would be labeled EXTERNAL-DEPENDENCY, not AUTONOMOUS-READY, even though its core scope is autonomous and the first-ten list treats it that way. |
| Suggested improvement | Product/Architecture state the convention. For example: "a mixed item takes its non-autonomous class as its single classification; its autonomous sub-scope is listed in the issue body; the item is marked blocked only if its stated acceptance criteria cannot be met without the decision or provider." Then align the §6 and §7 wording with it. |
| Expected benefit | Deterministic issue labels, and a queue that does not hide startable work or promote blocked work |
| Risk of doing nothing | Mislabelled issues: autonomous agents skip `MVP-010`, or pick up the provider sub-scope of an external item. |
| Implementation risk | None |
| Estimated scope | S |
| Dependencies | Product/Architecture decision. Best resolved together with ENG-IMP-011. |
| Product behavior impact | No |
| Specification impact | Yes: plan-document wording |
| Migration impact | No |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | Before GitHub issue generation |
| Status | IMPLEMENTED (2026-09-25). Product/Architecture decided (Decision 2) on single primary classification by precedence: HUMAN-DECISION-REQUIRED, then EXTERNAL-DEPENDENCY, then AUTONOMOUS-READY. |
| Related GitHub Issue | None. Resolved before issue generation. |
| Related PR | None. Committed to `docs/specification-foundation`. |
| Resolution | Plan 0.2.0 §7 defines the precedence rule and states each mixed item's single classification after reading its row: `MVP-008` is HUMAN-DECISION-REQUIRED (the item scope includes the open Administrator bootstrap); `MVP-030` is HUMAN-DECISION-REQUIRED (its work covers every matrix row, including the undecided compensation row); `MVP-010`, `MVP-025`, and `MVP-043` are EXTERNAL-DEPENDENCY (each scope includes a real, unselected provider). Each row still names the part that needs no decision or provider, and whether its acceptance test can pass with a mock. With `MVP-052`, counts are now 52 total, 42 AUTONOMOUS-READY, 6 HUMAN-DECISION-REQUIRED, and 4 EXTERNAL-DEPENDENCY. §6's first-ten statement and §7's "already counted above" wording were corrected. Correction commit: see [change record](#7-change-record). |

### ENG-IMP-013 Release and financial commands are not wired to verification and idempotency foundations

| Field | Value |
|---|---|
| ID | ENG-IMP-013 |
| Title | Release and financial commands are not wired to verification and idempotency foundations |
| Date identified | 2026-09-25 |
| Identified by | Claude Code (Opus 5.5), dependency revalidation after adding `MVP-052` |
| Category | Documentation, Architecture |
| Affected subsystem | Implementation planning; Escrow, once built |
| Current state | In [plan §5](../19-implementation-planning/mvp-implementation-plan.md#5-work-items), `MVP-028` (release) depends on `MVP-022`, `MVP-023`, and `MVP-026`, not on `MVP-012` (identity verification) or `MVP-025` (mock provider for funding confirmation). `MVP-003` (the shared idempotency, outbox, and inbox infrastructure) has no dependent except `MVP-052`. |
| Evidence / problem | Release requires the live payout gate, including Identity Verified (`REQ-ESCROW-009`, `BR-ESCROW-014`, `BR-IDENTITY-021`), and captured funding that only a verified provider fact creates. Every Escrow financial operation must be idempotent by key (`REQ-ESCROW-018`), which `MVP-003` provides. As planned, `MVP-026`/`MVP-028` can start before those foundations exist. Plan §6 therefore states checkpoint A as `MVP-045` plus `MVP-025` and `MVP-012`, not `MVP-045` alone. |
| Suggested improvement | Product/Architecture decide whether `MVP-028` (and, for idempotency, `MVP-024`/`MVP-026`/`MVP-029`) should depend on `MVP-012`, `MVP-025`, and `MVP-003`, or whether those items may use test fixtures for verification status and funding, with the dependency expressed only at the checkpoints. |
| Expected benefit | Dependencies that match the specifications' gates. A single-item checkpoint A. |
| Risk of doing nothing | Release could be implemented against seeded verification or funding state and ship without an integrated gate. Idempotency could be reimplemented per item instead of on `MVP-003`. |
| Implementation risk | None: documentation only |
| Estimated scope | S |
| Dependencies | Product/Architecture decision. Does **not** block issue generation: the current graph is valid and acyclic, and issues can carry this note. |
| Product behavior impact | No |
| Specification impact | Yes: plan-document dependencies |
| Migration impact | No |
| Security impact | Positive if adopted: gates and idempotency are built in, not retrofitted |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | Before `MVP-024`/`MVP-026`/`MVP-028` begin |
| Status | PROPOSED |
| Related GitHub Issue | — |
| Related PR | — |
| Resolution | — |

### ENG-IMP-014 MVP-009 cites the login section instead of the email-verification and password-reset sections

| Field | Value |
|---|---|
| ID | ENG-IMP-014 |
| Title | MVP-009 cites the login section instead of the email-verification and password-reset sections |
| Date identified | 2026-09-26 |
| Identified by | Claude Code (Opus 5.5), GitHub issue generation (`MVP-009`, [#11](https://github.com/xela-ash/Music_app/issues/11)) |
| Category | Documentation |
| Affected subsystem | Implementation planning (not code); Authentication once built |
| Current state | Before the correction, the [plan §5](../19-implementation-planning/mvp-implementation-plan.md#5-work-items) `MVP-009` (Password reset and email verification) Source cell read "[Authentication Section 10.1 Future Extensibility](../02-users-roles-permissions/authentication.md)", linking the document without an anchor. |
| Evidence / problem | In [`authentication.md`](../02-users-roles-permissions/authentication.md), §10.1 is "Canonical Login Flow vs. Repository Reality", and no section is titled "Future Extensibility" (the nearest text is §27 Future Architecture, a list of later identity features). The two flows `MVP-009` implements are specified in [§15 Email Verification](../02-users-roles-permissions/authentication.md#15-email-verification) (flow §15.1, 24-hour token policy §15.2) and [§16 Password Reset and Recovery](../02-users-roles-permissions/authentication.md#16-password-reset-and-recovery) (flow §16.1, 30-minute token policy §16.2, state diagram §16.3). The specification's own traceability confirms the mapping: `REQ-AUTH-008` (email verification) traces to §15, and `REQ-AUTH-006` (password reset) traces to §16; `DATA-AUTH-004`/`005` cite §15.2/§16.2. The issue generated from the row already cited §15 and §16 and flagged the discrepancy. |
| Suggested improvement | Correct the Source cell to cite §15 and §16 with anchors. No scope, dependency, or classification change. |
| Expected benefit | An implementer reading the plan row lands on the governing sections, and the plan, the issue, and the specification agree. |
| Risk of doing nothing | An implementer following the plan citation reads the login flow and misses the token policies, enumeration-safe response, and session handling the flows require. |
| Implementation risk | None: documentation only |
| Estimated scope | S |
| Dependencies | None. Does not block `MVP-001` or any other item. `MVP-009` remains EXTERNAL-DEPENDENCY and blocked on the email provider (Notifications Question EQ1), unchanged. |
| Product behavior impact | No |
| Specification impact | Yes: plan-document citation (Product/Architecture-owned) |
| Migration impact | No |
| Security impact | Indirect: points implementers at the security-relevant token and session rules in §15.2 and §16.2 |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | Before `MVP-009` begins |
| Status | IMPLEMENTED (2026-09-26). Corrected under an explicit human-approved task that authorized correcting the plan when the correct source is unambiguous. The mapping is unambiguous from the specification's own traceability table. |
| Related GitHub Issue | [#11](https://github.com/xela-ash/Music_app/issues/11) (`MVP-009`), synchronized to note the correction |
| Related PR | None yet. Committed to `docs/specification-foundation`, which is proposed for `main` in the documentation-baseline PR. |
| Resolution | [`mvp-implementation-plan.md`](../19-implementation-planning/mvp-implementation-plan.md) 0.2.1 (2026-09-26): `MVP-009`'s Source cell now cites Authentication §15 (email verification, `REQ-AUTH-008`) and §16 (password reset, `REQ-AUTH-006`) with anchors. Correction commit: see [change record](#7-change-record). Correcting the citation surfaced a separate planning gap in §16, recorded as `ENG-IMP-016`. |

### ENG-IMP-015 Project term-version record required by MVP-015 is not defined by the Projects specification

| Field | Value |
|---|---|
| ID | ENG-IMP-015 |
| Title | Project term-version record required by MVP-015 is not defined by the Projects specification |
| Date identified | 2026-09-26 |
| Identified by | Claude Code (Opus 5.5), GitHub issue generation (`MVP-015`, [#17](https://github.com/xela-ash/Music_app/issues/17)), re-verified before recording |
| Category | Documentation, Architecture, Database |
| Affected subsystem | Implementation planning; Projects, and through references Milestones and Escrow, once built |
| Current state | [Plan §5](../19-implementation-planning/mvp-implementation-plan.md#5-work-items) `MVP-015` (Project state machine and term-version snapshots) specifies "Schema: `project_term_versions`". [`projects.md` §26.1](../05-projects-milestones/projects.md#261-target-model-matrix) defines seven governed target models, `DATA-PROJECTS-001`–`007`, none of which is a term-version record. The paragraph after the table says: "Additional target supporting records include immutable Project term versions, idempotency/inbox/outbox records, and optional rebuildable financial projections. They may be shared infrastructure models, but their ownership and constraints MUST be explicit before implementation." The §18 relationship diagram shows `PROJECT ||--o{ TERM_VERSION : records`, and §14 describes "an immutable numbered proposal snapshot" and "an immutable agreed snapshot". |
| Evidence / problem | The concept is required, but its model is not specified anywhere. No document defines a name, fields, keys, ownership, or constraints for it: the name `project_term_versions` appears in no specification; System Architecture has no term-version text; `docs/14-database/` is empty; migrations `001`–`008` contain no term-version table. Other models already depend on this undefined identity: `DATA-PROJECTS-001` carries "current proposal/agreed term versions", `DATA-PROJECTS-004` carries "base/current term versions", `DATA-PROJECTS-009` (`milestone_term_versions`, Milestones) is indexed "by Project term version", and `DATA-ESCROW-001` carries `agreed_term_version` ("Reference to the Project agreed term version"). Open decisions include whether proposal and agreed snapshots share one versioned record or two, what fields a Project-level snapshot holds (the §9.1 field matrix lists `proposal_version`, `agreed_term_version`, `proposed_total`, currency and exponent, `service_snapshot`, `genre_ids`, `skill_ids`), whether snapshots are hashed, and how Milestone and Escrow references key into it. |
| Suggested improvement | Architecture clarification in `projects.md` §26.1: add a governed `DATA-PROJECTS-*` entry (or an explicit shared-infrastructure definition) for the Project term-version record, stating its owner, name, principal fields, keys and constraints, immutability enforcement, and how `DATA-PROJECTS-009`, `DATA-PROJECTS-004`, and `DATA-ESCROW-001` reference it. Then align the plan's `MVP-015` Schema text with the chosen name. This entry does not choose the model. |
| Expected benefit | `MVP-015` can be implemented against a defined model, and the Milestones, amendment, and Escrow items that reference Project term versions share one definition. |
| Risk of doing nothing | An implementation agent would have to invent the persistence model for immutable commercial terms, which `AGENTS.md` Section 4 forbids (missing requirement; product-significant data model) and which §26.1 itself says must be explicit first. An invented model could conflict with `MVP-016` (amendments write new term versions), `MVP-017` (Milestone snapshots keyed by Project term version), and `MVP-024` (Escrow `agreed_term_version`), forcing a migration of contract-evidence data later. |
| Implementation risk | None for the documentation change. Choosing the model is an Architecture decision. |
| Estimated scope | S (specification text) |
| Dependencies | Product/Architecture decision. Agents must not decide it ([`AGENTS.md`](../../AGENTS.md) Sections 4 and 6). Does **not** block `MVP-001`. It must be resolved before `MVP-015` starts; `MVP-015` is step 5 of the critical path and currently waits on `MVP-014`. |
| Product behavior impact | No: the behavior (immutable proposal and agreed snapshots) is already specified; only the model is missing |
| Specification impact | Yes: `projects.md` §26.1 data model, then the plan's `MVP-015` Schema text |
| Migration impact | Yes, once decided: a new table and references from later migrations |
| Security impact | Indirect: agreed-terms immutability protects contract evidence (`BR-PROJECTS-015`, `BR-PROJECTS-017`) |
| Performance impact | None |
| Priority suggestion | High |
| Recommended timing | Before `MVP-015` begins; ideally while `MVP-001`–`MVP-014` are in progress |
| Status | IMPLEMENTED (2026-09-30). The product owner defined the model and authorized recording it before MVP-015. |
| Related GitHub Issue | [#17](https://github.com/xela-ash/Music_app/issues/17) (`MVP-015`), whose pre-implementation warning cites this entry |
| Related PR | The MVP-015 pull request |
| Resolution | [ADR-001](../99-appendices/adr/ADR-001-project-term-versions.md) and [`projects.md`](../05-projects-milestones/projects.md) 1.1.0 define `DATA-PROJECTS-018` `project_term_versions`: Projects-owned, one immutable sequence per Project, proposal and agreed snapshots in that sequence, project-level commercial fields only, no engagement-model field, and no shared multi-project sequence. The plan's Schema name already matched. |

### ENG-IMP-016 Password reset requires session revocation that no MVP work item builds

| Field | Value |
|---|---|
| ID | ENG-IMP-016 |
| Title | Password reset requires session revocation that no MVP work item builds |
| Date identified | 2026-09-26 |
| Identified by | Claude Code (Opus 5.5), while verifying `ENG-IMP-014` |
| Category | Documentation, Architecture, Security |
| Affected subsystem | Implementation planning; Authentication once built |
| Current state | [`authentication.md` §16.1](../02-users-roles-permissions/authentication.md#161-canonical-flow-target-architecture) step 11 requires that a completed password reset revoke existing refresh sessions and increment the authentication version, "immediately invalidating outstanding access tokens"; §16.2 and `BR-AUTH-025` repeat this. The mechanisms are separate Planned requirements: revocable authentication (`REQ-AUTH-005`, `BR-AUTH-011`, `BR-AUTH-021`), refresh sessions (`DATA-AUTH-003`), and the missing-revocation finding `SEC-AUTH-003`. |
| Evidence / problem | No plan work item builds an authentication version or refresh sessions: the plan contains no occurrence of "refresh", "authentication version", or session revocation. `MVP-006` adds only the live account-status re-check. `MVP-009` implements the reset flow but not these mechanisms. As planned, `MVP-009` cannot satisfy §16 step 11 without building an unplanned mechanism or omitting a specified security step. |
| Suggested improvement | Product/Architecture decide how §16 step 11 is planned: for example, a new work item for revocable authentication that `MVP-009` depends on, or an explicit expansion of `MVP-006` or `MVP-009` scope and acceptance criteria. This entry does not choose. |
| Expected benefit | Password reset invalidates a compromised session as specified, and the work that makes it possible has an owned, reviewable issue. |
| Risk of doing nothing | An implementer either builds revocation ad hoc inside `MVP-009` or ships reset without invalidating stolen tokens, the scenario reset exists to handle. |
| Implementation risk | None for the documentation change |
| Estimated scope | S (planning) |
| Dependencies | Product/Architecture decision. Does not block `MVP-001`. `MVP-009` is already blocked on the email provider, so this does not change its current status. |
| Product behavior impact | No: the behavior is specified; only its planning is missing |
| Specification impact | Yes: plan document |
| Migration impact | Possibly, once decided (authentication-version column or session table) |
| Security impact | High relevance: session invalidation after credential reset |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | Before `MVP-009` begins |
| Status | PROPOSED |
| Related GitHub Issue | [#11](https://github.com/xela-ash/Music_app/issues/11) (`MVP-009`), which notes this entry |
| Related PR | — |
| Resolution | — |

### ENG-IMP-017 Characterization suite binds a fixed port 4000

| Field | Value |
|---|---|
| ID | ENG-IMP-017 |
| Title | Characterization suite binds a fixed port 4000 |
| Date identified | 2026-09-26 |
| Identified by | Independent review of MVP-001 (GitHub issue #3) |
| Category | Testing, Reliability |
| Affected subsystem | Testing |
| Current state | `backend/test/routes.characterization.test.js` sets `BASE` to `http://127.0.0.1:4000` (line 11) and spawns `Index.js` (lines 131–134). `backend/Index.js` listens on hardcoded port 4000 when it is the main module (lines 35–38). Readiness is any `GET /` that returns 200 (lines 143–146). |
| Evidence / problem | If another process already owns port 4000 and answers `GET /` with 200, the suite can treat that process as ready and assert against it. The spawned server's failure to bind is then ignored. The independent review of MVP-001 recorded this as a non-blocking improvement. |
| Suggested improvement | Bind an ephemeral port, or fail the suite when the spawned process does not own the port the tests call. |
| Expected benefit | The characterization snapshot cannot pass against an unrelated listener. |
| Risk of doing nothing | A local port conflict can produce a green run that did not exercise this backend. |
| Implementation risk | Low. The suite is the MVP-001 acceptance snapshot, so a port change must keep the same status and body assertions. |
| Estimated scope | S |
| Dependencies | MVP-002 may replace this file with the shared harness. Do not change it inside MVP-001. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | With MVP-002, or a dedicated test-isolation change after MVP-001 merges |
| Status | IMPLEMENTED |
| Related GitHub Issue | [#4](https://github.com/xela-ash/Music_app/issues/4) |
| Related PR | [#57](https://github.com/xela-ash/Music_app/pull/57) |
| Resolution | The MVP-002 harness imports the exported app and listens on port 0 (`backend/test/harness.js`). `node Index.js` still binds 4000. The old fixed-port characterization file is now `backend/test/routes.smoke.test.js`. |

### ENG-IMP-018 Characterization DB_PORT guard misses an omitted port

| Field | Value |
|---|---|
| ID | ENG-IMP-018 |
| Title | Characterization `DB_PORT` guard misses an omitted port |
| Date identified | 2026-09-26 |
| Identified by | Independent review of MVP-001 (GitHub issue #3) |
| Category | Testing, Reliability |
| Affected subsystem | Testing, Backend |
| Current state | `backend/test/routes.characterization.test.js` lines 22–23 refuse the run only when `String(process.env.DB_PORT) === "5432"`. `backend/db/db.js` line 6 sets the pool port with `process.env.DB_PORT \|\| 5432`. |
| Evidence / problem | An omitted `DB_PORT` does not equal the string `"5432"`, so the guard does not throw. The pool then uses 5432, which is the shared default the guard is meant to keep the suite away from. The application-level silent default remains [ENG-IMP-005](#eng-imp-005-configuration-is-loaded-implicitly-and-silently-falls-back-to-defaults). This entry is only the test guard's gap. |
| Suggested improvement | Treat a missing `DB_PORT` the same as `5432`: refuse the characterization run unless the port is explicit and not 5432. |
| Expected benefit | The suite cannot reach the shared PostgreSQL port by omission. |
| Risk of doing nothing | A run without `DB_PORT` can migrate or write the default local database. |
| Implementation risk | Low. Callers that already pass a non-default `DB_PORT` stay valid. |
| Estimated scope | S |
| Dependencies | ENG-IMP-005 for the application default. MVP-002 if the harness replaces this guard. Not part of MVP-001. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | Positive for local data isolation if implemented; none until then |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | With the next change to this characterization file, or with MVP-002 |
| Status | IMPLEMENTED |
| Related GitHub Issue | [#4](https://github.com/xela-ash/Music_app/issues/4) |
| Related PR | [#57](https://github.com/xela-ash/Music_app/pull/57) |
| Resolution | `backend/test/database-guard.js` rejects a missing, blank, or `5432` `DB_PORT` before the pool is created. `backend/test/database-guard.test.js` covers the omitted-port case. |

### ENG-IMP-019 Frontend comments still cite backend/Index.js for moved constants

| Field | Value |
|---|---|
| ID | ENG-IMP-019 |
| Title | Frontend comments still cite `backend/Index.js` for moved constants |
| Date identified | 2026-09-26 |
| Identified by | Independent review of MVP-001 (GitHub issue #3) |
| Category | Documentation, Maintainability |
| Affected subsystem | Frontend application |
| Current state | `frontend/src/App.tsx` lines 1039–1040 say `POSTGRES_INT_MAX` mirrors `backend/Index.js`. Lines 1043–1045 say `PROJECT_CURRENCY` mirrors `backend/Index.js`. After MVP-001, `POSTGRES_INT_MAX` is in `backend/src/milestones/service.js` and `PROJECT_CURRENCY` is in `backend/src/projects/service.js`. |
| Evidence / problem | The comments name a file that no longer defines those constants. The values are unchanged (`2147483647` and `"INR"`). The independent review recorded this as a non-blocking observation. MVP-001 did not change frontend behavior. |
| Suggested improvement | Point the comments at the modules that now own the constants, in a change that is allowed to touch `App.tsx` comments. |
| Expected benefit | The next editor can find the server-side source of the two limits. |
| Risk of doing nothing | A later edit follows the stale path and updates the wrong file. |
| Implementation risk | Low. Comment-only. The constants and form behavior stay as they are. |
| Estimated scope | S |
| Dependencies | None. Explicitly outside MVP-001. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | The next frontend change that already edits this screen, or a small documentation fix |
| Status | PROPOSED |
| Related GitHub Issue | [#3](https://github.com/xela-ash/Music_app/issues/3) (found during review; not in MVP-001 scope) |
| Related PR | — |
| Resolution | — |

### ENG-IMP-020 Build Record Section 4 verification stamp predates the MVP-001 baseline

| Field | Value |
|---|---|
| ID | ENG-IMP-020 |
| Title | Build Record Section 4 verification stamp predates the MVP-001 baseline |
| Date identified | 2026-09-26 |
| Identified by | Independent review of MVP-001 (GitHub issue #3) |
| Category | Documentation |
| Affected subsystem | Documentation |
| Current state | `docs/20-engineering/engineering-build-record.md` Section 4 opens with: verified against commit `2defbea` on 2026-09-25, and "Line numbers refer to that commit." Version 0.2.0 updated Section 4.1 and Section 4.3 for the MVP-001 module split without refreshing that stamp. |
| Evidence / problem | The section header still attributes the whole baseline, including the post-split backend description, to a commit from before MVP-001. Line numbers cited inside updated subsections are no longer guaranteed to match `2defbea`. The independent review recorded this as non-blocking. |
| Suggested improvement | Re-verify Section 4 against the commit that contains the module split, and replace the stamp and any stale line references in one documentation pass. |
| Expected benefit | The baseline header matches the subsystem text a reader is using. |
| Risk of doing nothing | A later change trusts line numbers that belong to `2defbea` for text that describes the decomposed backend. |
| Implementation risk | Low. Documentation only. It must not rewrite subsystem facts that Section 4.3 already updated for MVP-001. |
| Estimated scope | S |
| Dependencies | MVP-001 merged, so the stamp can name that commit. Not part of the MVP-001 implementation. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | The next Build Record revision after MVP-001 merges |
| Status | PROPOSED |
| Related GitHub Issue | [#3](https://github.com/xela-ash/Music_app/issues/3) (found during review; not in MVP-001 scope) |
| Related PR | — |
| Resolution | — |

### ENG-IMP-021 Cloud image corepack cannot follow current releases on Node 22.14.0

| Field | Value |
|---|---|
| ID | ENG-IMP-021 |
| Title | Cloud image corepack cannot follow current releases on Node 22.14.0 |
| Date identified | 2026-09-26 |
| Identified by | Cloud environment repair (no MVP item) |
| Category | Developer Experience, Dependency |
| Affected subsystem | Cloud Agent image |
| Current state | `.cursor/Dockerfile` installs Node.js 22.14.0 and then `corepack@0.34.7` so `pnpm@12.5.1` can be activated. Node 22.14.0 ships corepack 0.31.0. |
| Evidence / problem | `npm view corepack@0.35.0 engines` and `corepack@0.36.0` both require `node: ^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`. `corepack@0.31.0` through `0.33.0` prepare pnpm 12.5.1 and then fail looking for `bin/pnpm.cjs`, which that package does not contain. `corepack@0.34.7` activates pnpm 12.5.1 on Node 22.14.0. A later corepack bump on this Node version is an engines violation. |
| Suggested improvement | When a human chooses a newer Node for the Cloud image, move corepack forward in the same change and re-check `pnpm --version` for the ubuntu user. Do not bump Node as part of an unrelated repair. |
| Expected benefit | The image can take current corepack releases without an engines mismatch. |
| Risk of doing nothing | The next corepack update attempt either fails the image build or silently uses an unsupported Node. |
| Implementation risk | Low, once a Node version is chosen. The Node pin itself is a separate decision from this repair. |
| Estimated scope | S: one Dockerfile pin, plus the install and frontend checks |
| Dependencies | A decision to move the Cloud image off Node 22.14.0. Not authorized by the environment repair. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | The next intentional Cloud toolchain bump |
| Status | PROPOSED |
| Related GitHub Issue | — |
| Related PR | Branch `cursor/cloud-node-toolchain-ef45` |
| Resolution | — |

### ENG-IMP-022 Handbook current-state snapshots predate MVP-001 and MVP-002

| Field | Value |
|---|---|
| ID | ENG-IMP-022 |
| Title | Handbook current-state snapshots predate MVP-001 and MVP-002 |
| Date identified | 2026-09-26 |
| Identified by | Cursor autonomous build, while implementing MVP-002 (GitHub issue #4) |
| Category | Documentation |
| Affected subsystem | Documentation |
| Current state | [Handbook §5.1](engineering-handbook.md#51-current-verified-2026-09-25) still describes `backend/Index.js` as the whole backend. [Handbook §14](engineering-handbook.md#14-testing-strategy) still says no tests exist and that `backend/package.json`'s `test` script is a placeholder that exits 1. |
| Evidence / problem | MVP-001 split the backend into domain modules. MVP-002's `npm test` runs the smoke suite, and `frontend` has `pnpm test`. A later agent that trusts the handbook's "Current" paragraphs will plan against a repository that no longer exists. The Build Record is the implementation record; the handbook's current-state notes were not refreshed because MVP-002 does not change an engineering standard. |
| Suggested improvement | Refresh the handbook's "Current" snapshots in one documentation pass after the corresponding build-record sections are verified. Do not change the required standards in the same edit unless a standard actually changed. |
| Expected benefit | The next implementer does not rebuild the module split or the test harness. |
| Risk of doing nothing | Duplicate foundation work, or a change that assumes the placeholder `test` script is still in place. |
| Implementation risk | Low. Documentation only. It must not rewrite product behavior. |
| Estimated scope | S |
| Dependencies | None. Outside MVP-002. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | The next handbook revision |
| Status | PROPOSED |
| Related GitHub Issue | [#4](https://github.com/xela-ash/Music_app/issues/4) (found during MVP-002; not implemented) |
| Related PR | — |
| Resolution | — |

### ENG-IMP-023 Outbox dispatcher has no process runner, transport, or alerting

| Field | Value |
|---|---|
| ID | ENG-IMP-023 |
| Title | Outbox dispatcher has no process runner, transport, or alerting |
| Date identified | 2026-09-27 |
| Identified by | Cursor autonomous build, while implementing MVP-003 (GitHub issue #5) |
| Category | Reliability, Observability, Architecture |
| Affected subsystem | Idempotency, outbox, and inbox |
| Current state | `publishPendingOutbox(pool, publish, options)` in `backend/src/infrastructure/outbox.js` delivers pending `outbox_messages` rows through an injected `publish` function. Nothing calls it outside the tests. `backend/Index.js` starts no worker or schedule, and no in-process or broker transport exists. Dead-lettered rows are only visible by querying `outbox_messages`. |
| Evidence / problem | No domain writes outbox events yet, so nothing is lost today. The first item that writes an event for another domain to consume (for example `MVP-021`'s readiness fact or `MVP-041`'s notification intents) needs a running dispatcher and a transport. Otherwise its events stay `pending`. `OPS-PROJECTS-002` and `OPS-ESCROW-002` require alerts on outbox age and dead letters. No plan item names the runner, and Roles §7.11 records that no job runner exists. |
| Suggested improvement | When the first cross-domain consumer lands, add one small scheduled runner (in-process interval or a separate `node` entry point) that calls `publishPendingOutbox` with an in-process transport to the registered inbox consumers. Log each dead-lettered message with its `event_id` and type. Record the runner choice in an EDR. Redriving a dead letter also needs a design: the `protect_outbox_messages` trigger forbids lowering `attempts`, so a row moved back to `pending` is dead-lettered again after its next failure (found in the MVP-003 independent review). |
| Expected benefit | Events written by domain commands are actually delivered, and failures are visible. |
| Risk of doing nothing | A later item writes outbox events that are never published, so dependent state such as a Milestone transition or a notification silently never happens. |
| Implementation risk | Medium. Background work inside the API process affects shutdown and testing, and the job-runner choice is an engineering decision. |
| Estimated scope | S to M. One runner and one transport, plus tests. |
| Dependencies | MVP-003. The first item with a cross-domain outbox consumer. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | Indirect: lost financial or notification events are a correctness risk (`SEC-PROJECTS-011`) |
| Performance impact | A polling interval adds light, periodic database load |
| Priority suggestion | Medium |
| Recommended timing | With the first item whose acceptance depends on a consumed outbox event |
| Status | PROPOSED |
| Related GitHub Issue | [#5](https://github.com/xela-ash/Music_app/issues/5) (found during MVP-003; not implemented) |
| Related PR | — |
| Resolution | — |

### ENG-IMP-024 Shared infrastructure helper edge cases from the MVP-003 review

| Field | Value |
|---|---|
| ID | ENG-IMP-024 |
| Title | Shared infrastructure helper edge cases from the MVP-003 review |
| Date identified | 2026-09-27 |
| Identified by | Independent reviewer agent, MVP-003 pull request #60 |
| Category | Reliability, Security, Maintainability |
| Affected subsystem | Idempotency, outbox, and inbox |
| Current state | (a) `completeIdempotencyKey` in `backend/src/infrastructure/idempotency.js` writes the response body as `jsonb`. (b) `publishPendingOutbox` in `outbox.js` defaults `now` to the application clock and compares it with `available_at`, which defaults to the database's `now()`. (c) The dispatcher stores the transport error's `message`, truncated to 500 characters, in `outbox_messages.last_error`. (d) The three new tables have purpose-specific timestamps (`completed_at`, `last_attempt_at`, `processed_at`) but no `updated_at` column. (e) In migration 009, `idempotency_keys_completed_has_response` admits only the `in_progress` and `completed` statuses, which duplicates `idempotency_keys_status_allowed`. Removing `status_allowed` changes no behavior, so no test can detect its removal. |
| Evidence / problem | (a) A response string containing U+0000 is rejected by PostgreSQL `jsonb` (`22P05`), which aborts the whole command. The reviewer reproduced this. (b) Clock skew between the application host and the database delays or advances retries. The tests pass an explicit `now` for that reason. (c) A future transport could put internal details into its error message. (d) Handbook §9 describes a `created_at`/`updated_at` convention. |
| Suggested improvement | (a) Reject or escape NUL before the write. (b) Default `now` to the database clock (`SELECT now()`) when the caller passes none. (c) Require transports to throw errors with sanitized messages, or store only an error class or code. (d) Decide whether infrastructure tables follow the `updated_at` convention, and add the column with maintenance if so. (e) In a later migration, narrow `completed_has_response` to the response fields, so `status_allowed` alone governs status values and each constraint can be tested on its own. |
| Expected benefit | Fewer surprising failures, and no transport detail leaking into stored rows. |
| Risk of doing nothing | Low today, because no caller exists. It rises once domain commands and a transport use these helpers. |
| Implementation risk | Low. Each item is local to one helper or one migration. |
| Estimated scope | S |
| Dependencies | MVP-003 |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | (d) only: an additive column |
| Security impact | (c) reduces the risk of stored internal detail |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | With the first domain command or transport that uses these helpers |
| Status | PROPOSED |
| Related GitHub Issue | [#5](https://github.com/xela-ash/Music_app/issues/5) (found in review; not implemented) |
| Related PR | [#60](https://github.com/xela-ash/Music_app/pull/60) |
| Resolution | — |

### ENG-IMP-028 Future authenticatable statuses are not covered by an HTTP test

| Field | Value |
|---|---|
| ID | ENG-IMP-028 |
| Title | Future authenticatable statuses are not covered by an HTTP test |
| Date identified | 2026-09-28 |
| Identified by | Independent review of MVP-006 pull request #62, commit `6ec173c` |
| Category | Testing |
| Affected subsystem | Authentication, Testing |
| Current state | `accountMayAuthenticate` allows `restricted` and `email_verification_pending`. `backend/test/account-status.test.js` covers that function. `backend/test/live-status.test.js` covers `active`, `suspended`, and `deleted` over HTTP. The `user_status` enum does not contain the two future labels. |
| Evidence / problem | An HTTP test would still pass if `requireLiveStatus` compared the row to `active` alone. Those labels cannot be stored until a later migration, and MVP-006 forbids a schema change, so this pull request cannot add the HTTP allow-case. The middleware does call `accountMayAuthenticate`. IDs `ENG-IMP-025` through `ENG-IMP-027` are used on the unmerged MVP-004 branch, so this entry is `028`. |
| Suggested improvement | When a migration adds `restricted` or `email_verification_pending`, add an HTTP test that a token for that row is accepted on a protected route. |
| Expected benefit | The allow list cannot drift from the middleware without a failing request test. |
| Risk of doing nothing | Low until the enum grows. |
| Implementation risk | Low. It needs the enum values first. |
| Estimated scope | S |
| Dependencies | A later migration that adds those `user_status` values |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | The migration that adds the enum values |
| Status | PROPOSED |
| Related GitHub Issue | [#8](https://github.com/xela-ash/Music_app/issues/8) (review finding; not part of the acceptance criteria) |
| Related PR | [#62](https://github.com/xela-ash/Music_app/pull/62) |
| Resolution | — |

### ENG-IMP-029 project.create seller eligibility is a boolean the caller supplies

| Field | Value |
|---|---|
| ID | ENG-IMP-029 |
| Title | project.create seller eligibility is a boolean the caller supplies |
| Date identified | 2026-09-28 |
| Identified by | Independent review of MVP-007, commit `a3e3cf5` |
| Category | Authorization |
| Affected subsystem | Authorization, Projects |
| Current state | `authorize` denies `project.create` when `resource.sellerEligible` is not true. `createProject` sets that flag from `findActiveSellerWithProfile`, which requires `users.status = 'active'` and a profile row. |
| Evidence / problem | The active-user-with-profile rule still lives in the repository query. `authorize` trusts the boolean. A later caller can pass `sellerEligible: true` without that query. MVP-007 keeps the current HTTP result and does not move the query into the policy function. |
| Suggested improvement | Pass the loaded seller row, or its absence, into `authorize`, and decide eligibility there from `status` and profile presence. |
| Expected benefit | The eligibility rule has one implementation. |
| Risk of doing nothing | Low while `createProject` is the only caller. |
| Implementation risk | Low. The HTTP contract stays `404` "Seller not found". |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | No |
| Security impact | Low. The current call site still runs the query. |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | The next change that adds another `project.create` caller |
| Status | PROPOSED |
| Related GitHub Issue | [#9](https://github.com/xela-ash/Music_app/issues/9) (review finding; not part of the acceptance criteria) |
| Related PR | [#64](https://github.com/xela-ash/Music_app/pull/64) |
| Resolution | — |

### ENG-IMP-030 Profile search uses an unindexed leading wildcard

| Field | Value |
|---|---|
| ID | ENG-IMP-030 |
| Title | Profile search uses an unindexed leading wildcard |
| Date identified | 2026-09-29 |
| Identified by | MVP-013 implementation |
| Category | Database, Performance |
| Affected subsystem | Profiles, discovery |
| Current state | `GET /profiles` matches with `ILIKE '%term%'`. Handbook §9 asks for an index that matches the list filter. A btree index does not serve a leading wildcard. |
| Evidence / problem | MVP-013 forbids a schema change, so this issue does not add `pg_trgm` or another index. The query is correct at the current table size and is not measured as slow. |
| Suggested improvement | Add a trigram or equivalent index when profile search has a measured latency problem, in an issue that allows a migration. |
| Expected benefit | Search stays fast after the catalog grows. |
| Risk of doing nothing | Low until the `profiles` table is large. |
| Implementation risk | Low if the index is additive. |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | Additive index only |
| Security impact | None |
| Performance impact | Positive once the table is large enough to need it |
| Priority suggestion | Low |
| Recommended timing | After a measured search latency problem, not before |
| Status | PROPOSED |
| Related GitHub Issue | [#15](https://github.com/xela-ash/Music_app/issues/15) |
| Related PR | Branch `cursor/mvp-013-profile-search-255b` |
| Resolution | — |

### ENG-IMP-031 Profile search dimensions cannot be combined with AND

| Field | Value |
|---|---|
| ID | ENG-IMP-031 |
| Title | Profile search dimensions cannot be combined with AND |
| Date identified | 2026-09-29 |
| Identified by | MVP-013 implementation |
| Category | API, Discovery |
| Affected subsystem | Profiles, discovery |
| Current state | Supplied `name`, `handle`, `genre`, `city`, and `country` parameters are OR-combined. That matches the existing one-field Discover box (EDR-008). |
| Evidence / problem | `GET /profiles?city=Chennai&genre=jazz` returns a profile that matches either dimension. The specifications do not define conjunction. Adding it inside MVP-013 would change the search box unless a separate control existed. |
| Suggested improvement | When Discover grows separate filters, add an explicit conjunction mode without changing the single-box disjunction. |
| Expected benefit | A caller can require city and genre together. |
| Risk of doing nothing | Low. The shipped search box does not offer separate filters. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | Yes, once a conjunction mode exists. Do not invent that mode without a specification or a later issue. |
| Specification impact | The profiles specification does not define AND versus OR. A conjunction control needs a product statement before it becomes target behavior. |
| Migration impact | None |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | A later discovery issue that adds separate filters |
| Status | PROPOSED |
| Related GitHub Issue | [#15](https://github.com/xela-ash/Music_app/issues/15) |
| Related PR | Branch `cursor/mvp-013-profile-search-255b` |
| Resolution | — |

### ENG-IMP-032 Project creation still writes seller_user_id before acceptance

| Field | Value |
|---|---|
| ID | ENG-IMP-032 |
| Title | Project creation still writes seller_user_id before acceptance |
| Date identified | 2026-09-29 |
| Identified by | MVP-014 implementation |
| Category | Database, Authorization |
| Affected subsystem | Projects |
| Current state | `POST /projects` still requires and stores `seller_user_id`. Migration 010 makes the column nullable and writes it again on acceptance when it is null or already the invitee. Active Seller capability is the participant row, not the column. |
| Evidence / problem | `BR-PROJECTS-011` says a retained `seller_user_id` is populated only from the active accepted Seller participant. The existing create contract and the buyer project list's inner join on that column still depend on the value being present at creation. Nulling it in this item would hide the buyer's project and change the create response the current client reads. |
| Suggested improvement | Stop writing `seller_user_id` on create, use a left join for the named candidate, and set the column only from the accepted participant. |
| Expected benefit | The compatibility column matches `BR-PROJECTS-011` exactly. |
| Risk of doing nothing | A reader that treats `seller_user_id` as consent would repeat `SEC-AUTHZ-007`. List and lock no longer do that. |
| Implementation risk | The current frontend and smoke snapshot expect the named seller on the create response. |
| Estimated scope | S |
| Dependencies | A create-contract change, likely with the project read projection in a later projects item |
| Product behavior impact | Yes |
| Specification impact | No |
| Migration impact | No, if new rows simply leave the column null |
| Security impact | Removes the remaining pre-consent write of the compatibility column |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | With the next project-creation or project-read item, not inside MVP-014 |
| Status | PROPOSED |
| Related GitHub Issue | [#16](https://github.com/xela-ash/Music_app/issues/16) |
| Related PR | Branch `cursor/mvp-014-project-invitations-255b` |
| Resolution | — |

### ENG-IMP-033 Seller invitation expiry has no maximum duration

| Field | Value |
|---|---|
| ID | ENG-IMP-033 |
| Title | Seller invitation expiry has no maximum duration |
| Date identified | 2026-09-29 |
| Identified by | MVP-014 implementation |
| Category | API, Security |
| Affected subsystem | Projects |
| Current state | Invite requires `expires_at` later than the database clock and later than `created_at`. No upper bound is stored or enforced. |
| Evidence / problem | Projects §36 asks whether expiry is a fixed duration, a buyer-selected bounded duration, or a risk-based duration. MVP-014 stores the caller-supplied instant and does not choose that policy (`EDR-009`). |
| Suggested improvement | After Product chooses the duration policy, enforce it on invite. |
| Expected benefit | A pending invitation cannot be given an unbounded consent window by the client. |
| Risk of doing nothing | A caller can send an expiry far in the future. The invitation still expires at that instant, and acceptance after it is rejected. |
| Implementation risk | Low once the bound exists. Choosing the bound now would invent the open policy. |
| Estimated scope | S |
| Dependencies | Projects §36 duration decision |
| Product behavior impact | Yes |
| Specification impact | Yes. The owning specification has to record the duration policy first. |
| Migration impact | No |
| Security impact | Bounds how long a pending invitation can remain acceptable |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | When the open duration question is decided |
| Status | PROPOSED |
| Related GitHub Issue | [#16](https://github.com/xela-ash/Music_app/issues/16) |
| Related PR | Branch `cursor/mvp-014-project-invitations-255b` |
| Resolution | — |

### ENG-IMP-034 Terminal invitation rows can be updated

| Field | Value |
|---|---|
| ID | ENG-IMP-034 |
| Title | Terminal invitation rows can be updated |
| Date identified | 2026-09-29 |
| Identified by | MVP-014 independent review |
| Category | Database |
| Affected subsystem | Projects |
| Current state | `project_audit_events` rejects update and delete. `project_invitations` does not. `markInvitation` updates a row by id. |
| Evidence / problem | `DATA-PROJECTS-002` says terminal invitation outcomes are append-retained and never reopened. Application commands do not reopen a terminal row. A direct `UPDATE` can. |
| Suggested improvement | Add a trigger that rejects a status change once the row has left `pending`, and reject changes to the proposal hash and parties. |
| Expected benefit | The terminal-outcome rule holds when application checks are bypassed. |
| Risk of doing nothing | A later bug or manual write can reopen an accepted invitation. |
| Implementation risk | Low if the trigger allows the single pending-to-terminal update. |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | Additive trigger |
| Security impact | Closes a direct-SQL path around consent |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | A later projects hardening item |
| Status | PROPOSED |
| Related GitHub Issue | [#16](https://github.com/xela-ash/Music_app/issues/16) |
| Related PR | [#68](https://github.com/xela-ash/music_app/pull/68) |
| Resolution | — |

### ENG-IMP-035 Invitation review returns the full proposal after a terminal outcome

| Field | Value |
|---|---|
| ID | ENG-IMP-035 |
| Title | Invitation review returns the full proposal after a terminal outcome |
| Date identified | 2026-09-29 |
| Identified by | MVP-014 independent review |
| Category | API, Security |
| Affected subsystem | Projects |
| Current state | `GET /projects/:projectId/invitations/:invitationId` returns the commercial proposal for pending and terminal invitations. It does not write an audit row. `SellerAccepted` outbox payload does not include the participant external id. Accept re-checks account status only in `requireAuth`, before the row lock. |
| Evidence / problem | Projects §§6.2 and 8.2 describe a minimal receipt after decline, withdrawal, or expiry. `AUD-PROJECTS-002` includes a sensitive invitation view. `EVT-PROJECTS-003` names a participant reference. Section 8.1 names a live-status check inside the locked acceptance transaction. The independent review classified these as non-blocking. |
| Suggested improvement | Return a minimal receipt after a terminal outcome, audit that review when it exposes commercial fields, include the participant reference on `SellerAccepted`, and re-read `users.status` inside the acceptance transaction. |
| Expected benefit | Review matches the invitation visibility matrix and the audit and event rows match the cited identifiers. |
| Risk of doing nothing | A declined or expired invitee can still read the full brief. A suspension that lands after `requireAuth` and before commit can still accept. |
| Implementation risk | The current expiry test expects `proposal.title` on an expired review. |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | Yes, for the review payload |
| Specification impact | No |
| Migration impact | No |
| Security impact | Narrows post-terminal disclosure and the suspension race |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | A follow-up on the invitation read projection, not a change to the terminal-state commands |
| Status | PROPOSED |
| Related GitHub Issue | [#16](https://github.com/xela-ash/Music_app/issues/16) |
| Related PR | [#68](https://github.com/xela-ash/music_app/pull/68) |
| Resolution | — |

### ENG-IMP-036 Three notification topics have no single mandatory class

| Field | Value |
|---|---|
| ID | ENG-IMP-036 |
| Title | Three notification topics have no single mandatory class |
| Date identified | 2026-09-29 |
| Identified by | Cursor agent, MVP-041 / GitHub issue #43 |
| Category | Documentation, Architecture |
| Affected subsystem | Notifications |
| Current state | `backend/src/notifications/topics.js` classifies a topic only when the Section 8.1 "User May Disable?" cell says whether the durable in-app record remains. It rejects `Security-critical account event` ("Not all channels simultaneously"), `Authentication informational alert` ("Policy constrained"), and `Rating available/requested, rating hidden/removed` (one row covers an optional notice and a mandatory removal notice). |
| Evidence / problem | `BR-NOTIFICATIONS-001` requires every topic to be `MANDATORY` or `CONFIGURABLE`. Those three cells do not say the durable in-app record cannot be removed, and they are not a plain "Yes". An In-App cell of "Required" does not by itself choose the class. User Settings §11.2 keeps at least one security channel, which can be a channel other than in-app. |
| Suggested improvement | Architecture assigns one class to the security-critical and authentication-informational rows, and splits or classifies the rating row so availability and removal do not share one class. |
| Expected benefit | Those topics can create intents without a guessed suppression rule. |
| Risk of doing nothing | Producers of those three topics cannot notify. A later guess in code would suppress or force the wrong record. |
| Implementation risk | Low once the class is written into the specification. |
| Estimated scope | S |
| Dependencies | A specification update. Not authorized by this entry. |
| Product behavior impact | Yes |
| Specification impact | Yes |
| Migration impact | No, until the allowlist gains the topics |
| Security impact | The security-critical and authentication-informational rows are policy constrained, so leaving them unclassified avoids a wrong suppression |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | Before any producer emits one of these topics. MVP-042 should not guess the class. |
| Status | PROPOSED |
| Related GitHub Issue | [#43](https://github.com/xela-ash/Music_app/issues/43) |
| Related PR | [#70](https://github.com/xela-ash/music_app/pull/70) |
| Resolution | — |

### ENG-IMP-037 Verified notification events do not check the topic's owning domain

| Field | Value |
|---|---|
| ID | ENG-IMP-037 |
| Title | Verified notification events do not check the topic's owning domain |
| Date identified | 2026-09-29 |
| Identified by | Independent review of MVP-041 |
| Category | Architecture |
| Affected subsystem | Notifications |
| Current state | `parseVerifiedEvent` in `backend/src/notifications/rules.js` accepts any source domain from the global allowlist with any classified topic. |
| Evidence / problem | Notifications §8.1 names the owning domain on each topic row. §15.1 says to hold malformed input. A Projects event can currently be stored under a Disputes topic. The independent review classified this as non-blocking. |
| Suggested improvement | Reject a source domain that the topic row does not name. |
| Expected benefit | Intent rows keep the matrix's source-domain binding. |
| Risk of doing nothing | A mistaken producer can file a notice under the wrong domain. Deduping still prevents duplicates for the same tuple. |
| Implementation risk | Low. Some rows name two domains, so the check is a set, not one string. |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | Yes, for a mismatched producer |
| Specification impact | No |
| Migration impact | No |
| Security impact | Low. Ingestion is still in-process only. |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | With the first domain that calls `submitVerifiedEvent` |
| Status | PROPOSED |
| Related GitHub Issue | [#43](https://github.com/xela-ash/Music_app/issues/43) |
| Related PR | [#70](https://github.com/xela-ash/music_app/pull/70) |
| Resolution | — |

### ENG-IMP-038 Notification intent class is not tied to the topic

| Field | Value |
|---|---|
| ID | ENG-IMP-038 |
| Title | Notification intent class is not tied to the topic |
| Date identified | 2026-09-29 |
| Identified by | Independent review of MVP-041 |
| Category | Database |
| Affected subsystem | Notifications |
| Current state | `notification_intents.topic` and `mandatory_class` are separate columns. The topic allowlist does not constrain the class. |
| Evidence / problem | A direct insert can snapshot `New message` as `MANDATORY` or a dispute topic as `CONFIGURABLE`. The append-only trigger and the mandatory-in-app suppression trigger then enforce that snapshot. The service path writes the class from `topics.js`. The independent review classified this as non-blocking. |
| Suggested improvement | Add a check or trigger that pairs each allowed topic with its classified snapshot. |
| Expected benefit | A bypassed insert cannot freeze the wrong class. |
| Risk of doing nothing | Only a database session that skips the service can write the wrong pair. Application callers cannot. |
| Implementation risk | Low. The pair list must change when ENG-IMP-036 topics are classified. |
| Estimated scope | S |
| Dependencies | ENG-IMP-036 if those topics are added later |
| Product behavior impact | No, for the service path |
| Specification impact | No |
| Migration impact | Yes, a new check constraint |
| Security impact | Closes a direct-SQL misclassification |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | Before any non-service writer exists |
| Status | PROPOSED |
| Related GitHub Issue | [#43](https://github.com/xela-ash/Music_app/issues/43) |
| Related PR | [#70](https://github.com/xela-ash/music_app/pull/70) |
| Resolution | — |

### ENG-IMP-039 Notification preferences have no User Settings store

| Field | Value |
|---|---|
| ID | ENG-IMP-039 |
| Title | Notification preferences have no User Settings store |
| Date identified | 2026-09-29 |
| Identified by | MVP-042 implementation |
| Category | Architecture |
| Affected subsystem | Notifications, User Settings |
| Current state | `readNotificationSettings` returns `{ ok: false, reason: "user_settings_unavailable" }`. Fan-out then uses the topic-matrix default. A test can replace the reader. No settings table is queried. |
| Evidence / problem | User Settings §9 defines `notifications.in_app_enabled` and the related keys, and Notifications §15.1 requires a live read. MVP-042 forbids a schema change, and Notifications §11 says this domain does not store the preference. A live user therefore cannot disable a configurable channel. |
| Suggested improvement | When User Settings storage exists, point the production reader at that store and remove the test-only seam from the production path. |
| Expected benefit | A saved disable suppresses that channel for a real account. |
| Risk of doing nothing | Configurable topics whose matrix default is in-app keep being delivered. |
| Implementation risk | Medium. The store's shape is still an open User Settings question. |
| Estimated scope | M |
| Dependencies | User Settings persistence, which no current MVP item creates |
| Product behavior impact | No. The unavailable read is the specified failure behavior. |
| Specification impact | No |
| Migration impact | Yes, in the User Settings item that creates the store |
| Security impact | None beyond the specified matrix default |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | With the first User Settings storage item |
| Status | PROPOSED |
| Related GitHub Issue | [#44](https://github.com/xela-ash/Music_app/issues/44) |
| Related PR | [#73](https://github.com/xela-ash/music_app/pull/73) |
| Resolution | — |

### ENG-IMP-040 Quiet hours and digest are not applied

| Field | Value |
|---|---|
| ID | ENG-IMP-040 |
| Title | Quiet hours and digest are not applied |
| Date identified | 2026-09-29 |
| Identified by | MVP-042 implementation |
| Category | Architecture |
| Affected subsystem | Notifications |
| Current state | `evaluatePreferences` does not read `notifications.quiet_hours` or `notifications.digest`. |
| Evidence / problem | Notifications §8.2 includes digest and quiet-hours after the global toggles. User Settings describes quiet hours as a nullable local-time range and does not define the range format. Digest values are `off`, `daily`, and `weekly`, and Notifications EQ4 asks whether digest is in scope. No send clock is specified. |
| Suggested improvement | Apply deferral only after the range format and the digest schedule are specified. Do not treat the current skip as the product rule. |
| Expected benefit | Non-urgent delivery can wait without suppressing security, safety, or time-critical events. |
| Risk of doing nothing | A stored quiet-hours value would have no effect once a settings store exists. |
| Implementation risk | Medium. The window format and the urgent-topic set need a specification decision. |
| Estimated scope | M |
| Dependencies | A specified quiet-hours range and digest schedule |
| Product behavior impact | Yes, once those values are specified |
| Specification impact | Yes. The format and schedule are unspecified. |
| Migration impact | None until the values are stored |
| Security impact | A wrong deferral could delay a time-critical notice |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | After the format is specified and a settings store exists |
| Status | PROPOSED |
| Related GitHub Issue | [#44](https://github.com/xela-ash/Music_app/issues/44) |
| Related PR | [#73](https://github.com/xela-ash/music_app/pull/73) |
| Resolution | — |

### ENG-IMP-042 Completed send idempotency payloads keep the pre-tombstone body

| Field | Value |
|---|---|
| ID | ENG-IMP-042 |
| Title | Completed send idempotency payloads keep the pre-tombstone body |
| Date identified | 2026-09-29 |
| Identified by | MVP-038 independent review |
| Category | Security, Database |
| Affected subsystem | Messaging, idempotency |
| Current state | A send replay re-reads the message and returns `body: null` after a tombstone. The completed `idempotency_keys.response_body` from the original send is not rewritten. Migration 009 rejects changes to a completed key. |
| Evidence / problem | `REQ-MESSAGING-005` redacts ordinary display. The HTTP replay does that. A direct read of `idempotency_keys` still shows the original body. Changing the completed-key trigger would weaken MVP-003's evidence rule. |
| Suggested improvement | Decide a redaction or retention rule for completed idempotency payloads that contain message text, without allowing general edits to completed keys. |
| Expected benefit | Tombstone redaction would cover the stored HTTP payload as well as the live response. |
| Risk of doing nothing | An operator or a future dump of `idempotency_keys` can still read a tombstoned body. The message row retains that body on purpose. |
| Implementation risk | Medium. The idempotency trigger is shared infrastructure. |
| Estimated scope | S |
| Dependencies | A decision that does not weaken completed-key immutability for other commands |
| Product behavior impact | No for the messaging API. The stored payload is not an ordinary participant response. |
| Specification impact | No, unless Product wants the idempotency copy redacted |
| Migration impact | None until a redaction rule exists |
| Security impact | The extra copy is visible to database readers |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | After MVP-038, if a retention review asks for it |
| Status | PROPOSED |
| Related GitHub Issue | [#40](https://github.com/xela-ash/Music_app/issues/40) |
| Related PR | [#79](https://github.com/xela-ash/music_app/pull/79) |
| Resolution | — |

### ENG-IMP-043 An active seller receives 409 on a buyer-only project command

| Field | Value |
|---|---|
| ID | ENG-IMP-043 |
| Title | An active seller receives 409 on a buyer-only project command |
| Date identified | 2026-09-30 |
| Identified by | MVP-015 independent review |
| Category | Authorization |
| Affected subsystem | Projects |
| Current state | `withProjectCommand` returns 404 when the caller is neither the buyer nor the active seller. `commitTransition` then returns 409 `Invalid project transition` when an active seller calls a buyer-only edge such as archive or buyer cancel. |
| Evidence / problem | Issue #17 allows deny or a concealing 404 for the wrong role. The active seller is a participant, so 409 names the project. An outsider still receives 404. |
| Suggested improvement | Decide whether a participant who lacks the edge's actor should receive the same concealing 404 as an outsider. |
| Expected benefit | Wrong-role participants would not learn that the project exists in a state that rejects their command. |
| Risk of doing nothing | A participant sees a transition error instead of a concealed miss. The issue accepts either denial. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | Only the status shown to a participant who cannot take that edge |
| Specification impact | No. Section 11.3 names the initiator. It does not require 404 for a participant. |
| Migration impact | None |
| Security impact | Low. The caller is already a project participant. |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | A later authorization pass |
| Status | PROPOSED |
| Related GitHub Issue | [#17](https://github.com/xela-ash/Music_app/issues/17) |
| Related PR | [#81](https://github.com/xela-ash/music_app/pull/81) |
| Resolution | — |

### ENG-IMP-044 Invite checks an accepted seller before the idempotency store

| Field | Value |
|---|---|
| ID | ENG-IMP-044 |
| Title | Invite checks an accepted seller before the idempotency store |
| Date identified | 2026-09-30 |
| Identified by | MVP-015 independent review |
| Category | API, Idempotency |
| Affected subsystem | Projects, invitations |
| Current state | `authorizeInviteSeller` no longer rejects project state before `executeIdempotent`. It still returns 409 when `hasActiveSeller` is true, and that check runs before the idempotency claim. |
| Evidence / problem | A replay of a successful invite key returns the stored 201 while the project is still `seller_invited`. The same key after acceptance returns 409 `An accepted seller already exists` and does not read the stored response. |
| Suggested improvement | Claim the idempotency key before the accepted-seller check, so an identical replay returns the stored invitation after acceptance. |
| Expected benefit | The invite key would stay stable for its original request after the seller accepts. |
| Risk of doing nothing | A client that retries the original invite after acceptance sees a conflict instead of the original invitation. |
| Implementation risk | Low. The state check already moved inside the handler for this reason. |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | Replay status after acceptance only |
| Specification impact | No |
| Migration impact | None |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | The next invitation change |
| Status | PROPOSED |
| Related GitHub Issue | [#17](https://github.com/xela-ash/Music_app/issues/17) |
| Related PR | [#81](https://github.com/xela-ash/music_app/pull/81) |
| Resolution | — |

### ENG-IMP-045 Project transition audit and outbox omit named fact fields

| Field | Value |
|---|---|
| ID | ENG-IMP-045 |
| Title | Project transition audit and outbox omit named fact fields |
| Date identified | 2026-09-30 |
| Identified by | MVP-015 independent review |
| Category | Audit |
| Affected subsystem | Projects |
| Current state | A completed transition writes `AUD-PROJECTS-003` with actor, source, target, outcome, and the source fact in `idempotency_key`. `project_audit_events` has no preconditions column. `ProjectStateChanged` carries action, project, source, and target. Aggregate version is the outbox column. |
| Evidence / problem | `AUD-PROJECTS-003` names preconditions. `EVT-PROJECTS-005` names the source fact id on `ProjectStateChanged`. Neither is a separate stored field today. |
| Suggested improvement | When a later audit or event item defines the column and payload, store the precondition set and put the source fact id in the outbox payload. Do not invent that shape in MVP-015. |
| Expected benefit | A consumer could read the fact the matrix says the event carries. |
| Risk of doing nothing | The source fact is only in the audit row's idempotency key. The outbox payload does not repeat it. |
| Implementation risk | Low once the payload shape is specified |
| Estimated scope | S |
| Dependencies | No new audit column without a specification for it |
| Product behavior impact | No user-visible behavior |
| Specification impact | No |
| Migration impact | None until a column is specified |
| Security impact | The fact id is already in the audit row |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | The notification or audit consumer that reads `ProjectStateChanged` |
| Status | PROPOSED |
| Related GitHub Issue | [#17](https://github.com/xela-ash/Music_app/issues/17) |
| Related PR | [#81](https://github.com/xela-ash/music_app/pull/81) |
| Resolution | — |

### ENG-IMP-046 Amendment expiry has no maximum duration

| Field | Value |
|---|---|
| ID | ENG-IMP-046 |
| Title | Amendment expiry has no maximum duration |
| Date identified | 2026-09-30 |
| Identified by | MVP-016 implementation |
| Category | API, Security |
| Affected subsystem | Projects |
| Current state | `POST /projects/:projectId/amendments` requires `expires_at` to be a future UTC timestamp. The database requires `expires_at > created_at`. No maximum duration is stored or checked. |
| Evidence / problem | Projects §15 says an amendment has a fixed expiry and does not state a duration or a maximum. The same gap is recorded for invitations as `ENG-IMP-033`. |
| Suggested improvement | When a specification states a maximum, reject a later `expires_at`. Do not invent that maximum in application code. |
| Expected benefit | A pending amendment could not remain open indefinitely by caller choice. |
| Risk of doing nothing | A party can propose an amendment that expires only at a distant caller-chosen time. The counterparty can still reject or ignore it, and silence is not consent. |
| Implementation risk | Low once a duration is specified |
| Estimated scope | S |
| Dependencies | A product decision naming the maximum |
| Product behavior impact | Would reject currently accepted far-future expiry values |
| Specification impact | Requires an approved duration before the check exists |
| Migration impact | None |
| Security impact | Bounds how long a pending commercial proposal can sit |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | The product decision that sets invitation or amendment duration |
| Status | PROPOSED |
| Related GitHub Issue | [#18](https://github.com/xela-ash/Music_app/issues/18) |
| Related PR | — |
| Resolution | — |

### ENG-IMP-047 Amendment relationship checks are not in authorize()

| Field | Value |
|---|---|
| ID | ENG-IMP-047 |
| Title | Amendment relationship checks are not in authorize() |
| Date identified | 2026-09-30 |
| Identified by | MVP-016 independent review |
| Category | Authorization |
| Affected subsystem | Projects |
| Current state | Propose, accept, reject, and withdraw decide the buyer, active seller, proposer, and counterparty inside `amendment-service.js`. |
| Evidence / problem | Other project commands call `authorize()` for the relationship check. Amendments do not, because §13 does not define a new permission key beyond the relationship the service already checks. |
| Suggested improvement | If a later authorization item adds amendment actions to the permission catalog, route these checks through `authorize()` without changing the 404 and 409 outcomes. |
| Expected benefit | One place would list the project relationship checks. |
| Risk of doing nothing | A future route can copy the inline check incorrectly. The current routes still conceal outsiders and the wrong role. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | A permission catalog entry the specification does not define today |
| Product behavior impact | None if the statuses stay the same |
| Specification impact | No |
| Migration impact | None |
| Security impact | None while the service checks remain |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | The authorization item that catalogs amendment actions |
| Status | PROPOSED |
| Related GitHub Issue | [#18](https://github.com/xela-ash/Music_app/issues/18) |
| Related PR | [#84](https://github.com/xela-ash/music_app/pull/84) |
| Resolution | — |

### ENG-IMP-048 Amendment transition table is not called by the service

| Field | Value |
|---|---|
| ID | ENG-IMP-048 |
| Title | Amendment transition table is not called by the service |
| Date identified | 2026-09-30 |
| Identified by | MVP-016 independent review |
| Category | Maintainability |
| Affected subsystem | Projects |
| Current state | `amendmentTransition` lists the four legal edges. `amendment-service.js` repeats those actor and status checks instead of calling the function. |
| Evidence / problem | The unit matrix can stay green if the service allows a different edge. |
| Suggested improvement | Have the service call `amendmentTransition` before it writes a terminal status. |
| Expected benefit | An unlisted edge would have one definition. |
| Risk of doing nothing | The HTTP tests still cover the legal edges and the wrong-role denials. A later edit could diverge the two copies. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | None if the outcomes stay the same |
| Specification impact | No |
| Migration impact | None |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | The next amendment change |
| Status | PROPOSED |
| Related GitHub Issue | [#18](https://github.com/xela-ash/Music_app/issues/18) |
| Related PR | [#84](https://github.com/xela-ash/music_app/pull/84) |
| Resolution | — |

### ENG-IMP-049 A matching later snapshot can move the agreed pointer without an amendment

| Field | Value |
|---|---|
| ID | ENG-IMP-049 |
| Title | A matching later snapshot can move the agreed pointer without an amendment |
| Date identified | 2026-09-30 |
| Identified by | MVP-016 independent review |
| Category | Database |
| Affected subsystem | Projects |
| Current state | After agreement, `agreed_term_version` can move only forward to an existing `agreed` row whose live commercial columns match. `start_at` and `due_at` are not live project columns. |
| Evidence / problem | A direct insert of a later `agreed` row that copies the live title, brief, service snapshot, currency, exponent, total, and revision limit, but changes `start_at` or `due_at`, can then be selected by `UPDATE projects SET agreed_term_version`. No amendment row is required. The application accept path does not do this. |
| Suggested improvement | When a later item can do it without blocking seller acceptance, require a forward pointer move to reference an accepted amendment, or compare the date fields through a stored live column. |
| Expected benefit | A SQL session could not retarget dates while leaving the visible commercial columns unchanged. |
| Risk of doing nothing | The HTTP commands still append a version only through acceptance. The bypass needs direct table access. |
| Implementation risk | Medium if the check also rejects the seller-acceptance pointer, which is not an amendment |
| Estimated scope | S |
| Dependencies | A way to tell seller acceptance from a later pointer move |
| Product behavior impact | None for the amendment routes |
| Specification impact | No |
| Migration impact | None until the check exists |
| Security impact | Direct SQL can still move dates |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | A later amendment or term-version hardening item |
| Status | PROPOSED |
| Related GitHub Issue | [#18](https://github.com/xela-ash/Music_app/issues/18) |
| Related PR | [#84](https://github.com/xela-ash/music_app/pull/84) |
| Resolution | — |

### ENG-IMP-050 Milestone lines stay inside the 32-bit project total

| Field | Value |
|---|---|
| ID | ENG-IMP-050 |
| Title | Milestone lines stay inside the 32-bit project total |
| Date identified | 2026-10-01 |
| Identified by | MVP-017 implementation |
| Category | Database |
| Affected subsystem | Milestones, Projects |
| Current state | `project_milestones.amount` is `BIGINT`. `projects.price_amount` is `INTEGER`. Create rejects a milestone amount above `2147483647`. |
| Evidence / problem | The milestone sum must equal the project total. A BIGINT line that cannot fit in the project column cannot be stored, so the wider milestone type is not usable above the 32-bit project limit. |
| Suggested improvement | Widen `projects.price_amount` and the escrow amount columns together when a financial item authorizes 64-bit live totals. |
| Expected benefit | A milestone line and the project total can both use the signed 64-bit minor-unit range the specifications name. |
| Risk of doing nothing | Values inside the current INTEGER range remain exact. Larger totals are rejected at create. |
| Implementation risk | High if widened without the escrow columns |
| Estimated scope | M |
| Dependencies | Escrow money-type migration |
| Product behavior impact | None while totals stay inside the current limit |
| Specification impact | No |
| Migration impact | A later widening migration |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | The financial item that widens live money columns |
| Status | PROPOSED |
| Related GitHub Issue | [#19](https://github.com/xela-ash/Music_app/issues/19) |
| Related PR | [#86](https://github.com/xela-ash/music_app/pull/86) |
| Resolution | — |

### ENG-IMP-051 The milestone lock trigger does not lock the project row

| Field | Value |
|---|---|
| ID | ENG-IMP-051 |
| Title | The milestone lock trigger does not lock the project row |
| Date identified | 2026-10-01 |
| Identified by | MVP-017 implementation |
| Category | Database |
| Affected subsystem | Milestones |
| Current state | `protect_locked_milestones` reads `projects.milestones_locked_at` and `proposal_version` with a plain `SELECT`. |
| Evidence / problem | A concurrent insert can observe the project row before a freeze commits. The HTTP API has no route that inserts a milestone after create, so the race is direct SQL or a future route. |
| Suggested improvement | Take a consistent lock order, project then milestone, before deciding that an insert is still allowed. |
| Expected benefit | A freeze and a concurrent insert cannot both commit. |
| Risk of doing nothing | The current create-then-propose API does not issue that concurrent insert. |
| Implementation risk | Medium because the lock order can deadlock with the transition's project lock |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | None for the current routes |
| Specification impact | No |
| Migration impact | Trigger replacement only |
| Security impact | Direct SQL can still race a freeze |
| Performance impact | None at the current write rate |
| Priority suggestion | Low |
| Recommended timing | A later milestone-edit or concurrency item |
| Status | PROPOSED |
| Related GitHub Issue | [#19](https://github.com/xela-ash/Music_app/issues/19) |
| Related PR | [#86](https://github.com/xela-ash/music_app/pull/86) |
| Resolution | — |

### ENG-IMP-052 The incomplete-freeze test does not execute the update

| Field | Value |
|---|---|
| ID | ENG-IMP-052 |
| Title | The incomplete-freeze test does not execute the update |
| Date identified | 2026-10-01 |
| Identified by | MVP-017 independent review |
| Category | Testing |
| Affected subsystem | Milestones, testing |
| Current state | `backend/test/milestone-terms.http.test.js` checks migration text and `pg_get_functiondef` for `Milestone terms are incomplete`. |
| Evidence / problem | The case does not issue a draft-to-frozen update and assert that PostgreSQL rejects it. |
| Suggested improvement | Add a database update that expects the incomplete-freeze exception. |
| Expected benefit | A trigger-body edit that keeps the exception text but drops the guard would fail the test. |
| Risk of doing nothing | The function definition and the migration text still have to contain the guard. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | None |
| Specification impact | No |
| Migration impact | None |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | A later milestone-test item |
| Status | PROPOSED |
| Related GitHub Issue | [#19](https://github.com/xela-ash/Music_app/issues/19) |
| Related PR | [#86](https://github.com/xela-ash/music_app/pull/86) |
| Resolution | — |

### ENG-IMP-053 Invite readiness does not recheck catalogue codes

| Field | Value |
|---|---|
| ID | ENG-IMP-053 |
| Title | Invite readiness does not recheck catalogue codes |
| Date identified | 2026-10-01 |
| Identified by | MVP-017 independent review |
| Category | Backend |
| Affected subsystem | Projects, invitations |
| Current state | Invite `terms_complete` requires a non-empty `required_deliverables` array. It does not check that each code is in the catalogue. |
| Evidence / problem | A direct SQL row could store an unknown code and still pass the invite query. Acceptance still runs `assertSnapshotReady`, which rejects unknown codes. |
| Suggested improvement | Use the same catalogue validation on the invite gate that acceptance already uses. |
| Expected benefit | An unknown code is rejected at invite as well as at acceptance. |
| Risk of doing nothing | The create route and acceptance already reject unknown codes. The gap is a direct SQL row. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | None for rows created through the API |
| Specification impact | No |
| Migration impact | None |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | A later invitation-validation item |
| Status | PROPOSED |
| Related GitHub Issue | [#19](https://github.com/xela-ash/Music_app/issues/19) |
| Related PR | [#86](https://github.com/xela-ash/music_app/pull/86) |
| Resolution | — |

### ENG-IMP-054 Revision reason codes and detail bound are unspecified

| Field | Value |
|---|---|
| ID | ENG-IMP-054 |
| Title | Revision reason codes and detail bound are unspecified |
| Date identified | 2026-10-01 |
| Identified by | MVP-018 implementation |
| Category | Backend |
| Affected subsystem | Milestones |
| Current state | M06 stores any non-blank `reason_code` and `detail`. Blank values are rejected. There is no allowlist and no character maximum. |
| Evidence / problem | Milestones §17.1 says the reason-code list is a product decision and that the detail is bounded. It names neither the codes nor the bound. |
| Suggested improvement | When Product records the code list and the bound, enforce both on M06 and reject anything outside them. |
| Expected benefit | Revision requests match the decided vocabulary and size. |
| Risk of doing nothing | Buyers can submit any non-blank code and any length of detail that the database accepts. |
| Implementation risk | Low, once the specification names the list and the bound |
| Estimated scope | S |
| Dependencies | A product decision recorded in Milestones §17.1 |
| Product behavior impact | Yes. The list and the bound change what a Buyer may submit. They are not chosen here. |
| Specification impact | Yes. The owning specification has to name them before enforcement. |
| Migration impact | None until a bound is specified |
| Security impact | None until the bound is specified. Detail text is already kept off the audit and outbox payloads. |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | After Product records the §17.1 code list and detail bound |
| Status | PROPOSED |
| Related GitHub Issue | [#20](https://github.com/xela-ash/Music_app/issues/20) |
| Related PR | [#88](https://github.com/xela-ash/music_app/pull/88) |
| Resolution | — |

### ENG-IMP-055 Milestone transition tests do not cover every source and outcome

| Field | Value |
|---|---|
| ID | ENG-IMP-055 |
| Title | Milestone transition tests do not cover every source and outcome |
| Date identified | 2026-10-01 |
| Identified by | MVP-018 independent review |
| Category | Testing |
| Affected subsystem | Milestones |
| Current state | `backend/test/milestone-transitions.test.js` walks one successful path for each of M01–M17. It does not execute every source state of M03, M09, M11, M12, and M14, and it does not read `interruption_reason` on the post-start reversal. |
| Evidence / problem | Those edges have more than one legal source or outcome. The cases that do run assert status and the resulting state. |
| Suggested improvement | Add one case per remaining source and outcome, and assert `interruption_reason` for the post-start reversal. |
| Expected benefit | A later edit of one source list fails a test. |
| Risk of doing nothing | The service and the database edge list still reject unlisted pairs. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | None |
| Specification impact | No |
| Migration impact | None |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | A later milestone-test item |
| Status | PROPOSED |
| Related GitHub Issue | [#20](https://github.com/xela-ash/Music_app/issues/20) |
| Related PR | [#88](https://github.com/xela-ash/music_app/pull/88) |
| Resolution | — |

### ENG-IMP-056 The state trigger does not bind a resume exit to the stored state

| Field | Value |
|---|---|
| ID | ENG-IMP-056 |
| Title | The state trigger does not bind a resume exit to the stored state |
| Date identified | 2026-10-01 |
| Identified by | MVP-018 independent review |
| Category | Database |
| Affected subsystem | Milestones |
| Current state | `protect_milestone_state` allows any listed exit from `disputed` or `suspended`. M10 and M13 in the service restore the stored `resume_state`. |
| Evidence / problem | A session that sets `musicapp.milestone_transition` could update a disputed row to another listed state. |
| Suggested improvement | Reject a non-terminal exit from `disputed` or `suspended` unless the new state equals `resume_state`. Keep terminal resolution exits in the trigger. |
| Expected benefit | The database guard matches the service for resume. |
| Risk of doing nothing | The service is the only writer that sets the session flag. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | None |
| Specification impact | No |
| Migration impact | Function replace only |
| Security impact | Low. It narrows a session-flag bypass. |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | A later milestone-transition item |
| Status | PROPOSED |
| Related GitHub Issue | [#20](https://github.com/xela-ash/Music_app/issues/20) |
| Related PR | [#88](https://github.com/xela-ash/music_app/pull/88) |
| Resolution | — |

### ENG-IMP-057 Resume does not recheck funding or submission facts

| Field | Value |
|---|---|
| ID | ENG-IMP-057 |
| Title | Resume does not recheck funding or submission facts |
| Date identified | 2026-10-01 |
| Identified by | MVP-018 independent review |
| Category | Backend |
| Affected subsystem | Milestones |
| Current state | M10 and M13 restore the stored `resume_state` when the resolution names that state. They do not re-read the funding fact or the latest submission. |
| Evidence / problem | Milestones §12.1 says live facts revalidate on resume. It does not list which facts. The one-active index still rejects a second `in_progress` or `delivered` row. |
| Suggested improvement | When the specification lists the facts that must be revalidated, check those facts before restoring. |
| Expected benefit | A resume cannot restore a state whose funding or submission fact is no longer valid. |
| Risk of doing nothing | Resume still requires the stored state, and this item does not invent the fact list. |
| Implementation risk | Medium, until the fact list is specified |
| Estimated scope | M |
| Dependencies | A specification list of the live facts |
| Product behavior impact | Yes, once the fact list is chosen. It is not chosen here. |
| Specification impact | Yes. The owning specification has to name the facts first. |
| Migration impact | None |
| Security impact | None until the facts are specified |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | After the specification names the resume facts |
| Status | PROPOSED |
| Related GitHub Issue | [#20](https://github.com/xela-ash/Music_app/issues/20) |
| Related PR | [#88](https://github.com/xela-ash/music_app/pull/88) |
| Resolution | — |

### ENG-IMP-058 Escrow facts are not re-identified against the milestone

| Field | Value |
|---|---|
| ID | ENG-IMP-058 |
| Title | Escrow facts are not re-identified against the milestone |
| Date identified | 2026-10-01 |
| Identified by | MVP-018 independent review |
| Category | Backend |
| Affected subsystem | Milestones |
| Current state | `applyMilestoneTransition` receives the project and milestone ids from its caller. A system fact is matched on amount, currency, exponent, and term version. It is not required to carry the project and milestone external ids. |
| Evidence / problem | `REQ-PROJECTS-029` says a funding, release, or refund fact must match the Project and the Milestone. A caller that passes the wrong row can apply a fact whose money matches that row. |
| Suggested improvement | When the escrow consumer exists, require the fact to name the project and milestone external ids and quarantine a mismatch. |
| Expected benefit | A mis-routed fact cannot fund or release a different milestone with the same amount. |
| Risk of doing nothing | There is no public escrow consumer yet. MVP-024 is the funding-intent item. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | The escrow fact consumer |
| Product behavior impact | None until that consumer exists |
| Specification impact | No |
| Migration impact | None |
| Security impact | Medium once a consumer routes facts |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | The first escrow fact consumer |
| Status | PROPOSED |
| Related GitHub Issue | [#20](https://github.com/xela-ash/Music_app/issues/20) |
| Related PR | [#88](https://github.com/xela-ash/music_app/pull/88) |
| Resolution | — |

### ENG-IMP-059 Interruption events and superseded milestones are incomplete

| Field | Value |
|---|---|
| ID | ENG-IMP-059 |
| Title | Interruption events and superseded milestones are incomplete |
| Date identified | 2026-10-01 |
| Identified by | MVP-018 independent review |
| Category | Backend |
| Affected subsystem | Milestones |
| Current state | Post-start M03 writes `EVT-PROJECTS-009` and enters `suspended`. It does not write `EVT-PROJECTS-013`. M15 sets `cancelled_at`. It does not mark the milestone superseded. There is no `superseded_in_term_version` column. |
| Evidence / problem | `EVT-PROJECTS-013` is defined as an interruption opened or cleared. M15 says to mark a milestone superseded when an amendment removes it. This item's M15 path is unfunded cancellation, not an amendment. |
| Suggested improvement | Emit `EVT-PROJECTS-013` when M03 suspends and when an interruption clears. Add superseded marking only when an amendment-removal fact exists. |
| Expected benefit | Interruption consumers see the post-start reversal. Amendment removal can mark the row superseded without inventing that fact now. |
| Risk of doing nothing | State, audit, and `EVT-PROJECTS-009` still record the reversal and the cancellation. |
| Implementation risk | Low for the event. The superseded column waits on the amendment fact. |
| Estimated scope | S |
| Dependencies | None for the event. An amendment-removal fact for the column. |
| Product behavior impact | None for the event. The superseded column changes evidence once the amendment fact exists. |
| Specification impact | No |
| Migration impact | None for the event |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | A later interruption or amendment item |
| Status | PROPOSED |
| Related GitHub Issue | [#20](https://github.com/xela-ash/Music_app/issues/20) |
| Related PR | [#88](https://github.com/xela-ash/music_app/pull/88) |
| Resolution | — |

### ENG-IMP-060 The concurrent start test does not resubmit the losing key

| Field | Value |
|---|---|
| ID | ENG-IMP-060 |
| Title | The concurrent start test does not resubmit the losing key |
| Date identified | 2026-10-01 |
| Identified by | MVP-019 independent review |
| Category | Testing |
| Affected subsystem | Milestones |
| Current state | Two parallel `milestone.start` commands on one milestone produce one `200` and one `409`, and one start transition. The test does not send the losing idempotency key again. |
| Evidence / problem | A `409` that had been committed with the key would still satisfy the current assertions. The service rolls the failed command back, so the key is not stored, but the test does not show the retry. |
| Suggested improvement | After the race, resubmit the losing key with the current version and assert that start is rejected as stale or already in progress without a second transition. |
| Expected benefit | The concurrency test would fail if a losing `409` consumed the idempotency key. |
| Risk of doing nothing | The rollback path is implemented and covered by the single transition count. A future change could commit the `409` without this test noticing the key. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | None |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | None |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | A later milestone-command test pass |
| Status | PROPOSED |
| Related GitHub Issue | [#21](https://github.com/xela-ash/music_app/issues/21) |
| Related PR | [#90](https://github.com/xela-ash/music_app/pull/90) |
| Resolution | — |

### ENG-IMP-061 Escrow audit rows do not store amount and currency as columns

| Field | Value |
|---|---|
| ID | ENG-IMP-061 |
| Title | Escrow audit rows do not store amount and currency as columns |
| Date identified | 2026-10-01 |
| Identified by | MVP-024 independent review |
| Category | Database |
| Affected subsystem | Escrow |
| Current state | `AUD-ESCROW-001` is a `project_audit_events` row. Amount, currency, exponent, and the escrow external id are inside `change_hash`. The escrow and allocation rows store the figures. |
| Evidence / problem | Escrow §23.1 says the audit record identifies amount and currency. The hash is not queryable as those fields. `project_audit_events` has no amount or currency columns. |
| Suggested improvement | When an escrow audit table or an additive audit column is specified, store the amount and currency beside the hash. Do not weaken the hash. |
| Expected benefit | An auditor can read the amount without reversing the hash. |
| Risk of doing nothing | The escrow row and the hash still carry the figures. The command's evidence is not lost. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | A specified escrow audit layout. This entry does not authorize one. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | Additive columns or a new table, only after the layout is specified |
| Security impact | None. The hash already covers the figures. |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | With a later escrow audit item |
| Status | PROPOSED |
| Related GitHub Issue | [#26](https://github.com/xela-ash/Music_app/issues/26) |
| Related PR | [#92](https://github.com/xela-ash/music_app/pull/92) |
| Resolution | — |

### ENG-IMP-062 The application role owns the ledger table

| Field | Value |
|---|---|
| ID | ENG-IMP-062 |
| Title | The application role owns the ledger table |
| Date identified | 2026-10-01 |
| Identified by | MVP-026 implementation |
| Category | Security |
| Affected subsystem | Escrow |
| Current state | Migration `020` revokes `UPDATE`, `DELETE`, and `TRUNCATE` on `escrow_ledger` from `PUBLIC` and from `musicapp`. Triggers reject those statements as well. `musicapp` still owns the table, runs migrations, and serves the API. |
| Evidence / problem | Escrow §13.4 asks for an application role with `INSERT` and `SELECT` only. An owner can grant the revoked privileges back or disable the trigger. The repository has one database role for migrations and the application. |
| Suggested improvement | Introduce a non-owner application role that cannot alter `escrow_ledger`, and keep ownership with the migration role. |
| Expected benefit | A compromised application credential cannot disable the append-only trigger. |
| Risk of doing nothing | The trigger still rejects `UPDATE`, `DELETE`, and `TRUNCATE` for the current role unless that role first disables the trigger. |
| Implementation risk | Medium. Every connection string and the test fixture would change. |
| Estimated scope | M |
| Dependencies | None |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | Role and grant changes. No ledger rewrite. |
| Security impact | Closes the remaining owner path in `SEC-ESCROW-001`. |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | Before a production financial deployment |
| Status | PROPOSED |
| Related GitHub Issue | [#28](https://github.com/xela-ash/music_app/issues/28) |
| Related PR | [#94](https://github.com/xela-ash/music_app/pull/94) |
| Resolution | — |

### ENG-IMP-063 The ledger poster does not write allocation projections

| Field | Value |
|---|---|
| ID | ENG-IMP-063 |
| Title | The ledger poster does not write allocation projections |
| Date identified | 2026-10-01 |
| Identified by | MVP-026 independent review |
| Category | Database |
| Affected subsystem | Escrow |
| Current state | `postJournal` rewrites `escrows.funded_amount`, `released_amount`, and `refunded_amount` from the ledger. The deferred check also requires each allocation's `funded_amount`, `released_amount`, and `refunded_amount` to match that allocation's ledger net. The service does not update those allocation columns. |
| Evidence / problem | A journal that changes an allocation net aborts at commit with `allocation projections must equal the ledger`. Escrow and allocation projections cannot drift. A later funding journal that posts `allocated_to_milestone` has to update the allocation rows in the same transaction. |
| Suggested improvement | When a later item posts an allocation movement, write the allocation projections from the same ledger sums inside `postJournal` before commit. |
| Expected benefit | E02 and release journals can commit through the one poster. |
| Risk of doing nothing | Today's net-zero journals do not touch allocations, so they commit. A later caller that forgets the allocation update cannot commit a drifting total. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | A later item that posts an allocation movement. This entry does not authorize one. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | None |
| Security impact | None. The deferred check still rejects drift. |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | With the first journal that moves an allocation |
| Status | PROPOSED |
| Related GitHub Issue | [#28](https://github.com/xela-ash/music_app/issues/28) |
| Related PR | [#94](https://github.com/xela-ash/music_app/pull/94) |
| Resolution | — |

### ENG-IMP-064 The created-escrow guard watches only three projections

| Field | Value |
|---|---|
| ID | ENG-IMP-064 |
| Title | The created-escrow guard watches only three projections |
| Date identified | 2026-10-01 |
| Identified by | MVP-026 independent review |
| Category | Security |
| Affected subsystem | Escrow |
| Current state | `postJournal` rejects a `created` escrow journal whose funded, released, or refunded projection would become nonzero. `projectionDelta` does not include `adjustment`, `chargeback`, `payout_initiated`, `payout_paid`, `refund_paid`, or a fee whose source is `EXTERNAL_BUYER`. `reverses_entry_id` is not required to reference the same escrow. |
| Evidence / problem | An adjustment can leave a balance in an account while `funded_amount` stays 0. Escrow §9.1 and §10.1 define confirmed funds as those three projections, so this does not leave a `created` escrow holding confirmed funds. |
| Suggested improvement | When a later command posts those entry types, require the verified fact that §13.2 names for the type, and require `reverses_entry_id` to belong to the same escrow. |
| Expected benefit | Account movements that are not confirmed-fund projections still wait for their own authorizing fact. |
| Risk of doing nothing | The internal service can post a net-zero or non-projection entry. There is no HTTP route. A `created` escrow still cannot show a nonzero funded, released, or refunded total. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | The command that is allowed to post that entry type. This entry does not authorize one. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | None |
| Security impact | None beyond the disclosed internal service. |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | With the first command that posts an adjustment, chargeback, payout, or buyer-sourced fee |
| Status | PROPOSED |
| Related GitHub Issue | [#28](https://github.com/xela-ash/music_app/issues/28) |
| Related PR | [#94](https://github.com/xela-ash/music_app/pull/94) |
| Resolution | — |

### ENG-IMP-065 Refund execution does not see holds or the unallocated pool

| Field | Value |
|---|---|
| ID | ENG-IMP-065 |
| Title | Refund execution does not see holds or the unallocated pool |
| Date identified | 2026-10-01 |
| Identified by | MVP-029 implementation |
| Category | Escrow |
| Affected subsystem | Escrow |
| Current state | `executeRefundInstruction` refunds one `funded` allocation. The refundable formula accepts a held amount, and the service passes zero. A missing allocation id is rejected. |
| Evidence / problem | Escrow §15 allows a refund of the unallocated pool and excludes held funds. `DATA-ESCROW-004` is not built, so no hold row can exist. The MVP-026 projection adds `refunded_amount` only for `refunded_to_buyer` whose source is `ESCROW_ALLOCATION`. A pool refund would not increase that projection, so the cumulative bound would not see it. |
| Suggested improvement | When holds exist, subtract the open hold from the refundable amount and return 409 for held funds. When the projection counts an unallocated refund, accept a pool instruction up to that balance. |
| Expected benefit | The consumer matches both refund paths in §15 without letting a pool refund escape the captured-funding bound. |
| Risk of doing nothing | Allocation refunds stay inside captured funding. A pool or hold case cannot be executed until a later item adds the store and the projection. |
| Implementation risk | Medium |
| Estimated scope | M |
| Dependencies | A hold table and a projection change. This entry does not authorize either. |
| Product behavior impact | No product rule is changed. The unallocated and held paths stay unbuilt. |
| Specification impact | No |
| Migration impact | A later projection change needs a new migration. |
| Security impact | The deferred check still rejects an allocation total the ledger does not support. |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | With the first hold or unallocated-refund item |
| Status | PROPOSED |
| Related GitHub Issue | [#31](https://github.com/xela-ash/Music_app/issues/31) |
| Related PR | The MVP-029 pull request |
| Resolution | — |

### ENG-IMP-066 The refund journal does not reference a funding Payment

| Field | Value |
|---|---|
| ID | ENG-IMP-066 |
| Title | The refund journal does not reference a funding Payment |
| Date identified | 2026-10-01 |
| Identified by | MVP-029 implementation |
| Category | Escrow |
| Affected subsystem | Escrow |
| Current state | The refund decision moves `ESCROW_ALLOCATION` to `REFUND_IN_TRANSIT` and leaves `payment_id` null. Captured funding is the escrow `funded_amount` projection. |
| Evidence / problem | `BR-ESCROW-017` also requires the original funding Payment. Funding intent does not insert a payment, and MVP-025 owns the provider adapter. Inventing a payment row would select a capture the provider has not confirmed. |
| Suggested improvement | When a verified funding Payment exists, require the refund instruction to name that payment and reject a cumulative refund above its captured amount. |
| Expected benefit | The payment-level bound in `BR-ESCROW-017` is enforced in addition to the ledger projection. |
| Risk of doing nothing | The ledger bound still stops a refund above `funded_amount`. `refund_paid` and the provider destination stay with Payments. |
| Implementation risk | Medium |
| Estimated scope | M |
| Dependencies | MVP-025. This entry does not authorize a provider or a payment insert. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | None until a payment link is added |
| Security impact | None beyond the disclosed null payment reference. |
| Performance impact | None |
| Priority suggestion | Medium |
| Recommended timing | With the funding Payment |
| Status | PROPOSED |
| Related GitHub Issue | [#31](https://github.com/xela-ash/Music_app/issues/31) |
| Related PR | The MVP-029 pull request |
| Resolution | — |

### ENG-IMP-067 A settled allocation with a release stays funded

| Field | Value |
|---|---|
| ID | ENG-IMP-067 |
| Title | A settled allocation with a release stays funded |
| Date identified | 2026-10-01 |
| Identified by | MVP-029 independent review |
| Category | Escrow |
| Affected subsystem | Escrow |
| Current state | A refund that brings `released_amount + refunded_amount` to `funded_amount` sets `allocation_status` to `refunded` only when `released_amount` is zero. Any positive released amount leaves the allocation `funded`. |
| Evidence / problem | Escrow §11.3 says a fully settled allocation is `released` when any amount reached the Seller. No release writer sets `released_amount` today, so this branch does not run. |
| Suggested improvement | When a later release item settles an allocation that already has a release, set `allocation_status` to `released`. |
| Expected benefit | The stored allocation state matches §11.3 once a release amount exists. |
| Risk of doing nothing | Refund-only settlement still becomes `refunded`. A mixed release-and-refund settlement is not produced by the current services. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | A release journal. This entry does not authorize one. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | None |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | With the release item |
| Status | PROPOSED |
| Related GitHub Issue | [#31](https://github.com/xela-ash/Music_app/issues/31) |
| Related PR | [#96](https://github.com/xela-ash/Music_app/pull/96) |
| Resolution | — |

### ENG-IMP-075 Seller acceptance does not repeat the fee schedule

| Field | Value |
|---|---|
| ID | ENG-IMP-075 |
| Title | Seller acceptance does not repeat the fee schedule |
| Date identified | 2026-10-01 |
| Identified by | MVP-027 implementation |
| Category | Escrow |
| Affected subsystem | Escrow |
| Current state | Funding intent returns schedule `2026-10-01` to the Buyer. Seller acceptance of a proposal does not include that schedule. `buyer_acknowledged_at` and `seller_acknowledged_at` stay null. |
| Evidence / problem | Escrow §19.4 says the snapshot is disclosed to the Seller before acceptance. The 2026-10-01 decision requires disclosure before funding, which the funding-intent response does. Acceptance happens before that response exists, so this item does not invent a second disclosure surface. |
| Suggested improvement | When a later item can show the recorded schedule on seller acceptance, store the seller acknowledgment time on the snapshot that funding then freezes. |
| Expected benefit | The Seller sees the same immutable lines before agreeing to the Project. |
| Risk of doing nothing | The Buyer still receives the snapshot before funding. The Seller does not see it on the acceptance response. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | A seller-facing acceptance response that can carry the schedule. This entry does not authorize that response. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | None |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | With a seller acceptance disclosure surface |
| Status | PROPOSED |
| Related GitHub Issue | [#29](https://github.com/xela-ash/Music_app/issues/29) |
| Related PR | [#101](https://github.com/xela-ash/music_app/pull/101) |
| Resolution | — |

### ENG-IMP-076 Commission helper repeats the snapshot rate

| Field | Value |
|---|---|
| ID | ENG-IMP-076 |
| Title | Commission helper repeats the snapshot rate |
| Date identified | 2026-10-01 |
| Identified by | MVP-027 independent review |
| Category | Escrow |
| Affected subsystem | Escrow |
| Current state | `sellerCommissionMinor` multiplies by a hardcoded `1000n`. `FEE_LINES[0].rate_bps` is also `1000`. |
| Evidence / problem | The two constants match the recorded schedule today. A later edit could change one and leave the other. |
| Suggested improvement | Read the seller-commission basis points from the snapshotted line when a release item computes the fee. |
| Expected benefit | The posted fee cannot drift from the row the escrow references. |
| Risk of doing nothing | Both values are `1000` on schedule `2026-10-01`. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | The release item that posts the commission. This entry does not authorize that posting. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | None |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | With MVP-028 |
| Status | PROPOSED |
| Related GitHub Issue | [#29](https://github.com/xela-ash/Music_app/issues/29) |
| Related PR | [#101](https://github.com/xela-ash/music_app/pull/101) |
| Resolution | — |

### ENG-IMP-077 Fee-snapshot immutability test does not delete

| Field | Value |
|---|---|
| ID | ENG-IMP-077 |
| Title | Fee-snapshot immutability test does not delete |
| Date identified | 2026-10-01 |
| Identified by | MVP-027 independent review |
| Category | Testing |
| Affected subsystem | Escrow |
| Current state | `funding-intent.http.test.js` rejects an `UPDATE` of `fee_lines`. It does not issue a `DELETE`. |
| Evidence / problem | The same trigger function rejects both. The test proves the update path only. |
| Suggested improvement | Add a `DELETE` assertion next to the update assertion. |
| Expected benefit | A trigger that stopped rejecting deletes would fail the suite. |
| Risk of doing nothing | `DELETE` is still rejected by `escrow_fee_snapshots_no_delete`. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | None. This entry does not authorize the extra assertion by itself. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | None |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | With a later escrow test change |
| Status | PROPOSED |
| Related GitHub Issue | [#29](https://github.com/xela-ash/Music_app/issues/29) |
| Related PR | [#101](https://github.com/xela-ash/music_app/pull/101) |
| Resolution | — |

### ENG-IMP-078 Seller commission timing names release

| Field | Value |
|---|---|
| ID | ENG-IMP-078 |
| Title | Seller commission timing names release |
| Date identified | 2026-10-01 |
| Identified by | MVP-027 independent review |
| Category | Escrow |
| Affected subsystem | Escrow |
| Current state | The seller line stores `timing: "release"` and `basis: "seller_award"`. |
| Evidence / problem | Escrow §19.2 says the commission is taken at release or award. The funding-intent command does not post it. |
| Suggested improvement | When the release item posts the commission, keep the basis as the seller award, including a dispute award that is not a milestone release. |
| Expected benefit | A split award still uses the snapshotted 10% line. |
| Risk of doing nothing | No commission is posted by this item. The basis already says `seller_award`. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | MVP-028. This entry does not authorize a fee journal. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | None |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | With the release posting |
| Status | PROPOSED |
| Related GitHub Issue | [#29](https://github.com/xela-ash/Music_app/issues/29) |
| Related PR | [#101](https://github.com/xela-ash/music_app/pull/101) |
| Resolution | — |

### ENG-IMP-084 Unused direct-insert repository functions remain

| Field | Value |
|---|---|
| ID | ENG-IMP-084 |
| Title | Unused direct-insert repository functions remain |
| Date identified | 2026-10-01 |
| Identified by | MVP-005 independent review |
| Category | Users and profiles |
| Affected subsystem | Users, profiles |
| Current state | `users/repository.js` `insertUser` and `profiles/repository.js` `insertProfile` are exported and have no production caller. Signup uses `insertActiveUser` and `insertSignupProfile`. |
| Evidence / problem | `insertUser` still accepts a caller-supplied status. `insertProfile` still accepts a caller-supplied `user_id`. No route passes a request body to either function after MVP-005. |
| Suggested improvement | Remove the unused exports when a later cleanup is authorized, or keep them only if a specified internal caller needs them. |
| Expected benefit | The client-status and client-owner insert helpers are not left as unused bypass-shaped functions. |
| Risk of doing nothing | No HTTP route calls them. A later caller could reuse the client-supplied status or owner parameters. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | None. This entry does not authorize the cleanup. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | None |
| Security impact | None while unused |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | A later users/profiles cleanup |
| Status | PROPOSED |
| Related GitHub Issue | [#7](https://github.com/xela-ash/Music_app/issues/7) |
| Related PR | [#104](https://github.com/xela-ash/music_app/pull/104) |
| Resolution | — |

### ENG-IMP-085 ENG-IMP-007 still names the removed creation routes

| Field | Value |
|---|---|
| ID | ENG-IMP-085 |
| Title | ENG-IMP-007 still names the removed creation routes |
| Date identified | 2026-10-01 |
| Identified by | MVP-005 independent review |
| Category | Documentation |
| Affected subsystem | Engineering improvements register |
| Current state | `ENG-IMP-007` describes `POST /users` and `POST /profiles` as live PostgreSQL error mappings. Those routes are removed. The cross-reference table already records the removal. |
| Evidence / problem | The error-handler finding itself is unchanged. The route names in that entry's current-state field are historical. |
| Suggested improvement | When `ENG-IMP-007` is next edited, name a route that still exists as the malformed-JSON example. |
| Expected benefit | The register does not imply the removed routes are still mounted. |
| Risk of doing nothing | A reader of `ENG-IMP-007` alone can think the legacy routes still map database errors. |
| Implementation risk | Low |
| Estimated scope | S |
| Dependencies | None. This entry does not authorize an edit of `ENG-IMP-007`. |
| Product behavior impact | No |
| Specification impact | No |
| Migration impact | None |
| Security impact | None |
| Performance impact | None |
| Priority suggestion | Low |
| Recommended timing | With any later error-handler work |
| Status | PROPOSED |
| Related GitHub Issue | [#7](https://github.com/xela-ash/Music_app/issues/7) |
| Related PR | [#104](https://github.com/xela-ash/music_app/pull/104) |
| Resolution | — |

## 6. Findings already owned elsewhere (cross-reference only)

The initial review confirmed the following gaps in the code. Each is already owned by a canonical specification or a plan item, so it is **not** duplicated as an `ENG-IMP` entry. Track and resolve each one where it is owned.

| Observation | Owner |
|---|---|
| `backend/Index.js` and `frontend/src/App.tsx` are single-module tiers | [System Architecture §5](../01-foundation/system-architecture.md#5-current-code-organization-vs-the-modularity-principle); backend: MVP-001 |
| No automated tests or CI | MVP-002, MVP-004 |
| `POST /users` and `POST /profiles` are removed. `GET /users` stays unauthenticated. | `SEC-001` / MVP-005; `SEC-AUTH-008` |
| Open CORS, no rate limiting, no JWT algorithm allowlist, weak secret accepted | `SEC-AUTH-004`, `SEC-AUTH-005`, `SEC-AUTH-009`, `SEC-AUTH-006` ([Authentication](../02-users-roles-permissions/authentication.md)) |
| Account status was not re-checked on protected routes | Current `requireAuth` routes reload `users.status` in MVP-006. `SEC-AUTH-002` stays in `authentication.md` until Product/Architecture updates that document. |
| JWT in `localStorage` | `SEC-USERS-005`; [Authentication §19.3](../02-users-roles-permissions/authentication.md#193-browser-token-delivery--target-vs-current) |
| `err.detail` echoed in error responses | [Authentication §22](../02-users-roles-permissions/authentication.md#22-failure-handling) |
| `RETURNING *` returns full Profile rows | [Profiles](../02-users-roles-permissions/profiles.md) findings |
| Escrow and allocation amounts are `BIGINT` minor units with `INR` exponent 2. `escrow_ledger` amounts are `BIGINT` minor units with `INR` exponent 2. `projects.price_amount` and `payments` remain 32-bit. | `REQ-ESCROW-003`; `ENG-IMP-050` |
| `escrow_ledger` rejects `UPDATE`, `DELETE`, and `TRUNCATE`. Its foreign keys are `RESTRICT`. The application role still owns the table. | [Escrow §13](../06-payments-escrow/escrow.md#13-ledger-architecture); MVP-026; `ENG-IMP-062` |
| No `updated_at` maintenance trigger | [Milestones §26](../05-projects-milestones/milestones.md#26-target-data-model), [Projects §26](../05-projects-milestones/projects.md#26-target-data-model) |
| `GET /profiles` search is server-side and still paged at 100 rows. Public/active scoping is not applied because those columns do not exist. | [System Architecture §10.4](../01-foundation/system-architecture.md#104-marketplace); MVP-013; `REQ-PROFILE-005` |
| Only `console.*` logging, no structured observability | [System Architecture §14](../01-foundation/system-architecture.md#14-non-functional-and-operational-gaps); target practice in [Handbook §15](engineering-handbook.md#15-observability) |

## 7. Change record

Commits that implemented register entries, so each entry's *Resolution* can cite a stable reference.

| Date | Entries | Commit | Summary |
|---|---|---|---|
| 2026-09-25 | ENG-IMP-009, ENG-IMP-010 | `b32bfcd` | `docs: correct MVP implementation dependencies`, the plan 0.1.1 corrections |
| 2026-09-25 | ENG-IMP-011, ENG-IMP-012 | `8b2ec0e` | `docs: add seller payout implementation stage`, the plan 0.2.0 decisions |
| 2026-09-26 | ENG-IMP-014 | The commit titled `docs: record implementation planning findings` on `docs/specification-foundation` | The plan 0.2.1 citation correction, committed together with this register's 0.4.0 entries |
| 2026-09-26 | ENG-IMP-017, ENG-IMP-018 | Pull request #57 | Ephemeral test port and omitted-`DB_PORT` refusal, implemented by the MVP-002 harness |
| 2026-09-30 | ENG-IMP-015 | The MVP-015 specification commit on `cursor/mvp-015-project-term-versions-255b` | [ADR-001](../99-appendices/adr/ADR-001-project-term-versions.md) and `projects.md` 1.1.0 define `DATA-PROJECTS-018` |

## 8. Version history

| Version | Date | Change | Author |
|---|---|---|---|
| 0.1.0 | 2026-09-25 | Initial register. Nine evidence-based entries (`ENG-IMP-001`–`009`) from the initial repository review. Cross-reference table for findings already owned by specifications. Proposed pending human review. | Engineering (drafted by Claude Code) |
| 0.2.0 | 2026-09-25 | `ENG-IMP-009` set to IMPLEMENTED with its resolution. Added `ENG-IMP-010` (IMPLEMENTED: plan critical path and blocking-decision statement corrected), `ENG-IMP-011` (PROPOSED: no work item for the payout workflow; blocks issue generation) and `ENG-IMP-012` (PROPOSED: mixed-scope classification convention). Added Section 7, a change record, before the version history. Other entries unchanged. | Engineering (drafted by Claude Code) |
| 0.3.0 | 2026-09-25 | `ENG-IMP-011` and `ENG-IMP-012` set to IMPLEMENTED after the Product/Architecture decisions, with resolutions (plan 0.2.0). Added `ENG-IMP-013` (PROPOSED, non-blocking): release and financial items are not wired to the verification and idempotency foundations. Other entries unchanged. | Engineering (drafted by Claude Code) |
| 0.4.0 | 2026-09-26 | Added three findings from GitHub issue generation: `ENG-IMP-014` (IMPLEMENTED: `MVP-009` plan citation corrected to Authentication §15/§16, plan 0.2.1), `ENG-IMP-015` (PROPOSED, requires Architecture clarification: the Project term-version record `MVP-015` needs is not defined), and `ENG-IMP-016` (PROPOSED: password reset requires session revocation that no work item builds). None blocks `MVP-001`. Other entries unchanged. | Engineering (drafted by Claude Code) |
| 0.5.0 | 2026-09-26 | Recorded four non-blocking improvements from the MVP-001 independent review: `ENG-IMP-017` (fixed characterization port 4000), `ENG-IMP-018` (omitted `DB_PORT` bypasses the 5432 guard), `ENG-IMP-019` (frontend comments still cite `backend/Index.js`), and `ENG-IMP-020` (Section 4 verification stamp predates the module split). All `PROPOSED`. None are authorized, and none are part of MVP-001. | Engineering |
| 0.5.1 | 2026-09-26 | Noted in `ENG-IMP-008` that the Cloud image pin does not pin the application manifests. Added `ENG-IMP-021` (`PROPOSED`): current corepack releases require Node >= 22.22.2, so they are not part of the Node 22.14.0 image repair. | Engineering |
| 0.6.0 | 2026-09-26 | Set `ENG-IMP-017` and `ENG-IMP-018` to IMPLEMENTED because the MVP-002 harness is the resolution those entries named. Added `ENG-IMP-022` (PROPOSED): handbook current-state snapshots still describe the pre-split, pre-harness repository. | Engineering |
| 0.7.0 | 2026-09-27 | Added `ENG-IMP-023` (PROPOSED), found during MVP-003: nothing runs the outbox dispatcher yet, there is no transport, and dead letters raise no alert. Added `ENG-IMP-024` (PROPOSED): non-blocking helper edge cases from the MVP-003 independent review. | Engineering |
| 0.7.1 | 2026-09-28 | Added `ENG-IMP-028` (PROPOSED) from the MVP-006 review: `restricted` and `email_verification_pending` have no HTTP allow-case until the enum contains them. | Engineering |
| 0.7.2 | 2026-09-28 | Added `ENG-IMP-029` (PROPOSED) from the MVP-007 review: `project.create` seller eligibility is a boolean the caller supplies. Not implemented. | Engineering |
| 0.7.3 | 2026-09-29 | Added `ENG-IMP-030` and `ENG-IMP-031` (PROPOSED) from MVP-013: unindexed leading-wildcard search, and no AND across search dimensions. Neither is authorized. The cross-reference row for profile discovery now records that search is server-side. | Engineering |
| 0.7.4 | 2026-09-29 | Added `ENG-IMP-032` and `ENG-IMP-033` (PROPOSED) from MVP-014. Neither is authorized. | Engineering |
| 0.7.5 | 2026-09-29 | Added `ENG-IMP-034` and `ENG-IMP-035` (PROPOSED) from the MVP-014 independent review. Neither is authorized. | Engineering |
| 0.7.6 | 2026-09-29 | Added `ENG-IMP-036`, `ENG-IMP-037`, and `ENG-IMP-038` (PROPOSED) from MVP-041 and its review. Three matrix rows have no single mandatory class. Neither a topic/domain pair nor a topic/class pair is enforced. None are authorized. | Engineering |
| 0.7.7 | 2026-09-29 | Added `ENG-IMP-039` and `ENG-IMP-040` (PROPOSED) from MVP-042. No User Settings store exists, and quiet hours and digest are not applied. Neither is authorized. | Engineering |
| 0.7.8 | 2026-09-29 | Recorded pull request #73 on `ENG-IMP-039` and `ENG-IMP-040`. Neither is authorized. | Engineering |
| 0.7.9 | 2026-09-29 | Added `ENG-IMP-042` (PROPOSED) from the MVP-038 review: completed send idempotency payloads keep the pre-tombstone body. Not authorized. | Engineering |
| 0.7.10 | 2026-09-30 | Set `ENG-IMP-015` to IMPLEMENTED. The product owner defined `project_term_versions` and authorized [ADR-001](../99-appendices/adr/ADR-001-project-term-versions.md) and `projects.md` 1.1.0 before MVP-015. | Engineering |
| 0.7.11 | 2026-09-30 | Added `ENG-IMP-043`, `ENG-IMP-044`, and `ENG-IMP-045` (PROPOSED) from the MVP-015 review. None are authorized. | Engineering |
| 0.7.12 | 2026-09-30 | Added `ENG-IMP-046` (PROPOSED): amendment expiry has no specified maximum. Not authorized. | Engineering |
| 0.7.13 | 2026-09-30 | Added `ENG-IMP-047` and `ENG-IMP-048` (PROPOSED) from the MVP-016 review. Neither is authorized. | Engineering |
| 0.7.14 | 2026-09-30 | Added `ENG-IMP-049` (PROPOSED): a later matching snapshot can move the agreed pointer without an amendment. Not authorized. | Engineering |
| 0.7.15 | 2026-10-01 | Added `ENG-IMP-050` and `ENG-IMP-051` (both PROPOSED): the 32-bit project total still caps milestone lines, and the lock trigger does not lock the project row. Neither is authorized. | Engineering |
| 0.7.16 | 2026-10-01 | Recorded pull request #86 on `ENG-IMP-050` and `ENG-IMP-051`. Neither is authorized. | Engineering |
| 0.7.17 | 2026-10-01 | Added `ENG-IMP-052` and `ENG-IMP-053` (both PROPOSED) from the MVP-017 review. Neither is authorized. | Engineering |
| 0.7.18 | 2026-10-01 | Added `ENG-IMP-054` (PROPOSED): revision reason codes and the detail bound stay unspecified. Not authorized. | Engineering |
| 0.7.19 | 2026-10-01 | Added `ENG-IMP-055` through `ENG-IMP-059` (all PROPOSED) from the MVP-018 review. None are authorized. | Engineering |
| 0.7.20 | 2026-10-01 | Added `ENG-IMP-060` (PROPOSED) from the MVP-019 review: the concurrent start test does not resubmit the losing key. Not authorized. | Engineering |
| 0.7.21 | 2026-10-01 | Added `ENG-IMP-061` (PROPOSED) from the MVP-024 review: escrow audit rows keep amount and currency in the hash. Not authorized. The money cross-reference now records the BIGINT escrow columns. | Engineering |
| 0.7.22 | 2026-10-01 | Added `ENG-IMP-062` (PROPOSED): the application role still owns `escrow_ledger`. Not authorized. The ledger cross-reference now records the append-only BIGINT journal. | Engineering |
| 0.7.23 | 2026-10-01 | Added `ENG-IMP-063` and `ENG-IMP-064` (both PROPOSED) from the MVP-026 review. Neither is authorized. | Engineering |
| 0.7.24 | 2026-10-01 | Added `ENG-IMP-065` and `ENG-IMP-066` (both PROPOSED) from MVP-029. Neither is authorized. | Engineering |
| 0.7.25 | 2026-10-01 | Added `ENG-IMP-067` (PROPOSED) from the MVP-029 review. Not authorized. | Engineering |
| 0.7.26 | 2026-10-01 | The unauthenticated-creation cross-reference now records that `POST /users` and `POST /profiles` are removed. `GET /users` remains `SEC-AUTH-008`. | Engineering |
| 0.7.27 | 2026-10-01 | Added `ENG-IMP-084` and `ENG-IMP-085` (both PROPOSED) from the MVP-005 review. Neither is authorized. | Engineering |
| 0.7.28 | 2026-10-01 | Added `ENG-IMP-075` (PROPOSED): seller acceptance does not repeat the fee schedule. Not authorized. `ENG-IMP-068` through `ENG-IMP-074` remain on the unmerged MVP-010 branch. `ENG-IMP-084` and `ENG-IMP-085` are already on main. | Engineering |
| 0.7.29 | 2026-10-01 | Added `ENG-IMP-076`, `ENG-IMP-077`, and `ENG-IMP-078` (all PROPOSED) from the MVP-027 review. None are authorized. | Engineering |
