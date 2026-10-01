# MusicApp engineering build record

| Field | Value |
|---|---|
| Document ID | `ENG-BUILD-RECORD` (provisional; decision records use the non-governed `EDR-NNN` family, [Governance §4.1](../00-governance/README.md#41-engineering-control-documents)) |
| Type | Reference (REF): implementation record, not a requirement specification |
| Status | Proposed |
| Owner | Engineering (interim: repository maintainers) |
| Version | 0.16.1 |
| Last Reviewed | 2026-10-01 |
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
| [Backend application](#43-backend-application) | Partially Implemented (per-domain modules) | [System Architecture §5](../01-foundation/system-architecture.md#5-current-code-organization-vs-the-modularity-principle) |
| [Frontend application](#44-frontend-application) | Partially Implemented (single module) | [System Architecture §5](../01-foundation/system-architecture.md#5-current-code-organization-vs-the-modularity-principle) |
| [Authentication](#45-authentication) | Partially Implemented | [authentication.md](../02-users-roles-permissions/authentication.md) |
| [Authorization](#46-authorization) | Partially Implemented (`authorize()` for existing project rules) | [authorization.md](../02-users-roles-permissions/authorization.md), [roles.md](../02-users-roles-permissions/roles.md) |
| [Users, profiles, and discovery](#47-users-profiles-and-discovery) | Partially Implemented | [users.md](../02-users-roles-permissions/users.md), [profiles.md](../02-users-roles-permissions/profiles.md), [user-settings.md](../03-identity-profiles-verification/user-settings.md) |
| [Identity verification](#48-identity-verification) | Schema Implemented | [verification.md](../03-identity-profiles-verification/verification.md) |
| [Assets](#49-assets) | Not Implemented (placeholder columns only) | [assets-and-media.md](../03-identity-profiles-verification/assets-and-media.md) |
| [Projects](#410-projects) | Partially Implemented | [projects.md](../05-projects-milestones/projects.md) |
| [Milestones](#411-milestones) | Partially Implemented | [milestones.md](../05-projects-milestones/milestones.md) |
| [Deliverables](#412-deliverables) | Not Implemented | [deliverables.md](../05-projects-milestones/deliverables.md) |
| [Escrow](#413-escrow) | Schema Implemented | [escrow.md](../06-payments-escrow/escrow.md) |
| [Payments](#414-payments) | Schema Implemented | [payments.md](../06-payments-escrow/payments.md) |
| [Messaging](#415-messaging) | Partially Implemented (conversation, immutable message, tombstone) | [messaging.md](../07-messaging-collaboration/messaging.md) |
| [Ratings](#416-ratings) | Not Implemented (enum values only) | [ratings.md](../08-ratings-reputation/ratings.md) |
| [Disputes](#417-disputes) | Not Implemented (enum values and one column only) | [disputes.md](../09-moderation-trust-safety/disputes.md) |
| [Notifications](#418-notifications) | Partially Implemented (intent, in-app delivery, preference evaluation, read/mark-read) | [notifications.md](../10-notifications/notifications.md) |
| [Database and migrations](#419-database-and-migrations) | Implemented | [Governance §17](../00-governance/README.md#17-database-documentation-standards) |
| [Idempotency, outbox, and inbox](#422-idempotency-outbox-and-inbox) | Partially Implemented (project transitions, invitations, amendments, and messages use the helpers; nothing runs the dispatcher) | [Projects §24](../05-projects-milestones/projects.md#24-concurrency-and-idempotency), [Milestones §24](../05-projects-milestones/milestones.md#24-concurrency-and-idempotency), [Escrow §22](../06-payments-escrow/escrow.md#22-idempotency-and-concurrency), [Payments §14](../06-payments-escrow/payments.md#14-idempotency-and-concurrency) |
| [Testing](#420-testing) | Partially Implemented (backend smoke harness and frontend component runner; no CI) | [Handbook §14](engineering-handbook.md#14-testing-strategy); MVP-002 harness, MVP-004 CI |
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
| Implementation status | Partially Implemented. Route handlers are split by domain. Product behavior is unchanged from the single-module baseline. |
| Entry points | `npm start` → `node Index.js`; `npm run dev` → `node --watch Index.js`; `npm run migrate` → `node db/migrate.js`; `npm test` → `node --test --test-concurrency=1` over the files in `backend/test/` listed in [Testing](#420-testing) |
| Important files | `backend/Index.js` (composition root, health routes, listen on port 4000), `backend/src/{auth,users,profiles,projects,milestones,notifications,messaging}/{routes,service,repository}.js`, `backend/src/projects/transition-rules.js`, `backend/src/projects/transition-service.js`, `backend/src/projects/transition-repository.js`, `backend/src/projects/amendment-rules.js`, `backend/src/projects/amendment-service.js`, `backend/src/projects/amendment-repository.js`, `backend/src/notifications/` (topic classification, in-app adapter, and rules), `backend/src/messaging/rules.js`, `backend/src/infrastructure/` (shared idempotency, outbox, and inbox helpers; see [§4.22](#422-idempotency-outbox-and-inbox)), `backend/db/db.js` (pg `Pool`, loads `dotenv`), `backend/db/migrate.js` |
| API routes | `GET /`, `GET /db-health`, `POST /users`, `GET /users`, `POST /profiles`, `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, `GET /profiles`, `POST /projects`, `GET /projects`, `POST /projects/:projectId/propose`, `POST /projects/:projectId/seek-seller`, `POST /projects/:projectId/cancel`, `POST /projects/:projectId/start`, `POST /projects/:projectId/archive`, `POST /projects/:projectId/restore`, `POST /projects/:projectId/invitations`, `GET /projects/:projectId/invitations/:invitationId`, `POST /projects/:projectId/invitations/:invitationId/accept`, `POST /projects/:projectId/invitations/:invitationId/decline`, `POST /projects/:projectId/invitations/:invitationId/withdraw`, `POST /projects/:projectId/lock-milestones`, `GET /notifications`, `GET /notifications/:externalId`, `POST /notifications/:externalId/mark-read`, `POST /projects/:projectExternalId/messages`, `GET /projects/:projectExternalId/messages`, `POST /projects/:projectExternalId/messages/:messageExternalId/tombstone`, `POST /projects/:projectId/amendments`, `POST /projects/:projectId/amendments/:amendmentId/accept`, `POST /projects/:projectId/amendments/:amendmentId/reject`, `POST /projects/:projectId/amendments/:amendmentId/withdraw` |
| Services/modules | One routes/service/repository triplet per existing domain. `requireAuth` is exported from `backend/src/auth/routes.js`. Health checks stay on the composition root. Helpers: `makeExternalId`, `makeProfileExternalId`, `makeProjectExternalId`, `makeMilestoneExternalId`, `validateMilestonesInput`, and constants `SAFE_PROJECT_FIELDS`, `SAFE_PROJECT_FIELDS_JOINED`, `SAFE_MILESTONE_FIELDS`, `POSTGRES_INT_MAX`, `PROJECT_CURRENCY`, `UUID_PATTERN`. |
| External dependencies | `express` 5.2.1, `pg` 8.16.3, `jsonwebtoken` 9.0.3, `bcryptjs` 3.0.3, `cors` 2.8.5, `dotenv` 17.2.3 (locked versions). No dependency was added for MVP-001. |
| How it works | CommonJS. `Index.js` loads `backend/db/db.js` before it loads `backend/src/auth/service.js`, which reads `JWT_SECRET` and exits if that value is blank. Global middleware is still `cors()` then `express.json()`. Each domain route calls one service operation. Services keep the previous validation, transaction boundaries, and PostgreSQL error mapping. Repositories run the previous parameterized SQL. `Index.js` exports `app` and listens on hardcoded port 4000 only when it is the main module. The test harness imports that export and listens on an ephemeral port. |
| Security controls | Parameterized SQL throughout. Explicit safe column lists for project and milestone responses. bcrypt cost 12. JWT issuer and audience verification. |
| Tests | `backend/test/routes.smoke.test.js` asserts status and body for every existing route against a real PostgreSQL database, through `backend/test/harness.js`. `backend/test/database-guard.test.js` checks the isolation guard without opening a pool. Run with `DB_NAME=musicapp_mvp001` and an explicit `DB_PORT` other than 5432. `./.cursor/test-backend.sh` is the supported entry point. |
| Operational considerations | Logs only through `console.log`/`console.error`. There is no error-handling middleware. Run `npm install` before starting. |
| Known limitations | No central error handler ([ENG-IMP-007](engineering-improvements.md#eng-imp-007-no-central-error-handling-unhandled-and-body-parse-errors-reach-expresss-default-handler)). Implicit config loading ([ENG-IMP-005](engineering-improvements.md#eng-imp-005-configuration-is-loaded-implicitly-and-silently-falls-back-to-defaults)). Duplicated transaction handling ([ENG-IMP-006](engineering-improvements.md#eng-imp-006-transaction-boilerplate-is-duplicated-and-rollback-can-mask-the-original-error)). No lint ([ENG-IMP-004](engineering-improvements.md#eng-imp-004-no-backend-lint-and-no-repository-formatter)). |
| Engineering decisions | [EDR-001](#edr-001-backend-module-layout). [EDR-003](#edr-003-test-runners-and-database-fixture) for the test entry point. [EDR-004](#edr-004-shared-idempotency-outbox-and-inbox-model) for `backend/src/infrastructure/`. Baseline choices remain in Section 5. |
| Last materially changed | MVP-016 (2026-09-30): project amendment propose, accept, reject, and withdraw. |

### 4.4 Frontend application

| Field | Record |
|---|---|
| Purpose | Browser single-page application for signup, login, discovery, project creation, project listing, and milestone locking |
| Canonical specification | [System Architecture](../01-foundation/system-architecture.md); per-domain specs |
| Implementation status | Partially Implemented. Almost all code is in one module. |
| Entry points | `pnpm dev` (Vite, port 5173), `pnpm build` (`tsc -b && vite build`), `pnpm lint`, `pnpm test` (Vitest) |
| Important files | `frontend/src/main.tsx` (mount), `frontend/src/App.tsx` (1,816 lines: types, all screens, helpers), `frontend/src/api/api.js` (fetch client), `frontend/vitest.config.ts`, `frontend/src/test/setup.ts`, `App.css`, `index.css`, `eslint.config.js`, `tsconfig.app.json` |
| Frontend components | `App` (auth bootstrap; `AppState`), `LoginForm`, `SignupForm`, `AppShell` (navigation; `AuthenticatedView` = `home`/`discover`/`profileDetail`/`createProject`/`projects`/`projectDetail`), `DiscoverScreen`, `ProfileCard`, `ProfileDetailScreen`, `CreateProjectScreen`, `ProjectsScreen`, `ProjectCard`, `ProjectDetailScreen`, `MilestoneLockSection` |
| How it works | View switching through `useState`, with no router. Data is fetched in `useEffect` and held in component state. All requests go through `apiGet`/`apiPost`, which prefix `API_BASE = "http://localhost:4000"`, attach `Authorization: Bearer <token>`, parse the body as text then JSON, and throw `Error(data.error)` when the response is not OK. The JWT is stored in `localStorage` under `musicapp_token`. On load, the app calls `GET /auth/me` and clears the token on failure. |
| Security controls | React escaping. There is no `dangerouslySetInnerHTML`. |
| Tests | Vitest 4 with jsdom 26 and Testing Library. `frontend/src/App.smoke.test.tsx` covers the logged-out screen, the signup password-mismatch message, session loading, and a rejected login. `frontend/src/App.discover.test.tsx` covers Discover loading, empty catalog, empty search, server query parameters, hiding the signed-in profile, and the search error retry. |
| Known limitations | Single module (no plan item yet, [System Architecture §5](../01-foundation/system-architecture.md#5-current-code-organization-vs-the-modularity-principle)). Untyped, unlinted API client ([ENG-IMP-002](engineering-improvements.md#eng-imp-002-frontend-api-client-is-untyped-and-outside-lint-scope)). Hardcoded API base ([ENG-IMP-003](engineering-improvements.md#eng-imp-003-frontend-api-base-url-is-hardcoded)). Token in `localStorage` (`SEC-USERS-005`). |
| Last materially changed | MVP-013 (2026-09-29): Discover search is a server query. |

### 4.5 Authentication

| Field | Record |
|---|---|
| Canonical specification | [authentication.md](../02-users-roles-permissions/authentication.md) |
| Implementation status | Partially Implemented: signup, login, current-user lookup, and bearer-token middleware |
| API routes | `POST /auth/signup`, `POST /auth/login`, `GET /auth/me` in `backend/src/auth/` |
| Database tables | `users`, `profiles`, `auth_credentials` (migration 007: `password_hash`, `password_changed_at`) |
| How it works | **Signup** validates input, including a password length of 8 characters to 72 bytes (the bcrypt limit). It hashes with `bcryptjs` cost 12, then inserts the `users`, `profiles`, and `auth_credentials` rows in one transaction and returns `201 { user, profile }` without issuing a token. **Login** looks up an `active` user by case-insensitive email joined to profile and credentials, compares with bcrypt, and returns the same `401 "Invalid email or password"` whether the email is unknown, the password is wrong, or the account is not `active`. On success it signs a JWT (`sub`, `external_id`, `profile_id`, `status`; issuer `musicapp-api`, audience `musicapp-web`, expiry `JWT_EXPIRES_IN`, default `7d`). **`requireAuth`** in `backend/src/auth/routes.js` accepts only `Bearer <token>`, verifies signature, issuer, and audience, then calls **`requireLiveStatus`**. That loads `users.status` by `sub` and rejects the request with `401 { error: "Unauthorized" }` unless `accountMayAuthenticate` allows it (`backend/src/auth/account-status.js`: `active`, `restricted`, `email_verification_pending`). A missing row or a non-UUID `sub` is the same `401`. The live status replaces the token's `status` claim on `req.auth`. **`/auth/me`** re-reads the user and profile and no longer repeats the status predicate. |
| Frontend components | `LoginForm`, `SignupForm`, the `App` bootstrap |
| Security controls | bcrypt, a uniform login failure message, a fail-fast missing secret, and issuer/audience checks |
| Known limitations | No algorithm allowlist (`SEC-AUTH-009`), no rate limiting (`SEC-AUTH-005`), no authentication-version comparison (Authentication §12.3 step 7; the column is not implemented), no revocation or refresh, login by email only, no password reset or email verification (MVP-009). `restricted` and `email_verification_pending` are not in the `user_status` enum, so only `active` can pass the middleware until a later migration adds them. |
| Engineering decisions | [EDR-006](#edr-006-live-account-status-inside-requireauth) |
| Last materially changed | MVP-006 (2026-09-28) |

### 4.6 Authorization

| Field | Record |
|---|---|
| Canonical specification | [authorization.md](../02-users-roles-permissions/authorization.md), [roles.md](../02-users-roles-permissions/roles.md) |
| Implementation status | Partially Implemented. `authorize()` decides project create, list, lock, seller invitation commands, in-app notification list, read, and mark-read, and conversation read, send, and tombstone. There are no roles tables. Invitation commands write `project_audit_events`. Notification commands write `notification_audit_events`. Messaging commands write `messaging_audit_events`. |
| Entry points | `backend/src/authorization/authorize.js`. `createProject` and `listProjects` call it. `lockMilestones` calls it after `SELECT … FOR UPDATE`. |
| Authorization model | Authentication-gated routes: `/auth/me`, `GET /profiles`, all `/projects` routes, all `/notifications` routes, and the messaging routes under `/projects/:projectExternalId/messages`. Account status is enforced only in `requireAuth` (`BR-AUTHZ-005`). `project.create` denies self-dealing with `400` and an ineligible seller with `404`, and the inserted buyer is `obligations.buyerUserId`. `GET /projects` runs the participant `whereSql` from `authorize`: the buyer, or an active seller participant. `seller_user_id` alone is not access (`BR-AUTHZ-032`). Invite, withdraw, accept, decline, and review each have an action. A non-buyer invite and a non-invitee accept or decline return a concealing `404`. Invite no longer rejects a non-draft project before the idempotency store; the transition service rejects an unready proposal inside the handler. Propose, seek-seller, cancel, start, archive, and restore conceal a caller who is neither the buyer nor the active seller with `404`, then `commitTransition` checks the edge's actor. Lock-milestones is unchanged. `notification.list` returns `recipientUserId` and the list query is scoped to that user. Read and mark-read of another user's delivery, or of a missing id, return the same `404`. `conversation.read` and `conversation.send` allow the live Buyer or the active accepted Seller and conceal everyone else with `404`. `message.tombstone` allows only that message's sender; another live participant receives `403`. |
| Known limitations | `POST /users`, `GET /users`, and `POST /profiles` are unauthenticated (`SEC-001`, `SEC-AUTHZ-003`; MVP-005). The decision object is only `allowed`, `status`, `error`, and `obligations` — not the full §9.2 record (`INT-AUTHZ-004` is still Planned). `POST /projects` still stores `seller_user_id` before acceptance (`ENG-IMP-032`). There are no role tables (MVP-008). An unknown action fails closed with `403`. |
| Engineering decisions | [EDR-007](#edr-007-authorize-for-the-existing-project-rules) |
| Tests | `backend/test/authorize.test.js` (allow/deny for each existing rule, including notification list, read, and mark-read, and conversation read, send, and tombstone). `backend/test/authorization.http.test.js` (server-derived buyer, suspended seller, non-draft lock). Existing smoke and live-status tests still cover the other protected routes. Notification HTTP coverage is in `backend/test/notifications.http.test.js`. Messaging HTTP coverage is in `backend/test/messages.http.test.js`. |
| Last materially changed | MVP-015 (2026-09-30) |

### 4.7 Users, profiles, and discovery

| Field | Record |
|---|---|
| Canonical specification | [users.md](../02-users-roles-permissions/users.md), [profiles.md](../02-users-roles-permissions/profiles.md), [System Architecture §10.4](../01-foundation/system-architecture.md#104-marketplace) (Marketplace) |
| Implementation status | Partially Implemented |
| Database tables | `users` (001: `user_status` enum `active`/`suspended`/`deleted`, `CITEXT` unique email, unique `phone_e164`, `users_email_or_phone_present`); `profiles` (002: one per user, `CITEXT` unique `handle`, `genres TEXT[]`, `profile_photo_asset_id UUID` without FK) |
| API routes | `POST /users`, `GET /users`, `POST /profiles` (legacy direct creation), `GET /profiles` (authenticated, explicit columns excluding `dob`, server-side search, newest-first page of at most 100) |
| Frontend components | `DiscoverScreen` (sends the search box to `GET /profiles` as `name`, `handle`, `genre`, `city`, and `country`), `ProfileCard`, `ProfileDetailScreen` (shows initials when no photo is set) |
| Known limitations | No profile edit or settings routes. Profile visibility and lifecycle columns do not exist, so search cannot yet scope to public active Profiles (`REQ-PROFILE-005`). `POST /profiles` and signup return `RETURNING *`. Leading-wildcard search has no index (`ENG-IMP-030`). Supplied search dimensions are OR-combined (`ENG-IMP-031`). |
| Engineering decisions | [EDR-008](#edr-008-server-side-profile-search) |

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
| Implementation status | Partially Implemented: creation with milestones, participant listing, milestone locking, seller invitation consent, the Projects §11.3 transition service, one immutable `project_term_versions` sequence per project, bilateral project-level amendments, and immutable milestone proposal and agreed snapshots. |
| Database tables | `projects` (005 + 008 + 010 + 014): `project_state` enum now also includes `proposed`, `seller_invited`, `seller_declined`, `awaiting_seller`, `awaiting_funding`, `delivery_pending`, `buyer_approved`, `ratings_pending`, `suspended`, `refunded`, and `archived`. Legacy `buyer_rated` and `seller_rated` remain so existing rows stay valid. `price_amount INTEGER`, `currency TEXT`, `delivery_days`, `revision_limit`, `service_id`/`service_snapshot` (no services table), `cancel_reason`, `dispute_reason`, `milestones_locked_at` (008), `version INTEGER` (010, default 1). Migration 014 adds `proposal_version`, `agreed_term_version`, `currency_exponent SMALLINT NOT NULL DEFAULT 2`, `resume_state`, `funded_at`, `started_at`, `cancelled_at`, and `archived_at`. `seller_user_id` is nullable as of 010. Constraints include `projects_no_self_dealing`, `projects_price_positive`, `projects_version_positive`. `project_invitations` and `project_participants` (010) plus append-only `project_audit_events`. One pending invitation per project, one active buyer, and one active seller are partial unique indexes. `project_term_versions` and `project_state_transitions` (014) are append-only. A term version's content hash and contiguous version number are trigger-enforced. There is no `engagement_model` column and no milestone amount on the term snapshot. `project_amendments` (015) stores one proposed amendment per project. Terminal amendment rows cannot be updated or deleted. Once `agreed_term_version` is set, the pointer can only move forward to an existing `agreed` version whose snapshot matches the live commercial columns. A commercial-column change without that move is rejected, and so is any change to `delivery_days`. |
| API routes | `POST /projects` and `GET /projects` in `backend/src/projects/`; `POST /projects/:projectId/propose`, `seek-seller`, `cancel`, `start`, `archive`, and `restore`; invitation invite, review, accept, decline, and withdraw on `/projects/:projectId/invitations`; `POST /projects/:projectId/lock-milestones` in `backend/src/milestones/`. Amendment propose, accept, reject, and withdraw are on `/projects/:projectId/amendments`. Escrow, delivery, dispute, rating, and suspension edges are `applySystemTransition` in `backend/src/projects/transition-service.js`. They are not public set-state routes. There is no user expire route and no superseded route. |
| How it works | **Create:** validates all fields and the milestone array before any query, requires milestone amounts to sum exactly to `price_amount`, rejects self-dealing, and requires an active seller who has a profile. It then inserts the project, an active Buyer participant, and its milestones (numbered from 1) in one transaction. Currency is always the server constant `PROJECT_CURRENCY = "INR"` in `backend/src/projects/service.js`, and new projects start in `draft` at `version` 1. The named `seller_user_id` is stored and is not an active Seller participant. **List:** returns projects where the actor is the buyer or an active seller participant, joined to both parties' public profile fields, unpaginated. **Transitions:** `commitTransition` locks the project, matches one row in `transition-rules.js`, and returns `409` with no snapshot or state write when the edge is unlisted or a precondition fails. An unready Draft → Proposed returns `422` (`INT-PROJECTS-003`). A settled cancellation whose fact says a hold remains is rejected. Draft → Proposed inserts the next `project_term_versions` row with `represented_state` `proposed` from the live title, requirements-as-brief, service snapshot, empty genre and skill arrays, INR, exponent 2, `price_amount` as `total_amount`, a null start, `due_at` equal to the database clock plus `delivery_days`, and the project revision limit. Seller Invited → Accepted copies that proposal row into the next version with `represented_state` `agreed`. The same two transitions write one `milestone_term_versions` row per milestone, `proposal` then `agreed`, and set `project_milestones.terms_status` from `draft` to `frozen` to `agreed`. Acceptance of a proposal version that has no milestone snapshots writes those proposal rows from complete live terms, or returns 409 and writes no agreed version. `AUD-PROJECTS-008` records each of those captures. `proposal_version` and `agreed_term_version` point at those version numbers. The same transaction writes `project_state_transitions`, `AUD-PROJECTS-003`, `AUD-PROJECTS-001` when a snapshot is inserted, and a `ProjectStateChanged` outbox row. `resume_state` stores the prior state for Disputed, Suspended, and Archived. **Invite:** the buyer sends `invitee_user_id`, a future `expires_at`, `expected_version`, and `Idempotency-Key`. The project must already be `proposed` or `awaiting_seller`, with a proposal version, a ready proposal, a revision allowance, and a catalogue selection. A missing allowance stays null in the stored consent hash. The invitation stores that proposal version. The command then moves the project to `seller_invited`. **Accept / decline / withdraw:** the invitee accepts or declines; the buyer withdraws. Acceptance inserts the active Seller participant, sets `accepted_at`, sets `seller_user_id` only when it is null or already that invitee, moves the project to `accepted`, and freezes the agreed version. Decline moves to `seller_declined` and does not auto-normalize. Withdraw moves to `awaiting_seller`. **Expiry:** a review, accept, decline, or withdraw whose pending invitation is due marks it `expired` and then applies the system edge to `awaiting_seller`. A repeated terminal command for the same outcome returns that outcome and does not write a second effect. **Amendments:** after `agreed_term_version` is set, the buyer or the active seller proposes `{ expected_version, expires_at, changes }` with `Idempotency-Key`. The patch may contain `title`, `brief`, `revision_limit`, `start_at`, `due_at`, and `service_snapshot`. Currency, total, genre, skill, and milestone fields return `422`. The row stores the current agreed hash and the hash of the patched snapshot, computed by `project_term_version_content_hash`. Propose does not change the project row. The counterparty accepts with `expected_version` and `expected_hash` or rejects. The proposer withdraws. Acceptance inserts the next `agreed` term version, points `agreed_term_version` at it, bumps `projects.version`, and copies `title`, `brief` into `requirements`, `revision_limit`, and `service_snapshot` when those keys are present. It does not change `price_amount`, `currency`, `delivery_days`, milestone rows, or `projects.state`. Rejection and withdrawal leave the project and the term sequence unchanged. A due pending amendment expires on the next propose, accept, reject, or withdraw and does not write a term version. One proposed amendment per project. `AUD-PROJECTS-004` is in the same transaction. Acceptance also enqueues `ProjectTermsChanged`. |
| Frontend components | `CreateProjectScreen` (rupee input converted to paise by `parseBudgetToMinorUnits` using string arithmetic, with a live milestone-sum check), `ProjectsScreen`, `ProjectCard`, `ProjectDetailScreen` |
| Known limitations | Currency, total, and milestone-plan amendments return `422` because `INT-PROJECTS-023` and escrow revalidation are not available (`BR-PROJECTS-051`). Milestone proposal and agreed snapshots exist; an accepted amendment still does not write a milestone `amendment` snapshot. `superseded` is in the enum and has no command. Amendment expiry has no maximum (`ENG-IMP-046`). `ProjectTermsChanged` and `ProjectStateChanged` are written to the outbox and not delivered (`ENG-IMP-023`). `POST /projects` still writes `seller_user_id` before acceptance (`ENG-IMP-032`). Invitation duration has no maximum (`ENG-IMP-033`). The live `price_amount` column stays 32-bit `INTEGER` (`REQ-ESCROW-003`) and is guarded by `POSTGRES_INT_MAX`; the snapshot `total_amount` is `BIGINT`. Genre and skill catalogs do not exist, so a proposal snapshot stores empty arrays and an amendment cannot set them. `GET /projects` has no pagination and does not return the term snapshot. Display-integrity issues are recorded in `SEC-PROJECTS-018`. |
| Engineering decisions | Server-stamped INR (code comment in `backend/src/projects/service.js`; product rule `BR-PROJECTS-003`). Integer minor units with frontend string-arithmetic parsing (code comment `App.tsx:1048-1051`). Module layout: [EDR-001](#edr-001-backend-module-layout). Invitation consent model: [EDR-009](#edr-009-seller-invitation-without-a-project-state-transition). One term-version sequence and the transition function: [EDR-014](#edr-014-one-project-term-version-sequence). Project amendments: [EDR-015](#edr-015-project-amendments-on-the-agreed-sequence). Milestone snapshots: [EDR-016](#edr-016-milestone-term-snapshots). Product decision: [ADR-001](../99-appendices/adr/ADR-001-project-term-versions.md). |
| Last materially changed | MVP-017 (2026-10-01) |

### 4.11 Milestones

| Field | Record |
|---|---|
| Canonical specification | [milestones.md](../05-projects-milestones/milestones.md) |
| Implementation status | Partially Implemented: created with the project, lockable, snapshotted at proposal and acceptance, and moved through M01–M17 by `applyMilestoneTransition`. Start (`milestone.start`) enforces the Section 13.2 activation predicate. No public start, revision, or approval route. M18 is not built. |
| Database tables | `project_milestones` (006 + 016 + 017 + 018): `milestone_state` enum now includes `suspended`. `amount BIGINT`, `currency TEXT`, `currency_exponent SMALLINT NOT NULL`, `deliverable_definition JSONB`, `revision_allowance INTEGER`, `terms_status` (`draft`, `frozen`, `agreed`), `current_term_version`, `version INTEGER NOT NULL DEFAULT 1`, lifecycle timestamps, `resume_state`, `interruption_reason`, and `interrupted_at`. Constraints include `project_milestones_amount_positive`, `project_milestones_no_positive`, `project_milestones_unique_no_per_project`, nonnegative exponent and allowance, `project_milestones_agreed_terms_complete`, `project_milestones_resume_state_matches`, and a partial unique index of one `in_progress` or `delivered` row per project. FK to `projects` remains `ON DELETE CASCADE`. `milestone_term_versions` (016) is append-only. `milestone_state_transitions`, `milestone_revision_requests`, and `milestone_approvals` (018) are append-only with FK `ON DELETE RESTRICT`. |
| How it works | Create requires each milestone's integer minor-unit amount, an explicit nonnegative `revision_allowance`, and a non-empty catalogue selection, and it writes the M01 transition plus `AUD-PROJECTS-007`. The server stamps INR and the project's `currency_exponent`. Propose and seller acceptance still capture the immutable snapshots from MVP-017. `applyMilestoneTransition` locks the project, then every milestone of that project in ascending `milestone_no`, then the inbox or idempotency row. It refuses a client `target_state`. A direct `UPDATE` of `state` raises unless the session flag `musicapp.milestone_transition` is on and the pair is a legal edge. System facts are deduplicated by event id. A fact that fails amount, currency, exponent, term version, readiness, or outcome matching is quarantined. A stale `expected_version` rolls back and leaves no inbox row. M05 stores the event id as `source_fact_id` and the submission reference in its own column, so M06 and M07 can require that reference when the delivery event id is different. A second readiness fact for the same submission is acknowledged and writes no second transition. A quarantined mismatch writes an audit row and does not change state. M04 starts a `funded` milestone only for the active seller whose `users.status` is `active`, and only when `terms_status` is `agreed`, the project is `funded` or `in_progress` and not interrupted, every lower-numbered milestone is `buyer_approved`, `released`, `refunded`, or `cancelled`, and no other milestone is `in_progress` or `delivered`. The partial unique index rejects a second active row. The work-start audit hash records that predecessor set and the term version. A replay of the same idempotency key does not write a second start. Suspension, restoration, and suspension settlement do not require `terms_status = agreed`. Revision requests store any non-blank reason code and detail. There is no code list and no text maximum (`ENG-IMP-054`). The allowance is the agreed integer. `0` means no included revision. Approval writes one `milestone_approvals` row and `EVT-PROJECTS-010` with the stored amount, currency, submission reference, and approval id. It does not settle money. Dispute and suspension store `resume_state` and one of `DISPUTE`, `ADMIN_RISK`, `MODERATION`, or `CANCELLATION_PENDING`. Funding reversal before start returns to `planned`. After start it enters `suspended` with `ADMIN_RISK`. |
| Frontend components | `CreateProjectScreen` collects the catalogue with checkboxes and the revision allowance with a dropdown that has no preselected value, plus Custom for any other nonnegative integer. `ProjectDetailScreen` shows the stored amount with the milestone exponent, the allowance, and the selected deliverable labels. `MilestoneLockSection` remains. MVP-018 adds no screen. |
| Security controls | `protect_milestone_state` rejects unnamed state writes (`SEC-PROJECTS-021`, `BR-PROJECTS-037`). Public milestone JSON includes `version` (`SEC-PROJECTS-028`). Append-only transition, revision, and approval history (`BR-PROJECTS-052`). One approval per milestone. No release signal from `disputed` or `suspended` (`BR-PROJECTS-047`). Database-level immutability of locked, frozen, and agreed terms remains (`BR-PROJECTS-002`, `BR-PROJECTS-036`). |
| Known limitations | No milestone read endpoint and no public M04, M06, or M07 route (those routes are MVP-022). Start does not move `projects.state`; Section 15 assigns that Funded to In Progress transition to Projects. M18 and `milestone_platform_release_authorizations` are not built. Seller asset-to-deliverable fulfillment is specified and not built. `submission_requirements` is not collected. Milestone `amendment` snapshots are not written. The application still rejects a milestone amount above `2147483647` because `projects.price_amount` is `INTEGER` (`ENG-IMP-050`). The lock trigger reads the project row without `FOR UPDATE` (`ENG-IMP-051`). `external_id` is still not a protected column (`SEC-PROJECTS-022`). Escrow foreign keys were not changed. Asset upload ceilings were not inferred. Revision reason codes and the detail bound are not specified (`ENG-IMP-054`). Outbox rows are not dispatched (`ENG-IMP-023`). No notification intent is created. |
| Engineering decisions | Lock enforcement remains the migration 008 trigger, extended in migrations 016 and 017. Amount, catalogue, and revision allowance: [EDR-016](#edr-016-milestone-term-snapshots). State changes: [EDR-017](#edr-017-milestone-transition-service). Activation stays on that start edge: [EDR-018](#edr-018-activation-predicate-on-milestone-start). |
| Last materially changed | MVP-019 (2026-10-01) |

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
| Canonical specification | [messaging.md](../07-messaging-collaboration/messaging.md) version 0.2.0. Product set the MVP body maximum at 500 characters on 2026-09-29. |
| Implementation status | Partially Implemented. One conversation per project, created on the first user message. User messages are immutable. Tombstone redacts ordinary display and leaves the row, body, hash, sequence, and conversation binding in place. No attachment table, read-state table, system-message route, or hard-delete route. |
| Database tables | Migration `013`. `conversations`: unique `project_id`, `external_id` `cnv_` plus 20 hex, nullable `latest_message_id`, `version`. `messages`: `external_id` `msg_` plus 20 hex, unique `(conversation_id, sequence_number)`, `body` `char_length` at most 500, `content_hash` equal to the SHA-256 of the UTF-8 body, tombstone columns set once. `messaging_audit_events` for `AUD-MESSAGING-001`. |
| API routes | `POST /projects/:projectExternalId/messages`, `GET /projects/:projectExternalId/messages`, `POST /projects/:projectExternalId/messages/:messageExternalId/tombstone`. The project key is `prj_` plus 20 hex. `Idempotency-Key` is required on send and tombstone. |
| How it works | The route authenticates, loads the project by external id, and calls `authorize` before it loads a conversation or message. The sender is the authenticated user. Sequence numbers are assigned under a project row lock and a conversation row lock. Ordinary list and tombstone responses set `body` to null when `tombstoned_at` is set and do not return `content_hash`. Send and tombstone write the audit row and a redacted outbox event in the same transaction. |
| Known limitations | Attachments are MVP-039. Dispute-evidence read is MVP-040. System messages have columns and no HTTP producer. Read state is not stored. An ended participant loses read access; Messaging `REQ-MESSAGING-003` requires that denial. Organization Project Manager access is not granted because no organization membership exists. Page size is 1–100 and offset is at most 10000, copied from profile and notification lists because Messaging states no page size. Empty body is accepted because §8.1 states no minimum. No character class beyond the 500-character maximum is enforced. `SEC-MESSAGING-009` rate limiting remains open. A completed send idempotency payload still contains the pre-tombstone body (`ENG-IMP-042`); the HTTP replay redacts it. |
| Engineering decisions | [EDR-013](#edr-013-conversation-messages-and-tombstone) |
| Tests | `backend/test/messaging-rules.test.js`, `backend/test/messages.http.test.js`, `backend/test/message-constraints.test.js` |
| Next | MVP-039 – MVP-040 |

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
| Implementation status | Partially Implemented. Intent, in-app delivery, and preference evaluation exist. Email, push, SMS, preference storage, retry, and rendered templates do not. |
| Database tables | `notification_intents`, `notification_deliveries`, `notification_audit_events` (011). Intent rows are append-only. A mandatory in-app delivery cannot be suppressed or deleted. |
| Entry points | `submitVerifiedEvent` in `backend/src/notifications/service.js` (in-process only). `GET /notifications`, `GET /notifications/:externalId`, `POST /notifications/:externalId/mark-read`. |
| How it works | A classified topic is snapshotted as `MANDATORY` or `CONFIGURABLE` ([EDR-010](#edr-010-in-app-intent-without-a-preference-store), [EDR-011](#edr-011-preference-evaluation-without-a-settings-table)). `submitVerifiedEvent` ignores any preference on the event and reads User Settings in the fan-out transaction. The production reader reports the read unavailable, because no settings table exists, and the matrix default applies. A settings document, when the read succeeds, uses this order: mandatory in-app policy, a boolean topic override, a global channel boolean, then the matrix default. A more restrictive boolean wins. Mandatory in-app is always sent. A configurable in-app channel the matrix would deliver is inserted `PENDING` and moved to `SUPPRESSED` when the user disables it; the adapter is not called and `attempt_count` stays 0. A matrix-off channel with no enabling override creates no delivery row. Email, push, and SMS decisions are evaluated and not persisted. Duplicate `(recipient, topic, source_event_id)` returns the existing intent and does not write a second audit row. List, read, and mark-read omit `SUPPRESSED` rows. One `AUD-NOTIFICATIONS-001` row is written with the delivery id when a row exists. Mark-read sets `read_at` once and writes `AUD-NOTIFICATIONS-002` only on that change. `GET` does not set `read_at`. |
| Known limitations | Three matrix rows are refused (`ENG-IMP-036`), including `Security-critical account event`. Live users cannot store a disable until User Settings exists (`ENG-IMP-039`). Quiet hours and digest are not applied (`ENG-IMP-040`). `SEC-NOTIFICATIONS-002` stays open: there is no signed HTTP ingestion route. `SENT` is not an `AUD-NOTIFICATIONS-001` terminal state, so the in-app adapter does not write a second audit row when it accepts the delivery. A direct insert can pair a topic with the wrong class (`ENG-IMP-038`). A producer can name a source domain the topic row does not (`ENG-IMP-037`). No email provider is selected. Nothing renders notification copy. |
| Engineering decisions | [EDR-010](#edr-010-in-app-intent-without-a-preference-store), [EDR-011](#edr-011-preference-evaluation-without-a-settings-table) |
| Tests | `backend/test/notification-rules.test.js`, `backend/test/preference-evaluation.test.js`, `backend/test/notifications.http.test.js`, `backend/test/notification-constraints.test.js` |
| Last materially changed | MVP-042 (2026-09-29) |
| Next | MVP-043 email once a provider is selected. |

### 4.19 Database and migrations

| Field | Record |
|---|---|
| Purpose | Schema definition and evolution for PostgreSQL 16 |
| Implementation status | Implemented |
| Important files | `backend/db/001_create_users.sql` … `018_milestone_state_machine.sql`, `backend/db/migrate.js`, `backend/db/db.js` |
| How it works | `npm run migrate` creates `schema_migrations(id, filename UNIQUE, applied_at)` if missing, reads `db/*.sql` sorted by filename, skips filenames already recorded, and runs each remaining file with one `client.query` (each file has its own `BEGIN`/`COMMIT`) followed by an `INSERT` of the filename. The files are written to be re-runnable: `CREATE … IF NOT EXISTS`, enum creation guarded by a `pg_type` lookup, constraint creation guarded by `pg_constraint`, and `CREATE OR REPLACE FUNCTION` / `DROP TRIGGER IF EXISTS`. Extensions: `pgcrypto` (`gen_random_uuid()`) and `citext`. |
| Conventions in use | Three-digit numeric prefix plus a snake_case description. UUID PK plus a unique application-generated `external_id` per business table. Named constraints `<table>_<rule>`. `created_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` (no update trigger). Enums for lifecycle state. |
| Known limitations | No checksum or drift detection, and applied-state recording is not atomic ([ENG-IMP-001](engineering-improvements.md#eng-imp-001-migration-runner-cannot-detect-edited-migrations-and-records-applied-state-non-atomically)). No down-migrations. |
| Last materially changed | Runner `191b2a0` (2026-07-12). Latest migration `018` (MVP-018): `suspended` on `milestone_state`, milestone version and lifecycle columns, append-only `milestone_state_transitions`, `milestone_revision_requests`, and `milestone_approvals`, and `protect_milestone_state`. The new enum value is committed before later statements use it. No column is dropped. Migration `017` (MVP-017 review) repairs agreed-term completeness. Migration `016` widens milestone `amount` to `BIGINT` and adds milestone term snapshots. |

### 4.20 Testing

| Field | Record |
|---|---|
| Implementation status | Partially Implemented. MVP-002 added the backend runner, database fixture, and frontend component runner. There is still no CI workflow. |
| What does run | `backend`: `npm test` runs `backend/test/database-guard.test.js`, `backend/test/canonical-json.test.js` (no database), `backend/test/account-status.test.js` (no database), `backend/test/authorize.test.js` (no database), `backend/test/profile-search-query.test.js` (no database), `backend/test/invitation-rules.test.js` (no database), `backend/test/notification-rules.test.js` (no database), `backend/test/preference-evaluation.test.js` (no database), `backend/test/messaging-rules.test.js` (no database), `backend/test/routes.smoke.test.js`, `backend/test/live-status.test.js`, `backend/test/authorization.http.test.js`, `backend/test/profile-search.http.test.js`, `backend/test/infrastructure.test.js`, `backend/test/invitations.http.test.js`, `backend/test/invitation-constraints.test.js`, `backend/test/notifications.http.test.js`, `backend/test/notification-constraints.test.js`, `backend/test/messages.http.test.js`, `backend/test/message-constraints.test.js`, `backend/test/transition-rules.test.js`, `backend/test/transitions.http.test.js`, `backend/test/amendment-rules.test.js`, `backend/test/amendments.http.test.js`, and `backend/test/amendment-constraints.test.js`, `backend/test/amount.test.js`, `backend/test/catalogue.test.js`, `backend/test/milestone-terms.http.test.js`, `backend/test/milestone-transitions.test.js`, and `backend/test/milestone-activation.test.js` with Node's built-in `node:test` runner, one file at a time (`--test-concurrency=1`) because two files truncate the same database. The smoke file migrates, truncates application tables, and listens on an ephemeral port. The infrastructure file covers MVP-003's constraints, triggers, concurrency, and seeded property cases (`backend/test/random.js`). Invitation tests cover the terminal outcomes, authorization, proposal mismatch, and database constraints. Notification tests cover mandatory in-app creation, preference precedence, dedupe, recipient privacy, and the migration's constraints. Messaging tests cover the 500-character maximum, tombstone redaction with a preserved row and hash, relationship denial, sequence assignment, and the migration's constraints. Transition tests cover every listed Projects §11.3 edge, an unlisted `409` with no side effects, participant concealment, snapshot immutability, one sequence per project, and one winner under concurrent propose. Amendment tests cover acceptance writing the next agreed version, rejection leaving the project and the sequence unchanged, the allowlist, authorization, expiry, holds, one winner between accept and withdraw, and the amendment constraints. Milestone activation tests cover an unresolved predecessor, another active milestone, the one-active index, seller authorization including a non-active account, and one winner under concurrent start. | It requires `DB_NAME=musicapp_mvp001` and an explicit `DB_PORT` other than 5432. `./.cursor/test-backend.sh` provisions that database on port 5433. `frontend`: `pnpm test` (Vitest), `pnpm lint`, and `tsc -b`. |
| Known limitations | One smoke run truncates `musicapp_mvp001`. Two overlapping runs against that database will interfere. There is no GitHub Actions workflow yet (MVP-004). |
| Next | MVP-004 adds the CI workflow that runs these commands. |

### 4.21 Deployment and infrastructure

| Field | Record |
|---|---|
| Implementation status | Partially Implemented: local development only |
| What exists | `docker-compose.yml` runs one `postgres:16` container (`musicapp_postgres`, port 5432, local development credentials, named volume `postgres_data`). The backend and frontend run as local Node processes. `.cursor/Dockerfile` is the Cursor Cloud Agent image only: Ubuntu 24.04, PostgreSQL 16, Node.js 22.14.0, npm, corepack 0.34.7, and pnpm 12.5.1 ([EDR-002](#edr-002-cloud-agent-node-toolchain)). It is not an application image. |
| Not present | Application Dockerfiles, hosting configuration, TLS, reverse proxy, CI/CD, environment-specific frontend configuration, observability tooling |

### 4.22 Idempotency, outbox, and inbox

| Field | Record |
|---|---|
| Purpose | Shared retry-safety infrastructure that domain commands and event consumers call inside their own transaction |
| Canonical specification | [Projects §24](../05-projects-milestones/projects.md#24-concurrency-and-idempotency) and [§26](../05-projects-milestones/projects.md#26-target-data-model), [Milestones §24](../05-projects-milestones/milestones.md#24-concurrency-and-idempotency), [Escrow §22](../06-payments-escrow/escrow.md#22-idempotency-and-concurrency), [Payments §14](../06-payments-escrow/payments.md#14-idempotency-and-concurrency) |
| Implementation status | Partially Implemented. Project propose, seek-seller, cancel, start, archive, restore, and `applySystemTransition`, invitation invite, accept, decline, and withdraw, amendment propose, accept, reject, and withdraw, messaging send and tombstone, and milestone user commands call `executeIdempotent` inside the same transaction as the state change. Milestone system facts call `consumeInboxEvent` after the project and milestone locks. Nothing runs the outbox dispatcher ([ENG-IMP-023](engineering-improvements.md#eng-imp-023-outbox-dispatcher-has-no-process-runner-transport-or-alerting)). |
| Database tables | Migration 009. `idempotency_keys`: unique `(actor_type, actor_id, operation, resource_ref, idempotency_key)`, `actor_type` `user` or `system`, key of 1–255 visible ASCII characters, SHA-256 `request_hash`, `status` `in_progress` or `completed`, stored `response_status`/`response_body`, nullable `expires_at`. `outbox_messages`: unique `event_id` and `sequence`, event type and version, opaque aggregate reference and version, object `payload`, correlation and causation IDs, `status` `pending`/`published`/`dead_letter`, attempts, `available_at`, `last_error` (at most 500 characters), partial index on pending rows. `inbox_events`: unique `(consumer, source, event_id)`, `result` `applied`/`ignored`/`quarantined`, set together with `processed_at`. None has a foreign key to or from a domain table. |
| Services/modules | `backend/src/infrastructure/canonical-json.js`: `canonicalJson` (sorted keys; rejects values a JSON body cannot carry) and `hashRequest` (SHA-256 hex). `idempotency.js`: `validateIdempotencyKey`, `claimIdempotencyKey`, `completeIdempotencyKey`, `executeIdempotent`. `outbox.js`: `enqueueOutboxMessage`, `publishPendingOutbox(pool, publish, options)`. `inbox.js`: `consumeInboxEvent`. |
| How it works | Every helper except the dispatcher takes the caller's pooled client and runs inside the caller's transaction, so the state change, idempotency result, outbox event, and inbox record commit or roll back together. `executeIdempotent` inserts the key with `ON CONFLICT DO NOTHING`. A concurrent claim of the same key waits on the unique index. After the first transaction commits, the waiting claim sees that transaction's row. After a rollback, it claims the key itself. The same request hash replays the stored `{ status, body }` without calling the handler. A different hash returns `409`, and so does a claim that was committed without completion. `consumeInboxEvent` inserts the inbox row before running the handler, so a duplicate delivery is acknowledged without a second effect. `publishPendingOutbox` locks due rows with `FOR UPDATE SKIP LOCKED` in sequence order, calls the injected `publish` function, and marks each row published. On failure it retries with bounded exponential backoff (1 s doubling to 5 min) and dead-letters the row after 10 attempts, or the `maxAttempts` a caller passes. Delivery is at-least-once, and consumers deduplicate by `event_id`. |
| Security controls | Triggers reject any change to the scope, key, request hash, event content, or inbox identity. They also reject any change to a completed key, a published message, or a processed inbox row, and any `DELETE` on the three tables. `TRUNCATE` is not blocked, so the test fixture can reset. Actor and scope are server-derived arguments, and helpers throw on invalid ones. Only the idempotency key is client input, validated by `validateIdempotencyKey`. |
| Tests | `backend/test/canonical-json.test.js` and `backend/test/infrastructure.test.js` (Section 4.20) |
| Known limitations | Retention purge is not built, because the retention period is an open Legal decision (Escrow Question EQ11): idempotency `expires_at` stays null and rows are kept. Reordered facts are not held back until their source version arrives. That check belongs to each consumer's own handler (Milestones §24). Outbox order is by `sequence`, which is not commit order. No process publishes the outbox ([ENG-IMP-023](engineering-improvements.md#eng-imp-023-outbox-dispatcher-has-no-process-runner-transport-or-alerting)). |
| Engineering decisions | [EDR-004](#edr-004-shared-idempotency-outbox-and-inbox-model) |
| Related issues | MVP-003 / [#5](https://github.com/xela-ash/Music_app/issues/5) |
| Last materially changed | MVP-018 (2026-10-01): a milestone fact is deduplicated by inbox event id after the project and its milestones are locked. A mismatch that can never apply is quarantined. A stale version rolls back with no inbox row. |

## 5. Baseline implementation choices (pre-EDR)

These choices were in place before this record existed. Most have no recorded rationale in the repository. They are listed as **facts about the current implementation**, not endorsed decisions, so no rationale is invented for them. Changing one follows [Handbook §20](engineering-handbook.md#20-refactoring-and-replacement). If a future issue deliberately confirms or changes one, that issue records an EDR.

| Choice | Where | Rationale recorded in the repository? |
|---|---|---|
| Express 5 with raw parameterized SQL through `pg`, no ORM or query builder | `backend/package.json`, `backend/src/*/repository.js` | No |
| Plain `.sql` migrations with a custom filename-tracked runner | `backend/db/migrate.js` | No |
| Stateless JWT bearer authentication (`jsonwebtoken` defaults, issuer and audience claims) and bcrypt cost 12 | `backend/src/auth/service.js`, `backend/src/auth/routes.js` | Partially. [Authentication](../02-users-roles-permissions/authentication.md) documents the current model and its target replacement. |
| UUID primary keys plus prefixed random `external_id` | Migrations 001–006, `make*ExternalId` helpers in the domain repositories | No |
| Money as integer minor units, currency stamped server-side as INR | `backend/src/projects/service.js`, `App.tsx:1038-1060` | Yes, in code comments. Product rule `BR-PROJECTS-003`; target representation `REQ-ESCROW-003`. |
| Locked milestone terms enforced by a database trigger | Migration 008 | Yes, in the migration comment. Product rule `BR-PROJECTS-002`. |
| Concealing `404` for a non-buyer on lock-milestones | `backend/src/milestones/service.js` | Yes, in a code comment |
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

### EDR-001 Backend module layout

| Field | Value |
|---|---|
| ID | EDR-001 |
| Date | 2026-09-26 |
| Issue | MVP-001 / GitHub issue #3 |
| Decision | Split the existing backend into `backend/src/{auth,users,profiles,projects,milestones}/{routes,service,repository}.js`, and leave process startup and the two health routes in `backend/Index.js`. |
| Context | System Architecture §5 records a single backend module and leaves the target folder structure as an open question (§18). Issue #3 and Handbook §5.2 require this scaffold without a behavior change. Handbook §7.1 assigns HTTP, business rules, and SQL to route, service, and repository. Signup, project creation, and lock-milestones already span more than one table inside one transaction. |
| Options considered | Keep every route in `Index.js` and extract helpers only. That preserves behavior but does not meet the required paths. One file per domain, without the three layers. That meets the domain split and misses Handbook §7.1. A new shared platform package for config, transactions, and errors. That would implement ENG-IMP-005, ENG-IMP-006, and ENG-IMP-007, which issue #3 does not authorize. |
| Chosen approach | Five domain triplets. `Index.js` loads `backend/db/db.js` before the auth module, mounts the routers, serves `GET /` and `GET /db-health`, and listens on port 4000 only when it is the main module. `requireAuth` stays in `backend/src/auth/routes.js` and is required by the other authenticated routers. A service that already used one checked-out client keeps that client and passes it into the repositories it calls. SQL text, status codes, and response bodies stay as they were. |
| Why | This is the layout issue #3 names, and it keeps each existing transaction on one client. Health checks are not one of the five domains, so they stay on the composition root instead of inventing a domain. |
| Trade-offs | `UUID_PATTERN` is copied in the projects and milestones services. Transaction `BEGIN`/`COMMIT`/`ROLLBACK` stays inline. Configuration is still loaded by import order. Those are the existing limitations, left in place. |
| Affected components | `backend/Index.js`; `backend/src/auth/`; `backend/src/users/`; `backend/src/profiles/`; `backend/src/projects/`; `backend/src/milestones/` |
| Reversal / migration considerations | Move the route handlers back into `backend/Index.js` and delete `backend/src/`. No schema or client contract changes. |
| Related specification IDs | None. System Architecture §5 defines no governed identifiers for this split. |
| Related PR / commit | Pull request #56, merge commit `1952e82`. |
| Status | ACTIVE |

### EDR-002 Cloud Agent Node toolchain

| Field | Value |
|---|---|
| ID | EDR-002 |
| Date | 2026-09-26 |
| Issue | No `MVP-*` item. Cloud environment build `bld-20260926-dd1c93c3-4038-46a4-8c74-586bcc10e387` failed in `.cursor/install.sh` with `npm: command not found` (exit 127). |
| Decision | Keep Ubuntu 24.04 and PostgreSQL 16. Install checksum-pinned Node.js 22.14.0 (which includes npm), replace its bundled corepack with corepack 0.34.7, and activate pnpm 12.5.1 non-interactively for every user. |
| Context | `.cursor/Dockerfile` installed PostgreSQL, git, and curl, and `.cursor/install.sh` assumed `npm` and `corepack`/`pnpm` were already on `PATH`. Node 22.14.0's bundled corepack is 0.31.0. That release looks for `bin/pnpm.cjs`, which pnpm 12.5.1 does not publish, so `pnpm --version` exits before it can run. corepack 0.35.0 and later require Node `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`, so they cannot be the pin while Node stays at 22.14.0. The `ubuntu` user on the failed image was in the `sudo` group but `sudo` demanded a password, and `.cursor/lib/postgres.sh` starts PostgreSQL 16 with `sudo`. |
| Options considered | Install Node from Ubuntu's archive. That does not pin 22.14.0. Use NodeSource or `n`. That adds an unpinned third-party installer. Leave bundled corepack 0.31.0. It cannot activate pnpm 12.5.1. Install corepack 0.36.0. Its engines reject Node 22.14.0. Install pnpm with `npm install -g` and skip corepack activation. The install script and the frontend path are corepack-based (`corepack enable` then `pnpm`). Upgrade Node past 22.14.0 so current corepack installs. The repair pins 22.14.0. |
| Chosen approach | Download `node-v22.14.0-linux-x64.tar.gz` from `nodejs.org`, check SHA-256 `9d942932535988091034dc94cc5f42b6dc8784d6366df3a36c4c9ccb3996f0c2`, and extract it to `/usr/local`. Then `npm install -g corepack@0.34.7`, `corepack enable`, and `corepack prepare pnpm@12.5.1 --activate` with `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` and a world-readable `COREPACK_HOME=/usr/local/share/corepack`. Add `sudo` and `/etc/sudoers.d/90-ubuntu-nopasswd` so `ubuntu` can run the existing PostgreSQL helpers. Dev database port 5432, test cluster port 5433, and `./.cursor/test-backend.sh` are unchanged. |
| Why | This is the smallest image change that makes `.cursor/install.sh` find `npm` and lets the frontend activate the requested pnpm release without an interactive corepack prompt, without moving off PostgreSQL 16. |
| Trade-offs | corepack stays on 0.34.7 until Node is raised to at least 22.22.2 ([ENG-IMP-021](engineering-improvements.md#eng-imp-021-cloud-image-corepack-cannot-follow-current-releases-on-node-22140)). The image is linux-x64 only. Passwordless sudo is limited to the Cloud Agent `ubuntu` user so the existing helpers keep working. |
| Affected components | `.cursor/Dockerfile`. No application code, schema, or API. |
| Reversal / migration considerations | Revert `.cursor/Dockerfile`. No data migration. A new Cloud environment build is required before agents receive the toolchain. |
| Related specification IDs | None. This does not change product behavior. |
| Related PR / commit | Branch `cursor/cloud-node-toolchain-ef45`. |
| Status | ACTIVE |

### EDR-003 Test runners and database fixture

| Field | Value |
|---|---|
| ID | EDR-003 |
| Date | 2026-09-26 |
| Issue | MVP-002 / GitHub issue #4 |
| Decision | Use Node's built-in `node:test` runner for the backend, with an in-process ephemeral HTTP server and a truncate fixture against database `musicapp_mvp001`, and use Vitest 4 with Testing Library and jsdom 26 for frontend component tests. |
| Context | Handbook §14 requires a real PostgreSQL integration layer and a frontend behavior layer. MVP-001's characterization file used `node:test` only as a snapshot and left the runner, fixture, and frontend runner undecided. The backend and frontend are separate packages with separate package managers. The cloud test script already isolates PostgreSQL on port 5433 and database `musicapp_mvp001`. |
| Options considered | Keep spawning `Index.js` on port 4000. That preserves the snapshot but binds a fixed port and has no teardown. Jest for both tiers. That adds a backend dependency and a second frontend bundler path. One Vitest workspace for both tiers. That fights the CommonJS backend and the split package managers. `node:test` plus Vitest, as chosen. |
| Chosen approach | `backend/test/database-guard.js` refuses a missing or default database name, a missing port, a port that is not a plain decimal TCP port, and port 5432 before the pool is created. The port is compared as a number because `pg` parses it with `parseInt`, so `05432` or `5432x` would otherwise reach 5432. `backend/test/harness.js` migrates in a child process, truncates application tables, and listens on port 0. `backend/Index.js` exports `app`; `node Index.js` still binds port 4000. `frontend/vitest.config.ts` runs `src/**/*.test.tsx` in jsdom. jsdom is pinned to 26.1.0 because jsdom 30 requires a newer Node than this repository's Node 20+ note and this environment's Node 22.14. Vitest is 4.1.11 or later because Vitest 2.1.0 through 4.1.10 carry advisory GHSA-82fw-gwwq-j7x9 (`@vitest/mocker`, moderate). `@testing-library/dom` is declared because it is a required peer of `@testing-library/react` 16. |
| Why | `node:test` and `fetch` are already on the platform, so the backend gains no dependency. Vitest uses the existing Vite React plugin, and Testing Library asserts the screen the user sees. The isolated database name matches `./.cursor/test-backend.sh`, so the fixture does not invent a second test database. |
| Trade-offs | Two runners, one per package. The smoke suite still prints the existing missing-body and malformed-JSON server errors ([ENG-IMP-007](engineering-improvements.md#eng-imp-007-no-central-error-handling-unhandled-and-body-parse-errors-reach-expresss-default-handler)). Truncate lists today's tables explicitly. GitHub Actions remains MVP-004. `pnpm audit` on 2026-09-27 reported the same 34 advisory IDs on this branch as on `main` (`458b7cd`); the added test packages introduce none, and the existing ones sit in the pre-existing `vite`/lint tree. |
| Affected components | `backend/Index.js`, `backend/package.json`, `backend/test/`, `frontend/package.json`, `frontend/vitest.config.ts`, `frontend/src/App.smoke.test.tsx`, `frontend/src/test/setup.ts`, `.cursor/test-backend.sh` |
| Reversal / migration considerations | Restore a spawned server and remove the `app` export. No schema or client contract changes. Removing the frontend runner means deleting the devDependencies and the test files. |
| Related specification IDs | `SEC-PROJECTS-019`, `SEC-PROJECTS-032`, `SEC-ESCROW-014`. This harness is the coverage those findings depend on. It does not close them. |
| Related PR / commit | Pull request #57, branch `mvp-002-automated-test-harness`. |
| Status | ACTIVE |

### EDR-004 Shared idempotency, outbox, and inbox model

| Field | Value |
|---|---|
| ID | EDR-004 |
| Date | 2026-09-27 |
| Issue | MVP-003 / GitHub issue #5 |
| Decision | Build three shared tables (`idempotency_keys`, `outbox_messages`, `inbox_events`) and plain helper functions in `backend/src/infrastructure/`. Each helper takes the caller's transaction client. Uniqueness is enforced by the database, and the outbox dispatcher is transport-neutral. |
| Context | Projects §24 and §26, Milestones §24, Escrow §22, and Payments §14 require idempotency by key and request hash, a durable outbox published after commit, and consumer deduplication by immutable event ID. Projects §26 and Escrow §24.1 say these records are shared infrastructure, not Escrow-specific tables. Their ownership and constraints must be explicit before implementation. The plan names the tables but no specification defines their columns. No message broker, job runner, or consumer exists. Payments' `payment_provider_events` (`DATA-ESCROW-008`) belongs to Payments and is not part of this item, but `(provider, provider_event_id)` deduplication has to be expressible on the shared inbox. |
| Options considered | (1) Per-domain idempotency columns on each aggregate table. The specifications ask for shared infrastructure, and each domain would reimplement the claim. (2) Claim and complete the key in separate transactions around the domain work, as for an external call. A crash would leave an `in_progress` key that blocks retries, and no current command makes an external call. (3) Advisory locks keyed by a hash of the idempotency scope instead of a unique index. Serialization then depends on hash collisions and on callers, not on a constraint. (4) A generic `withTransaction` helper that owns the transaction ([ENG-IMP-006](engineering-improvements.md#eng-imp-006-transaction-boilerplate-is-duplicated-and-rollback-can-mask-the-original-error)). It is not authorized, and it would move the transaction boundary away from the domain services that already own it. (5) Chosen: shared tables and caller-client helpers. |
| Chosen approach | The idempotency scope is actor type (`user` or `system`, per Roles §7.11 and Escrow's `actor_type`/`actor_id`), actor ID, operation, resource reference, and key. The request hash is SHA-256 over canonical JSON with sorted keys. The claim is an `INSERT … ON CONFLICT DO NOTHING` in the caller's transaction, so the unique index serializes concurrent claims. The response is stored in the same transaction as the state change. The inbox key is `(consumer, source, event_id)`, where `source` is the producer or payment provider, so one consumer's `(provider, provider_event_id)` is unique. The outbox gets a UUID `event_id` and an identity `sequence`. The dispatcher claims rows with `SKIP LOCKED` and hands them to an injected `publish` function. Triggers make evidence columns immutable and block `DELETE`. Callers lock aggregate rows before claiming a key or inbox record, which keeps the Milestones §24 lock order. |
| Why | The database, not application code, guarantees one effect per key and per event under concurrency, which is what `BR-PROJECTS-026`, `BR-ESCROW-027`, and `BR-ESCROW-041` require. Keeping the caller's client gives one atomic boundary for state, idempotency, and outbox (`REQ-PROJECTS-018`, `REQ-ESCROW-018`) without changing how existing services own transactions. A transport-neutral dispatcher needs no broker or provider decision. |
| Trade-offs | A losing concurrent claim waits for the winner's transaction instead of failing fast. A `409` "in progress" is only reachable when a caller commits a claim without completing it. A published outbox message may be delivered more than once. Rows are never deleted until a retention decision exists. `resource_ref` uses `''` for "no resource", because a null would defeat the unique constraint. |
| Interpretations recorded | (a) Projects §24 and Milestones §24 say the key stores a "response reference". This implementation stores the full response `{ status, body }` as that reference, so a replay needs no second read. Callers therefore authorize before claiming the key and keep tokens and secrets out of the body. (b) Milestones §24 names the inbox key `(consumer, event_id)`. This uses `(consumer, source, event_id)`, which still gives one row per consumer and event ID for a given source. `source` is the producer or provider, which Payments' `(provider, provider_event_id)` needs. Each consumer supplies its own `source` label. (c) Serialization relies on READ COMMITTED. A caller that runs at REPEATABLE READ or SERIALIZABLE gets `40001` on a contended claim and must retry the transaction. |
| Affected components | `backend/db/009_create_idempotency_outbox_inbox.sql`, `backend/src/infrastructure/`, `backend/test/harness.js` (truncate list), `backend/package.json` (test files, one file at a time) |
| Reversal / migration considerations | No domain table references these tables, so they can be dropped by a forward migration once no caller uses them. Existing rows would be lost, and they are the evidence that prevents replays, so export them first. |
| Related specification IDs | `REQ-PROJECTS-018`, `REQ-PROJECTS-039`, `REQ-ESCROW-018`, `REQ-ESCROW-031`, `BR-PROJECTS-026`, `BR-PROJECTS-027`, `BR-PROJECTS-049`, `BR-ESCROW-027`, `BR-ESCROW-041`, `SEC-PROJECTS-011`, `SEC-PROJECTS-013`, `SEC-ESCROW-003`, `SEC-ESCROW-018`, `SEC-ESCROW-020`. The infrastructure is a prerequisite for those findings, but no domain command uses it yet, so none of them is closed. |
| Related PR / commit | Pull request #60, branch `mvp-003-idempotency-outbox-inbox` |
| Status | ACTIVE |

### EDR-006 Live account status inside requireAuth

| Field | Value |
|---|---|
| ID | EDR-006 |
| Date | 2026-09-28 |
| Issue | MVP-006 / GitHub issue #8 |
| Decision | `requireAuth` calls `requireLiveStatus` after a successful JWT verification. The live check loads `users.id` and `users.status` and allows only the account statuses Authentication §8.1 says may authenticate. |
| Context | `SEC-AUTH-002`, `SEC-AUTHZ-002`, and `SEC-PROJECTS-002` are the same gap: four protected routes trusted a still-valid JWT. `REQ-AUTH-004`, `BR-AUTH-019`, and Authentication §12.3 require one shared middleware, in order, and forbid handlers from recreating the status check. `BR-AUTH-006` allows `Restricted` and denies `Suspended`, `Disabled`, `Deleted`, and `Archived`. The plan's acceptance text says `user_status = active`. The specification also allows `Restricted` and `Email Verification Pending`. The enum today is only `active`, `suspended`, and `deleted`. Step 7 of §12.3, the authentication-version comparison, has no column. No route sets `suspended` or `deleted`. |
| Options considered | (1) Compare status to `active` only. That matches the plan sentence and rejects `Restricted`, which §12.3 and `BR-AUTH-006` forbid. (2) Put a copy of the status query in each route. That repeats the duplication `BR-AUTH-019` exists to stop. (3) Add `auth_version` in this change. The plan specifies no schema change, and §12.3 says the comparison happens once that mechanism exists. (4) Chosen: one allow-list function, invoked from `requireAuth`, with no schema change. |
| Chosen approach | `backend/src/auth/account-status.js` allows `active`, `restricted`, and `email_verification_pending`. Any other value, including `suspended`, `disabled`, `deleted`, `archived`, and a missing row, is `401 { error: "Unauthorized" }`. A `sub` that is not a UUID (`22P02`) is the same `401`. `requireLiveStatus` replaces `req.auth.status` with the database value. Login still requires `status = 'active'` in `findLoginByEmail`, because login is issuance, not a protected request, and a non-active account must not receive a new token. `/auth/me` no longer filters on status. The seller lookup in `findActiveSellerWithProfile` is unchanged. |
| Why | Every current `requireAuth` route gets the check without a second call site to forget. The allow list follows §8.1 rather than the narrower plan sentence, and the two future labels do nothing until a migration adds them to the enum. The `401` body matches the existing unauthorized response, so a suspended account is not distinguishable from an invalid token. |
| Trade-offs | `email_verification_pending` is a label this code chose by snake_case convention. The specification does not name the enum literal. A later migration must use that literal or change this allow list in the same change. Authentication version is still not checked. Login remains `active`-only, which is stricter than the middleware allow list and matches the current issuance query. |
| Affected components | `backend/src/auth/routes.js`, `backend/src/auth/account-status.js`, `backend/src/auth/repository.js`, `backend/src/auth/service.js` |
| Reversal / migration considerations | Remove the `requireLiveStatus` call from `requireAuth` and restore the `status = 'active'` predicate on the `/auth/me` query. No schema change to reverse. |
| Related specification IDs | `REQ-AUTH-004`, `BR-AUTH-006`, `BR-AUTH-019`, `BR-AUTHZ-005`, `SEC-AUTH-002`, `SEC-AUTHZ-002`, `SEC-PROJECTS-002`, `INT-AUTH-004` |
| Related PR / commit | Branch `cursor/mvp-006-live-account-status-32e3` |
| Status | ACTIVE |

### EDR-007 authorize() for the existing project rules

| Field | Value |
|---|---|
| ID | EDR-007 |
| Date | 2026-09-28 |
| Issue | MVP-007 / GitHub issue #9 |
| Decision | One `authorize(actor, action, resource)` function decides the project rules that already exist. Services call it and map a denial to the same HTTP status and `{ error }` body as before. |
| Context | `SEC-AUTHZ-004`, `REQ-AUTHZ-001`, `REQ-AUTHZ-004`, and `BR-AUTHZ-024` require route policy to go through `INT-AUTHZ-001`. Authorization §10.1 is the evaluation order. §9.2's full decision record and §26's audit writer (`INT-AUTHZ-004`) are Planned, and this issue cites no `AUD-*`. `BR-AUTHZ-005` keeps suspended, disabled, deleted, and archived denial in Authentication. `SEC-AUTHZ-007` (seller acceptance) is a later project item, not a new permission to invent here. The plan names five inline checks. Account-status on `/auth/me` moved to Authentication in MVP-006, so the five that remain are seller eligibility, server-derived buyer identity, participant list scope, lock relationship, and lock state. |
| Options considered | (1) Return the full §9.2 object now, including audit and step-up fields nothing writes. That adds a product-shaped record this issue does not require. (2) Re-check account status inside `authorize()`. That duplicates `BR-AUTHZ-005` and can disagree with the middleware. (3) Change the non-draft lock response from `400` to the §27 default `409`. The issue requires existing behavior to stay unchanged, and §14.3 records the current `400`. (4) Fetch every project and filter the list in memory through `authorize()`. That breaks `BR-AUTHZ-023`. (5) Chosen: a small decision object, SQL list scope kept, lock evaluated on the locked row. |
| Chosen approach | Actions are `project.create`, `project.list`, and `project.lock_milestones`. An unknown action or a missing actor fails closed (`403` or `401`). Create denies self-dealing with `400` before it denies an ineligible seller with `404`, and the buyer written to the row is `obligations.buyerUserId`. List with no resource allows the action and returns `whereSql` and `params` built from one participant-column list (`buyer_user_id`, `seller_user_id`). The repository rejects any other scope and runs that clause. The same column list allows or conceals a single project. Lock, inside the existing transaction after `FOR UPDATE`, returns `404`, then `409` when `milestones_locked_at` is set, then `400` when `state` is not `draft`. Milestone amount and currency checks stay in the domain service. `authorize` ignores an account-status field on the actor. |
| Why | Existing protected responses stay the same, and a new route has one function that denies by default. The list stays a scoped query. Lock still revalidates under the row lock (`BR-AUTHZ-029`). |
| Trade-offs | Create now loads the seller before the self-dealing denial, so a database failure on that lookup returns `500` instead of the previous `400`. A successful self-dealing request is unchanged. Seller eligibility is a boolean the service sets from `findActiveSellerWithProfile` (`ENG-IMP-029`). The decision object is not the §9.2 record. EDR-005 is reserved by the unmerged MVP-004 branch, so this record is EDR-007. |
| Affected components | `backend/src/authorization/authorize.js`, `backend/src/projects/service.js`, `backend/src/projects/repository.js`, `backend/src/milestones/service.js`, `backend/test/authorize.test.js`, `backend/test/authorization.http.test.js` |
| Reversal / migration considerations | Move the conditionals back into the two services. No schema change. |
| Related specification IDs | `REQ-AUTHZ-001`, `REQ-AUTHZ-004`, `BR-AUTHZ-002`, `BR-AUTHZ-003`, `BR-AUTHZ-005`, `BR-AUTHZ-023`, `BR-AUTHZ-024`, `BR-AUTHZ-029`, `SEC-AUTHZ-004`, `INT-AUTHZ-001` |
| Related PR / commit | Branch `cursor/mvp-007-authorize-decision-32e3` |
| Status | ACTIVE |

### EDR-008 Server-side profile search

| Field | Value |
|---|---|
| ID | EDR-008 |
| Date | 2026-09-29 |
| Issue | MVP-013 / GitHub issue #15 |
| Decision | `GET /profiles` filters in SQL with case-insensitive substrings on `name`, `handle`, `genre`, `city`, and `country`, ORs those dimensions, and returns a newest-first page of at most 100 rows. |
| Context | `REQ-PROFILE-005` asks for server-side, paginated, filtered search of public active Profiles. `SEC-PROFILE-007` and `SEC-AUTHZ-006` are the fixed 100-row window. `BR-AUTHZ-023` requires the filter to run in the query. The issue forbids a schema change and says to wire the existing Discover box. That box matches one string against display name, artist name, handle, genres, city, and country (`profileMatchesQuery`). Profiles have no visibility or lifecycle columns. `SEC-AUTHZ-008` (anonymous discovery) is a separate gap. Handbook §10.5 requires a bounded page. EDR-005 remains reserved on the unmerged MVP-004 branch. |
| Options considered | (1) Keep the 100-row fetch and filter in the client. That fails the acceptance criterion. (2) AND the five parameters. The existing one-field box would then miss a profile unless every dimension contained the same text. (3) Add a new `q` parameter. The issue names the five parameters, not a sixth. (4) Invent profile visibility and an index. The issue forbids a schema change. (5) Chosen: each supplied parameter adds its dimension to a disjunction, `name` matches `display_name` or `artist_name` only, and `limit`/`offset` stay inside 1–100 and 0–10000. |
| Chosen approach | `parseProfileListQuery` rejects repeated values, non-integers, and filters longer than 200 characters. `buildProfileSearchWhere` escapes `\`, `%`, and `_`, and the repository is the only caller that turns that clause into SQL. The response stays `{ profiles }` so the existing smoke assertion on keys still holds. Discover sends the typed string on all five parameters and still hides the signed-in profile locally. Unfiltered Discover remains the newest 100. Ordering is `created_at DESC, id DESC`. |
| Why | A profile older than the newest 100 is reachable by search, the page cannot grow past 100, and the current search box keeps the same match rule. Legal name stays out of the match, which is the current client behavior and avoids widening `SEC-PROFILE-001`. |
| Trade-offs | A caller cannot require city and genre together (`ENG-IMP-031`). There is no relevance ranking. Public/active scoping waits on columns this issue does not add. `ILIKE '%term%'` is not indexed (`ENG-IMP-030`). Offset pagination can skip or repeat rows if a profile is inserted between pages. |
| Affected components | `backend/src/profiles/search.js`, `backend/src/profiles/repository.js`, `backend/src/profiles/service.js`, `backend/src/profiles/routes.js`, `frontend/src/App.tsx`, `backend/test/profile-search-query.test.js`, `backend/test/profile-search.http.test.js`, `frontend/src/App.discover.test.tsx` |
| Reversal / migration considerations | No schema change. Restore `LIMIT 100` without a WHERE clause and the client `profileMatchesQuery` filter. |
| Related specification IDs | `REQ-PROFILE-005`, `REQ-AUTHZ-005`, `BR-AUTHZ-023`, `SEC-PROFILE-007`, `SEC-AUTHZ-006` |
| Related PR / commit | Branch `cursor/mvp-013-profile-search-255b` |
| Status | ACTIVE |

### EDR-009 Seller invitation without a project-state transition

| Field | Value |
|---|---|
| ID | EDR-009 |
| Date | 2026-09-29 |
| Issue | MVP-014 / GitHub issue #16 |
| Decision | Seller consent is an invitation row plus an active seller participant. Accept, decline, withdraw, and expiry do not change `projects.state`. |
| Context | Projects §§6–8 require an expiring invitation, an atomic acceptance, and no seller capability before acceptance. Section 11.3's only acceptance edge is Seller Invited → Accepted. The current `project_state` enum has neither Seller Invited nor the other invitation states, and Draft → Accepted is an unlisted edge. MVP-015 owns that matrix. `ENG-IMP-015` records that `project_term_versions` is not defined. Projects §36 leaves the expiry duration policy open. `BR-PROJECTS-029` forbids fabricating consent from existing `seller_user_id` values. |
| Options considered | (1) Add the target project states and move Draft to Seller Invited on invite. That implements MVP-015's matrix inside this item and invents transitions the enum cannot name without a new state machine. (2) Set `projects.state` to the existing `accepted` value on seller acceptance. Section 11.3 does not list that edge from `draft`. (3) Choose a fixed expiry duration. Section 36 leaves that policy open. (4) Chosen: store the invitation lifecycle on `project_invitations`, require the caller to send `expires_at`, bind acceptance to a hash of the current commercial fields, and leave `projects.state` unchanged. |
| Chosen approach | Migration 010 adds the invitation, participant, and append-only audit tables, `projects.version`, and a nullable `seller_user_id`. It backfills buyer participants only. Invite, accept, decline, and withdraw take `Idempotency-Key` and `expected_version`. Accept and decline also take `expected_proposal_version`. A due pending invitation becomes `expired` inside the locked command or review, once. `GET /projects` grants seller access only through an active seller participant. |
| Why | The acceptance criterion is the invitation's terminal outcome, and the current enum cannot represent the specified project states. The hash is the version binding this item can store without inventing the undefined term-version table. Leaving existing `seller_user_id` values in place avoids fabricated consent. |
| Trade-offs | Projects remain `draft` after acceptance until MVP-015. `POST /projects` still writes the named `seller_user_id` before acceptance (`ENG-IMP-032`). There is no maximum expiry (`ENG-IMP-033`). Review applies the specified read-time expiry, so that GET can commit an expiry. Outbox rows are written and not dispatched (`ENG-IMP-023`). |
| Affected components | `backend/db/010_project_participants_invitations.sql`, `backend/src/projects/invitation-service.js`, `backend/src/projects/invitation-repository.js`, `backend/src/projects/invitation-rules.js`, `backend/src/projects/routes.js`, `backend/src/projects/service.js`, `backend/src/authorization/authorize.js`, `backend/test/invitations.http.test.js`, `backend/test/invitation-constraints.test.js` |
| Reversal / migration considerations | A later migration can ignore the new tables. Dropping them is destructive and is not part of this change. Nullable `seller_user_id` stays nullable. No existing project row's seller is rewritten. |
| Related specification IDs | `REQ-PROJECTS-002`, `REQ-PROJECTS-003`, `REQ-AUTHZ-011`, `BR-PROJECTS-006`, `BR-PROJECTS-007`, `BR-PROJECTS-009`, `BR-PROJECTS-010`, `BR-PROJECTS-011`, `BR-PROJECTS-026`, `BR-PROJECTS-029`, `BR-PROJECTS-030`, `BR-AUTHZ-032`, `BR-ROLE-014`, `DATA-PROJECTS-002`, `DATA-PROJECTS-003`, `SEC-PROJECTS-001`, `SEC-PROJECTS-016`, `SEC-AUTHZ-007`, `INT-PROJECTS-004`, `INT-PROJECTS-005`, `INT-PROJECTS-006`, `AUD-PROJECTS-002` |
| Related PR / commit | Branch `cursor/mvp-014-project-invitations-255b` |
| Status | ACTIVE for the invitation, participant, and proposal-hash model. The consequence that accept, decline, withdraw, and expiry leave `projects.state` unchanged is superseded by [EDR-014](#edr-014-one-project-term-version-sequence). |

### EDR-010 In-app intent without a preference store

| Field | Value |
|---|---|
| ID | EDR-010 |
| Date | 2026-09-29 |
| Issue | MVP-041 / GitHub issue #43 |
| Decision | Store notification intents and in-app deliveries now. Create the durable in-app row for every mandatory topic, and for a configurable topic only when the matrix default includes in-app. Do not read or honor a caller-supplied preference. Do not add an HTTP ingestion route. |
| Context | Sections 6 and 10 require one intent per recipient, topic, and source event, and an in-app delivery whose `read_at` is recipient-private. `BR-NOTIFICATIONS-001` requires a `MANDATORY` or `CONFIGURABLE` snapshot, and a mandatory topic's in-app record cannot be removed by preference. Section 15.1 says a failed preference read uses the matrix default and must not become "always deliver everything." User Settings has no preference table, and MVP-042 owns that read. Section 11 limits creation to a trusted producer. `SEC-NOTIFICATIONS-002` requires a signed channel, and the specification does not define the signature. The list page size is not specified; Handbook §10.5 requires a bound. |
| Options considered | (1) Honor a preference argument inside this item. That implements MVP-042 before a settings store exists and lets a producer suppress a mandatory notice. (2) Always create an in-app row for every topic. That delivers marketplace and marketing notices whose matrix default is Off. (3) Invent a signed HTTP ingestion scheme. The signature algorithm is unspecified. (4) Choose a class for "Security-critical account event", "Authentication informational alert", and the split rating topic. Those cells do not say whether the durable in-app record remains (`ENG-IMP-036`). (5) Chosen: classify only the rows whose disable cell already says that, ignore any preference argument, follow the matrix default for the rest, and keep ingestion in-process. |
| Chosen approach | Migration 011 adds the two delivery tables and an append-only audit table. Migration 012 removes `Security-critical account event` from the topic allowlist after review, because that row's disable cell is "Not all channels simultaneously". `submitVerifiedEvent` dedupes on a hash of recipient, topic, and source event. The local in-app adapter returns the delivery external id and the row moves `PENDING` to `SENT` in the same transaction. `GET /notifications` is paged at 1–100 rows, matching the existing profile list bound. Read does not set `read_at`. Mark-read sets it once. |
| Why | The acceptance criterion is the mandatory in-app record. The matrix default is the specified behavior when preferences cannot be read. A public create route would be an unsigned producer. The page bound copies an existing list limit rather than inventing a notification-specific one. |
| Trade-offs | Configurable topics whose default is in-app are delivered even if a future user setting would disable them, until MVP-042. Three unclassified topics cannot be submitted. In-app stops at `SENT`, so no terminal-delivery audit row is written for that transition. No notification body is rendered. `SEC-NOTIFICATIONS-002` remains open. A direct insert can still pair a topic with the wrong class (`ENG-IMP-038`). |
| Affected components | `backend/db/011_notification_intents_deliveries.sql`, `backend/src/notifications/`, `backend/src/authorization/authorize.js`, `backend/Index.js`, `backend/test/notification-rules.test.js`, `backend/test/notifications.http.test.js`, `backend/test/notification-constraints.test.js` |
| Reversal / migration considerations | A later migration can ignore the new tables. Dropping them is destructive and is not part of this change. No existing domain table is altered. |
| Related specification IDs | `REQ-NOTIFICATIONS-002`, `REQ-NOTIFICATIONS-003`, `REQ-NOTIFICATIONS-006`, `BR-NOTIFICATIONS-001`, `BR-NOTIFICATIONS-002`, `BR-NOTIFICATIONS-003`, `DATA-NOTIFICATIONS-001`, `DATA-NOTIFICATIONS-002`, `SEC-NOTIFICATIONS-001`, `SEC-NOTIFICATIONS-005`, `INT-NOTIFICATIONS-001`, `INT-NOTIFICATIONS-003`, `INT-NOTIFICATIONS-004`, `AUD-NOTIFICATIONS-001`, `AUD-NOTIFICATIONS-002` |
| Related PR / commit | Branch `cursor/mvp-041-notification-intent-255b` |
| Status | ACTIVE |

### EDR-011 Preference evaluation without a settings table

| Field | Value |
|---|---|
| ID | EDR-011 |
| Date | 2026-09-29 |
| Issue | MVP-042 / GitHub issue #44 |
| Decision | Evaluate channel preference in process. The production settings reader reports the read unavailable and does not query a table. A failed or unusable read uses the matrix default. A successful document can suppress a configurable in-app delivery. A mandatory in-app delivery is always sent. Email, push, and SMS decisions are not stored. |
| Context | `REQ-NOTIFICATIONS-004` and User Settings §11.2 require mandatory policy, then a permitted topic override, then global channel toggles, then the matrix default. A more restrictive user value wins except where mandatory policy applies. Section 15.1 says a failed preference read uses the matrix default and must not become "always deliver everything." Notifications §11 says this domain enforces the preference and does not store it. MVP-042 specifies no schema change. No `user_settings` table exists. Quiet-hours is a nullable local-time range with no format, and digest has no send schedule (Notifications EQ4 asks whether digest is in scope). The three ENG-IMP-036 topics are the only rows that would use the security-alert projection, and they stay unclassified. Section 9 enters `SUPPRESSED` from `PENDING` when preference or eligibility blocks an attempt. Figure 2 still says a mandatory in-app record is never suppressed. |
| Options considered | (1) Create a settings table in this item. The plan forbids a schema change, and User Settings owns that store. (2) Honor a preference field on the verified event. That lets a producer suppress a notice (`SEC-NOTIFICATIONS-004`). (3) Leave every configurable topic on the matrix default and skip the evaluator. That misses both acceptance criteria once a document can be read. (4) Invent a quiet-hours range and a digest clock. Those values are unspecified. (5) Chosen: a pure evaluator, a reader that returns unavailable until User Settings exists, and a test-only replacement for that reader. |
| Chosen approach | `evaluatePreferences` returns `deliver`, `suppress`, or `skip` per channel. Mandatory in-app is `deliver` before any boolean is read. A topic-override boolean and a global channel boolean are the user values; if either is false, that false wins. An explicit topic `true` can enable a matrix-off channel. A global `true` cannot. A matrix-off channel with no enabling override is `skip` (no row), which keeps the MVP-041 marketplace result. A disable of a channel the matrix would deliver inserts `PENDING` and updates it to `SUPPRESSED` without calling the adapter. In-app for an existing recipient is treated as eligible. Email is eligible only when the evaluation context says the address is verified; this item never inserts an email row. `digest` and `quiet_hours` are not read. List, read, and mark-read hide `SUPPRESSED`. One `AUD-NOTIFICATIONS-001` row still records the intent and, when a delivery row exists, its id. The audit table has no status column, so the delivery row is the terminal-state evidence. |
| Why | The acceptance criteria are a per-channel disable and a mandatory in-app record that preference cannot remove. The unavailable reader is the failure behavior Section 15.1 already requires. Keeping the producer payload ignored preserves `SEC-NOTIFICATIONS-004`. |
| Trade-offs | A live user still cannot turn a channel off (`ENG-IMP-039`). Quiet hours do not defer anything (`ENG-IMP-040`). The security-alert projection is unused. Email suppression is visible to unit tests and creates no delivery row until MVP-043. |
| Affected components | `backend/src/notifications/preferences.js`, `backend/src/notifications/settings-reader.js`, `backend/src/notifications/service.js`, `backend/src/notifications/repository.js`, `backend/src/notifications/topics.js`, `backend/test/preference-evaluation.test.js`, `backend/test/notifications.http.test.js` |
| Reversal / migration considerations | No schema change. Removing the evaluator restores matrix-default fan-out. The test reader is not an HTTP route. |
| Related specification IDs | `REQ-NOTIFICATIONS-004`, `BR-NOTIFICATIONS-001`, `SEC-NOTIFICATIONS-004`, `INT-NOTIFICATIONS-002`, `AUD-NOTIFICATIONS-001` |
| Related PR / commit | [#73](https://github.com/xela-ash/music_app/pull/73), merge `7bc8b7d` |
| Status | ACTIVE |

### EDR-013 Conversation messages and tombstone

| Field | Value |
|---|---|
| ID | EDR-013 |
| Date | 2026-09-29 |
| Issue | MVP-038 / GitHub issue #40 |
| Decision | Store one lazy conversation per project and an append-only user-message stream; tombstone by nulling ordinary `body` display while the stored body, SHA-256 hash, sequence, and conversation binding remain. |
| Context | Messaging §§6–8, §10, §11, §17, and §19 require the stream, the relationship check before any message id is resolved, sender identity from the actor, idempotent send and tombstone, and `AUD-MESSAGING-001` in the same transaction. Product set the body maximum at 500 characters in messaging.md 0.2.0. The field matrix does not name the hash column, and it does not state a page size, a minimum length, or a character class. Attachments, system-message production, and case-actor reads are later items. |
| Options considered | Return the original body with a tombstone flag: ordinary display would still contain the text, which fails `REQ-MESSAGING-005`. Hard-delete the row: fails `BR-MESSAGING-004` and `SEC-MESSAGING-006`. Store the hash only in the audit row: the message row itself would not keep the hash the acceptance criterion requires. Use the internal project UUID in the path: §11.2 names the opaque external identifier. |
| Chosen approach | Migration `013` adds `conversations`, `messages`, and `messaging_audit_events`. `content_hash` is the SHA-256 of the UTF-8 body, checked by a trigger against `digest`. Ordinary responses set `body` to null after tombstone and omit `content_hash`. A send replay re-reads the row and applies that redaction, because the completed idempotency payload was stored before the tombstone. Routes are `POST` and `GET /projects/:projectExternalId/messages` and `POST .../tombstone`. Send and tombstone use the shared idempotency store. The message uniqueness scope is `(conversation_id, sender_user_id, idempotency_key)` for user messages, matching §17's binding to sender and conversation. Sequence assignment holds the project row, then the conversation row. Page bounds copy the existing 1–100 limit and 0–10000 offset. Length uses Unicode code points so it matches PostgreSQL `char_length`. Empty text is stored. No attachment, system-create, or delete route exists. Outbox payloads carry identifiers and sequence only. Conversation creation and the first message share one transaction, and the conversation-created audit row references that message. |
| Why | The acceptance criterion is redacted ordinary display with a surviving row, hash, and bindings. The 500-character check is the recorded product maximum. Concealing `404` before loading a message is `REQ-MESSAGING-006`. Leaving the body in the row is what lets a later case-actor read (MVP-040) see the original without this item inventing that read path. |
| Trade-offs | A participant cannot read a message after their participant row ends. Organization Project Manager access is absent. The hash is not in the API response. A coincidental idempotency key can be reused by the other participant because uniqueness is scoped, not global. The completed idempotency row still stores the pre-tombstone response (`ENG-IMP-042`). Rate limiting stays open (`SEC-MESSAGING-009`). |
| Affected components | `backend/db/013_conversations_messages.sql`, `backend/src/messaging/`, `backend/src/authorization/authorize.js`, `backend/Index.js`, `backend/test/messages.http.test.js`, `backend/test/message-constraints.test.js`, `backend/test/messaging-rules.test.js` |
| Reversal / migration considerations | Dropping the tables destroys message evidence. A later migration must not weaken the delete and body-update triggers. Changing the 500-character maximum is a product change to messaging.md. |
| Related specification IDs | `REQ-MESSAGING-002`, `REQ-MESSAGING-003`, `REQ-MESSAGING-005`, `REQ-MESSAGING-006`, `REQ-MESSAGING-010`, `BR-MESSAGING-001`, `BR-MESSAGING-004`, `BR-AUTHZ-014`, `BR-AUTHZ-015`, `SEC-MESSAGING-001`, `SEC-MESSAGING-002`, `SEC-MESSAGING-003`, `SEC-MESSAGING-006`, `SEC-MESSAGING-010`, `INT-MESSAGING-001`, `INT-MESSAGING-005`, `AUD-MESSAGING-001`, `DATA-MESSAGING-001`, `DATA-MESSAGING-002` |
| Related PR / commit | [#79](https://github.com/xela-ash/music_app/pull/79), merge `2c9bf06` |
| Status | ACTIVE |

### EDR-014 One project term-version sequence

| Field | Value |
|---|---|
| ID | EDR-014 |
| Date | 2026-09-30 |
| Issue | MVP-015 / GitHub issue #17 |
| Decision | Store proposal and agreed commercial snapshots in one append-only `project_term_versions` sequence per project, and perform every listed project-state edge through one `commitTransition` function. |
| Context | [ADR-001](../99-appendices/adr/ADR-001-project-term-versions.md) and `projects.md` 1.1.0 define `DATA-PROJECTS-018` and `BR-PROJECTS-081`. Projects §11.3 lists the legal edges. EDR-009 left `projects.state` unchanged because the enum could not name Seller Invited. Acceptance must not rewrite the proposal row. Milestone line items stay on Milestones. No payment, storage, or email provider is selected. `ProjectStateChanged` has no dispatcher (`ENG-IMP-023`). |
| Options considered | (1) Two version tables. ADR-001 rejects a second stream. (2) Update the proposal row to `agreed`. That destroys the immutable proposal. (3) A public route that accepts a client-supplied target state. An unlisted edge would depend on the client naming it. (4) A second column for the archived prior state. Disputed, Suspended, and Archived are mutually exclusive, so `resume_state` is free while the project is archived. (5) Chosen: one table, a copied agreed version, one transition function, and `resume_state` for dispute, suspension, and archive. |
| Chosen approach | Migration `014` adds the enum labels, the pointer and timestamp columns, `project_term_versions`, and `project_state_transitions`. It drops nothing. A before-insert trigger writes the content hash and rejects a version number that is not the next integer for that project. Update and delete triggers reject both new tables. `commitTransition` is the only writer of `projects.state`. HTTP routes are propose, seek-seller, cancel, start, archive, and restore. Each takes `expected_version` and `Idempotency-Key`. Escrow, delivery, dispute, rating, and suspension call `applySystemTransition` with a server-supplied `event_id`. Invitation invite, accept, decline, withdraw, and expiry call the same function and roll back if it does not succeed. Acceptance inserts the next version by copying the proposal version and sets `represented_state` to `agreed`. Genre and skill arrays are empty because those catalogs do not exist. The live `price_amount` column stays `INTEGER`; the snapshot total is `BIGINT`. |
| Why | One function is the §11.3 rule that an unlisted edge has no side effects. Copying the proposal row keeps that row immutable and keeps both snapshots in one sequence. Database triggers keep a historical version unchanged if the live project later changes. Per-project uniqueness keeps one project's history off another project's sequence. |
| Trade-offs | `resume_state` means both the dispute/suspension resume target and the archived project's prior terminal state. Notification copy is not rendered. The live money column is still 32-bit. Empty genre and skill arrays are not a catalog. Legacy `buyer_rated` and `seller_rated` remain in the enum and are not legal transition targets. |
| Affected components | `backend/db/014_project_term_versions.sql`, `backend/src/projects/transition-rules.js`, `backend/src/projects/transition-service.js`, `backend/src/projects/transition-repository.js`, `backend/src/projects/invitation-service.js`, `backend/src/projects/routes.js`, `backend/src/authorization/authorize.js`, `backend/test/transition-rules.test.js`, `backend/test/transitions.http.test.js` |
| Reversal / migration considerations | Dropping `project_term_versions` or `project_state_transitions` would destroy contractual evidence and is not part of this change. New enum labels stay. A later migration must not weaken the update and delete triggers. |
| Related specification IDs | `REQ-PROJECTS-002`, `REQ-PROJECTS-004`, `BR-PROJECTS-012`, `BR-PROJECTS-013`, `BR-PROJECTS-015`, `BR-PROJECTS-081`, `DATA-PROJECTS-005`, `DATA-PROJECTS-018`, `SEC-PROJECTS-013`, `SEC-PROJECTS-014`, `AUD-PROJECTS-001`, `AUD-PROJECTS-003` |
| Related PR / commit | Branch `cursor/mvp-015-project-term-versions-255b` |
| Status | ACTIVE |

### EDR-015 Project amendments on the agreed sequence

| Field | Value |
|---|---|
| ID | EDR-015 |
| Date | 2026-09-30 |
| Issue | MVP-016 / GitHub issue #18 |
| Decision | Store post-acceptance project-level changes as one `project_amendments` row per project, and apply an acceptance as the next `agreed` row in that project's existing `project_term_versions` sequence. |
| Context | Projects §15, `DATA-PROJECTS-004`, `REQ-PROJECTS-009`, `BR-PROJECTS-017`, and `BR-PROJECTS-051`. ADR-001 already requires one sequence and keeps milestone facts off the project snapshot. MVP-017 is stopped, so milestone snapshots and `INT-PROJECTS-023` do not exist. Escrow does not yet validate a funded total or currency change. Non-overlapping amendment scopes are deferred in §15. The specification names no amendment expiry maximum. |
| Options considered | (1) A second agreed-version table. ADR-001 forbids a second stream. (2) Mutate the current agreed row. That breaks immutability. (3) Accept milestone, total, and currency patches by updating live rows. That mutates historical milestone rows and invents escrow revalidation. (4) Invent an expiry duration. The invitation item already recorded that as out of scope. (5) Chosen: one pending amendment for the whole project snapshot; an allowlist of project-level non-financial fields; acceptance copies the agreed row, applies the patch, and inserts the next version. |
| Chosen approach | Migration `015` adds `project_amendments` and `projects_protect_agreed_terms`. It drops nothing. Propose, accept, reject, and withdraw take `Idempotency-Key`. Expiry is the database clock inside the next of those commands. The caller supplies `expires_at` and it must be in the future. There is no maximum and no user expire route. `superseded` is a legal terminal status and no command writes it. Acceptance is the only command that bumps `projects.version` or writes a term version. The content hash is `project_term_version_content_hash`, and acceptance rolls back if the inserted hash differs from the hash stored at propose time. `projects_protect_agreed_terms` lets `agreed_term_version` move only forward onto an existing `agreed` row that matches the live commercial columns. `AUD-PROJECTS-004` records the action, outcome, and a hash of the old and new snapshot hashes plus the affected field codes. Acceptance enqueues `ProjectTermsChanged`. |
| Why | The agreed terms stay one immutable sequence. Rejecting money and milestone patches preserves `BR-PROJECTS-051` without inventing milestone snapshots. The live-column trigger stops a direct title or price rewrite after agreement unless the new agreed version matches. One pending row is the MVP overlapping-scope rule while non-overlapping concurrency remains unspecified. |
| Trade-offs | A project cannot carry two pending amendments. `start_at` and `due_at` change the snapshot only. `delivery_days` does not change. Notification copy is not rendered. An amendment expiry can be arbitrarily far ahead (`ENG-IMP-046`). `INT-PROJECTS-023` is not called. |
| Affected components | `backend/db/015_project_amendments.sql`, `backend/src/projects/amendment-rules.js`, `backend/src/projects/amendment-service.js`, `backend/src/projects/amendment-repository.js`, `backend/src/projects/routes.js`, `backend/test/amendment-rules.test.js`, `backend/test/amendments.http.test.js`, `backend/test/amendment-constraints.test.js` |
| Reversal / migration considerations | Dropping `project_amendments` or the agreed-term trigger would remove the bilateral history and the live-column guard. A later migration must not weaken the update and delete triggers. Allowing a total or milestone patch requires the stopped milestone snapshot model and an escrow validation the current specifications do not implement. |
| Related specification IDs | `REQ-PROJECTS-009`, `BR-PROJECTS-017`, `BR-PROJECTS-051`, `DATA-PROJECTS-004`, `DATA-PROJECTS-018`, `SEC-PROJECTS-004`, `INT-PROJECTS-008`, `INT-PROJECTS-023`, `AUD-PROJECTS-004`, `EVT-PROJECTS-004` |
| Related PR / commit | Branch `cursor/mvp-016-project-amendments-255b` |
| Status | ACTIVE |

### EDR-016 Milestone term snapshots

| Field | Value |
|---|---|
| ID | EDR-016 |
| Date | 2026-10-01 |
| Issue | MVP-017 / GitHub issue #19 |
| Decision | Store each milestone's commercial terms on the live row and copy them into append-only `milestone_term_versions` rows when the project proposal is frozen and when the seller accepts. |
| Context | Milestones §9.3, §10.1, and `DATA-PROJECTS-009`, as decided on 2026-10-01. Amounts are integer minor units with the project currency and exponent. Deliverables are catalogue codes. `revision_allowance` is an explicit nonnegative integer. `projects.revision_limit` is not a milestone default. Asset upload ceilings stay undecided. `submission_requirements` stays a separate, uncollected declaration. Milestone amendments stay rejected by MVP-016. |
| Options considered | (1) Free-text deliverable definitions. The decision forbids that as the primary definition. (2) Default `revision_allowance` to `0` or to `projects.revision_limit`. The decision forbids a silent default. (3) Store money as a decimal or floating-point value. The decision and `BR-PROJECTS-034` forbid it. (4) Widen `projects.price_amount` in the same migration. The sum must still equal that INTEGER column, and widening it is a separate financial change. (5) Build the seller's asset-to-deliverable binding now. Asset upload is not implemented and its ceilings are undecided. (6) Chosen: BIGINT milestone amounts, server-stamped exponent, required explicit allowance and catalogue selection, proposal and agreed snapshots in the project transition transaction, and the existing lock trigger extended rather than replaced. |
| Chosen approach | Migration `016` widens `amount` to `BIGINT`, adds `currency_exponent`, `deliverable_definition`, `revision_allowance`, `terms_status`, and `current_term_version`, and creates append-only `milestone_term_versions`. A historical row whose currency does not match its project fails the migration instead of receiving an invented exponent. Locked plans backfill to `frozen`, never `agreed`. `revision_allowance` is not backfilled. `commitTransition` writes the proposal snapshots on Draft → Proposed and the agreed snapshots, copied from the proposal rows, on Seller Invited → Accepted. The create form uses a dropdown with no preselected allowance and a checkbox catalogue. `vocal_stems` is one code. Display and parsing use the explicit exponent with integer arithmetic. `125050` with exponent `2` formats as `1,250.50`. |
| Why | The proposal the seller accepts and the agreed snapshot must be the same commercial terms, and neither row may be edited later. Putting the capture in the existing project transition keeps one transaction for the project snapshot and the milestone snapshots. |
| Trade-offs | The live milestone amount is BIGINT, but create still rejects a line above `2147483647` because the project total is INTEGER (`ENG-IMP-050`). The lock trigger does not take `FOR UPDATE` on the project row (`ENG-IMP-051`). `external_id` is still outside the protected column list (`SEC-PROJECTS-022`). Other Agreed Deliverable text has no product maximum. `submission_requirements` is absent. No `amendment` snapshot is written. Escrow cascade behavior is unchanged. Migration 017 drops `project_milestones_frozen_terms_complete` where the first version of 016 created it. Agreed rows must have an allowance and a catalogue selection. A frozen historical row may lack both, because the backfill does not invent them. A later draft-to-frozen update is rejected when either is null. Seller acceptance of a proposal that has no milestone snapshots captures them from complete live rows, or returns 409 and writes no agreed version. |
| Affected components | `backend/db/016_milestone_term_versions.sql`, `backend/db/017_milestone_terms_repair.sql`, `backend/src/milestones/`, `backend/src/money/amount.js`, `backend/src/projects/transition-service.js`, `backend/src/projects/transition-repository.js`, `backend/src/projects/invitation-rules.js`, `frontend/src/App.tsx`, `frontend/src/money.ts`, `frontend/src/deliverableCatalogue.ts` |
| Reversal / migration considerations | Dropping `milestone_term_versions` or weakening its append-only triggers would destroy contractual evidence. Narrowing `amount` back to INTEGER would be lossy only for values above the 32-bit range, which this application does not write. A later migration must not copy `revision_limit` into `revision_allowance`. |
| Related specification IDs | `REQ-PROJECTS-025`, `REQ-PROJECTS-026`, `REQ-PROJECTS-037`, `REQ-PROJECTS-060`, `BR-PROJECTS-002`, `BR-PROJECTS-034`, `BR-PROJECTS-035`, `BR-PROJECTS-036`, `BR-PROJECTS-054`, `DATA-PROJECTS-008`, `DATA-PROJECTS-009`, `AUD-PROJECTS-008` |
| Related PR / commit | Branch `cursor/mvp-017-milestone-term-versions-255b` |
| Status | ACTIVE |

### EDR-017 Milestone transition service

| Field | Value |
|---|---|
| ID | EDR-017 |
| Date | 2026-10-01 |
| Issue | MVP-018 / GitHub issue #20 |
| Decision | Milestone state changes only through `applyMilestoneTransition`, guarded by `protect_milestone_state`. M06 and M07 evidence tables are created here. Public routes, M18, and a revision reason-code list are not. |
| Context | Milestones §11–§14, §17, §21, and §24. `REQ-PROJECTS-027`, `BR-PROJECTS-037`, `BR-PROJECTS-047`, `BR-PROJECTS-052`, `DATA-PROJECTS-010`, `SEC-PROJECTS-021`, and `SEC-PROJECTS-028`. The plan's work column names the transition table and service. M06 and M07 cannot succeed without `DATA-PROJECTS-012` and `DATA-PROJECTS-013`. MVP-022 owns the HTTP routes. MVP-023 owns M18. §17.1 leaves the revision reason-code list as a product decision and names no detail maximum. Q13 leaves the physical audit-table layout open, and `project_audit_events` already exists. |
| Options considered | (1) Public start, revision, and approval routes in this item. The plan assigns those routes to MVP-022. (2) A separate `milestone_audit_events` table. Q13 does not choose a layout, and the existing project audit table already stores the required evidence. (3) An invented reason-code allowlist or a character maximum. §17.1 says the code list is a product decision. (4) Copy `projects.revision_limit` or default the allowance to 0. MVP-017 forbids both. (5) Quarantine every system `409`, including a stale version. §24 says a stale request has no side effect, and a fact that fails identity, currency, term version, or amount matching is what gets quarantined. (6) Store the delivery event id as the only submission identity. M06 and M07 compare a submission reference, which the spec allows to differ from the event id. (7) Chosen: one service, a session flag plus a database edge guard, evidence tables for the edges that write them, inbox after the project and milestone locks, and submission reference stored on the M05 transition. |
| Chosen approach | Migration `018` adds `suspended` in its own transaction, then version, lifecycle timestamps, interruption columns, the one-active index, and the three append-only tables. `protect_milestone_state` rejects an insert that is not `planned` and an update that changes `state` unless `musicapp.milestone_transition` is `on` and the pair is a Section 12.1 edge or the Section 14.1 post-start reversal. The service locks the project, then that project's milestones in ascending `milestone_no`, then claims the inbox or idempotency row. M05 stores the event id in `source_fact_id` and the submission reference in `submission_ref`. A later fact for that same submission is acknowledged and does not write a second transition. The inbox still deduplicates `event_id`. A mismatch fact is committed as `quarantined`. Any other rejection, including a stale version, rolls back. User-command `409` rolls back so the idempotency key can be retried. M03 after `started_at` enters `suspended` with `ADMIN_RISK`. M12 accepts only `ADMIN_RISK`, `MODERATION`, or `CANCELLATION_PENDING`, and only from the system actor, because administrator bootstrap is a later item. Audit rows use `project_audit_events`. Outbox rows are `EVT-PROJECTS-009`, `EVT-PROJECTS-010` on M07, and `EVT-PROJECTS-013` on interruption changes. They are not dispatched. Revision detail is stored on the request row and is not copied into the audit or outbox payload. |
| Why | The acceptance criterion is that every M01–M17 edge succeeds under its stated precondition and every unlisted edge is rejected. The database guard is what makes a direct state write fail even if a later route forgets the service. Keeping routes and M18 out of this item leaves those work items their specified scope. |
| Trade-offs | Callers reach the service directly. There is no HTTP surface yet. A second delivery event that reuses a submission reference hits the unique source-fact index. Revision text has no product maximum (`ENG-IMP-054`). `project_milestones` still uses `ON DELETE CASCADE`. The one-active race that loses on the partial unique index returns `409` after rollback. Notification intents are not created. |
| Affected components | `backend/db/018_milestone_state_machine.sql`, `backend/src/milestones/transition-service.js`, `backend/src/milestones/transition-repository.js`, `backend/src/milestones/transition-rules.js`, `backend/src/projects/service.js`, `backend/test/milestone-transitions.test.js` |
| Reversal / migration considerations | Dropping the state trigger or the append-only transition history would let a writer set `released` without the funding, delivery, and approval facts. A later migration must not add M18 to `milestone_approvals`. It must not copy `revision_limit` into `revision_allowance`. |
| Related specification IDs | `REQ-PROJECTS-027`, `BR-PROJECTS-037`, `BR-PROJECTS-047`, `BR-PROJECTS-052`, `DATA-PROJECTS-010`, `DATA-PROJECTS-012`, `DATA-PROJECTS-013`, `SEC-PROJECTS-021`, `SEC-PROJECTS-028`, `AUD-PROJECTS-007`, `AUD-PROJECTS-009`, `AUD-PROJECTS-010`, `AUD-PROJECTS-011`, `AUD-PROJECTS-012`, `EVT-PROJECTS-009`, `EVT-PROJECTS-010`, `EVT-PROJECTS-013` |
| Related PR / commit | Branch `cursor/mvp-018-milestone-state-machine-255b` |
| Status | ACTIVE |

### EDR-018 Activation predicate on milestone start

| Field | Value |
|---|---|
| ID | EDR-018 |
| Date | 2026-10-01 |
| Issue | MVP-019 / GitHub issue #21 |
| Decision | Keep sequential activation inside the existing `milestone.start` edge. Do not add a second start service or a public route. Deny that command unless the live seller's `users.status` is `active`. |
| Context | Milestones §13.2, §15, and §24. `REQ-PROJECTS-028`, `BR-PROJECTS-033`, `BR-PROJECTS-039`, `BR-PROJECTS-040`, `INT-PROJECTS-020`, and `AUD-PROJECTS-010`. Question Q4 is unresolved, so a predecessor is resolved only in `buyer_approved`, `released`, `refunded`, or `cancelled`. MVP-018 already evaluates that predicate and the one-active index on M04. MVP-022 owns the public start route. Section 15 says the first start gives Projects the fact for Funded to In Progress, and that Projects owns that transition. |
| Options considered | (1) A new activation module and HTTP route. The plan's work column is the predicate on the start command, and MVP-022 owns the route. (2) Treat `delivered` as resolved so the seller can pipeline the next milestone. Q4 says the stricter rule applies until that decision. (3) Copy a platform default revision or skip the account-status read. Section 15 requires the live account status on this command, and the enum's non-active values are `suspended` and `deleted`. (4) Chosen: leave the predicate in M04, read `users.status` in that command's transaction, and record the predecessor set in the work-start audit hash. |
| Chosen approach | `predecessorStates` returns the lower-numbered milestones in number order. M04 rejects a predecessor outside `buyer_approved`, `released`, `refunded`, and `cancelled`, and rejects any other `in_progress` or `delivered` milestone. The seller match now also requires `users.status = active`. The successful M04 audit hash adds `predecessor_set` and `term_version`. No migration. `projects.state` is not changed. |
| Why | The acceptance criterion is that a milestone cannot start while a predecessor is unresolved or another is active. That check already existed. This item proves every Section 13.2 predecessor state and the one-active rule, and closes the live account-status gap Section 15 names for this command. |
| Trade-offs | There is still no public start route. A suspended or deleted seller who remains an active participant is denied with the same `409` as the wrong actor. `projects.state` stays where the caller left it. The buyer notification for work start is not created. |
| Affected components | `backend/src/milestones/transition-service.js`, `backend/src/milestones/transition-repository.js`, `backend/test/milestone-activation.test.js` |
| Reversal / migration considerations | None. Removing the account-status read would let a suspended seller start work. Treating `delivered` as resolved would decide Question Q4. |
| Related specification IDs | `REQ-PROJECTS-028`, `BR-PROJECTS-033`, `BR-PROJECTS-039`, `BR-PROJECTS-040`, `INT-PROJECTS-020`, `AUD-PROJECTS-010` |
| Related PR / commit | Branch `cursor/mvp-019-milestone-activation-255b` |
| Status | ACTIVE |

### 6.3 EDR index

| ID | Title | Status | Date |
|---|---|---|---|
| [EDR-001](#edr-001-backend-module-layout) | Backend module layout | ACTIVE | 2026-09-26 |
| [EDR-002](#edr-002-cloud-agent-node-toolchain) | Cloud Agent Node toolchain | ACTIVE | 2026-09-26 |
| [EDR-003](#edr-003-test-runners-and-database-fixture) | Test runners and database fixture | ACTIVE | 2026-09-26 |
| [EDR-004](#edr-004-shared-idempotency-outbox-and-inbox-model) | Shared idempotency, outbox, and inbox model | ACTIVE | 2026-09-27 |
| [EDR-006](#edr-006-live-account-status-inside-requireauth) | Live account status inside requireAuth | ACTIVE | 2026-09-28 |
| [EDR-007](#edr-007-authorize-for-the-existing-project-rules) | authorize() for the existing project rules | ACTIVE | 2026-09-28 |
| [EDR-008](#edr-008-server-side-profile-search) | Server-side profile search | ACTIVE | 2026-09-29 |
| [EDR-009](#edr-009-seller-invitation-without-a-project-state-transition) | Seller invitation without a project-state transition | ACTIVE; unchanged-state consequence superseded by EDR-014 | 2026-09-29 |
| [EDR-010](#edr-010-in-app-intent-without-a-preference-store) | In-app intent without a preference store | ACTIVE | 2026-09-29 |
| [EDR-011](#edr-011-preference-evaluation-without-a-settings-table) | Preference evaluation without a settings table | ACTIVE | 2026-09-29 |
| [EDR-013](#edr-013-conversation-messages-and-tombstone) | Conversation messages and tombstone | ACTIVE | 2026-09-29 |
| [EDR-014](#edr-014-one-project-term-version-sequence) | One project term-version sequence | ACTIVE | 2026-09-30 |
| [EDR-015](#edr-015-project-amendments-on-the-agreed-sequence) | Project amendments on the agreed sequence | ACTIVE | 2026-09-30 |
| [EDR-016](#edr-016-milestone-term-snapshots) | Milestone term snapshots | ACTIVE | 2026-10-01 |
| [EDR-017](#edr-017-milestone-transition-service) | Milestone transition service | ACTIVE | 2026-10-01 |
| [EDR-018](#edr-018-activation-predicate-on-milestone-start) | Activation predicate on milestone start | ACTIVE | 2026-10-01 |

No EDRs were created for choices that predate this record. None of the pre-existing choices in Section 5 has a recorded rationale that could fill an EDR's *Why* and *Options considered* fields without invention. Setting up these engineering-control documents is a documentation-structure decision, already recorded where Governance requires it ([Governance §4.1](../00-governance/README.md#41-engineering-control-documents), version 1.3.0). MVP-001's characterization file used Node's built-in test runner only so the acceptance snapshot could run. EDR-003 is the runner decision.

## 7. Change history

This section is append-only. Add one row per meaningful implementation issue, newest last. Never edit or delete a past row. Correct a row by adding a new one.

| Date | MVP / Issue | Summary | Subsystems changed | Migrations | API changes | Frontend changes | Security changes | Tests added/changed | EDRs | ENG-IMP created | PR | Commit(s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2025-12-23 – 2026-07-21 | Pre-plan (no issue) | Baseline built before the implementation plan existed: skeleton, schema 001–006, local development setup and migration runner, authentication foundation (007), profile discovery and detail, draft project creation, role-aware project list, INR projects with fixed milestones, milestone locking (008) | Repository, backend, frontend, database, authentication, profiles, projects, milestones | 001–008 | The 12 routes listed in Section 4.3 | All screens listed in Section 4.4 | bcrypt, JWT, concealing `404` on lock, lock trigger | None | — | — | — | `3e895a6` … `88986c5` (see `git log -- backend frontend`) |
| 2026-09-25 | Engineering-controls setup (no MVP item) | Created the engineering handbook, improvements register, and this build record. Integrated them into `AGENTS.md`. Governance 1.3.0 added `docs/20-engineering/`. No application code changed. | Documentation only | None | None | None | None | None | None | `ENG-IMP-001`–`009` | — (pushed to `docs/specification-foundation`) | The `docs:` commits of 2026-09-25 that introduce `docs/20-engineering/` |
| 2026-09-26 | MVP-001 / GitHub issue #3 | Split `backend/Index.js` into per-domain route, service, and repository modules without changing observable behavior. | Backend application, testing | None | None | None | None | `backend/test/routes.characterization.test.js` | EDR-001 | None | — | `860ff90` and the MVP-001 implementation commit on `mvp-001-backend-module-decomposition` |
| 2026-09-26 | MVP-001 review follow-up / GitHub issue #3 | Recorded the independent review's non-blocking observations. No application behavior changed. | Documentation only | None | None | None | None | None | None | `ENG-IMP-017`–`020` | — | The commit that adds those register entries on `mvp-001-backend-module-decomposition` |
| 2026-09-26 | Cloud environment repair (no MVP item) | Pinned Node.js 22.14.0, corepack 0.34.7, and pnpm 12.5.1 in `.cursor/Dockerfile` so Cloud install can find `npm` and activate pnpm without a prompt. PostgreSQL 16, port 5432, and the isolated test cluster on 5433 are unchanged. | Cloud Agent image only | None | None | None | Passwordless sudo for the image `ubuntu` user, required by the existing PostgreSQL helpers | None | EDR-002 | `ENG-IMP-021` | Branch `cursor/cloud-node-toolchain-ef45` | The Cloud toolchain commit on that branch |
| 2026-09-26 | MVP-002 / GitHub issue #4 | Added the backend smoke harness and the frontend component runner. The harness implements `ENG-IMP-017` and `ENG-IMP-018`. Recorded pull request #56 on EDR-001. | Backend application, frontend application, testing | None | None | None | None | `backend/test/database-guard.test.js`, `backend/test/routes.smoke.test.js`, `frontend/src/App.smoke.test.tsx` | EDR-003 | `ENG-IMP-022` | #57 | Branch `mvp-002-automated-test-harness` |
| 2026-09-27 | MVP-003 / GitHub issue #5 | Added the shared idempotency-key store, transactional outbox with a transport-neutral dispatcher, and inbox deduplication. The migration adds tables only, the helpers run in the caller's transaction, and triggers block deletes and edits to evidence columns. No route or domain command uses them yet. | Backend application, database, testing | 009 | None | None | Database-enforced single effect per idempotency key and per inbound event; immutable, undeletable evidence rows | `backend/test/canonical-json.test.js`, `backend/test/infrastructure.test.js` (every named constraint in migration 009 has a case); `npm test` now runs one file at a time | EDR-004 | `ENG-IMP-023`, `ENG-IMP-024` | #60 | Branch `mvp-003-idempotency-outbox-inbox` |
| 2026-09-28 | MVP-003 review repair / GitHub issue #5 | Constraint cases that set `completed_at` or `processed_at` now also set `created_at` or `received_at` to the same instant. A fixed completion time against `DEFAULT now()` started failing `*_after_created` / `*_after_received` once that instant was in the past, so PostgreSQL reported the wrong constraint. No schema or helper behavior changed. | Testing | None | None | None | None | `backend/test/infrastructure.test.js` | None | None | #60 | The review-repair commit on `mvp-003-idempotency-outbox-inbox` |
| 2026-09-28 | MVP-006 / GitHub issue #8 | Every `requireAuth` route reloads `users.status` and rejects a suspended, deleted, or otherwise non-authenticatable account before the handler runs. Login issuance stays `active`-only. No schema change. | Authentication, testing | None | Protected routes now return `401` for a still-valid JWT whose account cannot authenticate. `/auth/me` no longer applies its own status predicate. | None | `SEC-AUTH-002`, `SEC-AUTHZ-002`, `SEC-PROJECTS-002` | `backend/test/account-status.test.js`, `backend/test/live-status.test.js` | EDR-006 | None | Branch `cursor/mvp-006-live-account-status-32e3` | The MVP-006 commit on that branch |
| 2026-09-28 | MVP-006 review / GitHub issue #8 | Recorded the review's non-blocking HTTP-coverage limit. No application behavior changed. | Documentation only | None | None | None | None | None | None | `ENG-IMP-028` | #62 | The review-record commit on `cursor/mvp-006-live-account-status-32e3` |
| 2026-09-28 | MVP-007 / GitHub issue #9 | Project create, list, and lock decisions go through `authorize()`. HTTP status and error text for those routes stay the same. No schema change, no new permission, and no audit writer. | Authorization, projects, milestones, testing | None | None | None | `SEC-AUTHZ-004` for the five existing project checks. Account-status denial stays in Authentication. | `backend/test/authorize.test.js`, `backend/test/authorization.http.test.js` | EDR-007 | None | Branch `cursor/mvp-007-authorize-decision-32e3` | The MVP-007 commit on that branch |
| 2026-09-28 | MVP-007 review / GitHub issue #9 | `GET /projects` runs the participant `whereSql` returned by `authorize`. The repository rejects any other scope. Seller-eligibility boolean left as `ENG-IMP-029`. | Authorization, projects, testing | None | None | None | None | `backend/test/authorize.test.js` | EDR-007 (updated) | `ENG-IMP-029` | #64 | The review-repair commit on `cursor/mvp-007-authorize-decision-32e3` |
| 2026-09-29 | MVP-013 / GitHub issue #15 | `GET /profiles` searches `name`, `handle`, `genre`, `city`, and `country` in SQL and pages at most 100 rows. Discover sends the existing search box to that query. No schema change. | Profiles, discovery, frontend, testing | None | Search and `limit`/`offset` query parameters on `GET /profiles`. Body remains `{ profiles }`. | Discover refetches on search and no longer filters the fetched page in the client. | `SEC-PROFILE-007`, `SEC-AUTHZ-006`, `BR-AUTHZ-023`. Authenticated route unchanged. Legal name is not a search field. | `backend/test/profile-search-query.test.js`, `backend/test/profile-search.http.test.js`, `frontend/src/App.discover.test.tsx` | EDR-008 | `ENG-IMP-030`, `ENG-IMP-031` | Branch `cursor/mvp-013-profile-search-255b` | The MVP-013 commit on that branch |
| 2026-09-29 | MVP-013 review / GitHub issue #15 | Restored EDR-007's closing rows after EDR-008 was inserted inside that table. No application behavior changed. | Documentation only | None | None | None | None | None | EDR-007, EDR-008 | None | #66 | The review-repair commit on `cursor/mvp-013-profile-search-255b` |
| 2026-09-29 | MVP-014 / GitHub issue #16 | Seller invitations reach Accepted, Declined, Withdrawn, or Expired. Acceptance adds the only active Seller participant. `projects.state` is unchanged. `GET /projects` no longer treats a named seller as a party. | Projects, authorization, database, testing | 010 | Invitation invite, review, accept, decline, and withdraw. `GET /projects` seller scope. Project responses include `version`. | None | `SEC-PROJECTS-001`, `SEC-PROJECTS-016`, `SEC-AUTHZ-007`, `AUD-PROJECTS-002` | `backend/test/invitations.http.test.js`, `backend/test/invitation-constraints.test.js`, `backend/test/invitation-rules.test.js`; smoke and authorize expectations updated | EDR-009 | `ENG-IMP-032`, `ENG-IMP-033` | Branch `cursor/mvp-014-project-invitations-255b` | The MVP-014 commit on that branch |
| 2026-09-29 | MVP-014 review / GitHub issue #16 | Recorded the independent review's non-blocking observations. No application behavior changed. | Documentation only | None | None | None | None | None | None | `ENG-IMP-034`, `ENG-IMP-035` | #68 | The review-record commit on `cursor/mvp-014-project-invitations-255b` |
| 2026-09-29 | MVP-041 / GitHub issue #43 | Added notification intents, in-app deliveries, and recipient read/mark-read. A mandatory topic always keeps an in-app record. Preference evaluation and email stay later items. | Notifications, authorization, database, testing | 011 | `GET /notifications`, `GET /notifications/:externalId`, `POST /notifications/:externalId/mark-read` | None | `SEC-NOTIFICATIONS-001`, `SEC-NOTIFICATIONS-005`, `AUD-NOTIFICATIONS-001`, `AUD-NOTIFICATIONS-002` | `backend/test/notification-rules.test.js`, `backend/test/notifications.http.test.js`, `backend/test/notification-constraints.test.js` | EDR-010 | `ENG-IMP-036` | Branch `cursor/mvp-041-notification-intent-255b` | The MVP-041 commit on that branch |
| 2026-09-29 | MVP-041 review / GitHub issue #43 | Stopped classifying `Security-critical account event` as `MANDATORY`. Recorded the review's non-blocking domain and class-pair notes. | Notifications, database | 012 | None | None | `BR-NOTIFICATIONS-001` | `backend/test/notification-constraints.test.js` | EDR-010 | `ENG-IMP-036`, `ENG-IMP-037`, `ENG-IMP-038` | Branch `cursor/mvp-041-notification-intent-255b` | The review-repair commit on that branch |
| 2026-09-29 | MVP-042 / GitHub issue #44 | Preference evaluation reads User Settings at fan-out. A missing store uses the matrix default. A disabled configurable in-app channel becomes `SUPPRESSED`. A mandatory in-app record is still sent. No schema change. | Notifications, testing | None | None | None | `REQ-NOTIFICATIONS-004`, `BR-NOTIFICATIONS-001`, `SEC-NOTIFICATIONS-004`, `INT-NOTIFICATIONS-002` | `backend/test/preference-evaluation.test.js`, `backend/test/notifications.http.test.js` | EDR-011 | `ENG-IMP-039`, `ENG-IMP-040` | Branch `cursor/mvp-042-preference-evaluation-255b` | The MVP-042 commit on that branch |
| 2026-09-29 | MVP-038 / GitHub issue #40 | One conversation per project, immutable user messages, and tombstone redaction. The stored row, body, hash, sequence, and conversation binding remain. The body maximum is 500 characters. | Messaging, authorization, database, testing | 013 | Send, list, and tombstone under the project external id | None | `REQ-MESSAGING-002`, `REQ-MESSAGING-003`, `REQ-MESSAGING-005`, `BR-MESSAGING-001`, `BR-MESSAGING-004`, `BR-AUTHZ-014`, `BR-AUTHZ-015`, `SEC-MESSAGING-001`, `SEC-MESSAGING-002`, `SEC-MESSAGING-003`, `SEC-MESSAGING-006`, `SEC-MESSAGING-010`, `AUD-MESSAGING-001` | `backend/test/messaging-rules.test.js`, `backend/test/messages.http.test.js`, `backend/test/message-constraints.test.js` | EDR-013 | None | Branch `cursor/mvp-038-conversation-messages-255b` | The MVP-038 commit on that branch |
| 2026-09-29 | MVP-038 review / GitHub issue #40 | A send replay re-reads a tombstoned message and redacts `body`. The conversation-created audit row references the first message. The completed idempotency payload is unchanged (`ENG-IMP-042`). | Messaging, testing | None | Send replay after tombstone returns `body: null` | None | `REQ-MESSAGING-005`, `AUD-MESSAGING-001` | `backend/test/messages.http.test.js` | EDR-013 | `ENG-IMP-042` | #79 | The review-repair commit on `cursor/mvp-038-conversation-messages-255b` |
| 2026-09-30 | MVP-015 / GitHub issue #17 | One immutable `project_term_versions` sequence per project holds proposal and agreed snapshots. `commitTransition` enforces Projects §11.3. Invitation commands move project state. `ProjectStateChanged` is an outbox row. | Projects, authorization, database, testing | 014 | Propose, seek-seller, cancel, start, archive, and restore. Invitation commands now change `projects.state`. | None | `REQ-PROJECTS-002`, `REQ-PROJECTS-004`, `BR-PROJECTS-012`, `BR-PROJECTS-013`, `BR-PROJECTS-015`, `BR-PROJECTS-081`, `SEC-PROJECTS-013`, `SEC-PROJECTS-014`, `AUD-PROJECTS-001`, `AUD-PROJECTS-003` | `backend/test/transition-rules.test.js`, `backend/test/transitions.http.test.js`; invitation and message helpers propose before invite | EDR-014 | None (`ENG-IMP-015` marked IMPLEMENTED) | Branch `cursor/mvp-015-project-term-versions-255b` | The MVP-015 commits on that branch |
| 2026-09-30 | MVP-015 review / GitHub issue #17 | Unready Draft → Proposed returns `422`. Settled cancellation rejects a fact that says a hold remains. Successful propose writes `AUD-PROJECTS-001`, `AUD-PROJECTS-003`, and `ProjectStateChanged`. | Projects, testing | None | Unready propose is `422` | None | `INT-PROJECTS-003`; §11.3 funded/in-progress cancellation requires no hold | `backend/test/transitions.http.test.js` | None | `ENG-IMP-043`, `ENG-IMP-044`, `ENG-IMP-045` | #81 | The review-repair commit on `cursor/mvp-015-project-term-versions-255b` |
| 2026-09-30 | MVP-016 / GitHub issue #18 | An accepted amendment appends the next agreed term version. A rejected or withdrawn amendment leaves the project and the sequence unchanged. Money, catalog, and milestone patches return `422`. | Projects, database, testing | 015 | Propose, accept, reject, and withdraw under `/projects/:projectId/amendments` | None | `REQ-PROJECTS-009`, `BR-PROJECTS-017`, `BR-PROJECTS-051`, `SEC-PROJECTS-004`, `AUD-PROJECTS-004` | `backend/test/amendment-rules.test.js`, `backend/test/amendments.http.test.js`, `backend/test/amendment-constraints.test.js` | EDR-015 | `ENG-IMP-046` | Branch `cursor/mvp-016-project-amendments-255b` | The MVP-016 commits on that branch |
| 2026-09-30 | MVP-016 review / GitHub issue #18 | `agreed_term_version` can only move forward to an existing agreed snapshot that matches the live commercial columns. A direct pointer retarget is rejected. | Projects, database, testing | 015 (function replaced before merge) | None | None | `BR-PROJECTS-017` | `backend/test/amendments.http.test.js` | EDR-015 | `ENG-IMP-047`, `ENG-IMP-048` | #84 | The review-repair commit on `cursor/mvp-016-project-amendments-255b` |
| 2026-10-01 | MVP-017 / GitHub issue #19 | Proposal and acceptance each capture an immutable milestone snapshot. Amounts are integer minor units with an explicit exponent. Deliverables are catalogue selections. Revision allowance is an explicit nonnegative integer with no platform default. | Milestones, projects, database, frontend, testing | 016 | `POST /projects` requires `revision_allowance` and `deliverable_definition`. Propose and accept write milestone snapshots. Project responses include `currency_exponent`. | Create-project catalogue and revision dropdown. Amount display uses the stored exponent. | `REQ-PROJECTS-025`, `BR-PROJECTS-034`, `BR-PROJECTS-036`, `AUD-PROJECTS-008` | `backend/test/amount.test.js`, `backend/test/catalogue.test.js`, `backend/test/milestone-terms.http.test.js` | EDR-016 | `ENG-IMP-050`, `ENG-IMP-051` | Branch `cursor/mvp-017-milestone-term-versions-255b` | The MVP-017 commit on that branch |
| 2026-10-01 | MVP-017 review / GitHub issue #19 | Agreed rows must have complete terms. A frozen historical row may not. Lock and a later draft-to-frozen update reject a missing allowance or catalogue selection. Acceptance of a proposal with no milestone snapshots returns 409 when the live terms are incomplete, and captures them when they are complete. A missing allowance stays null in the invitation hash. | Milestones, projects, database, testing | 017 | Lock of incomplete terms is `400`. Acceptance without a capturable snapshot is `409`. An incomplete proposal cannot be invited. | None | `BR-PROJECTS-034`, `BR-PROJECTS-036`, `DATA-PROJECTS-009` | `backend/test/milestone-terms.http.test.js`, `backend/test/invitation-rules.test.js` | EDR-016 | None | #86 | The review-repair commit on `cursor/mvp-017-milestone-term-versions-255b` |
| 2026-10-01 | MVP-017 review record / GitHub issue #19 | Recorded the review's non-blocking observations. No application behavior changed. | Documentation only | None | None | None | None | None | None | `ENG-IMP-052`, `ENG-IMP-053` | #86 | The review-record commit on `cursor/mvp-017-milestone-term-versions-255b` |
| 2026-10-01 | MVP-018 / GitHub issue #20 | M01–M17 run through one transition service. A direct state write is rejected. A stale version has no side effect. A mismatched fact is quarantined. M05 keeps the submission reference distinct from the event id. | Milestones, projects, database, testing | 018 | No new public route. Create writes the M01 transition. Milestone responses include `version`. | None | `REQ-PROJECTS-027`, `BR-PROJECTS-037`, `BR-PROJECTS-047`, `BR-PROJECTS-052`, `SEC-PROJECTS-021`, `SEC-PROJECTS-028`, `DATA-PROJECTS-010` | `backend/test/milestone-transitions.test.js`, `backend/test/routes.smoke.test.js` | EDR-017 | `ENG-IMP-054` | Branch `cursor/mvp-018-milestone-state-machine-255b` | The MVP-018 commit on that branch |
| 2026-10-01 | MVP-018 review record / GitHub issue #20 | Recorded the review's non-blocking observations. No application behavior changed. | Documentation only | None | None | None | None | None | None | `ENG-IMP-055`, `ENG-IMP-056`, `ENG-IMP-057`, `ENG-IMP-058`, `ENG-IMP-059` | Branch `cursor/mvp-018-milestone-state-machine-255b` | The review-record commit on that branch |
| 2026-10-01 | MVP-019 / GitHub issue #21 | A milestone starts only when every predecessor is resolved and no other milestone is active. The seller account must be active. The work-start audit records the predecessor set. | Milestones, testing | None | No new public route | None | `REQ-PROJECTS-028`, `BR-PROJECTS-039`, `BR-PROJECTS-040`, `AUD-PROJECTS-010` | `backend/test/milestone-activation.test.js` | EDR-018 | None | Branch `cursor/mvp-019-milestone-activation-255b` | The MVP-019 commit on that branch |
| 2026-10-01 | MVP-019 review record / GitHub issue #21 | Recorded the review's non-blocking observation. No application behavior changed. | Documentation only | None | None | None | None | None | None | `ENG-IMP-060` | Branch `cursor/mvp-019-milestone-activation-255b` | The review-record commit on that branch |

## 8. Version history

| Version | Date | Change | Author |
|---|---|---|---|
| 0.1.0 | 2026-09-25 | Initial build record: status for 20 subsystems verified against commit `2defbea`, baseline implementation choices, EDR system (no initial EDRs), append-only change history. Proposed pending human review. | Engineering (drafted by Claude Code) |
| 0.2.0 | 2026-09-26 | Recorded the MVP-001 module split: backend and testing subsystem status, EDR-001, and a change-history row. | Engineering |
| 0.2.1 | 2026-09-26 | Appended a change-history row for `ENG-IMP-017`–`020`, recorded from the MVP-001 independent review and not implemented. Section 4's verification stamp is unchanged (`ENG-IMP-020`). | Engineering |
| 0.2.2 | 2026-09-26 | Recorded the Cloud Agent image toolchain: Section 4.21, EDR-002, and a change-history row. No application subsystem behavior changed. | Engineering |
| 0.3.0 | 2026-09-26 | Recorded the MVP-002 harness: testing and backend/frontend test fields, EDR-003, EDR-001's merged pull request, and a change-history row. Section 4's verification stamp is still `2defbea` (`ENG-IMP-020`). | Engineering |
| 0.4.0 | 2026-09-27 | Recorded MVP-003: new Section 4.22, backend, database, and testing fields, EDR-004, and a change-history row. | Engineering |
| 0.4.1 | 2026-09-28 | Recorded the MVP-003 constraint-test clock repair. No subsystem behavior changed. | Engineering |
| 0.5.0 | 2026-09-28 | Recorded MVP-006: live account-status check inside `requireAuth`, Section 4.5, EDR-006, and a change-history row. | Engineering |
| 0.6.0 | 2026-09-28 | Recorded MVP-007: `authorize()` for the existing project rules, Section 4.6, EDR-007, and a change-history row. | Engineering |
| 0.7.0 | 2026-09-29 | Recorded MVP-013: server-side profile search, Sections 4.3, 4.4, 4.7, and 4.20, EDR-008, and a change-history row. | Engineering |
| 0.8.0 | 2026-09-29 | Recorded MVP-014: seller invitations, Sections 4.3, 4.6, 4.10, 4.19, 4.20, and 4.22, EDR-009, and a change-history row. | Engineering |
| 0.8.1 | 2026-09-29 | Recorded the MVP-014 review's non-blocking improvements. No subsystem behavior changed. | Engineering |
| 0.9.0 | 2026-09-29 | Recorded MVP-041: notification intents, in-app delivery, and read/mark-read. Sections 4.1, 4.3, 4.6, 4.18, 4.19, and 4.20, plus EDR-010. | Engineering |
| 0.10.0 | 2026-09-29 | Recorded MVP-042: preference evaluation without a settings table. Sections 4.1, 4.18, and 4.20, plus EDR-011. | Engineering |
| 0.10.1 | 2026-09-29 | Recorded pull request #73 on EDR-011. No subsystem behavior changed. | Engineering |
| 0.11.0 | 2026-09-29 | Recorded MVP-038: conversations, immutable messages, and tombstone. Sections 4.1, 4.3, 4.6, 4.15, 4.19, 4.20, and 4.22, plus EDR-013. | Engineering |
| 0.11.1 | 2026-09-29 | Recorded pull request #79 on EDR-013. No subsystem behavior changed. | Engineering |
| 0.12.0 | 2026-09-30 | Recorded MVP-015: one project term-version sequence and the §11.3 transition service. Sections 4.1, 4.3, 4.6, 4.10, 4.19, 4.20, and 4.22, plus EDR-014. EDR-009's unchanged-state consequence is superseded. | Engineering |
| 0.12.1 | 2026-09-30 | Recorded the MVP-015 review repair: unready propose returns 422, and a settled cancellation with a hold is rejected. | Engineering |
| 0.13.0 | 2026-09-30 | Recorded MVP-016: project amendments on the agreed term-version sequence. Sections 4.1, 4.3, 4.10, 4.19, 4.20, and 4.22, plus EDR-015. | Engineering |
| 0.13.1 | 2026-09-30 | Recorded the MVP-016 review repair: the agreed-term pointer cannot be retargeted without a newer matching snapshot. | Engineering |
| 0.14.0 | 2026-10-01 | Recorded MVP-017: milestone term snapshots, integer minor units, the deliverable catalogue, and explicit revision allowance. Sections 4.10 and 4.11, plus EDR-016. | Engineering |
| 0.14.1 | 2026-10-01 | Recorded the MVP-017 review repair: migration 017, the agreed-only completeness check, and acceptance that does not invent a missing snapshot. | Engineering |
| 0.14.2 | 2026-10-01 | Recorded the MVP-017 review's non-blocking improvements. No application behavior changed. | Engineering |
| 0.15.0 | 2026-10-01 | Recorded MVP-018: the milestone state machine, transition history, and EDR-017. Sections 4.11, 4.19, 4.20, and 4.22. | Engineering |
| 0.15.1 | 2026-10-01 | Recorded the MVP-018 review's non-blocking improvements. No application behavior changed. | Engineering |
| 0.16.0 | 2026-10-01 | Recorded MVP-019: the Section 13.2 activation predicate on milestone start, including the live account-status check and EDR-018. Sections 4.11 and 4.20. | Engineering |
| 0.16.1 | 2026-10-01 | Recorded the MVP-019 review's non-blocking improvement. No application behavior changed. | Engineering |
