const { newExternalId } = require("./repository");

const HOLD_TYPES = new Set([
  "legal",
  "dispute",
  "financial",
  "fraud",
  "verification",
  "moderation",
]);

async function loadActivePolicy(client, purpose) {
  const result = await client.query(
    `SELECT policy_key, policy_version, purpose_scope, owning_domain,
            orphan_grace_seconds, staging_grace_seconds, replacement_grace_seconds,
            soft_delete_grace_seconds, decision_owner
     FROM asset_retention_policies
     WHERE retired_at IS NULL
       AND (purpose_scope = $1 OR purpose_scope = '*')
     ORDER BY CASE WHEN purpose_scope = $1 THEN 0 ELSE 1 END, effective_at DESC
     LIMIT 1`,
    [purpose]
  );
  return result.rows[0] ?? null;
}

async function lockAssetByExternalId(client, externalId) {
  const result = await client.query(
    `SELECT id, external_id, owner_user_id, purpose, state, row_version,
            retention_policy_key, retention_policy_version, retention_eligible_at,
            deletion_requested_at, deleted_at, archived_at
     FROM assets
     WHERE external_id = $1
     FOR UPDATE`,
    [externalId]
  );
  return result.rows[0] ?? null;
}

async function lockAssetById(client, assetId) {
  const result = await client.query(
    `SELECT id, external_id, owner_user_id, purpose, state, row_version,
            retention_policy_key, retention_policy_version, retention_eligible_at,
            deletion_requested_at, deleted_at, archived_at
     FROM assets
     WHERE id = $1
     FOR UPDATE`,
    [assetId]
  );
  return result.rows[0] ?? null;
}

async function countActiveBindings(client, assetId) {
  // Domain Asset FKs that still require availability (§18.3 / Handbook §13):
  // project bindings, profiles.profile_photo_asset_id, verification_documents.asset_id.
  const project = await client.query(
    `SELECT COUNT(*)::int AS count FROM asset_project_bindings WHERE asset_id = $1`,
    [assetId]
  );
  const profile = await client.query(
    `SELECT COUNT(*)::int AS count FROM profiles WHERE profile_photo_asset_id = $1`,
    [assetId]
  );
  const verification = await client.query(
    `SELECT COUNT(*)::int AS count FROM verification_documents WHERE asset_id = $1`,
    [assetId]
  );
  return project.rows[0].count + profile.rows[0].count + verification.rows[0].count;
}

async function insertHold(client, row) {
  const result = await client.query(
    `INSERT INTO asset_retention_holds (
       external_id, asset_id, hold_type, authority_actor_type, authority_actor_id,
       authority_reference, reason_code, scope_binding_type, scope_binding_id,
       state, starts_at, review_at, expires_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9,
       'active', COALESCE($10, clock_timestamp()), $11, $12
     )
     RETURNING id, external_id, hold_type, state, starts_at, review_at, expires_at,
               authority_reference, reason_code`,
    [
      row.externalId,
      row.assetId,
      row.holdType,
      row.authorityActorType,
      row.authorityActorId,
      row.authorityReference,
      row.reasonCode,
      row.scopeBindingType ?? null,
      row.scopeBindingId ?? null,
      row.startsAt ?? null,
      row.reviewAt ?? null,
      row.expiresAt ?? null,
    ]
  );
  return result.rows[0];
}

async function lockHoldByExternalId(client, externalId) {
  const result = await client.query(
    `SELECT id, external_id, asset_id, hold_type, state, authority_reference, reason_code
     FROM asset_retention_holds
     WHERE external_id = $1
     FOR UPDATE`,
    [externalId]
  );
  return result.rows[0] ?? null;
}

async function releaseHold(client, row) {
  const result = await client.query(
    `UPDATE asset_retention_holds
     SET state = 'released',
         released_at = clock_timestamp(),
         released_by_actor_type = $2,
         released_by_actor_id = $3,
         release_reason_code = $4,
         updated_at = clock_timestamp()
     WHERE id = $1 AND state = 'active'
     RETURNING id, external_id, asset_id, hold_type, state, released_at, release_reason_code`,
    [row.holdId, row.actorType, row.actorId, row.releaseReasonCode]
  );
  return result.rows[0] ?? null;
}

async function countActiveHolds(client, assetId) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM asset_retention_holds
     WHERE asset_id = $1 AND state = 'active'`,
    [assetId]
  );
  return result.rows[0].count;
}

async function softDeleteAsset(client, row) {
  const result = await client.query(
    `UPDATE assets
     SET state = 'deletion_pending',
         deletion_requested_at = clock_timestamp(),
         retention_policy_key = $2,
         retention_policy_version = $3,
         retention_eligible_at = clock_timestamp() + make_interval(secs => $4),
         updated_at = clock_timestamp(),
         row_version = row_version + 1
     WHERE id = $1 AND state = ANY($5::text[])
     RETURNING id, external_id, state, row_version, deletion_requested_at, retention_eligible_at,
               retention_policy_key, retention_policy_version`,
    [
      row.assetId,
      row.policyKey,
      row.policyVersion,
      row.softDeleteGraceSeconds,
      row.allowedFromStates,
    ]
  );
  return result.rows[0] ?? null;
}

async function enqueueJob(client, row) {
  const result = await client.query(
    `INSERT INTO asset_processing_jobs (
       external_id, asset_id, job_type, recipe_name, recipe_version, state,
       priority, maximum_attempts, available_at, idempotency_key
     ) VALUES (
       $1, $2, $3, $4, $5, 'pending',
       $6, $7, COALESCE($8, clock_timestamp()), $9
     )
     ON CONFLICT (idempotency_key) DO UPDATE
       SET state = CASE
             WHEN asset_processing_jobs.state IN ('succeeded', 'leased') THEN asset_processing_jobs.state
             ELSE 'pending'
           END,
           available_at = CASE
             WHEN asset_processing_jobs.state IN ('succeeded', 'leased') THEN asset_processing_jobs.available_at
             ELSE COALESCE($8, clock_timestamp())
           END,
           safe_error_code = CASE
             WHEN asset_processing_jobs.state IN ('succeeded', 'leased') THEN asset_processing_jobs.safe_error_code
             ELSE NULL
           END,
           lease_owner = CASE
             WHEN asset_processing_jobs.state = 'leased' THEN asset_processing_jobs.lease_owner
             ELSE NULL
           END,
           lease_expires_at = CASE
             WHEN asset_processing_jobs.state = 'leased' THEN asset_processing_jobs.lease_expires_at
             ELSE NULL
           END,
           updated_at = clock_timestamp()
     RETURNING id, external_id, asset_id, job_type, state, attempt_count, idempotency_key,
               (xmax = 0) AS inserted`,
    [
      row.externalId,
      row.assetId,
      row.jobType,
      row.recipeName,
      row.recipeVersion,
      row.priority ?? 100,
      row.maximumAttempts ?? 8,
      row.availableAt ?? null,
      row.idempotencyKey,
    ]
  );
  return result.rows[0];
}

async function claimJobs(client, row) {
  const result = await client.query(
    `WITH claimable AS (
       SELECT id
       FROM asset_processing_jobs
       WHERE job_type = $1
         AND (
           (
             state IN ('pending', 'failed', 'blocked_by_hold')
             AND available_at <= clock_timestamp()
             AND (lease_expires_at IS NULL OR lease_expires_at < clock_timestamp())
           )
           OR (
             state = 'leased'
             AND lease_expires_at IS NOT NULL
             AND lease_expires_at < clock_timestamp()
           )
         )
       ORDER BY priority ASC, available_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $2
     )
     UPDATE asset_processing_jobs j
     SET state = 'leased',
         lease_owner = $3,
         lease_expires_at = clock_timestamp() + make_interval(secs => $4),
         started_at = COALESCE(started_at, clock_timestamp()),
         attempt_count = attempt_count + 1,
         updated_at = clock_timestamp()
     FROM claimable
     WHERE j.id = claimable.id
     RETURNING j.id, j.external_id, j.asset_id, j.job_type, j.state, j.attempt_count,
               j.maximum_attempts, j.idempotency_key`,
    [row.jobType, row.limit, row.leaseOwner, row.leaseSeconds]
  );
  return result.rows;
}

async function listStorageObjects(client, assetId) {
  const result = await client.query(
    `SELECT id, external_id, object_role, storage_provider, storage_bucket, storage_key,
            object_generation, object_state, classification
     FROM asset_storage_objects
     WHERE asset_id = $1
     ORDER BY created_at ASC`,
    [assetId]
  );
  return result.rows;
}

async function markStorageAbsent(client, objectId) {
  await client.query(
    `UPDATE asset_storage_objects
     SET object_state = 'absent',
         deleted_at = COALESCE(deleted_at, clock_timestamp()),
         absence_verified_at = clock_timestamp()
     WHERE id = $1`,
    [objectId]
  );
}

async function markAssetDeleted(client, assetId) {
  const result = await client.query(
    `UPDATE assets
     SET state = 'deleted',
         deleted_at = clock_timestamp(),
         updated_at = clock_timestamp(),
         row_version = row_version + 1
     WHERE id = $1 AND state = 'deletion_pending'
     RETURNING id, external_id, state, row_version, deleted_at`,
    [assetId]
  );
  return result.rows[0] ?? null;
}

async function finishJob(client, row) {
  await client.query(
    `UPDATE asset_processing_jobs
     SET state = $2,
         finished_at = CASE WHEN $2 IN ('succeeded', 'dead_lettered') THEN clock_timestamp() ELSE finished_at END,
         available_at = COALESCE($3, available_at),
         lease_owner = NULL,
         lease_expires_at = NULL,
         safe_error_code = $4,
         dead_lettered_at = CASE WHEN $2 = 'dead_lettered' THEN clock_timestamp() ELSE dead_lettered_at END,
         updated_at = clock_timestamp()
     WHERE id = $1`,
    [row.jobId, row.state, row.availableAt ?? null, row.safeErrorCode ?? null]
  );
}

async function upsertOrphanCandidate(client, row) {
  if (row.assetId) {
    const existing = await client.query(
      `SELECT id, external_id, state, hold_blocked
       FROM asset_orphan_candidates
       WHERE asset_id = $1 AND candidate_kind = $2 AND state IN ('quarantined', 'eligible')
       FOR UPDATE`,
      [row.assetId, row.candidateKind]
    );
    if (existing.rows[0]) {
      await client.query(
        `UPDATE asset_orphan_candidates
         SET last_seen_at = clock_timestamp(),
             evidence = $2::jsonb,
             hold_blocked = $3,
             updated_at = clock_timestamp()
         WHERE id = $1`,
        [existing.rows[0].id, JSON.stringify(row.evidence), row.holdBlocked]
      );
      return { ...existing.rows[0], inserted: false };
    }
  }
  if (row.storageKey) {
    const existing = await client.query(
      `SELECT id, external_id, state, hold_blocked
       FROM asset_orphan_candidates
       WHERE storage_provider = $1 AND storage_bucket = $2 AND storage_key = $3
         AND object_generation IS NOT DISTINCT FROM $4
         AND state IN ('quarantined', 'eligible')
       FOR UPDATE`,
      [row.storageProvider, row.storageBucket, row.storageKey, row.objectGeneration ?? null]
    );
    if (existing.rows[0]) {
      await client.query(
        `UPDATE asset_orphan_candidates
         SET last_seen_at = clock_timestamp(),
             evidence = $2::jsonb,
             hold_blocked = $3,
             updated_at = clock_timestamp()
         WHERE id = $1`,
        [existing.rows[0].id, JSON.stringify(row.evidence), row.holdBlocked]
      );
      return { ...existing.rows[0], inserted: false };
    }
  }
  const result = await client.query(
    `INSERT INTO asset_orphan_candidates (
       external_id, candidate_kind, asset_id, upload_session_id, storage_provider,
       storage_bucket, storage_key, object_generation, evidence, state, hold_blocked
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9::jsonb, 'quarantined', $10
     )
     RETURNING id, external_id, state, hold_blocked`,
    [
      row.externalId,
      row.candidateKind,
      row.assetId ?? null,
      row.uploadSessionId ?? null,
      row.storageProvider ?? null,
      row.storageBucket ?? null,
      row.storageKey ?? null,
      row.objectGeneration ?? null,
      JSON.stringify(row.evidence),
      row.holdBlocked,
    ]
  );
  return { ...result.rows[0], inserted: true };
}

async function listExpiredAbandonedSessions(client, graceSeconds) {
  const result = await client.query(
    `SELECT s.id AS upload_session_id, s.external_id AS session_external_id, s.state AS session_state,
            s.staging_key, a.id AS asset_id, a.external_id AS asset_external_id, a.state AS asset_state,
            o.storage_provider, o.storage_bucket, o.storage_key, o.object_generation, o.object_state
     FROM asset_upload_sessions s
     JOIN assets a ON a.id = s.asset_id
     JOIN asset_storage_objects o ON o.asset_id = a.id AND o.object_role = 'staging'
     WHERE s.state IN ('created', 'uploading', 'expired', 'aborted')
       AND a.state NOT IN ('ready', 'deletion_pending', 'deleted')
       AND s.expires_at + make_interval(secs => $1) <= clock_timestamp()
       AND o.object_state = 'present'`,
    [graceSeconds]
  );
  return result.rows;
}

async function listUnboundAssets(client, graceSeconds) {
  const result = await client.query(
    `SELECT a.id AS asset_id, a.external_id AS asset_external_id, a.state AS asset_state, a.purpose,
            a.ready_at, a.updated_at
     FROM assets a
     WHERE a.state IN ('ready', 'archived', 'expired', 'rejected', 'quarantined')
       AND NOT EXISTS (
         SELECT 1 FROM asset_project_bindings b WHERE b.asset_id = a.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM profiles p WHERE p.profile_photo_asset_id = a.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM verification_documents v WHERE v.asset_id = a.id
       )
       AND COALESCE(a.ready_at, a.updated_at) + make_interval(secs => $1) <= clock_timestamp()`,
    [graceSeconds]
  );
  return result.rows;
}

async function listTrackedProviderKeys(client, provider, bucket) {
  const result = await client.query(
    `SELECT storage_key, object_generation, object_state
     FROM asset_storage_objects
     WHERE storage_provider = $1 AND storage_bucket = $2`,
    [provider, bucket]
  );
  return result.rows;
}

module.exports = {
  HOLD_TYPES,
  newExternalId,
  loadActivePolicy,
  lockAssetByExternalId,
  lockAssetById,
  countActiveBindings,
  insertHold,
  lockHoldByExternalId,
  releaseHold,
  countActiveHolds,
  softDeleteAsset,
  enqueueJob,
  claimJobs,
  listStorageObjects,
  markStorageAbsent,
  markAssetDeleted,
  finishJob,
  upsertOrphanCandidate,
  listExpiredAbandonedSessions,
  listUnboundAssets,
  listTrackedProviderKeys,
};
