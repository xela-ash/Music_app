const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const {
  ensureMigrated,
  resetApplicationData,
  startServer,
  closeServer,
  stopPool,
} = require("./harness");
const pool = require("../db/db");

let baseUrl = "";
let server;
let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

async function request(method, requestPath, { body } = {}) {
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: response.status, json, text };
}

async function signup(tag) {
  const email = `${tag}@example.com`;
  const created = await request("POST", "/auth/signup", {
    body: {
      email,
      password: "password-1",
      handle: `${tag}-handle`,
      first_name: "Ada",
      last_name: "Lovelace",
      artist_name: `${tag} Artist`,
      display_name: `${tag} Display`,
      genres: ["classical"],
      city: "Chennai",
      country: "IN",
    },
  });
  assert.equal(created.status, 201, created.text);
  return created.json.user.id;
}

function hexId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function dedupe() {
  return crypto.randomBytes(32).toString("hex");
}

async function pgError(query, params) {
  try {
    await pool.query(query, params);
    return null;
  } catch (err) {
    return err;
  }
}

async function insertIntent(recipientUserId, topic, sourceEventId) {
  const result = await pool.query(
    `INSERT INTO notification_intents (
       external_id, recipient_user_id, topic, mandatory_class,
       source_domain, source_event_id, dedupe_key, template_reference
     )
     VALUES ($1, $2, $3, 'MANDATORY', 'Disputes', $4, $5, $6)
     RETURNING id, external_id`,
    [
      hexId("ntf"),
      recipientUserId,
      topic,
      sourceEventId,
      dedupe(),
      `topic:${topic}`,
    ]
  );
  return result.rows[0];
}

describe("notification database constraints", { concurrency: 1, timeout: 30000 }, () => {
  before(async () => {
    ensureMigrated();
    await resetApplicationData();
    const started = await startServer();
    server = started.server;
    baseUrl = started.baseUrl;
  });

  after(async () => {
    try {
      if (server) {
        await closeServer(server);
      }
      await resetApplicationData();
    } finally {
      await stopPool();
    }
  });

  it("rejects a second intent for the same recipient, topic, and source event (REQ-NOTIFICATIONS-002, SEC-NOTIFICATIONS-003)", async () => {
    const recipientUserId = await signup(nextId("dedupe"));
    const topic = "Dispute opened / response required / resolved";
    await insertIntent(recipientUserId, topic, "same-event");
    const error = await pgError(
      `INSERT INTO notification_intents (
         external_id, recipient_user_id, topic, mandatory_class,
         source_domain, source_event_id, dedupe_key, template_reference
       )
       VALUES ($1, $2, $3, 'MANDATORY', 'Disputes', 'same-event', $4, 'topic:x')`,
      [hexId("ntf"), recipientUserId, topic, dedupe()]
    );
    assert.equal(error && error.code, "23505");
  });

  it("rejects an unclassified topic and a non-in-app read timestamp (BR-NOTIFICATIONS-002)", async () => {
    const recipientUserId = await signup(nextId("shape"));
    const unknown = await pgError(
      `INSERT INTO notification_intents (
         external_id, recipient_user_id, topic, mandatory_class,
         source_domain, source_event_id, dedupe_key, template_reference
       )
       VALUES ($1, $2, 'Authentication informational alert', 'CONFIGURABLE', 'Authentication', 'evt', $3, 'topic:x')`,
      [hexId("ntf"), recipientUserId, dedupe()]
    );
    assert.equal(unknown && unknown.code, "23514");

    const intent = await insertIntent(
      recipientUserId,
      "Dispute opened / response required / resolved",
      "email-read"
    );
    const readAt = await pgError(
      `INSERT INTO notification_deliveries (
         external_id, intent_id, channel, status, idempotency_key, read_at
       )
       VALUES ($1, $2, 'EMAIL', 'PENDING', $3, clock_timestamp())`,
      [hexId("ndl"), intent.id, `email:${dedupe()}`]
    );
    assert.equal(readAt && readAt.code, "23514");
  });

  it("refuses to suppress or delete a mandatory in-app record (BR-NOTIFICATIONS-001)", async () => {
    const recipientUserId = await signup(nextId("protect"));
    const intent = await insertIntent(
      recipientUserId,
      "Verification decision/action required",
      "verify-1"
    );
    const delivery = await pool.query(
      `INSERT INTO notification_deliveries (
         external_id, intent_id, channel, status, idempotency_key
       )
       VALUES ($1, $2, 'IN_APP', 'PENDING', $3)
       RETURNING id`,
      [hexId("ndl"), intent.id, `in_app:${dedupe()}`]
    );
    const suppressed = await pgError(
      "UPDATE notification_deliveries SET status = 'SUPPRESSED', updated_at = clock_timestamp() WHERE id = $1",
      [delivery.rows[0].id]
    );
    assert.equal(suppressed && suppressed.code, "23514");
    assert.match(suppressed.message, /cannot be suppressed/);

    const removed = await pgError(
      "DELETE FROM notification_deliveries WHERE id = $1",
      [delivery.rows[0].id]
    );
    assert.equal(removed && removed.code, "23514");
    assert.match(removed.message, /cannot be removed/);
  });

  it("allows only the delivery transitions in the state matrix and one row per channel", async () => {
    const recipientUserId = await signup(nextId("transition"));
    const intent = await insertIntent(
      recipientUserId,
      "Moderation/safety action",
      "mod-1"
    );
    const delivery = await pool.query(
      `INSERT INTO notification_deliveries (
         external_id, intent_id, channel, status, idempotency_key
       )
       VALUES ($1, $2, 'IN_APP', 'SENT', $3)
       RETURNING id`,
      [hexId("ndl"), intent.id, `in_app:${dedupe()}`]
    );
    const backward = await pgError(
      "UPDATE notification_deliveries SET status = 'PENDING', updated_at = clock_timestamp() WHERE id = $1",
      [delivery.rows[0].id]
    );
    assert.equal(backward && backward.code, "23514");
    assert.match(backward.message, /transition is not allowed/);

    const second = await pgError(
      `INSERT INTO notification_deliveries (
         external_id, intent_id, channel, status, idempotency_key
       )
       VALUES ($1, $2, 'IN_APP', 'PENDING', $3)`,
      [hexId("ndl"), intent.id, `in_app:${dedupe()}`]
    );
    assert.equal(second && second.code, "23505");
  });

  it("keeps intents and audit rows append-only (AUD-NOTIFICATIONS-001, AUD-NOTIFICATIONS-002)", async () => {
    const recipientUserId = await signup(nextId("audit"));
    const intent = await insertIntent(
      recipientUserId,
      "Escrow/payment transactional (funding required/confirmed, release, payout status, refund)",
      "escrow-1"
    );
    const updated = await pgError(
      "UPDATE notification_intents SET template_reference = 'changed' WHERE id = $1",
      [intent.id]
    );
    assert.equal(updated && updated.code, "23514");
    assert.match(updated.message, /append-only/);
    const deleted = await pgError("DELETE FROM notification_intents WHERE id = $1", [intent.id]);
    assert.equal(deleted && deleted.code, "23514");

    const audit = await pool.query(
      `INSERT INTO notification_audit_events (
         external_id, event_type, recipient_user_id, topic, channel,
         intent_external_id, actor_type, actor_id, change_hash
       )
       VALUES ($1, 'AUD-NOTIFICATIONS-001', $2, $3, 'IN_APP', $4, 'system', 'Escrow', $5)
       RETURNING id`,
      [
        hexId("nau"),
        recipientUserId,
        "Escrow/payment transactional (funding required/confirmed, release, payout status, refund)",
        intent.external_id,
        dedupe(),
      ]
    );
    const auditUpdate = await pgError(
      "UPDATE notification_audit_events SET actor_id = 'other' WHERE id = $1",
      [audit.rows[0].id]
    );
    assert.equal(auditUpdate && auditUpdate.code, "23514");
    assert.match(auditUpdate.message, /append-only/);
    const auditDelete = await pgError(
      "DELETE FROM notification_audit_events WHERE id = $1",
      [audit.rows[0].id]
    );
    assert.equal(auditDelete && auditDelete.code, "23514");
  });
});
