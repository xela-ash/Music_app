# MusicApp engineering improvements register

| Field | Value |
|---|---|
| Document ID | `ENG-IMPROVEMENTS` (provisional; entries use the non-governed `ENG-IMP-NNN` family, [Governance §4.1](../00-governance/README.md#41-engineering-control-documents)) |
| Type | Reference (REF): engineering backlog, not a requirement specification |
| Status | Proposed |
| Owner | Engineering (interim: repository maintainers) |
| Version | 0.6.0 |
| Last Reviewed | 2026-09-26 |
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
| [ENG-IMP-015](#eng-imp-015-project-term-version-record-required-by-mvp-015-is-not-defined-by-the-projects-specification) | Project term-version record required by MVP-015 is not defined by the Projects specification | Documentation, Architecture, Database | High | PROPOSED |
| [ENG-IMP-016](#eng-imp-016-password-reset-requires-session-revocation-that-no-mvp-work-item-builds) | Password reset requires session revocation that no MVP work item builds | Documentation, Architecture, Security | Medium | PROPOSED |
| [ENG-IMP-017](#eng-imp-017-characterization-suite-binds-a-fixed-port-4000) | Characterization suite binds a fixed port 4000 | Testing, Reliability | Medium | IMPLEMENTED |
| [ENG-IMP-018](#eng-imp-018-characterization-db_port-guard-misses-an-omitted-port) | Characterization `DB_PORT` guard misses an omitted port | Testing, Reliability | Medium | IMPLEMENTED |
| [ENG-IMP-019](#eng-imp-019-frontend-comments-still-cite-backendindexjs-for-moved-constants) | Frontend comments still cite `backend/Index.js` for moved constants | Documentation, Maintainability | Low | PROPOSED |
| [ENG-IMP-020](#eng-imp-020-build-record-section-4-verification-stamp-predates-the-mvp-001-baseline) | Build Record Section 4 verification stamp predates the MVP-001 baseline | Documentation | Low | PROPOSED |
| [ENG-IMP-021](#eng-imp-021-handbook-current-state-snapshots-predate-mvp-001-and-mvp-002) | Handbook current-state snapshots predate MVP-001 and MVP-002 | Documentation | Low | PROPOSED |

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
| Current state | `README.md` says "Node.js (v20+)". Neither `package.json` declares `engines`. The frontend declares no `packageManager`. There is no `.nvmrc` or `.node-version`. The reviewing machine ran Node 24.12.0 and pnpm 10.26.1. |
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
| Status | PROPOSED. Requires Architecture clarification. |
| Related GitHub Issue | [#17](https://github.com/xela-ash/Music_app/issues/17) (`MVP-015`), whose pre-implementation warning cites this entry |
| Related PR | — |
| Resolution | — |

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

### ENG-IMP-021 Handbook current-state snapshots predate MVP-001 and MVP-002

| Field | Value |
|---|---|
| ID | ENG-IMP-021 |
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

## 6. Findings already owned elsewhere (cross-reference only)

The initial review confirmed the following gaps in the code. Each is already owned by a canonical specification or a plan item, so it is **not** duplicated as an `ENG-IMP` entry. Track and resolve each one where it is owned.

| Observation | Owner |
|---|---|
| `backend/Index.js` and `frontend/src/App.tsx` are single-module tiers | [System Architecture §5](../01-foundation/system-architecture.md#5-current-code-organization-vs-the-modularity-principle); backend: MVP-001 |
| No automated tests or CI | MVP-002, MVP-004 |
| Unauthenticated `POST /users`, `POST /profiles`, `GET /users` | `SEC-001` / MVP-005; `SEC-AUTHZ-003`, `SEC-AUTH-008` |
| Open CORS, no rate limiting, no JWT algorithm allowlist, weak secret accepted | `SEC-AUTH-004`, `SEC-AUTH-005`, `SEC-AUTH-009`, `SEC-AUTH-006` ([Authentication](../02-users-roles-permissions/authentication.md)) |
| Account status not re-checked on protected routes | `SEC-AUTH-002` / MVP-006 |
| JWT in `localStorage` | `SEC-USERS-005`; [Authentication §19.3](../02-users-roles-permissions/authentication.md#193-browser-token-delivery--target-vs-current) |
| `err.detail` echoed in error responses | [Authentication §22](../02-users-roles-permissions/authentication.md#22-failure-handling) |
| `RETURNING *` returns full Profile rows | [Profiles](../02-users-roles-permissions/profiles.md) findings |
| Money in 32-bit `INT`, unrestricted `currency TEXT` | `REQ-ESCROW-003` ([Escrow §7](../06-payments-escrow/escrow.md#7-currency-and-money-representation)); MVP-024 |
| `escrow_ledger` not append-only; financial `ON DELETE CASCADE` | [Escrow §13](../06-payments-escrow/escrow.md#13-ledger-architecture), [§24](../06-payments-escrow/escrow.md#24-target-data-model); MVP-026 |
| No `updated_at` maintenance trigger | [Milestones §26](../05-projects-milestones/milestones.md#26-target-data-model), [Projects §26](../05-projects-milestones/projects.md#26-target-data-model) |
| `GET /profiles` fixed at 100 rows with client-side search | [System Architecture §10.4](../01-foundation/system-architecture.md#104-marketplace); MVP-013 |
| Only `console.*` logging, no structured observability | [System Architecture §14](../01-foundation/system-architecture.md#14-non-functional-and-operational-gaps); target practice in [Handbook §15](engineering-handbook.md#15-observability) |

## 7. Change record

Commits that implemented register entries, so each entry's *Resolution* can cite a stable reference.

| Date | Entries | Commit | Summary |
|---|---|---|---|
| 2026-09-25 | ENG-IMP-009, ENG-IMP-010 | `b32bfcd` | `docs: correct MVP implementation dependencies`, the plan 0.1.1 corrections |
| 2026-09-25 | ENG-IMP-011, ENG-IMP-012 | `8b2ec0e` | `docs: add seller payout implementation stage`, the plan 0.2.0 decisions |
| 2026-09-26 | ENG-IMP-014 | The commit titled `docs: record implementation planning findings` on `docs/specification-foundation` | The plan 0.2.1 citation correction, committed together with this register's 0.4.0 entries |
| 2026-09-26 | ENG-IMP-017, ENG-IMP-018 | Pull request #57 | Ephemeral test port and omitted-`DB_PORT` refusal, implemented by the MVP-002 harness |

## 8. Version history

| Version | Date | Change | Author |
|---|---|---|---|
| 0.1.0 | 2026-09-25 | Initial register. Nine evidence-based entries (`ENG-IMP-001`–`009`) from the initial repository review. Cross-reference table for findings already owned by specifications. Proposed pending human review. | Engineering (drafted by Claude Code) |
| 0.2.0 | 2026-09-25 | `ENG-IMP-009` set to IMPLEMENTED with its resolution. Added `ENG-IMP-010` (IMPLEMENTED: plan critical path and blocking-decision statement corrected), `ENG-IMP-011` (PROPOSED: no work item for the payout workflow; blocks issue generation) and `ENG-IMP-012` (PROPOSED: mixed-scope classification convention). Added Section 7, a change record, before the version history. Other entries unchanged. | Engineering (drafted by Claude Code) |
| 0.3.0 | 2026-09-25 | `ENG-IMP-011` and `ENG-IMP-012` set to IMPLEMENTED after the Product/Architecture decisions, with resolutions (plan 0.2.0). Added `ENG-IMP-013` (PROPOSED, non-blocking): release and financial items are not wired to the verification and idempotency foundations. Other entries unchanged. | Engineering (drafted by Claude Code) |
| 0.4.0 | 2026-09-26 | Added three findings from GitHub issue generation: `ENG-IMP-014` (IMPLEMENTED: `MVP-009` plan citation corrected to Authentication §15/§16, plan 0.2.1), `ENG-IMP-015` (PROPOSED, requires Architecture clarification: the Project term-version record `MVP-015` needs is not defined), and `ENG-IMP-016` (PROPOSED: password reset requires session revocation that no work item builds). None blocks `MVP-001`. Other entries unchanged. | Engineering (drafted by Claude Code) |
| 0.5.0 | 2026-09-26 | Recorded four non-blocking improvements from the MVP-001 independent review: `ENG-IMP-017` (fixed characterization port 4000), `ENG-IMP-018` (omitted `DB_PORT` bypasses the 5432 guard), `ENG-IMP-019` (frontend comments still cite `backend/Index.js`), and `ENG-IMP-020` (Section 4 verification stamp predates the module split). All `PROPOSED`. None are authorized, and none are part of MVP-001. | Engineering |
| 0.6.0 | 2026-09-26 | Set `ENG-IMP-017` and `ENG-IMP-018` to IMPLEMENTED because the MVP-002 harness is the resolution those entries named. Added `ENG-IMP-021` (PROPOSED): handbook current-state snapshots still describe the pre-split, pre-harness repository. | Engineering |
