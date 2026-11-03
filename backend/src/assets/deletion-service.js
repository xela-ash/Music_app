const pool = require("../../db/db");
const { enqueueOutboxMessage } = require("../infrastructure/outbox");
const repository = require("./repository");
const retention = require("./retention-repository");
const storage = require("./storage");

const SOFT_DELETE_FIELDS = new Set([
  "assetExternalId",
  "actorType",
  "actorId",
  "reasonCode",
  "correlationId",
]);
const SOFT_DELETE_FROM = [
  "ready",
  "archived",
  "expired",
  "rejected",
  "quarantined",
  "failed",
  "uploaded",
];
const ACTOR_TYPES = new Set(["system", "user", "moderator", "administrator"]);
const POLICY_VERSION = "2026-11-03";
const RECIPE_VERSION = "2026-11-03";

function rejection(status, body) {
  const error = new Error(body.error || "deletion rejected");
  error.status = status;
  error.body = body;
  return error;
}

function requireString(value, field, max = 200) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    return `${field} is required`;
  }
  return null;
}

function unknownField(body, allowed) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Request must be an object";
  }
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      return "Request contains an unknown field";
    }
  }
  return null;
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // keep the original error
    }
    throw error;
  } finally {
    client.release();
  }
}

async function requestSoftDelete(command) {
  const unknown = unknownField(command, SOFT_DELETE_FIELDS);
  if (unknown) {
    throw rejection(400, { error: unknown, code: "invalid_request" });
  }
  for (const [field, value] of [
    ["assetExternalId", command.assetExternalId],
    ["actorType", command.actorType],
    ["actorId", command.actorId],
    ["reasonCode", command.reasonCode],
  ]) {
    const message = requireString(value, field);
    if (message) {
      throw rejection(400, { error: message, code: "invalid_request" });
    }
  }
  if (!ACTOR_TYPES.has(command.actorType)) {
    throw rejection(422, { error: "actorType is not allowed", code: "invalid_actor" });
  }

  return withTransaction(async (client) => {
    const asset = await retention.lockAssetByExternalId(client, command.assetExternalId);
    if (!asset) {
      throw rejection(404, { error: "Asset not found", code: "asset_not_found" });
    }
    if (asset.state === "deleted") {
      throw rejection(409, { error: "Asset is already deleted", code: "asset_deleted" });
    }
    if (asset.state === "deletion_pending") {
      return {
        asset: {
          external_id: asset.external_id,
          state: asset.state,
          already_pending: true,
        },
      };
    }
    if (command.actorType === "user" && command.actorId !== asset.owner_user_id) {
      throw rejection(404, { error: "Asset not found", code: "asset_not_found" });
    }
    const activeBindings = await retention.countActiveBindings(client, asset.id);
    if (activeBindings > 0) {
      throw rejection(409, {
        error: "Asset still has an active binding",
        code: "active_binding",
      });
    }
    const policy = await retention.loadActivePolicy(client, asset.purpose);
    if (!policy) {
      throw rejection(503, {
        error: "No active retention policy is configured",
        code: "retention_policy_missing",
      });
    }
    const updated = await retention.softDeleteAsset(client, {
      assetId: asset.id,
      policyKey: policy.policy_key,
      policyVersion: policy.policy_version,
      softDeleteGraceSeconds: policy.soft_delete_grace_seconds,
      allowedFromStates: SOFT_DELETE_FROM,
    });
    if (!updated) {
      throw rejection(409, {
        error: "Asset cannot enter deletion pending from its current state",
        code: "invalid_state",
      });
    }
    const job = await retention.enqueueJob(client, {
      externalId: retention.newExternalId("apj"),
      assetId: asset.id,
      jobType: "physical_deletion",
      recipeName: "physical_deletion",
      recipeVersion: RECIPE_VERSION,
      idempotencyKey: `physical_deletion:${asset.external_id}`,
      priority: 50,
      availableAt: updated.retention_eligible_at,
    });
    await repository.insertAudit(client, {
      eventType: "AUD-ASSET-003",
      assetId: asset.id,
      sessionId: null,
      actorType: command.actorType,
      actorId: command.actorId,
      action: "asset.soft_deleted",
      outcome: "deletion_pending",
      reasonCode: command.reasonCode,
      correlationId: command.correlationId ?? null,
      policyVersion: `${policy.policy_key}:${policy.policy_version}`,
    });
    await enqueueOutboxMessage(client, {
      eventType: "AssetDeletionPending",
      aggregateType: "asset",
      aggregateId: asset.external_id,
      aggregateVersion: updated.row_version,
      payload: {
        reason_code: command.reasonCode,
        job_external_id: job.external_id,
        retention_eligible_at: updated.retention_eligible_at,
      },
    });
    return {
      asset: {
        external_id: updated.external_id,
        state: updated.state,
        deletion_requested_at: updated.deletion_requested_at,
        retention_eligible_at: updated.retention_eligible_at,
        retention_policy_key: updated.retention_policy_key,
        retention_policy_version: updated.retention_policy_version,
      },
      job: {
        external_id: job.external_id,
        state: job.state,
        inserted: job.inserted,
      },
    };
  });
}

async function processPhysicalDeletionJob(client, job) {
  if (!job.asset_id) {
    await retention.finishJob(client, {
      jobId: job.id,
      state: "dead_lettered",
      safeErrorCode: "missing_asset",
    });
    return { outcome: "dead_lettered", code: "missing_asset" };
  }
  const asset = await retention.lockAssetById(client, job.asset_id);
  if (!asset) {
    await retention.finishJob(client, {
      jobId: job.id,
      state: "dead_lettered",
      safeErrorCode: "asset_missing",
    });
    return { outcome: "dead_lettered", code: "asset_missing" };
  }
  if (asset.state === "deleted") {
    await retention.finishJob(client, { jobId: job.id, state: "succeeded" });
    return { outcome: "already_deleted", assetExternalId: asset.external_id };
  }
  if (asset.state !== "deletion_pending") {
    await retention.finishJob(client, {
      jobId: job.id,
      state: "failed",
      availableAt: new Date(Date.now() + 60_000),
      safeErrorCode: "not_deletion_pending",
    });
    return { outcome: "failed", code: "not_deletion_pending" };
  }
  const activeHolds = await retention.countActiveHolds(client, asset.id);
  if (activeHolds > 0) {
    await retention.finishJob(client, {
      jobId: job.id,
      state: "blocked_by_hold",
      availableAt: new Date(Date.now() + 60_000),
      safeErrorCode: "active_hold",
    });
    await repository.insertAudit(client, {
      eventType: "AUD-ASSET-003",
      assetId: asset.id,
      sessionId: null,
      actorType: "system",
      actorId: "asset-deletion-worker",
      action: "asset.physical_deletion_blocked",
      outcome: "blocked_by_hold",
      reasonCode: "active_hold",
      policyVersion: POLICY_VERSION,
    });
    return {
      outcome: "blocked_by_hold",
      assetExternalId: asset.external_id,
      activeHolds,
    };
  }
  if (asset.retention_eligible_at && new Date(asset.retention_eligible_at).getTime() > Date.now()) {
    await retention.finishJob(client, {
      jobId: job.id,
      state: "pending",
      availableAt: asset.retention_eligible_at,
      safeErrorCode: "grace_period",
    });
    return { outcome: "grace_period", assetExternalId: asset.external_id };
  }

  const objects = await retention.listStorageObjects(client, asset.id);
  for (const object of objects) {
    if (object.object_state === "absent") {
      continue;
    }
    storage.deleteObject(object.storage_key);
    const exists = storage.objectExists(object.storage_key);
    if (exists) {
      const nextAttempt = job.attempt_count >= job.maximum_attempts;
      await retention.finishJob(client, {
        jobId: job.id,
        state: nextAttempt ? "dead_lettered" : "failed",
        availableAt: nextAttempt ? null : new Date(Date.now() + 30_000),
        safeErrorCode: "provider_object_still_present",
      });
      return { outcome: nextAttempt ? "dead_lettered" : "failed", code: "provider_object_still_present" };
    }
    await retention.markStorageAbsent(client, object.id);
  }

  const deleted = await retention.markAssetDeleted(client, asset.id);
  if (!deleted) {
    await retention.finishJob(client, {
      jobId: job.id,
      state: "failed",
      availableAt: new Date(Date.now() + 30_000),
      safeErrorCode: "delete_race",
    });
    return { outcome: "failed", code: "delete_race" };
  }
  await retention.finishJob(client, { jobId: job.id, state: "succeeded" });
  await repository.insertAudit(client, {
    eventType: "AUD-ASSET-003",
    assetId: asset.id,
    sessionId: null,
    actorType: "system",
    actorId: "asset-deletion-worker",
    action: "asset.physically_deleted",
    outcome: "deleted",
    reasonCode: "provider_absence_verified",
    policyVersion: POLICY_VERSION,
  });
  await enqueueOutboxMessage(client, {
    eventType: "AssetPhysicallyDeleted",
    aggregateType: "asset",
    aggregateId: deleted.external_id,
    aggregateVersion: deleted.row_version,
    payload: {
      deleted_at: deleted.deleted_at,
      objects_removed: objects.length,
    },
  });
  return { outcome: "deleted", assetExternalId: deleted.external_id };
}

function providerFailureCode(error) {
  if (typeof error?.code === "string" && error.code.length > 0 && error.code.length <= 100) {
    return error.code;
  }
  return "provider_transient_failure";
}

async function markJobTransientFailure(job, error) {
  const exhausted = job.attempt_count >= job.maximum_attempts;
  const safeErrorCode = providerFailureCode(error);
  await withTransaction(async (client) => {
    await retention.finishJob(client, {
      jobId: job.id,
      state: exhausted ? "dead_lettered" : "failed",
      availableAt: exhausted ? null : new Date(Date.now() + 30_000),
      safeErrorCode,
    });
  });
  return {
    jobExternalId: job.external_id,
    outcome: exhausted ? "dead_lettered" : "failed",
    code: safeErrorCode,
  };
}

async function runDeletionWorker({ limit = 10, leaseOwner = "asset-deletion-worker", leaseSeconds = 30 } = {}) {
  const claimed = await withTransaction(async (client) =>
    retention.claimJobs(client, {
      jobType: "physical_deletion",
      limit,
      leaseOwner,
      leaseSeconds,
    })
  );
  const results = [];
  for (const job of claimed) {
    try {
      const result = await withTransaction(async (client) => processPhysicalDeletionJob(client, job));
      results.push({ jobExternalId: job.external_id, ...result });
    } catch (error) {
      // Claim already committed; a provider throw must release the lease (§18.3 / DATA-ASSET-006).
      results.push(await markJobTransientFailure(job, error));
    }
  }
  return { claimed: claimed.length, results };
}

module.exports = {
  requestSoftDelete,
  runDeletionWorker,
  SOFT_DELETE_FROM,
};
