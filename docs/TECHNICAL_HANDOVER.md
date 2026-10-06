# MusicApp technical handover

| Field | Value |
|---|---|
| Purpose | Let an independent engineer clone, run, assess, and continue MusicApp without access to earlier agent conversations |
| Snapshot | `main` at `9bda4b7` (2026-10-06), plus four reconciled pull requests awaiting merge (Section 13) |
| Status | Pre-production MVP build. **Not production-ready** (Section 11). |
| Maintained by | Repository maintainers. Refresh this file when `main` changes materially. |

Everything below was verified against the repository on 2026-10-06. Where this file and a canonical specification disagree about *target* behavior, the specification wins ([`AGENTS.md`](../AGENTS.md) §1). Where this file and the code disagree about *current* behavior, the code wins. Please report the drift.

## 1. What MusicApp is

MusicApp is a two-sided marketplace for fixed-price, milestone-based music work, launching India-first in **INR**. A Buyer commissions a Seller (producer, mixing or mastering engineer, artist, vocalist). The agreed terms are frozen as immutable snapshots. The Buyer funds an escrow, and money is released milestone by milestone as work is approved. Both parties rate each other before the project completes. The product definition is [`docs/01-foundation/product-overview.md`](01-foundation/product-overview.md). The target end-to-end transaction is [implementation plan §3](19-implementation-planning/mvp-implementation-plan.md#3-the-first-complete-mvp-transaction).

Today the backend implements the front half of that transaction:

- accounts and roles;
- discovery;
- project negotiation with immutable term snapshots;
- the milestone state machine;
- escrow creation, an append-only ledger, and internal refunds;
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
| [`engineering-improvements.md`](20-engineering/engineering-improvements.md) | `ENG-IMP-*` backlog. **An entry is never authorization to implement it.** |

**Merge authority** ([`AGENTS.md`](../AGENTS.md) §5.1):

- `AUTONOMOUS-READY` items may be squash-merged by the autonomous orchestrator once all 15 merge gates pass.
- `HUMAN-DECISION-REQUIRED` and `EXTERNAL-DEPENDENCY` items, and unclassified PRs, need a human final merge.

**Product Owner decisions D01–D25** were recorded on 2026-10-01 (pull request #99) in the owning specifications and the [consistency audit](00-governance/specification-consistency-audit.md). They are settled. Do not reopen them. Examples:

- 10% Seller commission; 0 Buyer and activation fees;
- whole-star 1–5 ratings and a 14-day rating window;
- automatic immediate payout once the live gate passes;
- a 24-hour funding-intent expiry;
- a non-public first-Administrator bootstrap;
- removal of `POST /users` and `POST /profiles`;
- Cloudflare R2, Cashfree, and Resend as the selected providers.

## 3. Architecture and stack

```text
frontend/  React 19 + TypeScript 5.9 + Vite 7 SPA (pnpm). Port 5173.
backend/   Node.js CommonJS, Express 5.2, pg 8.16 (raw parameterized SQL, no ORM),
           jsonwebtoken 9, bcryptjs 3 (cost 12). Port 4000 (hardcoded).
backend/db PostgreSQL 16. Plain numbered SQL migrations + custom runner (migrate.js).
docker-compose.yml  One postgres:16 container for local development (port 5432).
.github/workflows/ci.yml  Added by PR #61 (MVP-004): lint, frontend-test, backend-test, migration-dry-run.
.cursor/   Cursor Cloud Agent image and scripts (Ubuntu-specific). Not an application image.
```

The backend uses one `routes.js` / `service.js` / `repository.js` triplet per domain under `backend/src/<domain>/` ([EDR-001](20-engineering/engineering-build-record.md#edr-001-backend-module-layout)). Other conventions:

- **Authorization:** goes through one `authorize(actor, action, resource)` in `backend/src/authorization/authorize.js` ([EDR-007](20-engineering/engineering-build-record.md#edr-007-authorize-for-the-existing-project-rules)). `requireAuth` re-checks the live account status on every request ([EDR-006](20-engineering/engineering-build-record.md#edr-006-live-account-status-inside-requireauth)).
- **Retry safety:** state-changing commands take an `Idempotency-Key` and run inside one transaction with the shared idempotency, outbox, and inbox helpers in `backend/src/infrastructure/` ([EDR-004](20-engineering/engineering-build-record.md#edr-004-shared-idempotency-outbox-and-inbox-model)). Nothing dispatches the outbox yet ([ENG-IMP-023](20-engineering/engineering-improvements.md#eng-imp-023-outbox-dispatcher-has-no-process-runner-transport-or-alerting)).
- **Money:** integer minor units (paise), server-stamped `INR` with exponent 2. Escrow amounts are `BIGINT`. `projects.price_amount` is still 32-bit ([ENG-IMP-050](20-engineering/engineering-improvements.md)).
- **Database-enforced invariants:** many invariants live in the database: append-only triggers on audit, term-version, transition, and ledger tables; state-change guards; and named `CHECK` constraints.
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

**Environment variables** (`backend/.env.example`). `.env` is gitignored, and no credential is committed.

| Variable | Needed for | Notes |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Always | Defaults match `docker-compose.yml` |
| `JWT_SECRET` | Always | The process exits if blank. `JWT_EXPIRES_IN` defaults to `7d`. |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM` | Email (MVP-043, on `main`) | Unset → no provider; sending fails closed. `resend` with a missing key or sender also fails closed. |
| `PAYMENT_PROVIDER` (`mock` or `cashfree`), `MOCK_PAYMENT_WEBHOOK_SECRET`, `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_ENV` (`sandbox` or `production`) | Funding confirmation (PR #103) | No default provider. Unset → funding-payment routes return a provider-unconfigured error. |
| `ASSET_STORAGE_PROVIDER` (`local` or `r2`), `ASSET_LOCAL_STORAGE_ROOT`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Asset uploads (PR #98) | **Defaults to `local`**, under the OS temp directory unless `ASSET_LOCAL_STORAGE_ROOT` is set |
| `BOOTSTRAP_ADMIN_USER_ID` | First Administrator CLI | Or pass `--user-id` (Section 6) |

**First Administrator.** `node backend/src/roles/bootstrap-admin.js --user-id <users.id>` grants Administrator to one existing active user. It refuses once any active Administrator exists ([EDR-026](20-engineering/engineering-build-record.md#edr-026-first-administrator-bootstrap)). There is deliberately no HTTP route for this.

## 5. Database and migrations

- Migrations are `backend/db/NNN_description.sql`, applied by `npm run migrate`. The runner records each filename in `schema_migrations` and skips files already applied. Each file has its own `BEGIN`/`COMMIT` and is written to be re-runnable.
- **On `main`:** `001`–`020` and `023`. **Reserved by open PRs:** `021_assets_ingest.sql` (#98) and `022_payments_funding.sql` (#103).
- A database that already applied `023` will apply `021` and `022` afterwards. That out-of-order upgrade was tested on 2026-10-06 and applies cleanly.
- There are no down-migrations, and the runner has no checksum or drift detection ([ENG-IMP-001](20-engineering/engineering-improvements.md#eng-imp-001-migration-runner-cannot-detect-edited-migrations-and-records-applied-state-non-atomically)). **Never edit an applied migration.** Fix forward ([Handbook §18](20-engineering/engineering-handbook.md#18-migrations-and-compatibility)).
- Migration verification (also a CI job once #61 merges): apply all files to an empty database, then run `npm run migrate` again and require every file to print `skip`.

## 6. Testing

**Backend.** The suite uses Node's built-in `node:test` runner against a real PostgreSQL database. `backend/test/database-guard.js` refuses to run unless `DB_NAME=musicapp_mvp001` and `DB_PORT` is not `5432`. **Never point the tests at a development, staging, or production database.** The fixture truncates every application table.

- **Cursor Cloud image:** `./.cursor/test-backend.sh`. It is Ubuntu-only: it uses `apt-get`, `pg_ctlcluster`, and `sudo -u postgres`.
- **Any machine with Docker** (requires PR #61's harness change, which resets fixtures over TCP as a named superuser):

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

**Frontend.** Run `cd frontend && pnpm test && pnpm lint && pnpm build`. The tests use Vitest 4, Testing Library, and jsdom 26. The build is `tsc -b && vite build`.

**Results on 2026-10-06:**

| Target | Backend | Frontend |
|---|---|---|
| `main` `9bda4b7` | 236 / 236 pass; migrations from empty plus skip re-run OK | 10 / 10 tests; lint clean; build OK |
| PR #61 (MVP-004) | 240 / 240 locally and on GitHub Actions (all four jobs green) | unchanged |
| PR #101 (MVP-027) | 241 / 241 | unchanged |
| PR #103 (MVP-025) | 248 / 248 | unchanged |
| PR #98 (MVP-010) | 258 / 258 | unchanged |
| All four combined with `main` (local trial) | 279 / 279 | unchanged |
| Local app smoke test of `main` | 27 / 27 HTTP checks (Section 8 flow) | dev server serves and compiles |

## 7. Capability status

21 of 52 work items are merged on `main`. Four more are reconciled PRs awaiting merge. 27 are not started.

| Stage | Merged on `main` | Open PR | Not started |
|---|---|---|---|
| 0 Foundation | MVP-001 module layout, MVP-002 test harness, MVP-003 idempotency/outbox/inbox | MVP-004 CI (#61) | — |
| 1 Identity | MVP-005 legacy routes removed, MVP-006 live status check, MVP-007 `authorize()`, MVP-008 roles and Administrator bootstrap | — | MVP-009 password reset and email verification |
| 2 Assets/Verification | — | MVP-010 uploads and R2 (#98) | MVP-011 retention and holds, MVP-012 identity verification |
| 3 Marketplace | MVP-013 server-side profile search | — | — |
| 4 Projects | MVP-014 invitations, MVP-015 state machine and term versions, MVP-016 amendments | — | — |
| 5 Milestones | MVP-017 term snapshots, MVP-018 state machine M01–M17, MVP-019 activation | — | — |
| 6 Deliverables | — | — | MVP-020–023 (submission, readiness, revision/approval, non-response) |
| 7 Escrow/Payments | MVP-024 funding intent, MVP-026 ledger | MVP-025 payment adapter (#103), MVP-027 fee schedule (#101) | — |
| 8 Release/Payout | MVP-029 refund execution | — | MVP-028 release, MVP-030 cancellation outcomes, MVP-052 payout |
| 9 Disputes | — | — | MVP-031–037 |
| 10 Messaging | MVP-038 conversations and tombstone | — | MVP-039 attachments, MVP-040 dispute evidence read |
| 11 Notifications | MVP-041 intents and in-app, MVP-042 preferences, MVP-043 email adapter and Resend | — | — |
| 12 Ratings | — | — | MVP-044–047 |
| 13 Hardening | — | — | MVP-048–051 |

The **critical path** continues at `MVP-020` (Deliverables). It needs `MVP-011`, which needs `MVP-010` (#98). The first full transaction (plan §6 checkpoint A) also needs `MVP-028`, `MVP-044`, `MVP-045`, `MVP-025`, and `MVP-012`.

## 8. What can be exercised, and how

**In the UI** (`frontend/src/App.tsx`):

- sign up (creates the user, profile, and credential);
- log in, restore the session, log out;
- Discover, with server-side search by name, handle, genre, city, or country;
- profile detail;
- create a Draft project. Amounts are entered in rupees and stored in paise. Milestones must sum to the total. Each milestone needs a deliverable catalogue selection and an explicit revision allowance; there is no default.
- the projects list and project detail;
- milestone locking by the Buyer.

**HTTP API only** (no screen yet). This flow was verified end to end on 2026-10-06:

- Project transitions: `POST /projects/:id/{propose,seek-seller,cancel,start,archive,restore}`.
- Seller invitations: `POST /projects/:id/invitations`, plus `…/:invitationId` review, accept, decline, withdraw.
- Amendments: `POST /projects/:id/amendments` and accept, reject, withdraw.
- Funding intent: `POST /projects/:id/funding-intent`. It creates the escrow and allocations with an empty fee snapshot until #101.
- Messaging: `POST/GET /projects/:projectExternalId/messages`, `…/:messageExternalId/tombstone`.
- Notifications: `GET /notifications`, `GET /notifications/:externalId`, `POST …/mark-read`.
- Most commands require `Idempotency-Key` and `expected_version`. `backend/test/*.http.test.js` shows exact request shapes.

**Internal services only.** These are built and tested but have no HTTP route and no production caller yet:

- the milestone transition service (M01–M17, `applyMilestoneTransition`);
- project system transitions (`applySystemTransition`);
- ledger posting (`postJournal`);
- refund execution (`executeRefundInstruction`);
- notification fan-out (`submitVerifiedEvent`);
- the email adapter (`sendEmail`).

Later items connect them.

## 9. External providers, adapters, and mocks

All three providers are **selected**. **No credentials are in the repository, by design**, and no live call has been verified.

| Provider | Purpose | Code | State | To activate |
|---|---|---|---|---|
| **Resend** | Email channel | `backend/src/notifications/email-adapter.js` (neutral, fails closed), `resend-adapter.js` | On `main` (MVP-043). Notification fan-out does not call email yet ([ENG-IMP-041](20-engineering/engineering-improvements.md)). Nothing renders email copy. | Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RESEND_FROM` (verified sender domain). Verify one live send. MVP-009 builds the first real email flows. |
| **Cashfree** | Buyer funding (later: payouts, MVP-052) | `backend/src/payments/` (`registry.js`, `mock-adapter.js`, `cashfree-adapter.js`), `backend/src/escrow/funding-confirmation.js` | PR #103 (MVP-025). The mock completes funding confirmation end to end in tests. Webhooks are HMAC-verified on the raw body with a timing-safe compare and deduplicated by event id. | Cashfree merchant approval. Set `PAYMENT_PROVIDER=cashfree`, `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_ENV`. Register the webhook URL `POST /payments/webhooks/cashfree`. **Known gap:** order creation omits `customer_details`, which Cashfree requires ([ENG-IMP-089](20-engineering/engineering-improvements.md), on #103). Fix it before going live. |
| **Cloudflare R2** | Asset storage | `backend/src/assets/` (`storage.js`, `local-storage.js`, `r2-storage.js` with in-house SigV4 presigning) | PR #98 (MVP-010). Acceptance uses the local adapter and a mock scanner. | Create a bucket and an API token. Set `ASSET_STORAGE_PROVIDER=r2` and the `R2_*` variables. Choose a real malware scanner (not selected). Verify multipart upload against the bucket. |

## 10. Known technical debt (highest impact first)

The full list is the [improvements register](20-engineering/engineering-improvements.md). None of it is authorized work.

- **Frontend coverage.** The frontend is one large module with no router, an untyped API client, and a hardcoded API base (ENG-IMP-002, -003). Most backend capabilities from MVP-014 onward have no screen.
- **Outbox.** Rows are written and never dispatched (ENG-IMP-023), so domain events do not reach consumers.
- **Error handling and configuration.** There is no central error handler (ENG-IMP-007). Configuration loads implicitly (ENG-IMP-005). Transaction boilerplate is duplicated (ENG-IMP-006). The backend has no lint (ENG-IMP-004).
- **Migration runner.** It has no checksum or drift detection (ENG-IMP-001).
- **Money width.** `projects.price_amount` and `payments` amounts are still 32-bit (ENG-IMP-050).
- **CI coverage.** CI does not run `pnpm build` (ENG-IMP-025). In CI the app role is a superuser (ENG-IMP-091, on #61).
- **Stale handbook snapshots.** The Engineering Handbook's "Current" snapshots predate the module split (ENG-IMP-022).
- **Stale records.** Build Record §4's verification stamp and some status rows are older than the code. Trust the code and the per-subsystem "Last materially changed" rows.

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

- Cashfree webhook signatures are verified, but the timestamp is not checked for freshness (replay is limited by event-id deduplication).
- Rejected webhook signatures are recorded as rows.
- Asset storage defaults to `local`.
- Governed Administrator grants and revocations fail closed until step-up authentication is specified (ENG-IMP-086).
- No secrets are committed. `.env` files are gitignored, and test credentials are placeholders.

## 12. Remaining external dependencies

- **Credentials:** Cloudflare R2 bucket and token; Cashfree merchant approval and API keys; Resend API key and a verified sender domain.
- **Malware scanner** for assets. It is not selected; an Assets specification open question.
- **Still-open product questions** (each specification's Open Questions section). Examples: chargeback and post-payout recovery (Escrow EQ5, Disputes EQ1), the step-up authentication proof (Authorization §35.2 item 8), the `ENG-IMP-036` notification classes, and retention periods (Escrow EQ11).
- **Hosting:** no deployment target, application Dockerfile, TLS, or observability exists ([Build Record §4.21](20-engineering/engineering-build-record.md#421-deployment-and-infrastructure)).

## 13. Open pull requests, branches, and GitHub administration

All four open implementation PRs were reconciled with `main` on 2026-10-06. Each passes its suite, and an independent review found no unresolved defect. They conflict with each other only in `backend/package.json`'s test list and in engineering-record table rows. After each merge, the next one is re-synchronized.

| PR | Item | Classification | Who merges | Why it is still open |
|---|---|---|---|---|
| #61 | MVP-004 CI | AUTONOMOUS-READY | Orchestrator, once the gates pass | Acceptance requires that a failing check blocks merge. That needs the ruleset change below first. |
| #101 | MVP-027 fee schedule | HUMAN-DECISION-REQUIRED | Human | Governance requires a human merge |
| #103 | MVP-025 payment adapter | EXTERNAL-DEPENDENCY | Human | Governance requires a human merge. Live Cashfree is outstanding. |
| #98 | MVP-010 assets/R2 | EXTERNAL-DEPENDENCY | Human | Governance requires a human merge. It also records the Product-confirmed asset limits in `assets-and-media.md` §7.3 (v1.2.0). |

**Pending administrator action.** Ruleset **24033491** ("Protect main — autonomous build") must require the status checks `lint`, `frontend-test`, `backend-test`, and `migration-dry-run` (GitHub → Settings → Rules → Rulesets). On 2026-10-01 an automation token received HTTP 403 when it tried to change this.

**Closed without merge.** PR #72 (full frontend screen set, retro theme). Its live calls are incompatible with the current API. Most of its screens simulate unbuilt features, and it would replace newer screens. It is preserved as tag `archive/pr-72-full-mvp-screens` and branch `frontend/full-mvp-screens`, and recorded as [ENG-IMP-090](20-engineering/engineering-improvements.md). The screen-by-screen comparison is on the PR.

**Branches.** Remote branches whose PR is merged and whose head equals the merged head (no later commits) were deleted on 2026-10-06. GitHub can restore any of them from its PR page. `legacy-main` (an unrelated initial commit containing only `.gitattributes`) is preserved as tag `archive/legacy-main`.

## 14. How to continue

1. Merge the four open PRs in the order given in [`autonomous-build-status.md`](19-implementation-planning/autonomous-build-status.md).
2. Pick the next `READY` item from the [issue index](19-implementation-planning/github-issue-index.md). After #98 merges, that is `MVP-011` on the critical path. `MVP-012` and `MVP-039` follow from it.
3. Follow the nine pre-implementation steps of [`AGENTS.md`](../AGENTS.md) §2 for every item. Update the Build Record, EDRs, and improvements register as §5 requires.
4. Do not redesign working subsystems ([Handbook §20](20-engineering/engineering-handbook.md#20-refactoring-and-replacement)). Do not decide open product questions in code ([`AGENTS.md`](../AGENTS.md) §4).
