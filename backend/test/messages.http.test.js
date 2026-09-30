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

const STABLE_EXPIRY = futureIso(7);

async function request(method, requestPath, { token, body, idempotencyKey } = {}) {
  const headers = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (idempotencyKey) {
    headers["idempotency-key"] = idempotencyKey;
  }
  let payload;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers,
    body: payload,
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

function profileInput(tag) {
  return {
    handle: `${tag}-handle`,
    first_name: "Ada",
    last_name: "Lovelace",
    artist_name: `${tag} Artist`,
    display_name: `${tag} Display`,
    genres: ["classical"],
    city: "Chennai",
    country: "IN",
  };
}

async function signupAndLogin(tag) {
  const email = `${tag}@example.com`;
  const created = await request("POST", "/auth/signup", {
    body: { email, password: "password-1", ...profileInput(tag) },
  });
  assert.equal(created.status, 201, created.text);
  const loggedIn = await request("POST", "/auth/login", {
    body: { email, password: "password-1" },
  });
  assert.equal(loggedIn.status, 200, loggedIn.text);
  return { userId: created.json.user.id, token: loggedIn.json.token };
}

async function createProject(buyer, seller) {
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
  return created.json.project;
}

async function acceptSeller(buyer, seller, project) {
  const proposed = await request("POST", `/projects/${project.id}/propose`, {
    token: buyer.token,
    idempotencyKey: nextId("propose"),
    body: { expected_version: project.version },
  });
  assert.equal(proposed.status, 200, proposed.text);
  const invited = await request("POST", `/projects/${project.id}/invitations`, {
    token: buyer.token,
    idempotencyKey: nextId("invite"),
    body: {
      invitee_user_id: seller.userId,
      expires_at: STABLE_EXPIRY,
      expected_version: proposed.json.project.version,
    },
  });
  assert.equal(invited.status, 201, invited.text);
  const accepted = await request(
    "POST",
    `/projects/${project.id}/invitations/${invited.json.invitation.external_id}/accept`,
    {
      token: seller.token,
      idempotencyKey: nextId("accept"),
      body: {
        expected_version: invited.json.invitation.project_version,
        expected_proposal_version: invited.json.invitation.proposal_version,
      },
    }
  );
  assert.equal(accepted.status, 200, accepted.text);
}

function messagesPath(project) {
  return `/projects/${project.external_id}/messages`;
}

async function storedMessage(externalId) {
  const result = await pool.query(
    `SELECT body, content_hash, conversation_id, sequence_number, sender_user_id, tombstoned_at
     FROM messages
     WHERE external_id = $1`,
    [externalId]
  );
  return result.rows[0];
}

function sha256(body) {
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

describe("MVP-038 conversations and messages", { concurrency: 1, timeout: 30000 }, () => {
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

  it("redacts a tombstoned message from ordinary display and keeps the row, hash, and bindings (REQ-MESSAGING-005)", async () => {
    const buyer = await signupAndLogin(nextId("buyer"));
    const seller = await signupAndLogin(nextId("seller"));
    const outsider = await signupAndLogin(nextId("outsider"));
    const project = await createProject(buyer, seller);
    const original = "Keep the stems";

    const namedSeller = await request("POST", messagesPath(project), {
      token: seller.token,
      idempotencyKey: "named-seller",
      body: { body: original },
    });
    assert.equal(namedSeller.status, 404);
    assert.deepEqual(namedSeller.json, { error: "Project not found" });

    const sent = await request("POST", messagesPath(project), {
      token: buyer.token,
      idempotencyKey: "send-1",
      body: { body: original, sender_user_id: seller.userId },
    });
    assert.equal(sent.status, 201, sent.text);
    assert.equal(sent.json.message.body, original);
    assert.equal(sent.json.message.sender_user_id, buyer.userId);
    assert.equal(sent.json.message.sequence_number, 1);
    assert.match(sent.json.message.external_id, /^msg_[0-9a-f]{20}$/);
    assert.match(sent.json.message.conversation_external_id, /^cnv_[0-9a-f]{20}$/);

    const replay = await request("POST", messagesPath(project), {
      token: buyer.token,
      idempotencyKey: "send-1",
      body: { body: original, sender_user_id: outsider.userId },
    });
    assert.equal(replay.status, 201);
    assert.deepEqual(replay.json, sent.json);

    const mismatch = await request("POST", messagesPath(project), {
      token: buyer.token,
      idempotencyKey: "send-1",
      body: { body: "different" },
    });
    assert.equal(mismatch.status, 409);

    await acceptSeller(buyer, seller, project);
    const sellerSent = await request("POST", messagesPath(project), {
      token: seller.token,
      idempotencyKey: "send-2",
      body: { body: "Received" },
    });
    assert.equal(sellerSent.status, 201, sellerSent.text);
    assert.equal(sellerSent.json.message.sequence_number, 2);
    assert.equal(sellerSent.json.message.sender_user_id, seller.userId);

    const tooLong = await request("POST", messagesPath(project), {
      token: buyer.token,
      idempotencyKey: "too-long",
      body: { body: "a".repeat(501) },
    });
    assert.equal(tooLong.status, 400);
    assert.equal(tooLong.json.error, "Message body must be at most 500 characters");

    const exact = await request("POST", messagesPath(project), {
      token: buyer.token,
      idempotencyKey: "exact-500",
      body: { body: "🎵".repeat(500) },
    });
    assert.equal(exact.status, 201, exact.text);

    const tombstone = await request(
      "POST",
      `${messagesPath(project)}/${sent.json.message.external_id}/tombstone`,
      { token: buyer.token, idempotencyKey: "tomb-1" }
    );
    assert.equal(tombstone.status, 200, tombstone.text);
    assert.equal(tombstone.json.message.body, null);
    assert.ok(tombstone.json.message.tombstoned_at);

    const tombstoneReplay = await request(
      "POST",
      `${messagesPath(project)}/${sent.json.message.external_id}/tombstone`,
      { token: buyer.token, idempotencyKey: "tomb-1" }
    );
    assert.deepEqual(tombstoneReplay.json, tombstone.json);

    const tombstoneAgain = await request(
      "POST",
      `${messagesPath(project)}/${sent.json.message.external_id}/tombstone`,
      { token: buyer.token, idempotencyKey: "tomb-2" }
    );
    assert.equal(tombstoneAgain.status, 200);
    assert.equal(tombstoneAgain.json.message.body, null);

    const sellerTombstone = await request(
      "POST",
      `${messagesPath(project)}/${sent.json.message.external_id}/tombstone`,
      { token: seller.token, idempotencyKey: "tomb-seller" }
    );
    assert.equal(sellerTombstone.status, 403);

    const outsiderTombstone = await request(
      "POST",
      `${messagesPath(project)}/${sent.json.message.external_id}/tombstone`,
      { token: outsider.token, idempotencyKey: "tomb-outsider" }
    );
    assert.equal(outsiderTombstone.status, 404);
    assert.deepEqual(outsiderTombstone.json, { error: "Project not found" });

    const redactedReplay = await request("POST", messagesPath(project), {
      token: buyer.token,
      idempotencyKey: "send-1",
      body: { body: original },
    });
    assert.equal(redactedReplay.status, 201, redactedReplay.text);
    assert.equal(redactedReplay.json.message.external_id, sent.json.message.external_id);
    assert.equal(redactedReplay.json.message.body, null);
    assert.ok(redactedReplay.json.message.tombstoned_at);

    const listed = await request("GET", messagesPath(project), { token: seller.token });
    assert.equal(listed.status, 200, listed.text);
    assert.equal(listed.json.messages[0].body, null);
    assert.equal(listed.json.messages[0].external_id, sent.json.message.external_id);
    assert.equal(listed.json.messages[1].body, "Received");
    assert.equal(listed.json.conversation.message_count, 3);
    assert.equal(listed.json.messages.length, 3);

    const stored = await storedMessage(sent.json.message.external_id);
    assert.equal(stored.body, original);
    assert.equal(stored.content_hash, sha256(original));
    assert.equal(stored.sequence_number, 1);
    assert.ok(stored.conversation_id);
    assert.ok(stored.tombstoned_at);
    assert.equal(stored.sender_user_id, buyer.userId);

    const conversations = await pool.query(
      `SELECT COUNT(*)::int AS count FROM conversations WHERE project_id = $1`,
      [project.id]
    );
    assert.equal(conversations.rows[0].count, 1);

    const audits = await pool.query(
      `SELECT action, COUNT(*)::int AS count
       FROM messaging_audit_events
       WHERE project_id = $1
       GROUP BY action`,
      [project.id]
    );
    const auditCounts = Object.fromEntries(audits.rows.map((row) => [row.action, row.count]));
    assert.equal(auditCounts.conversation_created, 1);
    assert.equal(auditCounts.message_created, 3);
    assert.equal(auditCounts.message_tombstoned, 1);
    const createdAudit = await pool.query(
      `SELECT message_id IS NOT NULL AS has_message
       FROM messaging_audit_events
       WHERE project_id = $1 AND action = 'conversation_created'`,
      [project.id]
    );
    assert.equal(createdAudit.rows[0].has_message, true);

    const events = await pool.query(
      `SELECT event_type, payload
       FROM outbox_messages
       WHERE aggregate_id = $1`,
      [sent.json.message.conversation_external_id]
    );
    const eventTypes = events.rows.map((row) => row.event_type).sort();
    assert.deepEqual(eventTypes, ["ConversationCreated", "MessageSent", "MessageSent", "MessageSent", "MessageTombstoned"].sort());
    for (const row of events.rows) {
      assert.equal(Object.prototype.hasOwnProperty.call(row.payload, "body"), false);
    }

    const hidden = await request("GET", messagesPath(project), { token: outsider.token });
    assert.equal(hidden.status, 404);
    assert.deepEqual(hidden.json, { error: "Project not found" });

    const missing = await request("GET", "/projects/prj_00000000000000000000/messages", {
      token: buyer.token,
    });
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.json, hidden.json);

    const removed = await request(
      "DELETE",
      `${messagesPath(project)}/${sent.json.message.external_id}`,
      { token: buyer.token }
    );
    assert.equal(removed.status, 404);
    assert.ok(await storedMessage(sent.json.message.external_id));
  });

  it("assigns distinct sequences under the conversation lock and denies a suspended account (REQ-MESSAGING-010, SEC-AUTH-002)", async () => {
    const buyer = await signupAndLogin(nextId("race-buyer"));
    const seller = await signupAndLogin(nextId("race-seller"));
    const project = await createProject(buyer, seller);
    await acceptSeller(buyer, seller, project);

    const [first, second] = await Promise.all([
      request("POST", messagesPath(project), {
        token: buyer.token,
        idempotencyKey: "race-buyer",
        body: { body: "one" },
      }),
      request("POST", messagesPath(project), {
        token: seller.token,
        idempotencyKey: "race-seller",
        body: { body: "two" },
      }),
    ]);
    assert.equal(first.status, 201, first.text);
    assert.equal(second.status, 201, second.text);
    assert.deepEqual(
      [first.json.message.sequence_number, second.json.message.sequence_number].sort(),
      [1, 2]
    );

    await pool.query("UPDATE users SET status = 'suspended'::user_status WHERE id = $1", [buyer.userId]);
    const suspended = await request("POST", messagesPath(project), {
      token: buyer.token,
      idempotencyKey: "suspended",
      body: { body: "nope" },
    });
    assert.equal(suspended.status, 401);

    await pool.query(
      `UPDATE project_participants
       SET status = 'ended', ended_at = clock_timestamp()
       WHERE project_id = $1 AND user_id = $2 AND category = 'seller'`,
      [project.id, seller.userId]
    );
    const stale = await request("GET", messagesPath(project), { token: seller.token });
    assert.equal(stale.status, 404);
    assert.deepEqual(stale.json, { error: "Project not found" });
  });
});
