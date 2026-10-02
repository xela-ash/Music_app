const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const pool = require("../db/db");
const users = require("../src/users/repository");
const roles = require("../src/roles/repository");
const service = require("../src/roles/service");
const { explicitUserId } = require("../src/roles/bootstrap-admin");
const { ROLE_ASSIGN, ROLE_REVOKE } = require("../src/authorization/authorize");
const {
  ensureMigrated,
  resetApplicationData,
  startServer,
  closeServer,
  stopPool,
} = require("./harness");

const BACKEND_ROOT = path.join(__dirname, "..");

async function insertUser(status = "active") {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const externalId = users.makeExternalId();
  const email = `role-${suffix}@example.com`;
  const result =
    status === "active"
      ? await users.insertActiveUser(pool, externalId, email, null)
      : await users.insertUser(pool, externalId, email, null, status);
  return result.rows[0];
}

describe("MVP-008 platform roles", { concurrency: 1, timeout: 30000 }, () => {
  let server;

  before(async () => {
    ensureMigrated();
    await resetApplicationData();
    const started = await startServer();
    server = started.server;
  });

  after(async () => {
    try {
      if (server) {
        await closeServer(server);
      }
      await resetApplicationData();
    } finally {
      await stopPool();
    }
  });

  it("refuses a bootstrap that does not name an active user", async () => {
    const missing = await service.bootstrapFirstAdministrator("not-a-uuid");
    assert.equal(missing.status, 400);

    const absent = await service.bootstrapFirstAdministrator(
      "00000000-0000-4000-8000-000000000000"
    );
    assert.equal(absent.status, 404);

    const suspended = await insertUser("suspended");
    const inactive = await service.bootstrapFirstAdministrator(suspended.id);
    assert.equal(inactive.status, 409);
    assert.equal(inactive.body.error, "User is not active");

    const rows = await pool.query("SELECT COUNT(*)::int AS total FROM role_assignments");
    assert.equal(rows.rows[0].total, 0);
  });

  it("bootstraps only the first Administrator and audits that grant", async () => {
    const first = await insertUser();
    const second = await insertUser();
    const created = await service.bootstrapFirstAdministrator(first.id);
    assert.equal(created.status, 201);
    assert.equal(created.body.assignment.user_id, first.id);
    assert.equal(created.body.assignment.grant_source, "bootstrap");
    assert.equal(created.body.assignment.granted_by, null);
    assert.equal(created.body.assignment.state, "active");

    const audit = await pool.query(
      `SELECT actor_kind, actor_user_id, prior_state, new_state, reason, step_up_assurance
       FROM role_audit_events
       WHERE role_assignment_id = $1`,
      [created.body.assignment.id]
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].actor_kind, "bootstrap");
    assert.equal(audit.rows[0].actor_user_id, null);
    assert.equal(audit.rows[0].prior_state, null);
    assert.equal(audit.rows[0].new_state, "active");
    assert.equal(audit.rows[0].reason, service.BOOTSTRAP_REASON);
    assert.equal(audit.rows[0].step_up_assurance, null);

    const repeat = await service.bootstrapFirstAdministrator(first.id);
    assert.equal(repeat.status, 409);
    const other = await service.bootstrapFirstAdministrator(second.id);
    assert.equal(other.status, 409);
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM role_assignments assignment
       JOIN platform_roles role ON role.id = assignment.role_id
       WHERE role.name = 'administrator' AND assignment.state = 'active'`
    );
    assert.equal(count.rows[0].total, 1);
  });

  it("enforces a granted Administrator and denies that role after revocation", async () => {
    const holder = await pool.query(
      `SELECT assignment.id, assignment.user_id
       FROM role_assignments assignment
       JOIN platform_roles role ON role.id = assignment.role_id
       WHERE role.name = 'administrator' AND assignment.state = 'active'`
    );
    const userId = holder.rows[0].user_id;
    const granted = await service.decideRoleCommand(userId, ROLE_ASSIGN);
    assert.deepEqual(granted, {
      allowed: false,
      status: 403,
      error: "step-up required",
    });
    const governed = await service.assignPlatformRole(userId);
    assert.equal(governed.status, 403);
    assert.equal(governed.body.error, "step-up required");
    const stillActive = await pool.query(
      "SELECT COUNT(*)::int AS total FROM role_assignments WHERE state = 'active'"
    );
    assert.equal(stillActive.rows[0].total, 1);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('musicapp.role_transition', 'on', true)");
      const revoked = await roles.markRevoked(client, holder.rows[0].id, "test revocation");
      assert.equal(revoked.rowCount, 1);
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const after = await service.decideRoleCommand(userId, ROLE_REVOKE);
    assert.deepEqual(after, {
      allowed: false,
      status: 403,
      error: "Forbidden",
    });
    const revokedCommand = await service.revokePlatformRole(userId);
    assert.equal(revokedCommand.body.error, "Forbidden");
  });

  it("does not let a Moderator assign an Administrator", async () => {
    const moderator = await insertUser();
    const role = await roles.findRoleByName(pool, "moderator");
    await roles.insertActiveAssignment(pool, [
      roles.makeAssignmentExternalId(),
      moderator.id,
      role.rows[0].id,
      "bootstrap",
      null,
      "fixture",
      null,
    ]);
    const decision = await service.decideRoleCommand(moderator.id, ROLE_ASSIGN);
    assert.equal(decision.error, "Forbidden");
    const outsider = await insertUser();
    const elevation = await service.assignPlatformRole(outsider.id);
    assert.equal(elevation.status, 403);
    assert.equal(elevation.body.error, "Forbidden");
  });

  it("ignores an expired assignment without a revocation", async () => {
    const user = await insertUser();
    const role = await roles.findRoleByName(pool, "administrator");
    await roles.insertActiveAssignment(pool, [
      roles.makeAssignmentExternalId(),
      user.id,
      role.rows[0].id,
      "bootstrap",
      null,
      "temporary",
      new Date(Date.now() - 60_000),
    ]);
    const decision = await service.decideRoleCommand(user.id, ROLE_ASSIGN);
    assert.equal(decision.error, "Forbidden");
  });

  it("rejects direct state changes, a second open assignment, and audit mutation", async () => {
    const user = await insertUser();
    const role = await roles.findRoleByName(pool, "moderator");
    const inserted = await roles.insertActiveAssignment(pool, [
      roles.makeAssignmentExternalId(),
      user.id,
      role.rows[0].id,
      "bootstrap",
      null,
      "constraint",
      null,
    ]);
    await assert.rejects(
      pool.query("UPDATE role_assignments SET state = 'revoked', revoked_at = now(), reason = 'no' WHERE id = $1", [
        inserted.rows[0].id,
      ]),
      /role assignment state is changed only by the role service/
    );
    await assert.rejects(
      roles.insertActiveAssignment(pool, [
        roles.makeAssignmentExternalId(),
        user.id,
        role.rows[0].id,
        "bootstrap",
        null,
        "duplicate",
        null,
      ]),
      /role_assignments_one_open_per_role|duplicate key/i
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO platform_roles (name, scope, description, is_temporary_only)
         VALUES ('system', 'platform', 'not a human role', false)`
      ),
      /platform_roles_name_check|check constraint/i
    );

    const audit = await pool.query("SELECT id FROM role_audit_events LIMIT 1");
    await assert.rejects(
      pool.query("UPDATE role_audit_events SET reason = 'changed' WHERE id = $1", [audit.rows[0].id]),
      /role_audit_events is append-only/
    );
    await assert.rejects(
      pool.query("DELETE FROM role_audit_events WHERE id = $1", [audit.rows[0].id]),
      /role_audit_events is append-only/
    );
  });

  it("does not expose a public bootstrap route", async () => {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const unauthenticated = await fetch(`${baseUrl}/roles/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: "00000000-0000-4000-8000-000000000000" }),
    });
    assert.equal(unauthenticated.status, 404);
    const alternate = await fetch(`${baseUrl}/admin/bootstrap`, { method: "POST" });
    assert.equal(alternate.status, 404);
  });

  it("requires one explicit user id on the CLI", () => {
    assert.deepEqual(explicitUserId([], {}), { error: "user id is required" });
    assert.deepEqual(explicitUserId(["--user-id", "user-1"], { BOOTSTRAP_ADMIN_USER_ID: "user-2" }), {
      error: "user id arguments disagree",
    });
    assert.deepEqual(explicitUserId(["--user-id", "user-1"], {}), { userId: "user-1" });
  });

  it("runs the CLI only for the named active user", async () => {
    await resetApplicationData();
    const user = await insertUser();
    const script = path.join(BACKEND_ROOT, "src/roles/bootstrap-admin.js");
    const first = spawnSync(process.execPath, [script, "--user-id", user.id], {
      cwd: BACKEND_ROOT,
      env: process.env,
      encoding: "utf8",
    });
    assert.equal(first.status, 0, first.stderr);
    const second = spawnSync(process.execPath, [script], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, BOOTSTRAP_ADMIN_USER_ID: user.id },
      encoding: "utf8",
    });
    assert.equal(second.status, 1, second.stdout);
    assert.match(second.stderr, /An Administrator already exists/);
  });
});
