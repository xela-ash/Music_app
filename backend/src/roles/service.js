const crypto = require("crypto");
const pool = require("../../db/db");
const repository = require("./repository");
const { ROLE_ASSIGN, ROLE_REVOKE, authorize } = require("../authorization/authorize");

const BOOTSTRAP_REASON = "first_administrator_bootstrap";

function refusal(status, error) {
  return { status, body: { error } };
}

async function bootstrapFirstAdministrator(userId, db = pool) {
  if (!repository.isUuid(userId)) {
    return refusal(400, "user id is required");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const role = await repository.lockAdministratorRole(client);
    if (role.rowCount !== 1) {
      await client.query("ROLLBACK");
      return refusal(500, "Internal server error");
    }

    const existing = await repository.countActiveAdministrators(client);
    if (existing.rows[0].total > 0) {
      await client.query("ROLLBACK");
      return refusal(409, "An Administrator already exists");
    }

    const user = await repository.findUserStatus(client, userId);
    if (user.rowCount !== 1) {
      await client.query("ROLLBACK");
      return refusal(404, "User not found");
    }
    if (user.rows[0].status !== "active") {
      await client.query("ROLLBACK");
      return refusal(409, "User is not active");
    }

    const assignment = await repository.insertActiveAssignment(client, [
      repository.makeAssignmentExternalId(),
      userId,
      role.rows[0].id,
      "bootstrap",
      null,
      BOOTSTRAP_REASON,
      null,
    ]);
    const correlationId = crypto.randomUUID();
    await repository.insertAuditEvent(client, [
      repository.makeAuditExternalId(),
      assignment.rows[0].id,
      userId,
      "bootstrap",
      null,
      role.rows[0].id,
      null,
      "active",
      BOOTSTRAP_REASON,
      null,
      null,
      correlationId,
    ]);
    await client.query("COMMIT");
    return { status: 201, body: { assignment: assignment.rows[0] } };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_rollbackErr) {
      // The original error is the one the caller needs.
    }
    console.error(err);
    return refusal(500, "Internal server error");
  } finally {
    client.release();
  }
}

async function loadActivePlatformRoles(actorId, db = pool) {
  const result = await repository.listActivePlatformRoleNames(db, actorId);
  return result.rows.map((row) => row.name);
}

async function decideRoleCommand(actorId, action, db = pool) {
  const activePlatformRoles = await loadActivePlatformRoles(actorId, db);
  return authorize({ id: actorId }, action, { activePlatformRoles });
}

async function assignPlatformRole(actorId, db = pool) {
  const decision = await decideRoleCommand(actorId, ROLE_ASSIGN, db);
  if (!decision.allowed) {
    return { status: decision.status, body: { error: decision.error } };
  }
  return refusal(403, "step-up required");
}

async function revokePlatformRole(actorId, db = pool) {
  const decision = await decideRoleCommand(actorId, ROLE_REVOKE, db);
  if (!decision.allowed) {
    return { status: decision.status, body: { error: decision.error } };
  }
  return refusal(403, "step-up required");
}

module.exports = {
  BOOTSTRAP_REASON,
  bootstrapFirstAdministrator,
  decideRoleCommand,
  assignPlatformRole,
  revokePlatformRole,
};
