const crypto = require("crypto");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VERIFICATION_COLUMNS = `
  id, external_id, user_id, status, submitted_at, reviewed_at, reviewed_by,
  review_notes, is_current, created_at, updated_at
`;

const DOCUMENT_COLUMNS = `
  id, external_id, user_id, verification_id, doc_type, doc_side, country,
  id_type, asset_id, file_mime_type, is_current, status, rejection_reason,
  created_at, updated_at
`;

function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function makeExternalId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function enableTransition(client) {
  await client.query("SELECT set_config('musicapp.verification_transition', 'on', true)");
}

async function enableGrantUse(client) {
  await client.query("SELECT set_config('musicapp.verification_grant_use', 'on', true)");
}

function lockCurrentVerification(client, userId) {
  return client.query(
    `SELECT ${VERIFICATION_COLUMNS}
     FROM profile_verifications
     WHERE user_id = $1 AND is_current = true
     FOR UPDATE`,
    [userId]
  );
}

function lockVerificationByExternalId(client, externalId) {
  return client.query(
    `SELECT ${VERIFICATION_COLUMNS}
     FROM profile_verifications
     WHERE external_id = $1
     FOR UPDATE`,
    [externalId]
  );
}

function insertSubmittedVerification(client, externalId, userId) {
  return client.query(
    `INSERT INTO profile_verifications (
       external_id, user_id, status, submitted_at, is_current
     )
     VALUES ($1, $2, 'submitted', clock_timestamp(), true)
     RETURNING ${VERIFICATION_COLUMNS}`,
    [externalId, userId]
  );
}

function markSubmitted(client, verificationId) {
  return client.query(
    `UPDATE profile_verifications
     SET status = 'submitted',
         submitted_at = clock_timestamp()
     WHERE id = $1
       AND status = 'not_started'
       AND is_current = true
     RETURNING ${VERIFICATION_COLUMNS}`,
    [verificationId]
  );
}

function clearCurrent(client, verificationId) {
  return client.query(
    `UPDATE profile_verifications
     SET is_current = false
     WHERE id = $1
       AND is_current = true
     RETURNING id`,
    [verificationId]
  );
}

function clearCurrentDocuments(client, verificationId) {
  return client.query(
    `UPDATE verification_documents
     SET is_current = false
     WHERE verification_id = $1
       AND is_current = true`,
    [verificationId]
  );
}

function insertDocument(client, values) {
  return client.query(
    `INSERT INTO verification_documents (
       external_id, user_id, verification_id, doc_type, doc_side, country,
       id_type, asset_id, file_mime_type, is_current, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, 'submitted')
     RETURNING ${DOCUMENT_COLUMNS}`,
    values
  );
}

function listDocuments(client, verificationId) {
  return client.query(
    `SELECT ${DOCUMENT_COLUMNS}
     FROM verification_documents
     WHERE verification_id = $1
     ORDER BY created_at ASC, external_id ASC`,
    [verificationId]
  );
}

function lockDocument(client, verificationId, documentExternalId) {
  return client.query(
    `SELECT ${DOCUMENT_COLUMNS}
     FROM verification_documents
     WHERE verification_id = $1
       AND external_id = $2
     FOR UPDATE`,
    [verificationId, documentExternalId]
  );
}

function lockAssets(client, externalIds) {
  return client.query(
    `SELECT id, external_id, owner_user_id, state, detected_mime_type, size_bytes
     FROM assets
     WHERE external_id = ANY($1::text[])
     ORDER BY id
     FOR UPDATE`,
    [externalIds]
  );
}

function primaryStorageObject(client, assetId) {
  return client.query(
    `SELECT storage_provider, storage_bucket, storage_key, size_bytes, object_state
     FROM asset_storage_objects
     WHERE asset_id = $1
       AND object_role = 'primary'
       AND object_state = 'present'
     ORDER BY created_at DESC
     LIMIT 1`,
    [assetId]
  );
}

function decideVerification(client, verificationId, status, reviewerId, reason) {
  return client.query(
    `UPDATE profile_verifications
     SET status = $2::verification_status,
         reviewed_by = $3,
         reviewed_at = clock_timestamp(),
         review_notes = $4
     WHERE id = $1
       AND status = 'submitted'
       AND is_current = true
     RETURNING ${VERIFICATION_COLUMNS}`,
    [verificationId, status, reviewerId, reason]
  );
}

function decideDocuments(client, verificationId, status, reason) {
  return client.query(
    `UPDATE verification_documents
     SET status = $2::document_status,
         rejection_reason = CASE WHEN $2 = 'rejected' THEN $3 ELSE NULL END
     WHERE verification_id = $1
       AND is_current = true
       AND status = 'submitted'`,
    [verificationId, status, reason]
  );
}

function insertAudit(client, values) {
  return client.query(
    `INSERT INTO verification_audit_events (
       external_id, event_type, verification_id, owning_user_id, actor_user_id,
       document_id, prior_status, new_status, reason, correlation_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, external_id, event_type, prior_status, new_status, actor_user_id, reason`,
    values
  );
}

function listSubmitted(client, limit, offset) {
  return client.query(
    `SELECT ${VERIFICATION_COLUMNS}
     FROM profile_verifications
     WHERE is_current = true
       AND status = 'submitted'
     ORDER BY submitted_at ASC, id ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
}

function insertGrant(client, values) {
  return client.query(
    `INSERT INTO verification_access_grants (
       external_id, document_id, actor_user_id, token_hash, expires_at
     )
     VALUES ($1, $2, $3, $4, clock_timestamp() + make_interval(secs => $5))
     RETURNING id, external_id, expires_at`,
    values
  );
}

function lockGrantByHash(client, tokenHash) {
  return client.query(
    `SELECT id, document_id, actor_user_id, expires_at, used_at
     FROM verification_access_grants
     WHERE token_hash = $1
     FOR UPDATE`,
    [tokenHash]
  );
}

function markGrantUsed(client, grantId) {
  return client.query(
    `UPDATE verification_access_grants
     SET used_at = clock_timestamp()
     WHERE id = $1
       AND used_at IS NULL
       AND expires_at > clock_timestamp()
     RETURNING id`,
    [grantId]
  );
}

function listActivePlatformRoleNames(client, userId) {
  return client.query(
    `SELECT role.name
     FROM role_assignments assignment
     JOIN platform_roles role ON role.id = assignment.role_id
     WHERE assignment.user_id = $1
       AND assignment.state = 'active'
       AND (assignment.expires_at IS NULL OR assignment.expires_at > clock_timestamp())
     ORDER BY role.name`,
    [userId]
  );
}

module.exports = {
  isUuid,
  makeExternalId,
  hashToken,
  enableTransition,
  enableGrantUse,
  lockCurrentVerification,
  lockVerificationByExternalId,
  insertSubmittedVerification,
  markSubmitted,
  clearCurrent,
  clearCurrentDocuments,
  insertDocument,
  listDocuments,
  lockDocument,
  lockAssets,
  primaryStorageObject,
  decideVerification,
  decideDocuments,
  insertAudit,
  listSubmitted,
  insertGrant,
  lockGrantByHash,
  markGrantUsed,
  listActivePlatformRoleNames,
};
