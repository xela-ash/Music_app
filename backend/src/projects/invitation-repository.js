const crypto = require("crypto");

const INVITATION_FIELDS = `
  id, external_id, project_id, inviter_user_id, invitee_user_id,
  proposal_version, proposal_hash, status, expires_at, decided_at,
  withdrawn_at, version, created_at, updated_at
`;

const PARTICIPANT_FIELDS = `
  id, external_id, project_id, user_id, category, status,
  source_invitation_id, accepted_at, ended_at, created_at, updated_at
`;

function makeInvitationExternalId() {
  return `inv_${crypto.randomBytes(10).toString("hex")}`;
}

function makeParticipantExternalId() {
  return `ppt_${crypto.randomBytes(10).toString("hex")}`;
}

function makeAuditExternalId() {
  return `aud_${crypto.randomBytes(10).toString("hex")}`;
}

function lockProjectById(db, projectId) {
  return db.query(
    `SELECT id, external_id, buyer_user_id, seller_user_id, title, requirements,
            price_amount, currency, delivery_days, revision_limit, state, version,
            accepted_at
     FROM projects
     WHERE id = $1
     FOR UPDATE`,
    [projectId]
  );
}

function listMilestonesForHash(db, projectId) {
  return db.query(
    `SELECT milestone_no, title, description, amount, currency, due_at
     FROM project_milestones
     WHERE project_id = $1
     ORDER BY milestone_no`,
    [projectId]
  );
}

function proposalIsReady(db, projectId) {
  return db.query(
    `SELECT
       COUNT(*)::int AS milestone_count,
       COALESCE(bool_and(due_at IS NOT NULL AND due_at > clock_timestamp()), false) AS deadlines_future
     FROM project_milestones
     WHERE project_id = $1`,
    [projectId]
  );
}

function findPendingInvitation(db, projectId) {
  return db.query(
    `SELECT ${INVITATION_FIELDS}
     FROM project_invitations
     WHERE project_id = $1 AND status = 'pending'
     FOR UPDATE`,
    [projectId]
  );
}

function lockInvitation(db, projectId, externalId) {
  return db.query(
    `SELECT ${INVITATION_FIELDS}
     FROM project_invitations
     WHERE project_id = $1 AND external_id = $2
     FOR UPDATE`,
    [projectId, externalId]
  );
}

function findActiveSeller(db, projectId) {
  return db.query(
    `SELECT ${PARTICIPANT_FIELDS}
     FROM project_participants
     WHERE project_id = $1
       AND category = 'seller'
       AND status = 'active'`,
    [projectId]
  );
}

function findSellerParticipantForInvitation(db, invitationId) {
  return db.query(
    `SELECT external_id, category, status
     FROM project_participants
     WHERE source_invitation_id = $1
       AND category = 'seller'
       AND status = 'active'`,
    [invitationId]
  );
}

function expiryIsPast(db, expiresAt) {
  return db.query(`SELECT $1::timestamptz <= clock_timestamp() AS due`, [expiresAt]);
}

function insertInvitation(db, values) {
  return db.query(
    `INSERT INTO project_invitations (
       external_id, project_id, inviter_user_id, invitee_user_id,
       proposal_version, proposal_hash, status, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7::timestamptz)
     RETURNING ${INVITATION_FIELDS}`,
    values
  );
}

function insertBuyerParticipant(db, values) {
  return db.query(
    `INSERT INTO project_participants (
       external_id, project_id, user_id, category, status, accepted_at
     )
     VALUES ($1, $2, $3, 'buyer', 'active', now())
     RETURNING external_id`,
    values
  );
}

function insertSellerParticipant(db, values) {
  return db.query(
    `INSERT INTO project_participants (
       external_id, project_id, user_id, category, status, source_invitation_id, accepted_at
     )
     VALUES ($1, $2, $3, 'seller', 'active', $4, now())
     RETURNING external_id, category, status`,
    values
  );
}

function markInvitation(db, { id, status, decidedAt, withdrawnAt, nextVersion }) {
  return db.query(
    `UPDATE project_invitations
     SET status = $2::project_invitation_status,
         decided_at = $3::timestamptz,
         withdrawn_at = $4::timestamptz,
         version = $5,
         updated_at = clock_timestamp()
     WHERE id = $1
     RETURNING ${INVITATION_FIELDS}`,
    [id, status, decidedAt, withdrawnAt, nextVersion]
  );
}

function bumpProjectVersion(db, projectId, expectedVersion) {
  return db.query(
    `UPDATE projects
     SET version = version + 1,
         updated_at = clock_timestamp()
     WHERE id = $1 AND version = $2
     RETURNING version, external_id, accepted_at, seller_user_id, state`,
    [projectId, expectedVersion]
  );
}

function recordAcceptanceOnProject(db, projectId, inviteeUserId) {
  return db.query(
    `UPDATE projects
     SET seller_user_id = $2,
         accepted_at = COALESCE(accepted_at, clock_timestamp()),
         updated_at = clock_timestamp()
     WHERE id = $1
       AND (seller_user_id IS NULL OR seller_user_id = $2)
     RETURNING seller_user_id, accepted_at, state, version`,
    [projectId, inviteeUserId]
  );
}

function insertAuditEvent(db, values) {
  return db.query(
    `INSERT INTO project_audit_events (
       external_id, project_id, event_type, actor_type, actor_id, relationship,
       action, outcome, reason_code, source_state, target_state, aggregate_version,
       correlation_id, idempotency_key, change_hash
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    values
  );
}

module.exports = {
  makeInvitationExternalId,
  makeParticipantExternalId,
  makeAuditExternalId,
  lockProjectById,
  listMilestonesForHash,
  proposalIsReady,
  findPendingInvitation,
  lockInvitation,
  findActiveSeller,
  findSellerParticipantForInvitation,
  expiryIsPast,
  insertInvitation,
  insertBuyerParticipant,
  insertSellerParticipant,
  markInvitation,
  bumpProjectVersion,
  recordAcceptanceOnProject,
  insertAuditEvent,
};
