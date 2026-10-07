# MusicApp technical handover

| Field | Value |
|---|---|
| Purpose | Let an independent engineer clone, run, assess, and continue MusicApp without access to earlier agent conversations |
| Snapshot | Implementation as of `main` `d60bb94` (2026-10-07, the last implementation merge). This file arrived in documentation pull request #109. |
| Status | Pre-production MVP build. **Not production-ready** (Section 11). |
| Maintained by | Repository maintainers. Refresh this file when `main` changes materially. |

Everything below was verified against the repository on 2026-10-07. Where this file and a canonical specification disagree about *target* behavior, the specification wins ([`AGENTS.md`](../AGENTS.md) §1). Where this file and the code disagree about *current* behavior, the code wins. Please report the drift.

## 1. What MusicApp is

MusicApp is a two-sided marketplace for fixed-price, milestone-based music work, launching India-first in **INR**. A Buyer commissions a Seller (producer, mixing or mastering engineer, artist, vocalist). The agreed terms are frozen as immutable snapshots. The Buyer funds an escrow, and money is released milestone by milestone as work is approved. Both parties rate each other before the project completes. The product definition is [`docs/01-foundation/product-overview.md`](01-foundation/product-overview.md). The target end-to-end transaction is [implementation plan §3](19-implementation-planning/mvp-implementation-plan.md#3-the-first-complete-mvp-transaction).

Today the backend implements the front half of that transaction:

- accounts and roles;
- discovery;
- project negotiation with immutable term snapshots;
- the milestone state machine;
- escrow creation with a fee snapshot;
- funding confirmation through a payment-provider adapter;
- an append-only ledger and internal refunds;
- asset upload sessions;
- messaging;
- in-app notifications.

Deliverables, approval, release, payout, disputes, and ratings are not built.

## 2. How this repository is governed

Read these before changing anything. They are short relative to the codebase and they are binding.

| Document | Role |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | Source-of-truth order, per-issue workflow, stop conditions, Definition of Done, and merge policy (§5.1) |
| [`docs/00-governance/README.md`](00-governance/README.md) | Document structure, identifier families (`REQ-*`, `BR-*`, `SEC-*`, `AUD-*`, …) |
| `docs/01-foundation/` … `docs/10-notifications/`, [`disputes.md`](09-moderation-trust-safety/disputes.md) | **Canonical domain specifications.** Product and architecture authority. Each has a "verified repository comparison" section and an Open Questions section. |
| [`mvp-implementation-plan.md`](19-implementation-planning/mvp-implementation-plan.md) | 52 dependency-ordered work items `MVP-001`–`MVP-052`, each with a classification (§7) |
| [`github-issue-index.md`](19-implementation-planning/github-issue-index.md) | `MVP-*` → GitHub issue #3–#54, with execution status |
| [`autonomous-build-status.md`](19-implementation-planning/autonomous-build-status.md) | Operational status and handoff notes |
| [`engineering-handbook.md`](20-engineering/engineering-handbook.md) | *How* to engineer: financial rules (§12), testing (§14), migrations (§18), review (§19), refactoring (§20) |
| [`engineering-build-record.md`](20-engineering/engineering-build-record.md) | What was actually built and why. Per-subsystem records and the `EDR-*` decision records. **Read the subsystem section before touching it.** |
| [`engineering-improvements.md`](20-engineering/engineering-improvements.md) | `ENG-IMP-*` backlog, with a full index. **An entry is never authorization to implement it.** |

**Merge authority** ([`AGENTS.md`](../AGENTS.md) §5.1):

- `AUTONOMOUS-READY` items may be squash-merged by the autonomous orchestrator once all 15 merge gates pass.
- `HUMAN-DECISION-REQUIRED` and `EXTERNAL-DEPENDENCY` items, and unclassified PRs, need a human final merge.

**`main` is protected by ruleset 24033491:**

- squash-only pull requests, with review threads resolved;
- no deletion and no force-push;
- the GitHub Actions checks `lint`, `frontend-test`, `backend-test`, and `migration-dry-run` must pass;
- no bypass actors.

**Product Owner decisions D01–D25** were recorded on 2026-10-01 in the owning specifications and the [consistency audit](00-governance/specification-consistency-audit.md); the asset limits are in `assets-and-media.md` §7.3. They are settled. Do not reopen them. Examples:

- 10% Seller commission; 0 Buyer and activation fees;
- whole-star 1–5 ratings and a 14-day rating window;
- automatic immediate payout once the live gate passes;
- a 24-hour funding-intent expiry;
- a non-public first-Administrator bootstrap;
- removal of `POST /users` and `POST /profiles`;
- the asset byte limits;
- Cloudflare R2, Cashfree, and Resend as the selected providers.

## 3. Architecture and stack

```text
frontend/  React 19 + TypeScript 5.9 + Vite 7 SPA (pnpm). Port 5173.
backend/   Node.js CommonJS, Express 5.2, pg 8.16 (raw parameterized SQL, no ORM),
           jsonwebtoken 9, bcryptjs 3 (cost 12). Port 4000 (hardcoded).
backend/db PostgreSQL 16. Plain numbered SQL migrations 001–023 + custom runner (migrate.js).
docker-compose.yml  One postgres:16 container for local development (port 5432).
.github/workflows/ci.yml  lint, frontend-test, backend-test, migration-dry-run (required on main).
.cursor/   Cursor Cloud Agent image and scripts (Ubuntu-specific). Not an application image.
```

The backend uses one `routes.js` / `service.js` / `repository.js` triplet per domain under `backend/src/<domain>/` ([EDR-001](20-engineering/engineering-build-record.md#edr-001-backend-module-layout)). Other conventions:

- **Authorization:** goes through one `authorize(actor, action, resource)` in `backend/src/authorization/authorize.js` ([EDR-007](20-engineering/engineering-build-record.md#edr-007-authorize-for-the-existing-project-rules)). `requireAuth` re-checks the live account status on every request ([EDR-006](20-engineering/engineering-build-record.md#edr-006-live-account-status-inside-requireauth)).
- **Retry safety:** state-changing commands take an `Idempotency-Key` and run inside one transaction with the shared idempotency, outbox, and inbox helpers in `backend/src/infrastructure/` ([EDR-004](20-engineering/engineering-build-record.md#edr-004-shared-idempotency-outbox-and-inbox-model)). Nothing dispatches the outbox yet ([ENG-IMP-023](20-engineering/engineering-improvements.md#eng-imp-023-outbox-dispatcher-has-no-process-runner-transport-or-alerting)).
- **Money:** integer minor units (paise), server-stamped `INR` with exponent 2. Escrow amounts are `BIGINT`. `projects.price_amount` and `payments.amount` are still 32-bit (ENG-IMP-050).
- **Database-enforced invariants:** many invariants live in the database: append-only triggers on audit, term-version, transition, ledger, fee-snapshot, and webhook-receipt tables; state-change guards; and named `CHECK` constraints.
- **Frontend shape:** almost the whole frontend is `frontend/src/App.tsx`. There is no router (`useState` view switching), and the API base is hardcoded to `http://localhost:4000` ([ENG-IMP-003](20-engineering/engineering-improvements.md#eng-imp-003-frontend-api-base-url-is-hardcoded)). The JWT is kept in `localStorage`.

## 4. Local setup

**Prerequisites:**

- Docker (Desktop or Engine);
- Node.js 20 or later (CI pins **22.14.0**; 24.12 also verified);
- npm;
- pnpm (CI pins 12.5.1; 10.26 also works with the lockfile).

```bash
git clone https://github.com/xela-ash/Music_app.git && cd Music_app

# 1. Development database (port 5432, volume postgres_data)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env          # then set JWT_SECRET to any non-empty local value
npm ci
npm run migrate               # applies backend/db/*.sql in filename order; safe to re-run
npm run dev                   # http://localhost:4000  (npm start for no watch)

# 3. Frontend (second terminal)
cd frontend
pnpm install --frozen-lockfile
pnpm dev                      # http://localhost:5173
```

Health checks: `curl localhost:4000/` and `curl localhost:4000/db-health`.

**Environment variables** (`backend/.env.example` lists them all). `.env` is gitignored, and no credential is committed. Every provider setting fails closed when it is empty.

| Variable | Needed for | Notes |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Always | Defaults match `docker-compose.yml` |
| `JWT_SECRET` | Always | The process exits if blank. `JWT_EXPIRES_IN` defaults to `7d`. |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM` | Email adapter (MVP-043) | Unset → no provider; sending fails closed. `resend` with a missing key or sender also fails closed. |
| `PAYMENT_PROVIDER`, `MOCK_PAYMENT_WEBHOOK_SECRET`, `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_ENV` | Funding payments (MVP-025) | `PAYMENT_PROVIDER` is `mock` or `cashfree`, with no default. For local use, set `mock` and a mock secret of at least 16 characters. `CASHFREE_ENV` is `sandbox` or `production`. |
| `ASSET_STORAGE_PROVIDER`, `ASSET_LOCAL_STORAGE_ROOT`, `ASSET_UPLOAD_SESSION_TTL_SECONDS`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Asset uploads (MVP-010) | The provider **defaults to `local`**, under the OS temp directory unless `ASSET_LOCAL_STORAGE_ROOT` is set. Session create returns `503` until the TTL is a positive integer; the duration is an open product number (ENG-IMP-068). |
| `BOOTSTRAP_ADMIN_USER_ID` | First Administrator CLI | Or pass `--user-id` (below) |

**First Administrator.** `node backend/src/roles/bootstrap-admin.js --user-id <users.id>` grants Administrator to one existing active user. It refuses once any active Administrator exists ([EDR-026](20-engineering/engineering-build-record.md#edr-026-first-administrator-bootstrap)). There is deliberately no HTTP route for this.

## 5. Database and migrations

- Migrations are `backend/db/NNN_description.sql` (`001`–`023` on `main`), applied by `npm run migrate`. The runner records each filename in `schema_migrations` and skips files already applied. Each file has its own `BEGIN`/`COMMIT` and is written to be re-runnable. The next new migration is `024`.
- A database migrated before `021`/`022` existed applies them after `023`. That upgrade was tested on 2026-10-06 and 2026-10-07 and applies cleanly.
- There are no down-migrations, and the runner has no checksum or drift detection ([ENG-IMP-001](20-engineering/engineering-improvements.md#eng-imp-001-migration-runner-cannot-detect-edited-migrations-and-records-applied-state-non-atomically)). **Never edit an applied migration.** Fix forward ([Handbook §18](20-engineering/engineering-handbook.md#18-migrations-and-compatibility)).
- The CI job `migration-dry-run` applies every file to an empty database, then requires a second `npm run migrate` to skip every file.

## 6. Testing

**Backend.** The suite uses Node's built-in `node:test` runner against a real PostgreSQL database. `backend/test/database-guard.js` refuses to run unless `DB_NAME=musicapp_mvp001` and `DB_PORT` is not `5432`. **Never point the tests at a development, staging, or production database.** The fixture truncates every application table.

- **Any machine with Docker** (this is how CI runs it):

  ```bash
  docker run -d --name musicapp_test_pg -p 127.0.0.1:5433:5432 \
    -e POSTGRES_USER=musicapp -e POSTGRES_PASSWORD=musicapp -e POSTGRES_DB=musicapp_mvp001 \
    --tmpfs /var/lib/postgresql/data postgres:16
  cd backend
  export DB_HOST=127.0.0.1 DB_PORT=5433 DB_USER=musicapp DB_PASSWORD=musicapp \
         DB_NAME=musicapp_mvp001 JWT_SECRET=local-test-secret \
         MUSICAPP_TEST_ADMIN_USER=musicapp MUSICAPP_TEST_ADMIN_PASSWORD=musicapp
  npm ci && npm run migrate && npm test
  ```

  `MUSICAPP_TEST_ADMIN_USER` names a superuser that resets fixtures over TCP ([EDR-005](20-engineering/engineering-build-record.md#edr-005-pull-request-ci-workflow)).
- **Cursor Cloud image:** `./.cursor/test-backend.sh`. It is Ubuntu-only and resets fixtures with `sudo -u postgres`.

**Frontend.** Run `cd frontend && pnpm test && pnpm lint && pnpm build`. The tests use Vitest 4, Testing Library, and jsdom 26. The build is `tsc -b && vite build`.

**CI.** The four checks run on every pull request and on every push to `main`. A pull request is only checked once it contains current `main`'s workflow. CI does not run `pnpm build` (ENG-IMP-025), and it runs the app as the database superuser (ENG-IMP-091).

**Results on 2026-10-07, `main` `d60bb94`:**

| Check | Result |
|---|---|
| Backend `npm test` | 279 / 279 pass, with fresh migrations `001`–`023` plus a skip re-run. GitHub Actions is green on `main`. |
| Frontend | 10 / 10 tests; lint clean; build OK |
| Local application smoke test | 36 / 36 HTTP checks, covering the Section 8 flow and the funding and asset paths. The frontend dev server serves and compiles. |

## 7. Capability status

25 of 52 work items are merged. None is in an open pull request. 27 are not started.

| Stage | Merged | Not started |
|---|---|---|
| 0 Foundation | MVP-001 module layout, MVP-002 test harness, MVP-003 idempotency/outbox/inbox, MVP-004 CI | — |
| 1 Identity | MVP-005 legacy routes removed, MVP-006 live status check, MVP-007 `authorize()`, MVP-008 roles and Administrator bootstrap | MVP-009 password reset and email verification (live email needs Resend credentials) |
| 2 Assets/Verification | MVP-010 upload sessions, local and R2 adapters | MVP-011 retention and holds, MVP-012 identity verification |
| 3 Marketplace | MVP-013 server-side profile search | — |
| 4 Projects | MVP-014 invitations, MVP-015 state machine and term versions, MVP-016 amendments | — |
| 5 Milestones | MVP-017 term snapshots, MVP-018 state machine M01–M17, MVP-019 activation | — |
| 6 Deliverables | — (MVP-018 already provides the M05 consumer and the M06/M07 service for MVP-021/022) | MVP-020–023 (submission, readiness, revision/approval, non-response) |
| 7 Escrow/Payments | MVP-024 funding intent, MVP-025 payment adapter and funding confirmation, MVP-026 ledger, MVP-027 fee schedule | — |
| 8 Release/Payout | MVP-029 refund execution | MVP-028 release, MVP-030 cancellation outcomes, MVP-052 payout |
| 9 Disputes | — | MVP-031–037 |
| 10 Messaging | MVP-038 conversations and tombstone | MVP-039 attachments, MVP-040 dispute evidence read |
| 11 Notifications | MVP-041 intents and in-app, MVP-042 preferences, MVP-043 email adapter and Resend | — |
| 12 Ratings | — | MVP-044–047 |
| 13 Hardening | — | MVP-048–051 |

**Ready now:**

- `MVP-011` and `MVP-012` (both AUTONOMOUS-READY).
- `MVP-009` (EXTERNAL-DEPENDENCY). A human merges it. Live email needs credentials.

The critical path (plan §6) continues at `MVP-020`, which needs `MVP-011`. The first full transaction without payout (plan §6 checkpoint A) also needs `MVP-012`, `MVP-028`, `MVP-044`, and `MVP-045`.

**Open GitHub issues.** All 27 open issues were reviewed individually against `main` `d60bb94` on 2026-10-07. Each one carries a review comment with the evidence.

- **None was closed:** no open issue meets its acceptance criteria, and none is obsolete, superseded, or a duplicate.
- Every merged item's issue is closed (25).
- No open issue carries the `blocked` label.
- Bodies written before the 2026-10-01 decisions (#11, #32, #46, #54) carry a status banner.

| Issue | Item | Title | Classification | Status | Why it stays open |
|---|---|---|---|---|---|
| [#11](https://github.com/xela-ash/Music_app/issues/11) | MVP-009 | Password reset and email verification | EXTERNAL-DEPENDENCY | READY | Not started. Buildable against the merged email adapter and mock. Live Resend delivery needs credentials. Session revocation on reset (ENG-IMP-016) has no work item. |
| [#13](https://github.com/xela-ash/Music_app/issues/13) | MVP-011 | Asset retention, hold, and deletion | AUTONOMOUS-READY | READY | Not started. Unblocks MVP-020, MVP-031, MVP-033, MVP-039. |
| [#14](https://github.com/xela-ash/Music_app/issues/14) | MVP-012 | Identity verification routes | AUTONOMOUS-READY | READY | Not started. The schema and asset FK exist; no routes. |
| [#22](https://github.com/xela-ash/Music_app/issues/22) | MVP-020 | Deliverable and Submission model | AUTONOMOUS-READY | Waiting on MVP-011 | Not started. Next critical-path item. |
| [#23](https://github.com/xela-ash/Music_app/issues/23) | MVP-021 | Submission-to-Milestone readiness | AUTONOMOUS-READY | Waiting on MVP-020 | **Partial.** The M05 consumer exists (MVP-018). The readiness-fact emitter remains. |
| [#24](https://github.com/xela-ash/Music_app/issues/24) | MVP-022 | Revision requests and Buyer approval | AUTONOMOUS-READY | Waiting on MVP-021 | **Partial.** The tables and the M06/M07 service exist (MVP-018). Routes and Submission linkage remain. |
| [#25](https://github.com/xela-ash/Music_app/issues/25) | MVP-023 | Buyer non-response (M18) | AUTONOMOUS-READY | Waiting on MVP-022 | Not started. |
| [#30](https://github.com/xela-ash/Music_app/issues/30) | MVP-028 | Release eligibility and execution | AUTONOMOUS-READY | Waiting on MVP-022, MVP-023 | Not started. The M08 edge, the release ledger rule, and the fee snapshot exist. |
| [#32](https://github.com/xela-ash/Music_app/issues/32) | MVP-030 | Cancellation financial outcomes | HUMAN-DECISION-REQUIRED | Waiting on MVP-028 | Not started. EQ3 is decided (mutual award). |
| [#33](https://github.com/xela-ash/Music_app/issues/33) | MVP-031 | Disputes schema | AUTONOMOUS-READY | Waiting on MVP-011, MVP-022 | Not started. |
| [#34](https://github.com/xela-ash/Music_app/issues/34) | MVP-032 | Dispute eligibility and opening | AUTONOMOUS-READY | Waiting on MVP-031 | Not started. |
| [#35](https://github.com/xela-ash/Music_app/issues/35) | MVP-033 | Evidence references and Asset holds | AUTONOMOUS-READY | Waiting on MVP-011, MVP-032 | Not started. |
| [#36](https://github.com/xela-ash/Music_app/issues/36) | MVP-034 | Response and staff review | AUTONOMOUS-READY | Waiting on MVP-032 | Not started. |
| [#37](https://github.com/xela-ash/Music_app/issues/37) | MVP-035 | Adjudication and resolution instruction | AUTONOMOUS-READY | Waiting on MVP-034 | Not started. |
| [#38](https://github.com/xela-ash/Music_app/issues/38) | MVP-036 | Escrow resolution-instruction consumer | AUTONOMOUS-READY | Waiting on MVP-035 | Not started. Disputes EQ1 (post-payout recovery) is still open and gates only the manual UX. |
| [#39](https://github.com/xela-ash/Music_app/issues/39) | MVP-037 | Non-response/dispute race | AUTONOMOUS-READY | Waiting on MVP-023, MVP-032 | Not started. |
| [#41](https://github.com/xela-ash/Music_app/issues/41) | MVP-039 | Message Asset attachments | AUTONOMOUS-READY | Waiting on MVP-011 | Not started. Attachments are rejected today. |
| [#42](https://github.com/xela-ash/Music_app/issues/42) | MVP-040 | Dispute-evidence read access | AUTONOMOUS-READY | Waiting on MVP-034 | Not started. |
| [#46](https://github.com/xela-ash/Music_app/issues/46) | MVP-044 | Rating eligibility and submission | HUMAN-DECISION-REQUIRED | Waiting on MVP-028 | Not started. The scale is decided (1–5). |
| [#47](https://github.com/xela-ash/Music_app/issues/47) | MVP-045 | Ratings Pending and waiver timeout | AUTONOMOUS-READY | Waiting on MVP-044 | Not started. |
| [#48](https://github.com/xela-ash/Music_app/issues/48) | MVP-046 | Rating publication and moderation | AUTONOMOUS-READY | Waiting on MVP-044 | Not started. |
| [#49](https://github.com/xela-ash/Music_app/issues/49) | MVP-047 | Reputation projection | AUTONOMOUS-READY | Waiting on MVP-046 | Not started. |
| [#50](https://github.com/xela-ash/Music_app/issues/50) | MVP-048 | Concurrency/idempotency audit | AUTONOMOUS-READY | Waiting on MVP-030, -037, -045, -052 | Not started. |
| [#51](https://github.com/xela-ash/Music_app/issues/51) | MVP-049 | Security-finding closure sweep | AUTONOMOUS-READY | Waiting on MVP-048 | Not started. Some SEC findings are already closed by earlier items. |
| [#52](https://github.com/xela-ash/Music_app/issues/52) | MVP-050 | Audit-trail completeness | AUTONOMOUS-READY | Waiting on MVP-049 | Not started. |
| [#53](https://github.com/xela-ash/Music_app/issues/53) | MVP-051 | Vertical-slice end-to-end suite | AUTONOMOUS-READY | Waiting on MVP-050 | Not started. |
| [#54](https://github.com/xela-ash/Music_app/issues/54) | MVP-052 | Seller payout execution | HUMAN-DECISION-REQUIRED | Waiting on MVP-012, MVP-028 | Not started. PQ3 is decided. Ledger payout rules and a `createPayout` stub exist. |


## 8. What can be exercised, and how

**In the UI** (`frontend/src/App.tsx`):

- sign up (creates the user, profile, and credential);
- log in, restore the session, log out;
- Discover, with server-side search by name, handle, genre, city, or country;
- profile detail;
- create a Draft project. Amounts are entered in rupees and stored in paise. Milestones must sum to the total. Each milestone needs a deliverable catalogue selection and an explicit revision allowance; there is no default.
- the projects list and project detail;
- milestone locking by the Buyer.

**HTTP API only** (no screen yet). This flow was verified end to end on 2026-10-07:

- Project transitions: `POST /projects/:id/{propose,seek-seller,cancel,start,archive,restore}`.
- Seller invitations: `POST /projects/:id/invitations`, plus `…/:invitationId` review, accept, decline, withdraw.
- Amendments: `POST /projects/:id/amendments` and accept, reject, withdraw.
- Funding: `POST /projects/:id/funding-intent` creates the escrow, the allocations, and the fee snapshot. `POST /projects/:id/funding-payments` creates the provider payment. `POST /payments/webhooks/:provider` takes a signed provider event; it funds the escrow, the project, and the milestones.
- Assets: `POST /asset-upload-sessions`, then `PUT …/:id/content` (or multipart parts), then `POST …/:id/complete` to a `ready` asset, and `GET …/:id`.
- Messaging: `POST/GET /projects/:projectExternalId/messages`, `…/:messageExternalId/tombstone`.
- Notifications: `GET /notifications`, `GET /notifications/:externalId`, `POST …/mark-read`.
- Most commands require `Idempotency-Key` and `expected_version`. `backend/test/*.http.test.js` shows exact request shapes.

**Internal services only.** These are built and tested but have no HTTP route and no production caller yet:

- the milestone transition service (M01–M17, `applyMilestoneTransition`; funding confirmation applies M02);
- project system transitions (`applySystemTransition`);
- ledger posting (`postJournal`);
- refund execution (`executeRefundInstruction`);
- notification fan-out (`submitVerifiedEvent`);
- the email adapter (`sendEmail`).

Later items connect them.

## 9. External providers, adapters, and mocks

All three providers are **selected** and their adapters are on `main`. **No credentials are in the repository, by design**, and no live call has been verified.

| Provider | Purpose | Code | State | To activate |
|---|---|---|---|---|
| **Resend** | Email channel | `backend/src/notifications/email-adapter.js` (neutral, fails closed), `resend-adapter.js` | Notification fan-out does not call email yet (ENG-IMP-041). Nothing renders email copy. | Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RESEND_FROM` (verified sender domain). Verify one live send. MVP-009 builds the first real email flows. |
| **Cashfree** | Buyer funding (later: payouts, MVP-052) | `backend/src/payments/` (`registry.js`, `mock-adapter.js`, `cashfree-adapter.js`), `backend/src/escrow/funding-confirmation.js` | The mock completes funding confirmation end to end. Webhooks are HMAC-verified on the raw body with a timing-safe compare and deduplicated by event id. | Cashfree merchant approval. Set `PAYMENT_PROVIDER=cashfree`, `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_ENV`. Register `POST /payments/webhooks/cashfree`. **Known gap:** order creation omits `customer_details`, which Cashfree requires (ENG-IMP-089). Fix it before going live. |
| **Cloudflare R2** | Asset storage | `backend/src/assets/` (`storage.js`, `local-storage.js`, `r2-storage.js` with in-house SigV4 presigning) | Tests use the local adapter and a mock scanner | Create a bucket and an API token. Set `ASSET_STORAGE_PROVIDER=r2` and the `R2_*` variables. Choose a real malware scanner (not selected). Verify multipart upload against the bucket. |

## 10. Known technical debt (highest impact first)

The full list is the [improvements register](20-engineering/engineering-improvements.md), which has a complete index. None of it is authorized work.

- **Frontend coverage.** The frontend is one large module with no router, an untyped API client, and a hardcoded API base (ENG-IMP-002, -003). Most backend capabilities from MVP-014 onward have no screen. The closed PR #72 is preserved for reuse (ENG-IMP-090).
- **Outbox.** Rows are written and never dispatched (ENG-IMP-023), so domain events do not reach consumers.
- **Error handling and configuration.** There is no central error handler (ENG-IMP-007). Configuration loads implicitly (ENG-IMP-005). Transaction boilerplate is duplicated (ENG-IMP-006). The backend has no lint (ENG-IMP-004).
- **Migration runner.** It has no checksum or drift detection (ENG-IMP-001).
- **Money width.** `projects.price_amount` and `payments.amount` are still 32-bit (ENG-IMP-050).
- **Asset inspection.** It reads image headers only (ENG-IMP-069). The upload session duration, rate, and concurrency numbers are open (ENG-IMP-068).
- **CI coverage.** CI does not run `pnpm build` (ENG-IMP-025), and it runs as the database superuser (ENG-IMP-091).
- **Stale handbook snapshots.** The Engineering Handbook's "Current" snapshots predate the module split (ENG-IMP-022). The Build Record §4 verification stamp is old. Trust the code and the per-subsystem "Last materially changed" rows.

## 11. Security considerations

The specifications track open findings as `SEC-*` IDs, and **MVP-049** is the sweep that closes them. The ones a reviewer should weigh first:

| Finding | Risk today |
|---|---|
| `SEC-AUTH-008` | **`GET /users` is unauthenticated and returns every user's email, phone, and status.** Must be fixed before any public deployment. |
| `SEC-PROFILE-001` / `BR-PROFILE-008` | `GET /profiles` returns legal names (`first_name`, `last_name`) to any signed-in user |
| `SEC-AUTH-004`, `-005`, `-006`, `-009` | Open CORS, no rate limiting, a weak `JWT_SECRET` is accepted, no JWT algorithm allowlist |
| `SEC-USERS-005` | JWT stored in `localStorage` |
| `SEC-NOTIFICATIONS-002` | No signed ingestion route; notifications are in-process only |

Other points for review:

- **Payment webhooks:**
  - Cashfree signatures are verified, but the timestamp is not checked for freshness. Replay is limited by event-id deduplication.
  - Every rejected signature writes a receipt row.
  - `PAYMENT_PROVIDER=mock` must never be set in production.
- **Assets:** storage defaults to `local`, and inspection is header-only.
- **Roles:** governed Administrator grants and revocations fail closed until step-up authentication is specified (ENG-IMP-086).
- **Secrets:** none are committed. `.env` files are gitignored, and test credentials are placeholders.

## 12. Remaining external dependencies

- **Credentials:** Cloudflare R2 bucket and token; Cashfree merchant approval and API keys; Resend API key and a verified sender domain.
- **Malware scanner** for assets. It is not selected; an Assets specification open question.
- **Still-open product questions** (each specification's Open Questions section). Examples: the asset session duration, rate, and concurrency limits (Assets §30.1); chargeback and post-payout recovery (Escrow EQ5, Disputes EQ1); the step-up authentication proof (Authorization §35.2 item 8); the `ENG-IMP-036` notification classes; and retention periods (Escrow EQ11).
- **Hosting:** no deployment target, application Dockerfile, TLS, or observability exists ([Build Record §4.21](20-engineering/engineering-build-record.md#421-deployment-and-infrastructure)).

## 13. Repository housekeeping (2026-10-06/07)

**Pull requests reconciled with `main` and merged:**

| PR | Item | Merged by | Commit |
|---|---|---|---|
| #61 | MVP-004 CI pipeline | Autonomous orchestrator (AUTONOMOUS-READY; all 15 gates passed) | `064d53d` |
| #101 | MVP-027 fee schedule | Human | `2875dc8` |
| #103 | MVP-025 payment adapter | Human | `eb10171` |
| #98 | MVP-010 assets and R2 | Human | `d60bb94` |

An independent review covered every reconciliation and found no unresolved defect.

**Closed without merge: PR #72** (full frontend screen set and retro theme):

- Its live API calls are incompatible with the current API.
- Most of its screens simulate unbuilt features.
- It would replace newer screens.

It is preserved as tag `archive/pr-72-full-mvp-screens` and branch `frontend/full-mvp-screens`, and recorded as [ENG-IMP-090](20-engineering/engineering-improvements.md#eng-imp-090-full-mvp-frontend-screen-set-from-pull-request-72-is-preserved-unmerged). The screen-by-screen comparison is on the PR.

**Issues:**

- #7 and #10 were closed with acceptance evidence.
- The stale `blocked` label was removed from #29, #46, #54, and #11.
- After the four merges, 25 issues are closed and 27 are open. Each open issue was reviewed on 2026-10-07; see the table in Section 7.

**Branches:**

- Every branch whose PR merged, and whose head equalled the merged head, was deleted; GitHub can restore any of them from its PR page.
- `legacy-main` (an unrelated initial commit containing only `.gitattributes`) is preserved as tag `archive/legacy-main`.
- Remaining: `main` and `frontend/full-mvp-screens`.

**GitHub administration:** nothing is pending. The ruleset requires the four CI checks.

## 14. How to continue

1. Pick a `READY` item from the [issue index](19-implementation-planning/github-issue-index.md): `MVP-011` (it unblocks critical-path `MVP-020`, and also `MVP-031` and `MVP-039`), `MVP-012`, or `MVP-009` (a human merges it).
2. Follow the nine pre-implementation steps of [`AGENTS.md`](../AGENTS.md) §2 for every item. Update the Build Record, EDRs, and improvements register as §5 requires. The next free identifiers are `EDR-027`, `ENG-IMP-092`, and migration `024`.
3. Merge `main` into a pull request before expecting CI on it. The four checks are required.
4. Do not redesign working subsystems ([Handbook §20](20-engineering/engineering-handbook.md#20-refactoring-and-replacement)). Do not decide open product questions in code ([`AGENTS.md`](../AGENTS.md) §4).
