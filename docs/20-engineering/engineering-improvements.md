# MusicApp engineering improvements register

| Field | Value |
|---|---|
| Document ID | `ENG-IMPROVEMENTS` (provisional; entries use the non-governed `ENG-IMP-NNN` family, [Governance §4.1](../00-governance/README.md#41-engineering-control-documents)) |
| Type | Reference (REF): engineering backlog, not a requirement specification |
| Status | Proposed |
| Owner | Engineering (interim: repository maintainers) |
| Version | 0.1.0 |
| Last Reviewed | 2026-09-25 |
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
| [ENG-IMP-009](#eng-imp-009-mvp-implementation-plan-has-incorrect-dependency-cross-references) | MVP implementation plan has incorrect dependency cross-references | Documentation | High | PROPOSED |

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
| Status | PROPOSED |
| Related GitHub Issue | — |
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

## 7. Version history

| Version | Date | Change | Author |
|---|---|---|---|
| 0.1.0 | 2026-09-25 | Initial register. Nine evidence-based entries (`ENG-IMP-001`–`009`) from the initial repository review. Cross-reference table for findings already owned by specifications. Proposed pending human review. | Engineering (drafted by Claude Code) |
