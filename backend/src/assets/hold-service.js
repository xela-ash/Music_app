const pool = require("../../db/db");
const { enqueueOutboxMessage } = require("../infrastructure/outbox");
const repository = require("./repository");
const retention = require("./retention-repository");

const CREATE_FIELDS = new Set([
  "assetExternalId",
  "holdType",
  "authorityActorType",
  "authorityActorId",
  "authorityReference",
  "reasonCode",
  "scopeBindingType",
  "scopeBindingId",
  "startsAt",
  "reviewAt",
  "expiresAt",
  "correlationId",
]);
const RELEASE_FIELDS = new Set([
  "holdExternalId",
  "actorType",
  "actorId",
  "releaseReasonCode",
  "correlationId",
]);
const ACTOR_TYPES = new Set(["system", "moderator", "administrator"]);
const POLICY_VERSION = "2026-11-03";

function rejection(status, body) {
  const error = new Error(body.error || "hold rejected");
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

async function createHold(command) {
  const unknown = unknownField(command, CREATE_FIELDS);
  if (unknown) {
    throw rejection(400, { error: unknown, code: "invalid_request" });
  }
  for (const [field, value] of [
    ["assetExternalId", command.assetExternalId],
    ["holdType", command.holdType],
    ["authorityActorType", command.authorityActorType],
    ["authorityActorId", command.authorityActorId],
    ["authorityReference", command.authorityReference],
    ["reasonCode", command.reasonCode],
  ]) {
    const message = requireString(value, field);
    if (message) {
      throw rejection(400, { error: message, code: "invalid_request" });
    }
  }
  if (!retention.HOLD_TYPES.has(command.holdType)) {
    throw rejection(422, { error: "holdType is not allowed", code: "invalid_hold_type" });
  }
  if (!ACTOR_TYPES.has(command.authorityActorType)) {
    throw rejection(422, {
      error: "Ordinary users cannot place retention holds",
      code: "hold_authority_denied",
    });
  }
  if (command.correlationId !== undefined) {
    const message = requireString(command.correlationId, "correlationId", 255);
    if (message) {
      throw rejection(400, { error: message, code: "invalid_request" });
    }
  }

  try {
    return await withTransaction(async (client) => {
      const asset = await retention.lockAssetByExternalId(client, command.assetExternalId);
      if (!asset) {
        throw rejection(404, { error: "Asset not found", code: "asset_not_found" });
      }
      if (asset.state === "deleted") {
        throw rejection(409, { error: "Asset is already deleted", code: "asset_deleted" });
      }
      const hold = await retention.insertHold(client, {
        externalId: retention.newExternalId("arh"),
        assetId: asset.id,
        holdType: command.holdType,
        authorityActorType: command.authorityActorType,
        authorityActorId: command.authorityActorId,
        authorityReference: command.authorityReference,
        reasonCode: command.reasonCode,
        scopeBindingType: command.scopeBindingType,
        scopeBindingId: command.scopeBindingId,
        startsAt: command.startsAt,
        reviewAt: command.reviewAt,
        expiresAt: command.expiresAt,
      });
      await repository.insertAudit(client, {
        eventType: "AUD-ASSET-003",
        assetId: asset.id,
        sessionId: null,
        actorType: command.authorityActorType,
        actorId: command.authorityActorId,
        action: "asset.hold_created",
        outcome: "active",
        reasonCode: command.reasonCode,
        correlationId: command.correlationId ?? null,
        policyVersion: POLICY_VERSION,
      });
      await enqueueOutboxMessage(client, {
        eventType: "AssetHoldCreated",
        aggregateType: "asset",
        aggregateId: asset.external_id,
        aggregateVersion: asset.row_version,
        payload: {
          hold_external_id: hold.external_id,
          hold_type: hold.hold_type,
          authority_reference: hold.authority_reference,
        },
      });
      return {
        hold: {
          external_id: hold.external_id,
          asset_external_id: asset.external_id,
          hold_type: hold.hold_type,
          state: hold.state,
          authority_reference: hold.authority_reference,
          reason_code: hold.reason_code,
          starts_at: hold.starts_at,
          review_at: hold.review_at,
          expires_at: hold.expires_at,
        },
      };
    });
  } catch (error) {
    if (error && error.code === "23505") {
      throw rejection(409, {
        error: "An active hold with this authority reference already exists",
        code: "hold_conflict",
      });
    }
    throw error;
  }
}

async function releaseHold(command) {
  const unknown = unknownField(command, RELEASE_FIELDS);
  if (unknown) {
    throw rejection(400, { error: unknown, code: "invalid_request" });
  }
  for (const [field, value] of [
    ["holdExternalId", command.holdExternalId],
    ["actorType", command.actorType],
    ["actorId", command.actorId],
    ["releaseReasonCode", command.releaseReasonCode],
  ]) {
    const message = requireString(value, field);
    if (message) {
      throw rejection(400, { error: message, code: "invalid_request" });
    }
  }
  if (!ACTOR_TYPES.has(command.actorType)) {
    throw rejection(422, {
      error: "Ordinary users cannot release retention holds",
      code: "hold_authority_denied",
    });
  }

  return withTransaction(async (client) => {
    const hold = await retention.lockHoldByExternalId(client, command.holdExternalId);
    if (!hold) {
      throw rejection(404, { error: "Hold not found", code: "hold_not_found" });
    }
    if (hold.state === "released") {
      return {
        hold: {
          external_id: hold.external_id,
          state: "released",
          already_released: true,
        },
      };
    }
    const asset = await retention.lockAssetById(client, hold.asset_id);
    const released = await retention.releaseHold(client, {
      holdId: hold.id,
      actorType: command.actorType,
      actorId: command.actorId,
      releaseReasonCode: command.releaseReasonCode,
    });
    if (!released) {
      throw rejection(409, { error: "Hold was released concurrently", code: "hold_conflict" });
    }
    const remaining = await retention.countActiveHolds(client, hold.asset_id);
    await repository.insertAudit(client, {
      eventType: "AUD-ASSET-003",
      assetId: hold.asset_id,
      sessionId: null,
      actorType: command.actorType,
      actorId: command.actorId,
      action: "asset.hold_released",
      outcome: "released",
      reasonCode: command.releaseReasonCode,
      correlationId: command.correlationId ?? null,
      policyVersion: POLICY_VERSION,
    });
    await enqueueOutboxMessage(client, {
      eventType: "AssetHoldReleased",
      aggregateType: "asset",
      aggregateId: asset.external_id,
      aggregateVersion: asset.row_version,
      payload: {
        hold_external_id: released.external_id,
        hold_type: released.hold_type,
        active_holds_remaining: remaining,
      },
    });
    if (asset.state === "deletion_pending" && remaining === 0) {
      await retention.enqueueJob(client, {
        externalId: retention.newExternalId("apj"),
        assetId: asset.id,
        jobType: "physical_deletion",
        recipeName: "physical_deletion",
        recipeVersion: POLICY_VERSION,
        idempotencyKey: `physical_deletion:${asset.external_id}`,
        priority: 50,
      });
    }
    return {
      hold: {
        external_id: released.external_id,
        asset_external_id: asset.external_id,
        hold_type: released.hold_type,
        state: released.state,
        release_reason_code: released.release_reason_code,
        released_at: released.released_at,
        active_holds_remaining: remaining,
      },
    };
  });
}

module.exports = {
  createHold,
  releaseHold,
};
