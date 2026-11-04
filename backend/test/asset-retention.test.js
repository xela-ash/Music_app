const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  ensureMigrated,
  resetApplicationData,
  stopPool,
} = require("./harness");
const pool = require("../db/db");
const local = require("../src/assets/local-storage");
const { createHold, releaseHold } = require("../src/assets/hold-service");
const { requestSoftDelete, runDeletionWorker } = require("../src/assets/deletion-service");
const { runOrphanDetection } = require("../src/assets/orphan-service");

let storageDir = "";

function hexId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

async function createUser() {
  const result = await pool.query(
    `INSERT INTO users (external_id, email, status)
     VALUES ($1, $2, 'active')
     RETURNING id`,
    [hexId("usr"), `ret-${Date.now()}-${crypto.randomBytes(3).toString("hex")}@example.com`]
  );
  return result.rows[0].id;
}

async function createReadyAsset({ withBinding = false } = {}) {
  const userId = await createUser();
  const reserved = local.reserveObject();
  const finalPath = path.join(local.storageRoot(), "objects", reserved.key, "final");
  fs.writeFileSync(finalPath, Buffer.from("retention-bytes"));
  const manifestPath = path.join(local.storageRoot(), "objects", reserved.key, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.final = { size: "15", checksum: crypto.createHash("sha256").update("retention-bytes").digest("hex") };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  const asset = await pool.query(
    `INSERT INTO assets (
       external_id, owner_user_id, purpose, visibility, state,
       original_filename, normalized_filename, uploaded_by_user_id,
       size_bytes, detected_mime_type, checksum_algorithm, checksum,
       malware_scan_status, ready_at
     ) VALUES (
       $1, $2, 'other_project_file', 'relationship_restricted', 'ready',
       'take.bin', 'take.bin', $2,
       15, 'application/octet-stream', 'sha256', $3,
       'clean', clock_timestamp()
     )
     RETURNING id, external_id, owner_user_id`,
    [hexId("ast"), userId, manifest.final.checksum]
  );
  await pool.query(
    `INSERT INTO asset_storage_objects (
       external_id, asset_id, object_role, storage_provider, storage_bucket,
       storage_key, object_generation, classification, size_bytes, checksum, object_state
     ) VALUES ($1, $2, 'primary', $3, $4, $5, $6, 'private_original', 15, $7, 'present')`,
    [
      hexId("aso"),
      asset.rows[0].id,
      local.PROVIDER_KEY,
      local.BUCKET,
      reserved.key,
      reserved.generation,
      manifest.final.checksum,
    ]
  );
  if (withBinding) {
    const sellerId = await createUser();
    const project = await pool.query(
      `INSERT INTO projects (
         external_id, buyer_user_id, seller_user_id, title, requirements, state,
         price_amount, currency, delivery_days, revision_limit
       ) VALUES (
         $1, $2, $3, 'Retention', 'brief', 'draft',
         100, 'INR', 7, 1
       )
       RETURNING id`,
      [hexId("prj"), userId, sellerId]
    );
    await pool.query(
      `INSERT INTO asset_project_bindings (asset_id, project_id, purpose, created_by_user_id)
       VALUES ($1, $2, 'other_project_file', $3)`,
      [asset.rows[0].id, project.rows[0].id, userId]
    );
  }
  return {
    userId,
    assetId: asset.rows[0].id,
    assetExternalId: asset.rows[0].external_id,
    storageKey: reserved.key,
  };
}

async function bindVerificationDocument(userId, assetId) {
  const verification = await pool.query(
    `INSERT INTO profile_verifications (external_id, user_id, status)
     VALUES ($1, $2, 'submitted')
     RETURNING id`,
    [hexId("ver"), userId]
  );
  await pool.query(
    `INSERT INTO verification_documents (
       external_id, user_id, verification_id, doc_type, doc_side, country,
       asset_id, file_mime_type, is_current, status
     ) VALUES (
       $1, $2, $3, 'selfie', 'selfie', 'IN',
       $4, 'image/jpeg', true, 'uploaded'
     )`,
    [hexId("vdoc"), userId, verification.rows[0].id, assetId]
  );
}

describe("asset retention holds and deletion", () => {
  before(() => {
    ensureMigrated();
  });

  beforeEach(async () => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "musicapp-retention-"));
    process.env.ASSET_LOCAL_STORAGE_ROOT = storageDir;
    delete process.env.ASSET_STORAGE_PROVIDER;
    await resetApplicationData();
  });

  after(async () => {
    await stopPool();
    if (storageDir && fs.existsSync(storageDir)) {
      fs.rmSync(storageDir, { recursive: true, force: true });
    }
  });

  it("AC1: a held asset cannot be physically deleted while any hold is active", async () => {
    const fixture = await createReadyAsset();
    const hold = await createHold({
      assetExternalId: fixture.assetExternalId,
      holdType: "dispute",
      authorityActorType: "system",
      authorityActorId: "dispute-service",
      authorityReference: "dispute:case-1",
      reasonCode: "evidence_preservation",
    });
    assert.equal(hold.hold.state, "active");

    await requestSoftDelete({
      assetExternalId: fixture.assetExternalId,
      actorType: "system",
      actorId: "retention-test",
      reasonCode: "owner_requested",
    });

    const first = await runDeletionWorker({ limit: 5 });
    assert.equal(first.claimed, 1);
    assert.equal(first.results[0].outcome, "blocked_by_hold");

    const asset = await pool.query("SELECT state, deleted_at FROM assets WHERE id = $1", [
      fixture.assetId,
    ]);
    assert.equal(asset.rows[0].state, "deletion_pending");
    assert.equal(asset.rows[0].deleted_at, null);
    assert.equal(local.objectExists(fixture.storageKey), true);

    const objects = await pool.query(
      "SELECT object_state FROM asset_storage_objects WHERE asset_id = $1",
      [fixture.assetId]
    );
    assert.equal(objects.rows[0].object_state, "present");

    const blockedAudit = await pool.query(
      `SELECT action, outcome FROM asset_audit_events
       WHERE asset_id = $1 AND action = 'asset.physical_deletion_blocked'`,
      [fixture.assetId]
    );
    assert.equal(blockedAudit.rows.length, 1);
    assert.equal(blockedAudit.rows[0].outcome, "blocked_by_hold");
  });

  it("AC2: releasing all holds allows physical deletion", async () => {
    const fixture = await createReadyAsset();
    const hold = await createHold({
      assetExternalId: fixture.assetExternalId,
      holdType: "legal",
      authorityActorType: "administrator",
      authorityActorId: "admin-1",
      authorityReference: "legal:matter-9",
      reasonCode: "litigation_hold",
    });

    await requestSoftDelete({
      assetExternalId: fixture.assetExternalId,
      actorType: "system",
      actorId: "retention-test",
      reasonCode: "policy_expiry",
    });

    const blocked = await runDeletionWorker({ limit: 5 });
    assert.equal(blocked.results[0].outcome, "blocked_by_hold");

    const released = await releaseHold({
      holdExternalId: hold.hold.external_id,
      actorType: "administrator",
      actorId: "admin-1",
      releaseReasonCode: "matter_closed",
    });
    assert.equal(released.hold.state, "released");
    assert.equal(released.hold.active_holds_remaining, 0);

    const second = await runDeletionWorker({ limit: 5 });
    assert.equal(second.claimed, 1);
    assert.equal(second.results[0].outcome, "deleted");

    const asset = await pool.query("SELECT state, deleted_at FROM assets WHERE id = $1", [
      fixture.assetId,
    ]);
    assert.equal(asset.rows[0].state, "deleted");
    assert.ok(asset.rows[0].deleted_at);
    assert.equal(local.objectExists(fixture.storageKey), false);

    const objects = await pool.query(
      "SELECT object_state, absence_verified_at FROM asset_storage_objects WHERE asset_id = $1",
      [fixture.assetId]
    );
    assert.equal(objects.rows[0].object_state, "absent");
    assert.ok(objects.rows[0].absence_verified_at);

    const deletedAudit = await pool.query(
      `SELECT event_type, action, outcome FROM asset_audit_events
       WHERE asset_id = $1 AND action = 'asset.physically_deleted'`,
      [fixture.assetId]
    );
    assert.equal(deletedAudit.rows.length, 1);
    assert.equal(deletedAudit.rows[0].event_type, "AUD-ASSET-003");
  });

  it("BR-ASSET-017: one remaining hold still blocks after another hold is released", async () => {
    const fixture = await createReadyAsset();
    const first = await createHold({
      assetExternalId: fixture.assetExternalId,
      holdType: "financial",
      authorityActorType: "system",
      authorityActorId: "escrow",
      authorityReference: "escrow:1",
      reasonCode: "funding_dispute",
    });
    await createHold({
      assetExternalId: fixture.assetExternalId,
      holdType: "moderation",
      authorityActorType: "moderator",
      authorityActorId: "mod-1",
      authorityReference: "moderation:case-2",
      reasonCode: "review_open",
    });
    await requestSoftDelete({
      assetExternalId: fixture.assetExternalId,
      actorType: "system",
      actorId: "retention-test",
      reasonCode: "cleanup",
    });
    await releaseHold({
      holdExternalId: first.hold.external_id,
      actorType: "system",
      actorId: "escrow",
      releaseReasonCode: "resolved",
    });
    const run = await runDeletionWorker({ limit: 5 });
    assert.equal(run.results[0].outcome, "blocked_by_hold");
    assert.equal(run.results[0].activeHolds, 1);
    assert.equal(local.objectExists(fixture.storageKey), true);
  });

  it("SEC-ASSET-010: soft deletion leaves bytes until the worker verifies absence", async () => {
    const fixture = await createReadyAsset();
    const soft = await requestSoftDelete({
      assetExternalId: fixture.assetExternalId,
      actorType: "system",
      actorId: "retention-test",
      reasonCode: "soft_first",
    });
    assert.equal(soft.asset.state, "deletion_pending");
    assert.equal(local.objectExists(fixture.storageKey), true);

    const run = await runDeletionWorker({ limit: 5 });
    assert.equal(run.results[0].outcome, "deleted");
    assert.equal(local.objectExists(fixture.storageKey), false);

    const again = await runDeletionWorker({ limit: 5 });
    assert.equal(again.claimed, 0);
  });

  it("rejects ordinary users creating holds and refuses soft-delete while a binding remains", async () => {
    const fixture = await createReadyAsset({ withBinding: true });
    await assert.rejects(
      () =>
        createHold({
          assetExternalId: fixture.assetExternalId,
          holdType: "legal",
          authorityActorType: "user",
          authorityActorId: fixture.userId,
          authorityReference: "user:self",
          reasonCode: "nope",
        }),
      (error) => error.status === 422 && error.body.code === "hold_authority_denied"
    );
    await assert.rejects(
      () =>
        requestSoftDelete({
          assetExternalId: fixture.assetExternalId,
          actorType: "system",
          actorId: "retention-test",
          reasonCode: "still_bound",
        }),
      (error) => error.status === 409 && error.body.code === "active_binding"
    );
  });

  it("§18.3: verification_documents.asset_id is an active binding for soft-delete and orphan detection", async () => {
    const fixture = await createReadyAsset();
    await bindVerificationDocument(fixture.userId, fixture.assetId);

    await assert.rejects(
      () =>
        requestSoftDelete({
          assetExternalId: fixture.assetExternalId,
          actorType: "system",
          actorId: "retention-test",
          reasonCode: "verification_bound",
        }),
      (error) => error.status === 409 && error.body.code === "active_binding"
    );

    const unboundSibling = await createReadyAsset();
    const sweep = await runOrphanDetection();
    assert.ok(sweep.summary.unbound_asset >= 1);

    const candidates = await pool.query(
      `SELECT asset_id FROM asset_orphan_candidates
       WHERE candidate_kind = 'unbound_asset' AND state = 'quarantined'`
    );
    const orphanAssetIds = candidates.rows.map((row) => row.asset_id);
    assert.ok(orphanAssetIds.includes(unboundSibling.assetId));
    assert.equal(orphanAssetIds.includes(fixture.assetId), false);

    const asset = await pool.query("SELECT state FROM assets WHERE id = $1", [fixture.assetId]);
    assert.equal(asset.rows[0].state, "ready");
    assert.equal(local.objectExists(fixture.storageKey), true);
  });

  it("SEC-ASSET-009: orphan detection quarantines abandoned staging and untracked objects", async () => {
    const userId = await createUser();
    const reserved = local.reserveObject();
    const asset = await pool.query(
      `INSERT INTO assets (
         external_id, owner_user_id, purpose, visibility, state,
         original_filename, normalized_filename, uploaded_by_user_id
       ) VALUES (
         $1, $2, 'profile_avatar', 'relationship_restricted', 'upload_initiated',
         'a.png', 'a.png', $2
       )
       RETURNING id`,
      [hexId("ast"), userId]
    );
    const profile = await pool.query(
      `INSERT INTO profiles (external_id, user_id, handle, first_name, last_name, artist_name, display_name, city, country)
       VALUES ($1, $2, $3, 'Ada', 'Lovelace', 'Ada', 'Ada', 'Chennai', 'IN')
       RETURNING id`,
      [hexId("prf"), userId, `h-${Date.now()}`]
    );
    const session = await pool.query(
      `INSERT INTO asset_upload_sessions (
         external_id, asset_id, uploader_user_id, purpose, binding_type, profile_id,
         declared_size_bytes, max_size_bytes, method, state, staging_key, expires_at
       ) VALUES (
         $1, $2, $3, 'profile_avatar', 'profile', $4,
         10, 20000000, 'server_stream', 'expired', $5, clock_timestamp() - interval '1 hour'
       )
       RETURNING id`,
      [hexId("aus"), asset.rows[0].id, userId, profile.rows[0].id, reserved.key]
    );
    await pool.query("UPDATE assets SET upload_session_id = $2 WHERE id = $1", [
      asset.rows[0].id,
      session.rows[0].id,
    ]);
    await pool.query(
      `INSERT INTO asset_storage_objects (
         external_id, asset_id, object_role, storage_provider, storage_bucket,
         storage_key, object_generation, classification, object_state
       ) VALUES ($1, $2, 'staging', $3, $4, $5, $6, 'temporary_staging', 'present')`,
      [
        hexId("aso"),
        asset.rows[0].id,
        local.PROVIDER_KEY,
        local.BUCKET,
        reserved.key,
        reserved.generation,
      ]
    );

    const stray = local.reserveObject();
    const sweep = await runOrphanDetection();
    assert.ok(sweep.summary.abandoned_staging >= 1);
    assert.ok(sweep.summary.untracked_provider_object >= 1);

    const candidates = await pool.query(
      `SELECT candidate_kind, state FROM asset_orphan_candidates
       WHERE candidate_kind IN ('abandoned_staging', 'untracked_provider_object')
       ORDER BY candidate_kind`
    );
    assert.ok(candidates.rows.some((row) => row.candidate_kind === "abandoned_staging"));
    assert.ok(candidates.rows.some((row) => row.candidate_kind === "untracked_provider_object"));
    assert.ok(candidates.rows.every((row) => row.state === "quarantined"));
    assert.equal(local.objectExists(stray.key), true);
  });

  it("database constraints: hold release completeness, policy immutability, and ready soft-delete", async () => {
    const fixture = await createReadyAsset();
    const hold = await pool.query(
      `INSERT INTO asset_retention_holds (
         external_id, asset_id, hold_type, authority_actor_type, authority_actor_id,
         authority_reference, reason_code, state
       ) VALUES ($1, $2, 'fraud', 'system', 'fraud-engine', 'fraud:1', 'review', 'active')
       RETURNING id`,
      [hexId("arh"), fixture.assetId]
    );
    await assert.rejects(
      () =>
        pool.query(
          `UPDATE asset_retention_holds SET state = 'released' WHERE id = $1`,
          [hold.rows[0].id]
        ),
      /asset_retention_holds_release_complete/
    );
    await assert.rejects(
      () =>
        pool.query(
          `UPDATE asset_retention_policies SET soft_delete_grace_seconds = 5
           WHERE policy_key = 'mvp_default' AND policy_version = '2026-11-03'`
        ),
      /immutable/
    );

    await pool.query(
      `UPDATE assets
       SET state = 'deletion_pending',
           deletion_requested_at = clock_timestamp(),
           row_version = row_version + 1
       WHERE id = $1`,
      [fixture.assetId]
    );
    const pending = await pool.query("SELECT state FROM assets WHERE id = $1", [fixture.assetId]);
    assert.equal(pending.rows[0].state, "deletion_pending");

    const ready = await createReadyAsset();
    await assert.rejects(
      () => pool.query("UPDATE assets SET size_bytes = 16 WHERE id = $1", [ready.assetId]),
      /a ready asset is immutable/
    );
  });

  it("DATA-ASSET-006: expired leased physical_deletion jobs are reclaimed and retried", async () => {
    const fixture = await createReadyAsset();
    await requestSoftDelete({
      assetExternalId: fixture.assetExternalId,
      actorType: "system",
      actorId: "retention-test",
      reasonCode: "lease_recovery",
    });
    await pool.query(
      `UPDATE asset_processing_jobs
       SET state = 'leased',
           lease_owner = 'crashed-worker',
           lease_expires_at = clock_timestamp() - interval '1 second',
           attempt_count = 1,
           started_at = clock_timestamp() - interval '1 minute'
       WHERE asset_id = $1 AND job_type = 'physical_deletion'`,
      [fixture.assetId]
    );

    const run = await runDeletionWorker({ limit: 5, leaseOwner: "recovery-worker" });
    assert.equal(run.claimed, 1);
    assert.equal(run.results[0].outcome, "deleted");

    const job = await pool.query(
      `SELECT state, lease_owner, lease_expires_at FROM asset_processing_jobs
       WHERE asset_id = $1 AND job_type = 'physical_deletion'`,
      [fixture.assetId]
    );
    assert.equal(job.rows[0].state, "succeeded");
    assert.equal(job.rows[0].lease_owner, null);
    assert.equal(job.rows[0].lease_expires_at, null);
    assert.equal(local.objectExists(fixture.storageKey), false);
  });

  it("§18.3: a throw from storage.deleteObject releases the lease as failed for retry", async () => {
    const fixture = await createReadyAsset();
    await requestSoftDelete({
      assetExternalId: fixture.assetExternalId,
      actorType: "system",
      actorId: "retention-test",
      reasonCode: "provider_throw",
    });

    const originalDelete = local.deleteObject;
    local.deleteObject = () => {
      const error = new Error("simulated provider transient failure");
      error.code = "storage_provider_rejected";
      throw error;
    };
    try {
      const first = await runDeletionWorker({ limit: 5 });
      assert.equal(first.claimed, 1);
      assert.equal(first.results[0].outcome, "failed");
      assert.equal(first.results[0].code, "storage_provider_rejected");

      const leased = await pool.query(
        `SELECT state, lease_owner, lease_expires_at, safe_error_code
         FROM asset_processing_jobs
         WHERE asset_id = $1 AND job_type = 'physical_deletion'`,
        [fixture.assetId]
      );
      assert.equal(leased.rows[0].state, "failed");
      assert.equal(leased.rows[0].lease_owner, null);
      assert.equal(leased.rows[0].lease_expires_at, null);
      assert.equal(leased.rows[0].safe_error_code, "storage_provider_rejected");
      assert.equal(local.objectExists(fixture.storageKey), true);

      const asset = await pool.query("SELECT state FROM assets WHERE id = $1", [fixture.assetId]);
      assert.equal(asset.rows[0].state, "deletion_pending");
    } finally {
      local.deleteObject = originalDelete;
    }

    await pool.query(
      `UPDATE asset_processing_jobs
       SET available_at = clock_timestamp() - interval '1 second'
       WHERE asset_id = $1 AND job_type = 'physical_deletion'`,
      [fixture.assetId]
    );
    const second = await runDeletionWorker({ limit: 5 });
    assert.equal(second.claimed, 1);
    assert.equal(second.results[0].outcome, "deleted");
    assert.equal(local.objectExists(fixture.storageKey), false);
  });

  it("DATA-ASSET-006: holds and grace polls do not consume the provider deletion retry budget", async () => {
    const fixture = await createReadyAsset();
    const hold = await createHold({
      assetExternalId: fixture.assetExternalId,
      holdType: "dispute",
      authorityActorType: "system",
      authorityActorId: "dispute-service",
      authorityReference: "dispute:retry-budget",
      reasonCode: "evidence_preservation",
    });
    await requestSoftDelete({
      assetExternalId: fixture.assetExternalId,
      actorType: "system",
      actorId: "retention-test",
      reasonCode: "retry_budget",
    });
    await pool.query(
      `UPDATE asset_processing_jobs
       SET maximum_attempts = 2
       WHERE asset_id = $1 AND job_type = 'physical_deletion'`,
      [fixture.assetId]
    );

    for (let poll = 0; poll < 4; poll += 1) {
      const held = await runDeletionWorker({ limit: 5 });
      assert.equal(held.results[0].outcome, "blocked_by_hold");
      await pool.query(
        `UPDATE asset_processing_jobs
         SET available_at = clock_timestamp() - interval '1 second'
         WHERE asset_id = $1 AND job_type = 'physical_deletion'`,
        [fixture.assetId]
      );
    }

    await releaseHold({
      holdExternalId: hold.hold.external_id,
      actorType: "system",
      actorId: "dispute-service",
      releaseReasonCode: "case_closed",
    });
    await pool.query(
      `UPDATE assets
       SET retention_eligible_at = clock_timestamp() + interval '1 day'
       WHERE id = $1`,
      [fixture.assetId]
    );
    for (let poll = 0; poll < 4; poll += 1) {
      const deferred = await runDeletionWorker({ limit: 5 });
      assert.equal(deferred.results[0].outcome, "grace_period");
      await pool.query(
        `UPDATE asset_processing_jobs
         SET available_at = clock_timestamp() - interval '1 second'
         WHERE asset_id = $1 AND job_type = 'physical_deletion'`,
        [fixture.assetId]
      );
    }

    const untouched = await pool.query(
      `SELECT attempt_count, state FROM asset_processing_jobs
       WHERE asset_id = $1 AND job_type = 'physical_deletion'`,
      [fixture.assetId]
    );
    assert.equal(untouched.rows[0].attempt_count, 0);
    assert.equal(untouched.rows[0].state, "pending");

    await pool.query(
      `UPDATE assets SET retention_eligible_at = clock_timestamp() - interval '1 second' WHERE id = $1`,
      [fixture.assetId]
    );
    const originalDelete = local.deleteObject;
    local.deleteObject = () => {
      const error = new Error("provider still failing");
      error.code = "storage_provider_rejected";
      throw error;
    };
    try {
      const firstFailure = await runDeletionWorker({ limit: 5 });
      assert.equal(firstFailure.results[0].outcome, "failed");
      assert.equal(firstFailure.results[0].attemptCount, 1);
      await pool.query(
        `UPDATE asset_processing_jobs
         SET available_at = clock_timestamp() - interval '1 second'
         WHERE asset_id = $1 AND job_type = 'physical_deletion'`,
        [fixture.assetId]
      );
      const secondFailure = await runDeletionWorker({ limit: 5 });
      assert.equal(secondFailure.results[0].outcome, "dead_lettered");
      assert.equal(secondFailure.results[0].attemptCount, 2);
    } finally {
      local.deleteObject = originalDelete;
    }

    const exhausted = await pool.query(
      `SELECT state, attempt_count FROM asset_processing_jobs
       WHERE asset_id = $1 AND job_type = 'physical_deletion'`,
      [fixture.assetId]
    );
    assert.equal(exhausted.rows[0].state, "dead_lettered");
    assert.equal(exhausted.rows[0].attempt_count, 2);
    const asset = await pool.query("SELECT state FROM assets WHERE id = $1", [fixture.assetId]);
    assert.equal(asset.rows[0].state, "deletion_pending");
    assert.equal(local.objectExists(fixture.storageKey), true);
  });

  it("DATA-ASSET-006: one provider failure after hold release still leaves retry budget for deletion", async () => {
    const fixture = await createReadyAsset();
    const hold = await createHold({
      assetExternalId: fixture.assetExternalId,
      holdType: "legal",
      authorityActorType: "administrator",
      authorityActorId: "admin-1",
      authorityReference: "legal:retry-1",
      reasonCode: "litigation_hold",
    });
    await requestSoftDelete({
      assetExternalId: fixture.assetExternalId,
      actorType: "system",
      actorId: "retention-test",
      reasonCode: "after_hold",
    });
    await runDeletionWorker({ limit: 5 });
    await releaseHold({
      holdExternalId: hold.hold.external_id,
      actorType: "administrator",
      actorId: "admin-1",
      releaseReasonCode: "matter_closed",
    });
    await pool.query(
      `UPDATE assets SET retention_eligible_at = clock_timestamp() - interval '1 second' WHERE id = $1`,
      [fixture.assetId]
    );
    await pool.query(
      `UPDATE asset_processing_jobs
       SET available_at = clock_timestamp() - interval '1 second'
       WHERE asset_id = $1 AND job_type = 'physical_deletion'`,
      [fixture.assetId]
    );

    const originalDelete = local.deleteObject;
    local.deleteObject = () => {
      const error = new Error("one transient provider failure");
      error.code = "storage_provider_rejected";
      throw error;
    };
    try {
      const failed = await runDeletionWorker({ limit: 5 });
      assert.equal(failed.results[0].outcome, "failed");
      assert.equal(failed.results[0].attemptCount, 1);
    } finally {
      local.deleteObject = originalDelete;
    }
    await pool.query(
      `UPDATE asset_processing_jobs
       SET available_at = clock_timestamp() - interval '1 second'
       WHERE asset_id = $1 AND job_type = 'physical_deletion'`,
      [fixture.assetId]
    );
    const deleted = await runDeletionWorker({ limit: 5 });
    assert.equal(deleted.results[0].outcome, "deleted");
    const job = await pool.query(
      `SELECT state, attempt_count FROM asset_processing_jobs
       WHERE asset_id = $1 AND job_type = 'physical_deletion'`,
      [fixture.assetId]
    );
    assert.equal(job.rows[0].state, "succeeded");
    assert.equal(job.rows[0].attempt_count, 1);
    assert.equal(local.objectExists(fixture.storageKey), false);
  });

  it("concurrency: parallel hold creates for the same authority keep one active hold", async () => {
    const fixture = await createReadyAsset();
    const command = {
      assetExternalId: fixture.assetExternalId,
      holdType: "verification",
      authorityActorType: "system",
      authorityActorId: "verification",
      authorityReference: "verification:attempt-1",
      reasonCode: "attempt_open",
    };
    const results = await Promise.allSettled([createHold(command), createHold(command)]);
    const fulfilled = results.filter((row) => row.status === "fulfilled");
    const rejected = results.filter((row) => row.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.status, 409);
    const holds = await pool.query(
      `SELECT COUNT(*)::int AS count FROM asset_retention_holds
       WHERE asset_id = $1 AND state = 'active'`,
      [fixture.assetId]
    );
    assert.equal(holds.rows[0].count, 1);
  });
});
