const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const pool = require("../db/db");
const users = require("../src/users/repository");
const { ensureMigrated, resetApplicationData, stopPool } = require("./harness");

function externalId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

async function insertUser() {
  const result = await users.insertActiveUser(
    pool,
    users.makeExternalId(),
    `verify-${crypto.randomBytes(4).toString("hex")}@example.com`,
    null
  );
  return result.rows[0];
}

async function insertAsset(userId, mime = "image/png") {
  const result = await pool.query(
    `INSERT INTO assets (
       external_id, owner_user_id, purpose, visibility, state,
       original_filename, normalized_filename, detected_mime_type, file_extension,
       size_bytes, checksum_algorithm, checksum, uploaded_by_user_id,
       malware_scan_status, ready_at
     ) VALUES (
       $1, $2, 'profile_avatar', 'relationship_restricted', 'ready',
       'id.png', 'id.png', $3, 'png',
       4, 'sha256', $4, $2, 'clean', clock_timestamp()
     ) RETURNING id`,
    [externalId("ast"), userId, mime, crypto.randomBytes(16).toString("hex")]
  );
  return result.rows[0];
}

async function insertVerification(userId, status, extra = {}) {
  const result = await pool.query(
    `INSERT INTO profile_verifications (
       external_id, user_id, status, submitted_at, reviewed_at, reviewed_by, review_notes, is_current
     ) VALUES (
       $1, $2, $3::verification_status,
       CASE WHEN $3 = 'not_started' THEN NULL ELSE clock_timestamp() END,
       $4, $5, $6, $7
     ) RETURNING id, external_id`,
    [
      externalId("pfv"),
      userId,
      status,
      extra.reviewedAt || null,
      extra.reviewedBy || null,
      extra.notes || null,
      extra.current !== false,
    ]
  );
  return result.rows[0];
}

async function pgError(sql, params) {
  try {
    await pool.query(sql, params);
    return null;
  } catch (err) {
    return err;
  }
}

describe("identity verification database constraints", { concurrency: 1, timeout: 30000 }, () => {
  before(async () => {
    ensureMigrated();
    await resetApplicationData();
  });

  after(async () => {
    try {
      await resetApplicationData();
    } finally {
      await stopPool();
    }
  });

  it("rejects a decision without a reviewer, a rejection without a reason, and a second current attempt", async () => {
    const user = await insertUser();
    const missingReviewer = await pgError(
      `INSERT INTO profile_verifications (external_id, user_id, status, submitted_at, reviewed_at)
       VALUES ($1, $2, 'approved', clock_timestamp(), clock_timestamp())`,
      [externalId("pfv"), user.id]
    );
    assert.match(missingReviewer.message, /profile_verifications_decision_actor_check/);

    const missingReason = await pgError(
      `INSERT INTO profile_verifications (
         external_id, user_id, status, submitted_at, reviewed_at, reviewed_by
       ) VALUES ($1, $2, 'rejected', clock_timestamp(), clock_timestamp(), $2)`,
      [externalId("pfv"), user.id]
    );
    assert.match(missingReason.message, /profile_verifications_rejection_reason_check/);

    await insertVerification(user.id, "submitted");
    const second = await pgError(
      `INSERT INTO profile_verifications (external_id, user_id, status, submitted_at, is_current)
       VALUES ($1, $2, 'submitted', clock_timestamp(), true)`,
      [externalId("pfv"), user.id]
    );
    assert.match(second.message, /profile_verifications_one_current_per_user/);
  });

  it("enforces document mime, side, current asset, and rejection reason checks", async () => {
    const user = await insertUser();
    const verification = await insertVerification(user.id, "submitted");
    const asset = await insertAsset(user.id);
    const badMime = await pgError(
      `INSERT INTO verification_documents (
         external_id, user_id, verification_id, doc_type, doc_side, country,
         asset_id, file_mime_type, status
       ) VALUES ($1, $2, $3, 'selfie', 'selfie', 'IN', $4, 'image/gif', 'submitted')`,
      [externalId("vdc"), user.id, verification.id, asset.id]
    );
    assert.match(badMime.message, /verification_documents_mime_allowed/);

    const badSide = await pgError(
      `INSERT INTO verification_documents (
         external_id, user_id, verification_id, doc_type, doc_side, country,
         asset_id, file_mime_type, status
       ) VALUES ($1, $2, $3, 'selfie', 'front', 'IN', $4, 'image/png', 'submitted')`,
      [externalId("vdc"), user.id, verification.id, asset.id]
    );
    assert.match(badSide.message, /verification_documents_type_side_consistent/);

    await pool.query(
      `INSERT INTO verification_documents (
         external_id, user_id, verification_id, doc_type, doc_side, country,
         asset_id, file_mime_type, status
       ) VALUES ($1, $2, $3, 'government_id', 'front', 'IN', $4, 'image/png', 'submitted')`,
      [externalId("vdc"), user.id, verification.id, asset.id]
    );
    const other = await insertAsset(user.id);
    const reused = await pgError(
      `INSERT INTO verification_documents (
         external_id, user_id, verification_id, doc_type, doc_side, country,
         asset_id, file_mime_type, status
       ) VALUES ($1, $2, $3, 'government_id', 'back', 'IN', $4, 'image/png', 'submitted')`,
      [externalId("vdc"), user.id, verification.id, asset.id]
    );
    assert.match(reused.message, /verification_documents_one_current_asset/);

    const missingDocumentReason = await pgError(
      `INSERT INTO verification_documents (
         external_id, user_id, verification_id, doc_type, doc_side, country,
         asset_id, file_mime_type, status
       ) VALUES ($1, $2, $3, 'selfie', 'selfie', 'IN', $4, 'image/jpeg', 'rejected')`,
      [externalId("vdc"), user.id, verification.id, other.id]
    );
    assert.match(missingDocumentReason.message, /verification_documents_rejection_reason_check/);
  });

  it("rejects direct updates and deletes of attempts, documents, grants, and audit rows", async () => {
    const user = await insertUser();
    const verification = await insertVerification(user.id, "not_started", { current: true });
    const update = await pgError(
      "UPDATE profile_verifications SET status = 'submitted', submitted_at = clock_timestamp() WHERE id = $1",
      [verification.id]
    );
    assert.match(update.message, /profile_verifications cannot be updated directly/);
    const deleted = await pgError("DELETE FROM profile_verifications WHERE id = $1", [verification.id]);
    assert.match(deleted.message, /profile_verifications cannot be deleted/);

    const submitted = await insertVerification(user.id, "submitted", { current: false });
    const asset = await insertAsset(user.id);
    const document = await pool.query(
      `INSERT INTO verification_documents (
         external_id, user_id, verification_id, doc_type, doc_side, country,
         asset_id, file_mime_type, is_current, status
       ) VALUES ($1, $2, $3, 'selfie', 'selfie', 'IN', $4, 'image/png', false, 'submitted')
       RETURNING id`,
      [externalId("vdc"), user.id, submitted.id, asset.id]
    );
    const documentUpdate = await pgError(
      "UPDATE verification_documents SET status = 'approved' WHERE id = $1",
      [document.rows[0].id]
    );
    assert.match(documentUpdate.message, /verification_documents cannot be updated directly/);

    const audit = await pool.query(
      `INSERT INTO verification_audit_events (
         external_id, event_type, verification_id, owning_user_id, actor_user_id,
         prior_status, new_status, correlation_id
       ) VALUES ($1, 'AUD-IDENTITY-001', $2, $3, $3, NULL, 'submitted', $4)
       RETURNING id`,
      [externalId("vae"), submitted.id, user.id, crypto.randomUUID()]
    );
    const auditUpdate = await pgError(
      "UPDATE verification_audit_events SET reason = 'changed' WHERE id = $1",
      [audit.rows[0].id]
    );
    assert.match(auditUpdate.message, /verification_audit_events is append-only/);
    const auditDelete = await pgError(
      "DELETE FROM verification_audit_events WHERE id = $1",
      [audit.rows[0].id]
    );
    assert.match(auditDelete.message, /verification_audit_events is append-only/);

    const grant = await pool.query(
      `INSERT INTO verification_access_grants (
         external_id, document_id, actor_user_id, token_hash, expires_at, created_at
       ) VALUES ($1, $2, $3, $4, clock_timestamp() - interval '30 seconds', clock_timestamp() - interval '1 minute')
       RETURNING id`,
      [externalId("vag"), document.rows[0].id, user.id, crypto.randomBytes(32).toString("hex")]
    );
    const grantUpdate = await pgError(
      "UPDATE verification_access_grants SET used_at = clock_timestamp() WHERE id = $1",
      [grant.rows[0].id]
    );
    assert.match(grantUpdate.message, /verification_access_grants cannot be updated directly/);
  });
});
