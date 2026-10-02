const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { assertIsolatedDatabase } = require("./database-guard");

// Validate the target before dotenv or the pool can attach to a default database.
assertIsolatedDatabase();

const pool = require("../db/db");
const { app } = require("../Index");

const BACKEND_ROOT = path.join(__dirname, "..");

// Every application table. schema_migrations is intentionally absent so
// teardown clears rows without replaying migrations.
const APPLICATION_TABLES = [
  "role_audit_events",
  "role_assignments",
  "messaging_audit_events",
  "messages",
  "conversations",
  "notification_audit_events",
  "notification_deliveries",
  "notification_intents",
  "idempotency_keys",
  "outbox_messages",
  "inbox_events",
  "escrow_ledger",
  "escrow_allocations",
  "payments",
  "escrows",
  "escrow_fee_snapshots",
  "project_audit_events",
  "project_amendments",
  "project_state_transitions",
  "project_term_versions",
  "project_participants",
  "project_invitations",
  "milestone_term_versions",
  "milestone_state_transitions",
  "milestone_revision_requests",
  "milestone_approvals",
  "project_milestones",
  "projects",
  "verification_documents",
  "profile_verifications",
  "auth_credentials",
  "profiles",
  "users",
];

function ensureMigrated() {
  const result = spawnSync(process.execPath, ["db/migrate.js"], {
    cwd: BACKEND_ROOT,
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `Migrations failed (status ${result.status}).\n${result.stdout || ""}\n${result.stderr || ""}`
    );
  }
}

async function resetApplicationData() {
  // escrow_ledger rejects UPDATE, DELETE, and TRUNCATE for the application
  // role. The cluster superuser resets fixtures with session_replication_role
  // so that trigger does not fire. The application pool never sets that role.
  const sql = `TRUNCATE TABLE ${APPLICATION_TABLES.join(", ")} RESTART IDENTITY CASCADE`;
  const result = spawnSync(
    "sudo",
    [
      "-u",
      "postgres",
      "psql",
      "-p",
      String(process.env.DB_PORT),
      "-d",
      process.env.DB_NAME,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "SET session_replication_role = replica",
      "-c",
      sql,
      "-c",
      "SET session_replication_role = origin",
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(
      `Fixture reset failed (status ${result.status}).\n${result.stdout || ""}\n${result.stderr || ""}`
    );
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Test server did not bind a TCP port"));
        return;
      }
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
    server.on("error", reject);
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function stopPool() {
  await pool.end();
}

module.exports = {
  ensureMigrated,
  resetApplicationData,
  startServer,
  closeServer,
  stopPool,
};
