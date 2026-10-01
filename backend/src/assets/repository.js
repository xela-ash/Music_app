const crypto = require("crypto");

function newExternalId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

async function findProfileForUser(client, userId) {
  const result = await client.query(
    `SELECT id, user_id
     FROM profiles
     WHERE user_id = $1
     FOR UPDATE`,
    [userId]
  );
  return result.rows[0] ?? null;
}

async function lockProjectByExternalId(client, externalId) {
  const result = await client.query(
    `SELECT p.id, p.external_id, p.buyer_user_id,
            (SELECT pp.user_id
             FROM project_participants pp
             WHERE pp.project_id = p.id AND pp.category = 'seller' AND pp.status = 'active'
             LIMIT 1) AS active_seller_user_id
     FROM projects p
     WHERE p.external_id = $1
     FOR UPDATE`,
    [externalId]
  );
  return result.rows[0] ?? null;
}

async function projectReservedBytes(client, projectId) {
  const result = await client.query(
    `SELECT COALESCE(SUM(
        CASE
          WHEN a.state = 'expired' THEN 0
          WHEN s.state = 'sealed' AND a.size_bytes IS NOT NULL THEN a.size_bytes
          WHEN s.state IN ('created', 'uploading') THEN s.declared_size_bytes
          ELSE 0
        END
      ), 0)::text AS reserved
     FROM asset_upload_sessions s
     JOIN assets a ON a.id = s.asset_id
     WHERE s.project_id = $1`,
    [projectId]
  );
  return BigInt(result.rows[0].reserved);
}

async function insertOriginalAsset(client, row) {
  const result = await client.query(
    `INSERT INTO assets (
       external_id, owner_user_id, purpose, visibility, state,
       original_filename, normalized_filename, declared_mime_type, file_extension,
       uploaded_by_user_id, moderation_status, malware_scan_status
     ) VALUES (
       $1, $2, $3, 'relationship_restricted', 'upload_initiated',
       $4, $5, $6, $7,
       $2, 'not_required', 'pending'
     )
     RETURNING id, external_id, state, row_version`,
    [
      row.externalId,
      row.ownerUserId,
      row.purpose,
      row.originalFilename,
      row.normalizedFilename,
      row.declaredMimeType,
      row.fileExtension,
    ]
  );
  return result.rows[0];
}

async function insertSession(client, row) {
  const result = await client.query(
    `INSERT INTO asset_upload_sessions (
       external_id, asset_id, uploader_user_id, purpose, binding_type,
       profile_id, project_id, declared_size_bytes, max_size_bytes, method,
       state, staging_key, expires_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       'created', $11, clock_timestamp() + ($12::text || ' seconds')::interval
     )
     RETURNING id, external_id, state, method, expires_at, max_size_bytes, declared_size_bytes, staging_key`,
    [
      row.externalId,
      row.assetId,
      row.uploaderUserId,
      row.purpose,
      row.bindingType,
      row.profileId,
      row.projectId,
      row.declaredSizeBytes.toString(),
      row.maxSizeBytes.toString(),
      row.method,
      row.stagingKey,
      String(row.ttlSeconds),
    ]
  );
  await client.query(
    `UPDATE assets SET upload_session_id = $2, updated_at = clock_timestamp() WHERE id = $1`,
    [row.assetId, result.rows[0].id]
  );
  return result.rows[0];
}

async function insertStorageObject(client, row) {
  await client.query(
    `INSERT INTO asset_storage_objects (
       external_id, asset_id, object_role, storage_provider, storage_bucket,
       storage_key, object_generation, classification, size_bytes, checksum
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      newExternalId("aso"),
      row.assetId,
      row.objectRole,
      row.provider,
      row.bucket,
      row.key,
      row.generation,
      row.classification,
      row.sizeBytes === null || row.sizeBytes === undefined ? null : row.sizeBytes.toString(),
      row.checksum ?? null,
    ]
  );
}

async function insertProjectBinding(client, row) {
  await client.query(
    `INSERT INTO asset_project_bindings (asset_id, project_id, purpose, created_by_user_id)
     VALUES ($1, $2, $3, $4)`,
    [row.assetId, row.projectId, row.purpose, row.userId]
  );
}

async function insertAudit(client, row) {
  await client.query(
    `INSERT INTO asset_audit_events (
       external_id, event_type, asset_id, upload_session_id, actor_type, actor_id,
       action, outcome, reason_code, correlation_id, policy_version
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      newExternalId("aud"),
      row.eventType,
      row.assetId,
      row.sessionId,
      row.actorType,
      row.actorId,
      row.action,
      row.outcome,
      row.reasonCode ?? null,
      row.correlationId ?? null,
      row.policyVersion,
    ]
  );
}

async function lockSession(client, externalId) {
  const result = await client.query(
    `SELECT s.id, s.external_id, s.asset_id, s.uploader_user_id, s.purpose, s.binding_type,
            s.profile_id, s.project_id, s.declared_size_bytes::text AS declared_size_bytes,
            s.max_size_bytes::text AS max_size_bytes, s.method, s.state, s.staging_key,
            s.expires_at, a.external_id AS asset_external_id, a.state AS asset_state,
            a.row_version, o.storage_provider, o.object_generation
     FROM asset_upload_sessions s
     JOIN assets a ON a.id = s.asset_id
     JOIN asset_storage_objects o ON o.asset_id = a.id AND o.object_role = 'staging'
     WHERE s.external_id = $1
     FOR UPDATE`,
    [externalId]
  );
  return result.rows[0] ?? null;
}

async function markUploading(client, sessionId, assetId) {
  await client.query(
    `UPDATE asset_upload_sessions
     SET state = 'uploading', updated_at = clock_timestamp()
     WHERE id = $1 AND state IN ('created', 'uploading')`,
    [sessionId]
  );
  await client.query(
    `UPDATE assets
     SET state = 'uploading', updated_at = clock_timestamp(), row_version = row_version + 1
     WHERE id = $1 AND state IN ('upload_initiated', 'uploading')`,
    [assetId]
  );
}

async function sealSession(client, row) {
  await client.query(
    `UPDATE asset_upload_sessions
     SET state = 'sealed', observed_size_bytes = $2, sealed_at = clock_timestamp(), updated_at = clock_timestamp()
     WHERE id = $1`,
    [row.sessionId, row.observedSize.toString()]
  );
  await client.query(
    `UPDATE assets
     SET state = $2,
         size_bytes = $3,
         checksum_algorithm = $4,
         checksum = $5,
         detected_mime_type = $6,
         width = $7,
         height = $8,
         malware_scan_status = $9,
         quarantine_reason = $10,
         ready_at = CASE WHEN $2 = 'ready' THEN clock_timestamp() ELSE NULL END,
         updated_at = clock_timestamp(),
         row_version = row_version + 1
     WHERE id = $1`,
    [
      row.assetId,
      row.state,
      row.observedSize.toString(),
      row.checksumAlgorithm,
      row.checksum,
      row.detectedMime,
      row.width,
      row.height,
      row.scanStatus,
      row.quarantineReason,
    ]
  );
}

async function publicSession(client, sessionId) {
  const result = await client.query(
    `SELECT s.external_id, s.state, s.method, s.purpose, s.expires_at,
            s.max_size_bytes::text AS max_size_bytes,
            s.declared_size_bytes::text AS declared_size_bytes,
            a.external_id AS asset_external_id, a.state AS asset_state,
            a.size_bytes::text AS size_bytes, a.detected_mime_type,
            a.malware_scan_status, a.width, a.height
     FROM asset_upload_sessions s
     JOIN assets a ON a.id = s.asset_id
     WHERE s.id = $1`,
    [sessionId]
  );
  return result.rows[0];
}

module.exports = {
  newExternalId,
  findProfileForUser,
  lockProjectByExternalId,
  projectReservedBytes,
  insertOriginalAsset,
  insertSession,
  insertStorageObject,
  insertProjectBinding,
  insertAudit,
  lockSession,
  markUploading,
  sealSession,
  publicSession,
};
