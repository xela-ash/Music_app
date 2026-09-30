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

function amendmentValues(externalId, projectId, proposerId, counterpartyId, patch) {
  return [
    externalId,
    projectId,
    proposerId,
    counterpartyId,
    1,
    1,
    JSON.stringify(patch),
    "a".repeat(64),
    "b".repeat(64),
  ];
}

describe("project amendment database constraints", { concurrency: 1, timeout: 30000 }, () => {
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

  it("rejects a second pending row, a money patch, a rewritten proposal, and a deleted terminal row", async () => {
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
        milestones: [{ title: "Only", amount: 100, due_at: futureIso(30) }],
      },
    });
    assert.equal(created.status, 201, created.text);
    const projectId = created.json.project.id;

    const insertSql = `
      INSERT INTO project_amendments (
        external_id, project_id, proposer_user_id, counterparty_user_id,
        base_project_version, base_term_version, patch, old_snapshot_hash,
        new_snapshot_hash, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, clock_timestamp() + interval '1 day')
      RETURNING id`;

    const first = await pool.query(insertSql, amendmentValues(
      `amd_${"1".repeat(20)}`,
      projectId,
      buyer.userId,
      seller.userId,
      { title: "Next" }
    ));

    const second = await pgError(insertSql, amendmentValues(
      `amd_${"2".repeat(20)}`,
      projectId,
      seller.userId,
      buyer.userId,
      { brief: "Other" }
    ));
    assert.equal(second.code, "23505");

    const rewritten = await pgError(
      "UPDATE project_amendments SET patch = '{\"brief\":\"Changed\"}'::jsonb WHERE id = $1",
      [first.rows[0].id]
    );
    assert.equal(rewritten.code, "23514");

    const rejected = await pool.query(
      `UPDATE project_amendments
       SET status = 'rejected',
           decided_at = clock_timestamp(),
           decided_by_user_id = $2,
           version = version + 1,
           updated_at = clock_timestamp()
       WHERE id = $1
       RETURNING status`,
      [first.rows[0].id, seller.userId]
    );
    assert.equal(rejected.rows[0].status, "rejected");

    const money = await pgError(insertSql, amendmentValues(
      `amd_${"3".repeat(20)}`,
      projectId,
      buyer.userId,
      seller.userId,
      { currency: "USD" }
    ));
    assert.equal(money.code, "23514");

    const milestone = await pgError(insertSql, amendmentValues(
      `amd_${"4".repeat(20)}`,
      projectId,
      buyer.userId,
      seller.userId,
      { milestones: [{ amount: 1 }] }
    ));
    assert.equal(milestone.code, "23514");

    const sameHash = await pgError(
      `INSERT INTO project_amendments (
         external_id, project_id, proposer_user_id, counterparty_user_id,
         base_project_version, base_term_version, patch, old_snapshot_hash,
         new_snapshot_hash, expires_at
       )
       VALUES ($1, $2, $3, $4, 1, 1, '{"title":"Next"}'::jsonb, $5, $5, clock_timestamp() + interval '1 day')`,
      [`amd_${"5".repeat(20)}`, projectId, buyer.userId, seller.userId, "c".repeat(64)]
    );
    assert.equal(sameHash.code, "23514");

    const terminal = await pgError(
      `UPDATE project_amendments
       SET status = 'withdrawn', version = version + 1, updated_at = clock_timestamp()
       WHERE id = $1`,
      [first.rows[0].id]
    );
    assert.equal(terminal.code, "23514");

    const deleted = await pgError("DELETE FROM project_amendments WHERE id = $1", [first.rows[0].id]);
    assert.equal(deleted.code, "23514");
  });
});
