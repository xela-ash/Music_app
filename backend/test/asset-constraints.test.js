const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const {
  ensureMigrated,
  resetApplicationData,
  stopPool,
} = require("./harness");
const pool = require("../db/db");

function hexId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

async function pgError(query, params) {
  try {
    await pool.query(query, params);
    return null;
  } catch (error) {
    return error;
  }
}

describe("asset constraints", () => {
  before(() => {
    ensureMigrated();
  });

  before(async () => {
    await resetApplicationData();
  });

  after(async () => {
    await stopPool();
  });

  it("rejects a negative size, an over-max declaration, deletion, and a ready mutation", async () => {
    const user = await pool.query(
      `INSERT INTO users (external_id, email, status)
       VALUES ($1, $2, 'active')
       RETURNING id`,
      [hexId("usr"), `asset-${Date.now()}@example.com`]
    );
    const userId = user.rows[0].id;
    const profile = await pool.query(
      `INSERT INTO profiles (external_id, user_id, handle, first_name, last_name, artist_name, display_name, city, country)
       VALUES ($1, $2, $3, 'Ada', 'Lovelace', 'Ada', 'Ada', $4, $5)
       RETURNING id`,
      [hexId("prf"), userId, `handle-${Date.now()}`, "Chennai", "IN"]
    );
    const asset = await pool.query(
      `INSERT INTO assets (
         external_id, owner_user_id, purpose, visibility, state,
         original_filename, normalized_filename, uploaded_by_user_id
       ) VALUES ($1, $2, 'profile_avatar', 'relationship_restricted', 'upload_initiated', 'a.png', 'a.png', $2)
       RETURNING id`,
      [hexId("ast"), userId]
    );
    const assetId = asset.rows[0].id;
    const session = await pool.query(
      `INSERT INTO asset_upload_sessions (
         external_id, asset_id, uploader_user_id, purpose, binding_type, profile_id,
         declared_size_bytes, max_size_bytes, method, state, staging_key, expires_at
       ) VALUES (
         $1, $2, $3, 'profile_avatar', 'profile', $4,
         10, 20000000, 'server_stream', 'created', $5, clock_timestamp() + interval '1 hour'
       ) RETURNING id`,
      [hexId("aus"), assetId, userId, profile.rows[0].id, crypto.randomBytes(16).toString("hex")]
    );
    await pool.query("UPDATE assets SET upload_session_id = $2 WHERE id = $1", [assetId, session.rows[0].id]);

    const negative = await pgError(
      "UPDATE assets SET size_bytes = -1 WHERE id = $1",
      [assetId]
    );
    assert.ok(negative);
    assert.match(negative.message, /assets_size_nonnegative/);

    const otherAsset = await pool.query(
      `INSERT INTO assets (
         external_id, owner_user_id, purpose, visibility, state,
         original_filename, normalized_filename, uploaded_by_user_id
       ) VALUES ($1, $2, 'profile_avatar', 'relationship_restricted', 'upload_initiated', 'b.png', 'b.png', $2)
       RETURNING id`,
      [hexId("ast"), userId]
    );
    const overMax = await pgError(
      `INSERT INTO asset_upload_sessions (
         external_id, asset_id, uploader_user_id, purpose, binding_type, profile_id,
         declared_size_bytes, max_size_bytes, method, state, staging_key, expires_at
       ) VALUES (
         $1, $2, $3, 'profile_avatar', 'profile', $4,
         11, 10, 'server_stream', 'created', $5, clock_timestamp() + interval '1 hour'
       )`,
      [hexId("aus"), otherAsset.rows[0].id, userId, profile.rows[0].id, crypto.randomBytes(16).toString("hex")]
    );
    assert.ok(overMax);
    assert.match(overMax.message, /asset_upload_sessions_declared_within_max/);

    const removed = await pgError("DELETE FROM assets WHERE id = $1", [assetId]);
    assert.ok(removed);
    assert.match(removed.message, /assets rows cannot be deleted/);

    await pool.query(
      `UPDATE assets
       SET state = 'ready', size_bytes = 10, detected_mime_type = 'image/png',
           checksum = 'abc', malware_scan_status = 'clean', ready_at = clock_timestamp()
       WHERE id = $1`,
      [assetId]
    );
    const mutated = await pgError(
      "UPDATE assets SET size_bytes = 11 WHERE id = $1",
      [assetId]
    );
    assert.ok(mutated);
    assert.match(mutated.message, /a ready asset is immutable/);

    const audit = await pool.query(
      `INSERT INTO asset_audit_events (
         external_id, event_type, asset_id, upload_session_id, actor_type, actor_id,
         action, outcome, policy_version
       ) VALUES ($1, 'AUD-ASSET-001', $2, $3, 'user', $4, 'asset.ready', 'ready', '2026-10-01')
       RETURNING id`,
      [hexId("aud"), assetId, session.rows[0].id, userId]
    );
    const auditDelete = await pgError("DELETE FROM asset_audit_events WHERE id = $1", [audit.rows[0].id]);
    assert.ok(auditDelete);
    assert.match(auditDelete.message, /asset_audit_events is append-only/);
  });
});
