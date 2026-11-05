const pool = require("../../db/db");
const { enqueueOutboxMessage } = require("../infrastructure/outbox");
const repository = require("./repository");
const retention = require("./retention-repository");
const storage = require("./storage");
const local = require("./local-storage");

const POLICY_VERSION = "2026-11-03";

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

async function recordCandidate(client, row) {
  const holdBlocked = row.assetId
    ? (await retention.countActiveHolds(client, row.assetId)) > 0
    : false;
  const candidate = await retention.upsertOrphanCandidate(client, {
    ...row,
    externalId: retention.newExternalId("aoc"),
    holdBlocked,
  });
  if (candidate.inserted) {
    await repository.insertAudit(client, {
      eventType: "AUD-ASSET-003",
      assetId: row.assetId ?? null,
      sessionId: row.uploadSessionId ?? null,
      actorType: "system",
      actorId: "asset-orphan-worker",
      action: "asset.orphan_detected",
      outcome: "quarantined",
      reasonCode: row.candidateKind,
      policyVersion: POLICY_VERSION,
    });
  }
  return { ...candidate, holdBlocked };
}

async function runOrphanDetection() {
  return withTransaction(async (client) => {
    const policy = await retention.loadActivePolicy(client, "*");
    if (!policy) {
      const error = new Error("No active retention policy is configured");
      error.status = 503;
      error.body = { error: error.message, code: "retention_policy_missing" };
      throw error;
    }

    const summary = {
      abandoned_staging: 0,
      unbound_asset: 0,
      untracked_provider_object: 0,
      missing_provider_object: 0,
      hold_blocked: 0,
    };

    const abandoned = await retention.listExpiredAbandonedSessions(
      client,
      policy.staging_grace_seconds
    );
    for (const row of abandoned) {
      const candidate = await recordCandidate(client, {
        candidateKind: "abandoned_staging",
        assetId: row.asset_id,
        uploadSessionId: row.upload_session_id,
        storageProvider: row.storage_provider,
        storageBucket: row.storage_bucket,
        storageKey: row.storage_key,
        objectGeneration: row.object_generation,
        evidence: {
          session_external_id: row.session_external_id,
          session_state: row.session_state,
          asset_state: row.asset_state,
          policy_key: policy.policy_key,
          policy_version: policy.policy_version,
        },
      });
      summary.abandoned_staging += 1;
      if (candidate.holdBlocked) {
        summary.hold_blocked += 1;
      }
    }

    const unbound = await retention.listUnboundAssets(client, policy.orphan_grace_seconds);
    for (const row of unbound) {
      const candidate = await recordCandidate(client, {
        candidateKind: "unbound_asset",
        assetId: row.asset_id,
        evidence: {
          asset_external_id: row.asset_external_id,
          asset_state: row.asset_state,
          purpose: row.purpose,
          policy_key: policy.policy_key,
          policy_version: policy.policy_version,
        },
      });
      summary.unbound_asset += 1;
      if (candidate.holdBlocked) {
        summary.hold_blocked += 1;
      }
    }

    const tracked = await retention.listTrackedProviderKeys(
      client,
      local.PROVIDER_KEY,
      local.BUCKET
    );
    const trackedKeys = new Set(tracked.map((row) => row.storage_key));
    for (const row of tracked) {
      if (row.object_state !== "present") {
        continue;
      }
      if (!storage.objectExists(row.storage_key)) {
        const assetRow = await client.query(
          `SELECT asset_id FROM asset_storage_objects WHERE storage_key = $1 LIMIT 1`,
          [row.storage_key]
        );
        const candidate = await recordCandidate(client, {
          candidateKind: "missing_provider_object",
          assetId: assetRow.rows[0]?.asset_id ?? null,
          storageProvider: local.PROVIDER_KEY,
          storageBucket: local.BUCKET,
          storageKey: row.storage_key,
          objectGeneration: row.object_generation,
          evidence: {
            direction: "database_to_provider",
            policy_key: policy.policy_key,
            policy_version: policy.policy_version,
          },
        });
        summary.missing_provider_object += 1;
        if (candidate.holdBlocked) {
          summary.hold_blocked += 1;
        }
      }
    }

    if (typeof local.listObjectKeys === "function") {
      for (const key of local.listObjectKeys()) {
        if (trackedKeys.has(key)) {
          continue;
        }
        const candidate = await recordCandidate(client, {
          candidateKind: "untracked_provider_object",
          storageProvider: local.PROVIDER_KEY,
          storageBucket: local.BUCKET,
          storageKey: key,
          evidence: {
            direction: "provider_to_database",
            policy_key: policy.policy_key,
            policy_version: policy.policy_version,
          },
        });
        summary.untracked_provider_object += 1;
        if (candidate.holdBlocked) {
          summary.hold_blocked += 1;
        }
      }
    }

    await enqueueOutboxMessage(client, {
      eventType: "AssetOrphanSweepCompleted",
      aggregateType: "asset_retention",
      aggregateId: `${policy.policy_key}:${policy.policy_version}`,
      aggregateVersion: 1,
      payload: summary,
    });

    return {
      policy: {
        key: policy.policy_key,
        version: policy.policy_version,
        orphan_grace_seconds: policy.orphan_grace_seconds,
        staging_grace_seconds: policy.staging_grace_seconds,
      },
      summary,
    };
  });
}

module.exports = {
  runOrphanDetection,
};
