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

function futureIso(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function sha256(body) {
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

async function request(method, requestPath, { token, body, idempotencyKey } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (idempotencyKey) {
    headers["idempotency-key"] = idempotencyKey;
  }
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers,
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
  const loggedIn = await request("POST", "/auth/login", {
    body: { email, password: "password-1" },
  });
  assert.equal(loggedIn.status, 200, loggedIn.text);
  return { userId: created.json.user.id, token: loggedIn.json.token };
}

async function pgError(query, params) {
  try {
    await pool.query(query, params);
    return null;
  } catch (err) {
    return err;
  }
}

describe("message database constraints", { concurrency: 1, timeout: 30000 }, () => {
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

  it("rejects a hard delete, a body edit, a hash mismatch, a 501-character body, and a second tombstone (BR-MESSAGING-001, BR-MESSAGING-004, SEC-MESSAGING-006)", async () => {
    const buyer = await signup(nextId("constraint-buyer"));
    const seller = await signup(nextId("constraint-seller"));
    const created = await request("POST", "/projects", {
      token: buyer.token,
      body: {
        seller_user_id: seller.userId,
        title: "Session",
        requirements: "Stems",
        price_amount: 100,
        delivery_days: 7,
        milestones: [{ title: "Only", amount: 100, due_at: futureIso(30) }],
      },
    });
    assert.equal(created.status, 201, created.text);
    const project = created.json.project;
    const sent = await request("POST", `/projects/${project.external_id}/messages`, {
      token: buyer.token,
      idempotencyKey: "constraint-send",
      body: { body: "original" },
    });
    assert.equal(sent.status, 201, sent.text);

    const row = await pool.query(
      `SELECT m.id, m.conversation_id, m.body, m.content_hash, c.project_id
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.external_id = $1`,
      [sent.json.message.external_id]
    );
    const message = row.rows[0];
    assert.equal(message.body, "original");
    assert.equal(message.content_hash, sha256("original"));

    const tooLong = "b".repeat(501);
    const oversize = await pgError(
      `INSERT INTO messages (
         external_id, conversation_id, sequence_number, message_type, sender_user_id,
         body, content_hash, idempotency_key
       )
       VALUES ($1, $2, 2, 'USER', $3, $4, $5, 'oversize-key')`,
      [
        `msg_${crypto.randomBytes(10).toString("hex")}`,
        message.conversation_id,
        buyer.userId,
        tooLong,
        sha256(tooLong),
      ]
    );
    assert.equal(oversize.code, "23514");

    const mismatch = await pgError(
      `INSERT INTO messages (
         external_id, conversation_id, sequence_number, message_type, sender_user_id,
         body, content_hash, idempotency_key
       )
       VALUES ($1, $2, 2, 'USER', $3, 'short', $4, 'mismatch-key')`,
      [
        `msg_${crypto.randomBytes(10).toString("hex")}`,
        message.conversation_id,
        buyer.userId,
        sha256("other"),
      ]
    );
    assert.equal(mismatch.code, "23514");

    const emptyBody = "";
    const empty = await pool.query(
      `INSERT INTO messages (
         external_id, conversation_id, sequence_number, message_type, sender_user_id,
         body, content_hash, idempotency_key
       )
       VALUES ($1, $2, 2, 'USER', $3, $4, $5, 'empty-key')
       RETURNING char_length(body) AS length`,
      [
        `msg_${crypto.randomBytes(10).toString("hex")}`,
        message.conversation_id,
        buyer.userId,
        emptyBody,
        sha256(emptyBody),
      ]
    );
    assert.equal(empty.rows[0].length, 0);

    const edited = await pgError(`UPDATE messages SET body = 'changed' WHERE id = $1`, [message.id]);
    assert.equal(edited.code, "23514");

    const deleted = await pgError(`DELETE FROM messages WHERE id = $1`, [message.id]);
    assert.equal(deleted.code, "23514");

    const conversationDeleted = await pgError(`DELETE FROM conversations WHERE id = $1`, [
      message.conversation_id,
    ]);
    assert.equal(conversationDeleted.code, "23514");

    const rebound = await pgError(
      `UPDATE conversations SET project_id = gen_random_uuid() WHERE id = $1`,
      [message.conversation_id]
    );
    assert.equal(rebound.code, "23514");

    await pool.query(
      `UPDATE messages
       SET tombstoned_at = clock_timestamp(), tombstoned_by_user_id = $2
       WHERE id = $1`,
      [message.id, buyer.userId]
    );
    const retombstone = await pgError(
      `UPDATE messages
       SET tombstoned_at = clock_timestamp(), tombstoned_by_user_id = $2
       WHERE id = $1`,
      [message.id, buyer.userId]
    );
    assert.equal(retombstone.code, "23514");

    const persisted = await pool.query(
      `SELECT body, content_hash FROM messages WHERE id = $1`,
      [message.id]
    );
    assert.equal(persisted.rows[0].body, "original");
    assert.equal(persisted.rows[0].content_hash, sha256("original"));

    const audit = await pool.query(
      `SELECT id FROM messaging_audit_events WHERE project_id = $1 LIMIT 1`,
      [message.project_id]
    );
    const auditDelete = await pgError(`DELETE FROM messaging_audit_events WHERE id = $1`, [
      audit.rows[0].id,
    ]);
    assert.equal(auditDelete.code, "23514");
  });
});
