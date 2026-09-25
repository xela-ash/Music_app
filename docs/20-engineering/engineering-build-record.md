# MusicApp engineering build record

| Field | Value |
|---|---|
| Document ID | `ENG-BUILD-RECORD` (provisional; decision records use the non-governed `EDR-NNN` family, [Governance §4.1](../00-governance/README.md#41-engineering-control-documents)) |
| Type | Reference (REF): implementation record, not a requirement specification |
| Status | Proposed |
| Owner | Engineering (interim: repository maintainers) |
| Version | 0.1.0 |
| Last Reviewed | 2026-09-25 |
| Applies To | The implemented state of `backend/`, `frontend/`, `docker-compose.yml`, and supporting tooling |
| Supersedes / Superseded By | None |

> **BEFORE MODIFYING AN EXISTING SUBSYSTEM, READ ITS BUILD RECORD.**
>
> Extend or modify the existing implementation unless there is an approved reason to replace it. Never rebuild a working subsystem just because you would design it differently.

## 1. Purpose

This is the persistent technical memory of what MusicApp's implementation actually is. It answers four questions:

- **What exists?**
- **How does it work?**
- **Why was it built this way?**
- **What should the next engineer know before changing it?**

It exists so a future human engineer or AI agent does not enter the repository, misread the architecture, and rebuild something that already works.

The build record describes **implementation reality only**. What MusicApp *should* do is defined by the canonical specifications, which each subsystem links to. A capability appears here as implemented only when it can be found in the repository. Target architecture is never copied into this record as if it existed. Engineering practice is defined by the [engineering handbook](engineering-handbook.md). Recommended but unauthorized improvements live in the [improvements register](engineering-improvements.md).

## 2. The build record principle

1. Before changing a subsystem, read its section below and the EDRs it lists.
2. Extend what exists. Keep its structure, naming, and patterns unless the approved issue says to change them.
3. Replace a subsystem only for a reason listed in [Handbook §20](engineering-handbook.md#20-refactoring-and-replacement). When replacement is justified, the replacing PR must:
   - record **why**, in an EDR, marking any EDR it supersedes;
   - cite the **evidence** (defect, measurement, requirement that cannot be met);
   - cite the **approved issue**;
   - preserve a **migration or backward-compatibility plan** for stored data and existing clients;
   - update this record: the subsystem section, the EDR index, and the change history.

## 3. Maintaining this record

### 3.1 When to update

| Situation | Required update |
|---|---|
| An issue changes what exists: a new route, table, module, screen, or control | Update the subsystem section(s) and add a change-history row (Section 7). **Mandatory.** |
| A significant engineering decision is made | Add an EDR (Section 6). **Mandatory.** |
| An issue is documentation- or test-only and changes no implementation reality | Change-history row only if tests were added or changed |
| Nothing about implementation reality changed | No update. Do not add noise. |

Every claim cites a file (with line numbers where useful), a migration, or a configuration file. If you cannot point at it, it does not go here.

### 3.2 Status vocabulary

| Status | Meaning |
|---|---|
| Implemented | Built and reachable end-to-end (schema, API, and UI where applicable) for the scope described |
| Partially Implemented | Some of the canonical scope is built and reachable. The section says which parts. |
| Schema Implemented | Tables, enums, or constraints exist, but no application code reads or writes them |
| Planned | Scheduled in the [MVP implementation plan](../19-implementation-planning/mvp-implementation-plan.md), with nothing built yet |
| Not Implemented | Nothing built. Mentioned only to point at the canonical specification. |

### 3.3 Subsystem record format

Each subsystem section uses these fields as they become relevant: Purpose · Canonical specification · Implementation status · Entry points · Important files · Database tables · API routes · Services/modules · Frontend components · External dependencies · Events · Authorization model · Security controls · Tests · Operational considerations · Known limitations · Technical debt · Engineering decisions · Related issues · Related PRs · Last materially changed. Fields that are not applicable yet are omitted for subsystems with nothing built.

## 4. Current system baseline

Verified against the repository at commit `2defbea` (branch `docs/specification-foundation`) on 2026-09-25. Line numbers refer to that commit.

### 4.1 Status summary

| Subsystem | Implementation status | Canonical specification |
|---|---|---|
| [Repository structure and tooling](#42-repository-structure-and-tooling) | Implemented (local development only) | [System Architecture §4–5](../01-foundation/system-architecture.md#4-technology-stack-and-deployment-topology) |
| [Backend application](#43-backend-application) | Partially Implemented (single module) | [System Architecture §5](../01-foundation/system-architecture.md#5-current-code-organization-vs-the-modularity-principle) |
| [Frontend application](#44-frontend-application) | Partially Implemented (single module) | [System Architecture §5](../01-foundation/system-architecture.md#5-current-code-organization-vs-the-modularity-principle) |
| [Authentication](#45-authentication) | Partially Implemented | [authentication.md](../02-users-roles-permissions/authentication.md) |
| [Authorization](#46-authorization) | Partially Implemented (inline checks) | [authorization.md](../02-users-roles-permissions/authorization.md), [roles.md](../02-users-roles-permissions/roles.md) |
| [Users, profiles, and discovery](#47-users-profiles-and-discovery) | Partially Implemented | [users.md](../02-users-roles-permissions/users.md), [profiles.md](../02-users-roles-permissions/profiles.md), [user-settings.md](../03-identity-profiles-verification/user-settings.md) |
| [Identity verification](#48-identity-verification) | Schema Implemented | [verification.md](../03-identity-profiles-verification/verification.md) |
| [Assets](#49-assets) | Not Implemented (placeholder columns only) | [assets-and-media.md](../03-identity-profiles-verification/assets-and-media.md) |
| [Projects](#410-projects) | Partially Implemented | [projects.md](../05-projects-milestones/projects.md) |
| [Milestones](#411-milestones) | Partially Implemented | [milestones.md](../05-projects-milestones/milestones.md) |
| [Deliverables](#412-deliverables) | Not Implemented | [deliverables.md](../05-projects-milestones/deliverables.md) |
| [Escrow](#413-escrow) | Schema Implemented | [escrow.md](../06-payments-escrow/escrow.md) |
| [Payments](#414-payments) | Schema Implemented | [payments.md](../06-payments-escrow/payments.md) |
| [Messaging](#415-messaging) | Not Implemented | [messaging.md](../07-messaging-collaboration/messaging.md) |
| [Ratings](#416-ratings) | Not Implemented (enum values only) | [ratings.md](../08-ratings-reputation/ratings.md) |
| [Disputes](#417-disputes) | Not Implemented (enum values and one column only) | [disputes.md](../09-moderation-trust-safety/disputes.md) |
| [Notifications](#418-notifications) | Not Implemented | [notifications.md](../10-notifications/notifications.md) |
| [Database and migrations](#419-database-and-migrations) | Implemented | [Governance §17](../00-governance/README.md#17-database-documentation-standards) |
| [Testing](#420-testing) | Not Implemented | [Handbook §14](engineering-handbook.md#14-testing-strategy); MVP-002 |
| [Deployment and infrastructure](#421-deployment-and-infrastructure) | Partially Implemented (local PostgreSQL container only) | [System Architecture §14](../01-foundation/system-architecture.md#14-non-functional-and-operational-gaps) |

*Ratings is labeled "Schema Implemented" in [System Architecture §15](../01-foundation/system-architecture.md#15-current-implementation-status-summary) on the strength of the `buyer_rated`/`seller_rated` enum values. This record uses "Not Implemented (enum values only)" because no ratings table exists. That is consistent with [Governance §28](../00-governance/README.md#28-worked-examples-by-domain), which labels only the enum as implemented.*

### 4.2 Repository structure and tooling

| Field | Record |
|---|---|
| Purpose | Local-first monorepo with two independently installed applications and a containerized database |
| Implementation status | Implemented for local development |
| Important files | `README.md` (setup), `docker-compose.yml`, `.gitignore`, `backend/package.json` + `package-lock.json` (npm), `frontend/package.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` (pnpm), `AGENTS.md`, `docs/` |
| External dependencies | Docker (PostgreSQL 16 image), Node.js (README: "v20+", no pin), npm, pnpm |
| Operational considerations | `.env` and `.env.*` are gitignored and `backend/.env.example` is tracked. `.vscode/` is untracked and not part of the repository. Backend `node_modules` stopped being tracked in `d908ed1`. |
| Known limitations | No shared code between tiers. No workspace-level scripts. No CI (`.github/` absent). No formatter configuration. No toolchain pin ([ENG-IMP-008](engineering-improvements.md#eng-imp-008-toolchain-versions-are-not-pinned)). |
| Last materially changed | `191b2a0` (2026-07-12), "Stabilize local development setup and automate migrations" |

### 4.3 Backend application

| Field | Record |
|---|---|
| Purpose | HTTP JSON API for authentication, users, profiles, projects, and milestone locking |
| Canonical specification | [System Architecture](../01-foundation/system-architecture.md); per-domain specs below |
| Implementation status | Partially Implemented. All code is in one module. |
| Entry points | `npm start` → `node Index.js`; `npm run dev` → `node --watch Index.js`; `npm run migrate` → `node db/migrate.js` |
| Important files | `backend/Index.js` (925 lines: config, `requireAuth`, 12 routes, helpers, SQL), `backend/db/db.js` (pg `Pool`, loads `dotenv`), `backend/db/migrate.js` |
| API routes | `GET /`, `GET /db-health`, `POST /users`, `GET /users`, `POST /profiles`, `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, `GET /profiles`, `POST /projects`, `GET /projects`, `POST /projects/:projectId/lock-milestones` (12 total) |
| Services/modules | None as separate modules. Private helpers inside `Index.js`: `makeExternalId`, `makeProfileExternalId`, `makeProjectExternalId`, `makeMilestoneExternalId`, `validateMilestonesInput`, and constants `SAFE_PROJECT_FIELDS`, `SAFE_PROJECT_FIELDS_JOINED`, `SAFE_MILESTONE_FIELDS`, `POSTGRES_INT_MAX`, `PROJECT_CURRENCY`, `UUID_PATTERN`. |
| External dependencies | `express` 5.2.1, `pg` 8.16.3, `jsonwebtoken` 9.0.3, `bcryptjs` 3.0.3, `cors` 2.8.5, `dotenv` 17.2.3 (locked versions) |
| How it works | CommonJS. `require("./db/db")` (line 6) loads `dotenv` before `JWT_SECRET` is read (line 11). The process exits if `JWT_SECRET` is blank (lines 16-19). Global middleware is `cors()` then `express.json()` (lines 51-52). Each route validates input inline, runs parameterized SQL through `pool` or a checked-out `client`, maps selected PostgreSQL error codes to `400`/`409`, and returns `{ error }` on failure. Listens on hardcoded port 4000 (line 922). |
| Security controls | Parameterized SQL throughout. Explicit safe column lists for project and milestone responses. bcrypt cost 12. JWT issuer and audience verification. |
| Tests | None |
| Operational considerations | Logs only through `console.log`/`console.error`. There is no error-handling middleware. The local `backend/node_modules` observed during the 2026-09-25 review was incomplete (`express`, `pg` absent). Run `npm install` before starting. |
| Known limitations | Everything in one module (MVP-001). No central error handler ([ENG-IMP-007](engineering-improvements.md#eng-imp-007-no-central-error-handling-unhandled-and-body-parse-errors-reach-expresss-default-handler)). Implicit config loading ([ENG-IMP-005](engineering-improvements.md#eng-imp-005-configuration-is-loaded-implicitly-and-silently-falls-back-to-defaults)). Duplicated transaction handling ([ENG-IMP-006](engineering-improvements.md#eng-imp-006-transaction-boilerplate-is-duplicated-and-rollback-can-mask-the-original-error)). No lint ([ENG-IMP-004](engineering-improvements.md#eng-imp-004-no-backend-lint-and-no-repository-formatter)). |
| Engineering decisions | No EDRs yet. See the baseline choices in Section 5. |
| Last materially changed | `88986c5` (2026-07-21), "feat: add milestone locking and project flow updates" |

### 4.4 Frontend application

| Field | Record |
|---|---|
| Purpose | Browser single-page application for signup, login, discovery, project creation, project listing, and milestone locking |
| Canonical specification | [System Architecture](../01-foundation/system-architecture.md); per-domain specs |
| Implementation status | Partially Implemented. Almost all code is in one module. |
| Entry points | `pnpm dev` (Vite, port 5173), `pnpm build` (`tsc -b && vite build`), `pnpm lint` |
| Important files | `frontend/src/main.tsx` (mount), `frontend/src/App.tsx` (1,816 lines: types, all screens, helpers), `frontend/src/api/api.js` (fetch client), `App.css`, `index.css`, `eslint.config.js`, `tsconfig.app.json` |
| Frontend components | `App` (auth bootstrap; `AppState`), `LoginForm`, `SignupForm`, `AppShell` (navigation; `AuthenticatedView` = `home`/`discover`/`profileDetail`/`createProject`/`projects`/`projectDetail`), `DiscoverScreen`, `ProfileCard`, `ProfileDetailScreen`, `CreateProjectScreen`, `ProjectsScreen`, `ProjectCard`, `ProjectDetailScreen`, `MilestoneLockSection` |
| How it works | View switching through `useState`, with no router. Data is fetched in `useEffect` and held in component state. All requests go through `apiGet`/`apiPost`, which prefix `API_BASE = "http://localhost:4000"`, attach `Authorization: Bearer <token>`, parse the body as text then JSON, and throw `Error(data.error)` when the response is not OK. The JWT is stored in `localStorage` under `musicapp_token`. On load, the app calls `GET /auth/me` and clears the token on failure. |
| Security controls | React escaping. There is no `dangerouslySetInnerHTML`. |
| Tests | None. No test runner is configured. `pnpm lint` and `tsc -b` both passed on 2026-09-25. |
| Known limitations | Single module (no plan item yet, [System Architecture §5](../01-foundation/system-architecture.md#5-current-code-organization-vs-the-modularity-principle)). Untyped, unlinted API client ([ENG-IMP-002](engineering-improvements.md#eng-imp-002-frontend-api-client-is-untyped-and-outside-lint-scope)). Hardcoded API base ([ENG-IMP-003](engineering-improvements.md#eng-imp-003-frontend-api-base-url-is-hardcoded)). Token in `localStorage` (`SEC-USERS-005`). |
| Last materially changed | `88986c5` (2026-07-21) |

### 4.5 Authentication

| Field | Record |
|---|---|
| Canonical specification | [authentication.md](../02-users-roles-permissions/authentication.md) |
| Implementation status | Partially Implemented: signup, login, current-user lookup, and bearer-token middleware |
| API routes | `POST /auth/signup` (`Index.js:203-314`), `POST /auth/login` (`319-407`), `GET /auth/me` (`412-468`) |
| Database tables | `users`, `profiles`, `auth_credentials` (migration 007: `password_hash`, `password_changed_at`) |
| How it works | **Signup** validates input, including a password length of 8 characters to 72 bytes (the bcrypt limit). It hashes with `bcryptjs` cost 12, then inserts the `users`, `profiles`, and `auth_credentials` rows in one transaction and returns `201 { user, profile }` without issuing a token. **Login** looks up an `active` user by case-insensitive email joined to profile and credentials, compares with bcrypt, and returns the same `401 "Invalid email or password"` whether the email is unknown or the password is wrong. On success it signs a JWT (`sub`, `external_id`, `profile_id`, `status`; issuer `musicapp-api`, audience `musicapp-web`, expiry `JWT_EXPIRES_IN`, default `7d`). **`requireAuth`** (`24-48`) accepts only `Bearer <token>` and verifies signature, issuer, and audience. **`/auth/me`** re-reads the user and requires `status = 'active'`. |
| Frontend components | `LoginForm`, `SignupForm`, the `App` bootstrap |
| Security controls | bcrypt, a uniform login failure message, a fail-fast missing secret, and issuer/audience checks |
| Known limitations | Owned by the spec: no live status check on routes other than `/auth/me` (`SEC-AUTH-002`, MVP-006), no algorithm allowlist (`SEC-AUTH-009`), no rate limiting (`SEC-AUTH-005`), no revocation or refresh, login by email only, no password reset or email verification (MVP-009). |
| Last materially changed | `395396c` (2026-07-15), "feat: complete authentication foundation" |

### 4.6 Authorization

| Field | Record |
|---|---|
| Canonical specification | [authorization.md](../02-users-roles-permissions/authorization.md), [roles.md](../02-users-roles-permissions/roles.md) |
| Implementation status | Partially Implemented. There is no central policy function and no roles. |
| Authorization model | Authentication-gated routes: `/auth/me`, `GET /profiles`, and all `/projects` routes. Relationship checks are inline. `POST /projects` takes the buyer from `req.auth.sub` and never from the body. `GET /projects` filters `buyer_user_id = $1 OR seller_user_id = $1`. Lock-milestones loads the project `FOR UPDATE` and returns the same `404` for missing or not-buyer (`Index.js:854-860`). Self-dealing is rejected in code (`675`) and by the `projects_no_self_dealing` constraint. |
| Known limitations | `POST /users`, `GET /users`, and `POST /profiles` are unauthenticated (`SEC-001`, `SEC-AUTHZ-003`; MVP-005). Checks are duplicated inline (`SEC-AUTHZ-004`; MVP-007). There are no role tables (MVP-008). |
| Engineering decisions | The concealing-`404` pattern in lock-milestones is documented in its code comment and adopted as the reference pattern in [Handbook §7.3](engineering-handbook.md#73-authorization). |

### 4.7 Users, profiles, and discovery

| Field | Record |
|---|---|
| Canonical specification | [users.md](../02-users-roles-permissions/users.md), [profiles.md](../02-users-roles-permissions/profiles.md), [System Architecture §10.4](../01-foundation/system-architecture.md#104-marketplace) (Marketplace) |
| Implementation status | Partially Implemented |
| Database tables | `users` (001: `user_status` enum `active`/`suspended`/`deleted`, `CITEXT` unique email, unique `phone_e164`, `users_email_or_phone_present`); `profiles` (002: one per user, `CITEXT` unique `handle`, `genres TEXT[]`, `profile_photo_asset_id UUID` without FK) |
| API routes | `POST /users`, `GET /users`, `POST /profiles` (legacy direct creation), `GET /profiles` (authenticated, explicit columns excluding `dob`, newest 100) |
| Frontend components | `DiscoverScreen` (client-side search through `profileMatchesQuery` over the fetched 100), `ProfileCard`, `ProfileDetailScreen` (shows initials when no photo is set) |
| Known limitations | No profile edit or settings routes. `GET /profiles` has no live user-status filter and no server-side search (MVP-013). `POST /profiles` and signup return `RETURNING *`. |

### 4.8 Identity verification

| Field | Record |
|---|---|
| Canonical specification | [verification.md](../03-identity-profiles-verification/verification.md) |
| Implementation status | Schema Implemented |
| Database tables | `profile_verifications` (003: one per user, `verification_status` enum `not_started`/`submitted`/`approved`/`rejected`); `verification_documents` (004: `document_type`/`document_side`/`document_status` enums, MIME allowlist JPEG/PNG/HEIC/HEIF, type–side consistency CHECK, partial unique index for one current document per slot, `asset_id UUID` without FK) |
| API routes / frontend | None |
| Next | MVP-012 (depends on MVP-008 and MVP-010) |

### 4.9 Assets

| Field | Record |
|---|---|
| Canonical specification | [assets-and-media.md](../03-identity-profiles-verification/assets-and-media.md) |
| Implementation status | Not Implemented. No `assets` table, upload route, storage adapter, or file handling. |
| What exists | Two placeholder UUID columns waiting for the `assets` table: `profiles.profile_photo_asset_id` and `verification_documents.asset_id` (migration comments: "FK to assets(id) will be added after assets table exists") |
| Next | MVP-010, MVP-011 |

### 4.10 Projects

| Field | Record |
|---|---|
| Canonical specification | [projects.md](../05-projects-milestones/projects.md) |
| Implementation status | Partially Implemented: creation with milestones, participant listing, milestone locking. No state transitions, invitations, acceptance, or amendments. |
| Database tables | `projects` (005 + 008): `project_state` enum (`draft`, `funded`, `accepted`, `in_progress`, `delivered`, `buyer_rated`, `seller_rated`, `completed`, `cancelled`, `disputed`), `price_amount INTEGER`, `currency TEXT`, `delivery_days`, `revision_limit`, `service_id`/`service_snapshot` (no services table), `cancel_reason`, `dispute_reason`, `milestones_locked_at` (008). Constraints: `projects_no_self_dealing`, `projects_price_positive`, `projects_delivery_days_positive`, `projects_revision_limit_nonnegative`, `projects_service_snapshot_is_object`, `projects_milestones_locked_at_after_created`. FKs to `users` with `ON DELETE RESTRICT`. Indexes on buyer/seller + `created_at`, `state`, `service_id`. |
| API routes | `POST /projects` (`Index.js:611-771`), `GET /projects` (`773-831`), `POST /projects/:projectId/lock-milestones` (`837-920`) |
| How it works | **Create:** validates all fields and the milestone array before any query, requires milestone amounts to sum exactly to `price_amount`, rejects self-dealing, and requires an active seller who has a profile. It then inserts the project and its milestones (numbered from 1) in one transaction. Currency is always the server constant `PROJECT_CURRENCY = "INR"` (`522`), and new projects start in `draft`. **List:** returns projects where the actor is buyer or seller, joined to both parties' public profile fields, unpaginated. **Lock:** see [Milestones](#411-milestones). |
| Frontend components | `CreateProjectScreen` (rupee input converted to paise by `parseBudgetToMinorUnits` using string arithmetic, with a live milestone-sum check), `ProjectsScreen`, `ProjectCard`, `ProjectDetailScreen` |
| Known limitations | No transition routes, so projects stay `draft`. The 32-bit `INTEGER` money column (`REQ-ESCROW-003`) is guarded by `POSTGRES_INT_MAX` on both tiers. `GET /projects` has no pagination. Display-integrity issues are recorded in `SEC-PROJECTS-018`. |
| Engineering decisions | Server-stamped INR (code comment `Index.js:518-521`; product rule `BR-PROJECTS-003`). Integer minor units with frontend string-arithmetic parsing (code comment `App.tsx:1048-1051`). |
| Last materially changed | `88986c5` (2026-07-21) |

### 4.11 Milestones

| Field | Record |
|---|---|
| Canonical specification | [milestones.md](../05-projects-milestones/milestones.md) |
| Implementation status | Partially Implemented: created with the project, and lockable. No state transitions, term versions, revisions, or approvals. |
| Database tables | `project_milestones` (006): `milestone_state` enum (`planned`, `funded`, `in_progress`, `delivered`, `buyer_approved`, `released`, `refunded`, `disputed`, `cancelled`), `amount INT`, `currency TEXT`, `due_at`. Constraints: `project_milestones_amount_positive`, `project_milestones_no_positive`, `project_milestones_unique_no_per_project`. FK to `projects` `ON DELETE CASCADE`. |
| How it works | Lock-milestones, inside one transaction: locks the project row `FOR UPDATE`, requires buyer (otherwise concealing `404`), not already locked (`409`), `draft` state, at least one milestone, all milestones `planned` and in the project currency, and a sum equal to the price. It then sets `milestones_locked_at`. Trigger `protect_locked_milestones` (migration 008) then rejects any insert or delete, and any change to `project_id`, `milestone_no`, `title`, `description`, `amount`, `currency`, or `due_at` on that project's milestones, while leaving `state`/`updated_at` writable. |
| Frontend components | `MilestoneLockSection` inside `ProjectDetailScreen` |
| Security controls | Database-level immutability of locked terms (`BR-PROJECTS-002`) |
| Known limitations | No milestone read endpoint. `ProjectDetailScreen` has milestones only right after creation or locking (code comment `App.tsx:648-649`). |
| Engineering decisions | Lock enforcement is a database trigger rather than application-only logic, as recorded in migration 008's header comment. |
| Last materially changed | `88986c5` (2026-07-21) |

### 4.12 Deliverables

| Field | Record |
|---|---|
| Canonical specification | [deliverables.md](../05-projects-milestones/deliverables.md) |
| Implementation status | Not Implemented. The only related artifacts are the `delivered` values in the `project_state`/`milestone_state` enums and `projects.delivered_at`. |
| Next | MVP-020 – MVP-022 |

### 4.13 Escrow

| Field | Record |
|---|---|
| Canonical specification | [escrow.md](../06-payments-escrow/escrow.md) |
| Implementation status | Schema Implemented. Zero routes read or write these tables. |
| Database tables | `escrows` (one per project; `escrow_status` enum; `amount`/`funded_amount`/`released_amount`/`refunded_amount INT` with non-negative CHECKs), `escrow_allocations` (one per milestone; `escrow_allocations_totals_within_allocated`), `escrow_ledger` (`ledger_entry_type` enum, `escrow_ledger_amount_nonzero`, `escrow_ledger_alloc_requires_refs`; headed "immutable" in a comment only, with no enforcing trigger) |
| Known limitations | Owned by the spec: 32-bit money, unrestricted currency, ledger not append-only, `ON DELETE CASCADE` from projects/escrows onto ledger rows ([Escrow §26](../06-payments-escrow/escrow.md#26-verified-repository-comparison)). |
| Next | MVP-024, MVP-026 onward |

### 4.14 Payments

| Field | Record |
|---|---|
| Canonical specification | [payments.md](../06-payments-escrow/payments.md) |
| Implementation status | Schema Implemented. No provider, adapter, webhook, or route. |
| Database tables | `payments` (006): `payment_status` and `payment_type` enums, `provider TEXT`, `provider_payment_id`, `payments_milestone_required_for_milestone_types`, `payments_no_milestone_for_escrow_fund`, `payments_allocation_requires_milestone`, and several lookup indexes |
| Next | MVP-025 (provider-neutral adapter with a mock provider). No payment provider is selected. |

### 4.15 Messaging

| Field | Record |
|---|---|
| Canonical specification | [messaging.md](../07-messaging-collaboration/messaging.md) |
| Implementation status | Not Implemented |
| Next | MVP-038 – MVP-040 |

### 4.16 Ratings

| Field | Record |
|---|---|
| Canonical specification | [ratings.md](../08-ratings-reputation/ratings.md) |
| Implementation status | Not Implemented. Only the `buyer_rated`/`seller_rated` values in `project_state` exist, and no ratings table. |
| Next | MVP-044 (blocked on rating-scale decision) – MVP-047 |

### 4.17 Disputes

| Field | Record |
|---|---|
| Canonical specification | [disputes.md](../09-moderation-trust-safety/disputes.md) |
| Implementation status | Not Implemented. Only the bare `disputed` value on `project_state`, `milestone_state`, and `escrow_status`, plus `projects.dispute_reason TEXT`. |
| Next | MVP-031 – MVP-037 |

### 4.18 Notifications

| Field | Record |
|---|---|
| Canonical specification | [notifications.md](../10-notifications/notifications.md) |
| Implementation status | Not Implemented |
| Next | MVP-041 – MVP-043. No email provider is selected. |

### 4.19 Database and migrations

| Field | Record |
|---|---|
| Purpose | Schema definition and evolution for PostgreSQL 16 |
| Implementation status | Implemented |
| Important files | `backend/db/001_create_users.sql` … `008_add_milestone_locking.sql`, `backend/db/migrate.js`, `backend/db/db.js` |
| How it works | `npm run migrate` creates `schema_migrations(id, filename UNIQUE, applied_at)` if missing, reads `db/*.sql` sorted by filename, skips filenames already recorded, and runs each remaining file with one `client.query` (each file has its own `BEGIN`/`COMMIT`) followed by an `INSERT` of the filename. The files are written to be re-runnable: `CREATE … IF NOT EXISTS`, enum creation guarded by a `pg_type` lookup, constraint creation guarded by `pg_constraint`, and `CREATE OR REPLACE FUNCTION` / `DROP TRIGGER IF EXISTS`. Extensions: `pgcrypto` (`gen_random_uuid()`) and `citext`. |
| Conventions in use | Three-digit numeric prefix plus a snake_case description. UUID PK plus a unique application-generated `external_id` per business table. Named constraints `<table>_<rule>`. `created_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` (no update trigger). Enums for lifecycle state. |
| Known limitations | No checksum or drift detection, and applied-state recording is not atomic ([ENG-IMP-001](engineering-improvements.md#eng-imp-001-migration-runner-cannot-detect-edited-migrations-and-records-applied-state-non-atomically)). No down-migrations. |
| Last materially changed | Runner `191b2a0` (2026-07-12). Latest migration `008` in `88986c5` (2026-07-21). |

### 4.20 Testing

| Field | Record |
|---|---|
| Implementation status | Not Implemented. There are no test files, and `backend/package.json` `"test"` is `echo "Error: no test specified" && exit 1`. No frontend test script. |
| What does run | `frontend`: `pnpm lint` (ESLint over `*.ts`/`*.tsx`) and `tsc -b`, both exit 0 as of 2026-09-25. |
| Next | MVP-002 (harness) records its tooling choice as an EDR. MVP-004 adds CI. |

### 4.21 Deployment and infrastructure

| Field | Record |
|---|---|
| Implementation status | Partially Implemented: local development only |
| What exists | `docker-compose.yml` runs one `postgres:16` container (`musicapp_postgres`, port 5432, local development credentials, named volume `postgres_data`). The backend and frontend run as local Node processes. |
| Not present | Application Dockerfiles, hosting configuration, TLS, reverse proxy, CI/CD, environment-specific frontend configuration, observability tooling |

## 5. Baseline implementation choices (pre-EDR)

These choices were in place before this record existed. Most have no recorded rationale in the repository. They are listed as **facts about the current implementation**, not endorsed decisions, so no rationale is invented for them. Changing one follows [Handbook §20](engineering-handbook.md#20-refactoring-and-replacement). If a future issue deliberately confirms or changes one, that issue records an EDR.

| Choice | Where | Rationale recorded in the repository? |
|---|---|---|
| Express 5 with raw parameterized SQL through `pg`, no ORM or query builder | `backend/package.json`, `Index.js` | No |
| Plain `.sql` migrations with a custom filename-tracked runner | `backend/db/migrate.js` | No |
| Stateless JWT bearer authentication (`jsonwebtoken` defaults, issuer and audience claims) and bcrypt cost 12 | `Index.js:11-48`, `247`, `387-400` | Partially. [Authentication](../02-users-roles-permissions/authentication.md) documents the current model and its target replacement. |
| UUID primary keys plus prefixed random `external_id` | Migrations 001–006, `make*ExternalId` helpers | No |
| Money as integer minor units, currency stamped server-side as INR | `Index.js:513-522`, `App.tsx:1038-1060` | Yes, in code comments. Product rule `BR-PROJECTS-003`; target representation `REQ-ESCROW-003`. |
| Locked milestone terms enforced by a database trigger | Migration 008 | Yes, in the migration comment. Product rule `BR-PROJECTS-002`. |
| Concealing `404` for a non-buyer on lock-milestones | `Index.js:854-860` | Yes, in a code comment |
| Frontend view state through `useState` with no router or server-state library | `App.tsx` | No |
| JWT persisted in `localStorage` | `App.tsx` (`TOKEN_KEY`) | No. The target differs (`SEC-USERS-005`). |

## 6. Engineering decision records

### 6.1 When to write an EDR

Write an EDR for a significant **implementation** decision that does not belong in a product specification. Examples: library selection, transaction strategy, retry design, indexing approach, module boundaries, caching, provider-adapter structure, background-job design, error strategy, testing strategy, deployment choice.

- Do **not** write an EDR for a trivial choice such as a local variable name or the order of helper functions.
- An EDR **never changes product behavior**. If a decision would change what a specification says, it is a specification change: stop and raise it ([`AGENTS.md`](../../AGENTS.md) Section 4).
- A decision that changes an Approved or Implemented document, introduces a cross-cutting standard, or reverses a prior decision is an **ADR**, not an EDR ([Governance §4.1](../00-governance/README.md#41-engineering-control-documents), [§14](../00-governance/README.md#14-decision-records-adrs)).
- EDR IDs are sequential and never reused. A superseded or reversed EDR stays in place with its status updated and a link to its replacement.

### 6.2 EDR format

```markdown
### EDR-NNN Short title

| Field | Value |
|---|---|
| ID | EDR-NNN |
| Date | YYYY-MM-DD |
| Issue | MVP-NNN / GitHub issue link |
| Decision | One sentence |
| Context | The problem and its constraints |
| Options considered | At least two, with pros and cons |
| Chosen approach | |
| Why | |
| Trade-offs | What is given up |
| Affected components | Files, modules, tables |
| Reversal / migration considerations | What undoing this would take |
| Related specification IDs | REQ-* / BR-* / SEC-* / AUD-* |
| Related PR / commit | |
| Status | ACTIVE / SUPERSEDED (by EDR-NNN) / REVERSED |
```

### 6.3 EDR index

| ID | Title | Status | Date |
|---|---|---|---|
| — | No EDRs yet | — | — |

No initial EDRs were created. None of the pre-existing choices in Section 5 has a recorded rationale that could fill an EDR's *Why* and *Options considered* fields without invention. Setting up these engineering-control documents is a documentation-structure decision, already recorded where Governance requires it ([Governance §4.1](../00-governance/README.md#41-engineering-control-documents), version 1.3.0). The first EDRs are expected from MVP-001 (module layout) and MVP-002 (test tooling).

## 7. Change history

This section is append-only. Add one row per meaningful implementation issue, newest last. Never edit or delete a past row. Correct a row by adding a new one.

| Date | MVP / Issue | Summary | Subsystems changed | Migrations | API changes | Frontend changes | Security changes | Tests added/changed | EDRs | ENG-IMP created | PR | Commit(s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2025-12-23 – 2026-07-21 | Pre-plan (no issue) | Baseline built before the implementation plan existed: skeleton, schema 001–006, local development setup and migration runner, authentication foundation (007), profile discovery and detail, draft project creation, role-aware project list, INR projects with fixed milestones, milestone locking (008) | Repository, backend, frontend, database, authentication, profiles, projects, milestones | 001–008 | The 12 routes listed in Section 4.3 | All screens listed in Section 4.4 | bcrypt, JWT, concealing `404` on lock, lock trigger | None | — | — | — | `3e895a6` … `88986c5` (see `git log -- backend frontend`) |
| 2026-09-25 | Engineering-controls setup (no MVP item) | Created the engineering handbook, improvements register, and this build record. Integrated them into `AGENTS.md`. Governance 1.3.0 added `docs/20-engineering/`. No application code changed. | Documentation only | None | None | None | None | None | None | `ENG-IMP-001`–`009` | — (pushed to `docs/specification-foundation`) | The `docs:` commits of 2026-09-25 that introduce `docs/20-engineering/` |

## 8. Version history

| Version | Date | Change | Author |
|---|---|---|---|
| 0.1.0 | 2026-09-25 | Initial build record: status for 20 subsystems verified against commit `2defbea`, baseline implementation choices, EDR system (no initial EDRs), append-only change history. Proposed pending human review. | Engineering (drafted by Claude Code) |
