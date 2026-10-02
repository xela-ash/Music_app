const crypto = require("crypto");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeAssignmentExternalId() {
  return `ras_${crypto.randomBytes(10).toString("hex")}`;
}

function makeAuditExternalId() {
  return `rae_${crypto.randomBytes(10).toString("hex")}`;
}

function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function lockAdministratorRole(db) {
  return db.query(
    `SELECT id, name
     FROM platform_roles
     WHERE name = 'administrator'
     FOR UPDATE`
  );
}

function countActiveAdministrators(db) {
  return db.query(
    `SELECT COUNT(*)::int AS total
     FROM role_assignments assignment
     JOIN platform_roles role ON role.id = assignment.role_id
     WHERE role.name = 'administrator'
       AND assignment.state = 'active'
       AND (assignment.expires_at IS NULL OR assignment.expires_at > now())`
  );
}

function findUserStatus(db, userId) {
  return db.query(
    `SELECT id, status
     FROM users
     WHERE id = $1`,
    [userId]
  );
}

function findRoleByName(db, name) {
  return db.query(
    `SELECT id, name
     FROM platform_roles
     WHERE name = $1`,
    [name]
  );
}

function insertActiveAssignment(db, values) {
  return db.query(
    `INSERT INTO role_assignments (
       external_id, user_id, role_id, state, grant_source, granted_by, reason, expires_at
     )
     VALUES ($1, $2, $3, 'active', $4, $5, $6, $7)
     RETURNING id, external_id, user_id, role_id, state, grant_source, granted_by, granted_at, expires_at, reason`,
    values
  );
}

function insertAuditEvent(db, values) {
  return db.query(
    `INSERT INTO role_audit_events (
       external_id, role_assignment_id, role_holder_user_id, actor_kind, actor_user_id,
       role_id, scope, prior_state, new_state, reason, expires_at, step_up_assurance,
       correlation_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'platform', $7, $8, $9, $10, $11, $12)
     RETURNING id, external_id, new_state, actor_kind`,
    values
  );
}

function listActivePlatformRoleNames(db, userId) {
  return db.query(
    `SELECT role.name
     FROM role_assignments assignment
     JOIN platform_roles role ON role.id = assignment.role_id
     WHERE assignment.user_id = $1
       AND assignment.state = 'active'
       AND (assignment.expires_at IS NULL OR assignment.expires_at > now())
     ORDER BY role.name`,
    [userId]
  );
}

function findOpenAssignment(db, userId, roleName) {
  return db.query(
    `SELECT assignment.id, assignment.state, assignment.role_id, role.name
     FROM role_assignments assignment
     JOIN platform_roles role ON role.id = assignment.role_id
     WHERE assignment.user_id = $1
       AND role.name = $2
       AND assignment.state IN ('active', 'suspended')`,
    [userId, roleName]
  );
}

function markRevoked(db, assignmentId, reason) {
  return db.query(
    `UPDATE role_assignments
     SET state = 'revoked',
         revoked_at = now(),
         reason = $2
     WHERE id = $1
       AND state = 'active'
     RETURNING id, user_id, role_id, state, revoked_at, reason`,
    [assignmentId, reason]
  );
}

module.exports = {
  makeAssignmentExternalId,
  makeAuditExternalId,
  isUuid,
  lockAdministratorRole,
  countActiveAdministrators,
  findUserStatus,
  findRoleByName,
  insertActiveAssignment,
  insertAuditEvent,
  listActivePlatformRoleNames,
  findOpenAssignment,
  markRevoked,
};
