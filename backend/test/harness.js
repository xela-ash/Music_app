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
  "escrow_ledger",
  "escrow_allocations",
  "payments",
  "escrows",
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
  await pool.query(
    `TRUNCATE TABLE ${APPLICATION_TABLES.join(", ")} RESTART IDENTITY CASCADE`
  );
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
