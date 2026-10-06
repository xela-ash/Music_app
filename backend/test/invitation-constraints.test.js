const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  ensureMigrated,
  resetApplicationData,
  startServer,
  closeServer,
  stopPool,
} = require("./harness");
const pool = require("../db/db");
const { withMilestoneTerms } = require("./milestone-fixture");

let baseUrl = "";
let server;
let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

async function request(method, requestPath, { token, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
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

describe("project invitation database constraints", { concurrency: 1, timeout: 30000 }, () => {
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

  it("rejects a second pending invitation, a buyer invitee, a non-expiring row, a second seller, and audit mutation", async () => {
    const buyer = await signup(nextId("c-buyer"));
    const seller = await signup(nextId("c-seller"));
    const created = await request("POST", "/projects", {
      token: buyer.token,
      body: {
        seller_user_id: seller.userId,
        title: "Constraint",
        requirements: "Hold",
        price_amount: 100,
        delivery_days: 7,
        milestones: [withMilestoneTerms({ title: "Only", amount: 100, due_at: "2027-01-01T00:00:00.000Z" })],
      },
    });
    assert.equal(created.status, 201, created.text);
    const projectId = created.json.project.id;

    const first = await pool.query(
      `INSERT INTO project_invitations (
         external_id, project_id, inviter_user_id, invitee_user_id,
         proposal_version, proposal_hash, expires_at
       )
       VALUES ($1, $2, $3, $4, 1, $5, clock_timestamp() + interval '1 day')
       RETURNING id`,
      [
        "inv_aaaaaaaaaaaaaaaaaaaa",
        projectId,
        buyer.userId,
        seller.userId,
        "a".repeat(64),
      ]
    );

    const secondPending = await pgError(
      `INSERT INTO project_invitations (
         external_id, project_id, inviter_user_id, invitee_user_id,
         proposal_version, proposal_hash, expires_at
       )
       VALUES ($1, $2, $3, $4, 1, $5, clock_timestamp() + interval '2 days')`,
      ["inv_bbbbbbbbbbbbbbbbbbbb", projectId, buyer.userId, seller.userId, "b".repeat(64)]
    );
    assert.equal(secondPending.code, "23505");

    const buyerInvitee = await pgError(
      `INSERT INTO project_invitations (
         external_id, project_id, inviter_user_id, invitee_user_id,
         proposal_version, proposal_hash, status, expires_at, decided_at
       )
       VALUES ($1, $2, $3, $4, 1, $5, 'declined', clock_timestamp() + interval '1 day', clock_timestamp())`,
      ["inv_cccccccccccccccccccc", projectId, seller.userId, buyer.userId, "c".repeat(64)]
    );
    assert.equal(buyerInvitee.code, "23514");

    const noExpiryGap = await pgError(
      `INSERT INTO project_invitations (
         external_id, project_id, inviter_user_id, invitee_user_id,
         proposal_version, proposal_hash, status, expires_at, created_at, decided_at
       )
       VALUES ($1, $2, $3, $4, 1, $5, 'declined', clock_timestamp(), clock_timestamp(), clock_timestamp())`,
      ["inv_dddddddddddddddddddd", projectId, buyer.userId, seller.userId, "d".repeat(64)]
    );
    assert.equal(noExpiryGap.code, "23514");

    await pool.query(
      `INSERT INTO project_participants (
         external_id, project_id, user_id, category, status, source_invitation_id, accepted_at
       )
       VALUES ($1, $2, $3, 'seller', 'active', $4, clock_timestamp())`,
      ["ppt_aaaaaaaaaaaaaaaaaaaa", projectId, seller.userId, first.rows[0].id]
    );
    const secondSeller = await pgError(
      `INSERT INTO project_participants (
         external_id, project_id, user_id, category, status, source_invitation_id, accepted_at
       )
       VALUES ($1, $2, $3, 'seller', 'active', $4, clock_timestamp())`,
      ["ppt_bbbbbbbbbbbbbbbbbbbb", projectId, seller.userId, first.rows[0].id]
    );
    assert.equal(secondSeller.code, "23505");

    const missingSource = await pgError(
      `INSERT INTO project_participants (
         external_id, project_id, user_id, category, status, accepted_at
       )
       VALUES ($1, $2, $3, 'seller', 'active', clock_timestamp())`,
      ["ppt_cccccccccccccccccccc", projectId, seller.userId]
    );
    assert.equal(missingSource.code, "23514");

    await pool.query(
      `INSERT INTO project_audit_events (
         external_id, project_id, event_type, actor_type, actor_id, relationship,
         action, outcome, source_state, target_state, aggregate_version, change_hash
       )
       VALUES ($1, $2, 'AUD-PROJECTS-002', 'system', 'system', 'system',
               'expire', 'expired', 'pending', 'expired', 1, $3)`,
      ["aud_aaaaaaaaaaaaaaaaaaaa", projectId, "e".repeat(64)]
    );
    const updated = await pgError(
      "UPDATE project_audit_events SET outcome = 'changed' WHERE external_id = $1",
      ["aud_aaaaaaaaaaaaaaaaaaaa"]
    );
    assert.match(updated.message, /append-only/);
    const deleted = await pgError(
      "DELETE FROM project_audit_events WHERE external_id = $1",
      ["aud_aaaaaaaaaaaaaaaaaaaa"]
    );
    assert.match(deleted.message, /append-only/);
  });
});
