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

function projectBody(sellerUserId) {
  return {
    seller_user_id: sellerUserId,
    title: "Session",
    requirements: "Stems",
    price_amount: 100,
    delivery_days: 7,
    milestones: [{ title: "Only", amount: 100, due_at: futureIso(30) }],
  };
}

async function createProject(buyer, seller) {
  const created = await request("POST", "/projects", {
    token: buyer.token,
    body: projectBody(seller.userId),
  });
  assert.equal(created.status, 201, created.text);
  return created.json.project;
}

async function invite(buyer, project, seller) {
  const current = await pool.query("SELECT state, version FROM projects WHERE id = $1", [project.id]);
  let version = current.rows[0].version;
  if (current.rows[0].state === "draft") {
    const proposed = await request("POST", `/projects/${project.id}/propose`, {
      token: buyer.token,
      idempotencyKey: `propose-${project.id}`,
      body: { expected_version: version },
    });
    assert.equal(proposed.status, 200, proposed.text);
    version = proposed.json.project.version;
  }
  return request("POST", `/projects/${project.id}/invitations`, {
    token: buyer.token,
    idempotencyKey: `invite-${project.id}`,
    body: {
      invitee_user_id: seller.userId,
      expires_at: STABLE_EXPIRY,
      expected_version: version,
    },
  });
}

async function acceptInvitation(seller, project, invited) {
  return request(
    "POST",
    `/projects/${project.id}/invitations/${invited.json.invitation.external_id}/accept`,
    {
      token: seller.token,
      idempotencyKey: `accept-invite-${project.id}`,
      body: {
        expected_version: invited.json.invitation.project_version,
        expected_proposal_version: invited.json.invitation.proposal_version,
      },
    }
  );
}

async function acceptedProject(buyer, seller) {
  const project = await createProject(buyer, seller);
  const invited = await invite(buyer, project, seller);
  assert.equal(invited.status, 201, invited.text);
  const accepted = await acceptInvitation(seller, project, invited);
  assert.equal(accepted.status, 200, accepted.text);
  const row = await pool.query(
    `SELECT version, agreed_term_version, state, title, requirements, revision_limit,
            price_amount, currency, delivery_days
     FROM projects WHERE id = $1`,
    [project.id]
  );
  return { project, invited, row: row.rows[0] };
}

function proposeBody(row, changes) {
  return {
    expected_version: row.version,
    expires_at: STABLE_EXPIRY,
    changes,
  };
}

async function propose(actor, project, row, changes, key) {
  return request("POST", `/projects/${project.id}/amendments`, {
    token: actor.token,
    idempotencyKey: key,
    body: proposeBody(row, changes),
  });
}

async function termCount(projectId) {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS count FROM project_term_versions WHERE project_id = $1",
    [projectId]
  );
  return result.rows[0].count;
}

async function projectRow(projectId) {
  const result = await pool.query(
    `SELECT version, agreed_term_version, state, title, requirements, revision_limit,
            price_amount, currency, delivery_days, service_snapshot
     FROM projects WHERE id = $1`,
    [projectId]
  );
  return result.rows[0];
}

async function milestoneRow(projectId) {
  const result = await pool.query(
    `SELECT milestone_no, title, description, amount, currency, due_at, state
     FROM project_milestones WHERE project_id = $1 ORDER BY milestone_no`,
    [projectId]
  );
  return result.rows;
}

async function pgError(query, params) {
  try {
    await pool.query(query, params);
    return null;
  } catch (err) {
    return err;
  }
}

describe("MVP-016 project amendments", { concurrency: 1, timeout: 30000 }, () => {
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

  it("an accepted amendment atomically writes a new term version", async () => {
    const buyer = await signupAndLogin(nextId("buyer-acc"));
    const seller = await signupAndLogin(nextId("seller-acc"));
    const { project, row } = await acceptedProject(buyer, seller);
    const beforeTerms = await termCount(project.id);
    const beforeMilestones = await milestoneRow(project.id);
    const beforeHash = await pool.query(
      `SELECT version_number, content_hash, title FROM project_term_versions
       WHERE project_id = $1 AND version_number = $2`,
      [project.id, row.agreed_term_version]
    );

    const proposed = await propose(buyer, project, row, {
      title: "Renamed session",
      brief: "New stems",
      revision_limit: 3,
      service_snapshot: { service_id: "mix" },
      start_at: "2027-03-01T00:00:00.000Z",
      due_at: "2027-04-01T00:00:00.000Z",
    }, "amd-accept-1");
    assert.equal(proposed.status, 201, proposed.text);
    assert.equal(proposed.json.amendment.status, "proposed");
    assert.equal(proposed.json.amendment.base_term_version, row.agreed_term_version);
    assert.notEqual(proposed.json.amendment.old_snapshot_hash, proposed.json.amendment.new_snapshot_hash);
    assert.equal((await projectRow(project.id)).version, row.version);
    assert.equal(await termCount(project.id), beforeTerms);

    const replay = await propose(buyer, project, row, {
      title: "Renamed session",
      brief: "New stems",
      revision_limit: 3,
      service_snapshot: { service_id: "mix" },
      start_at: "2027-03-01T00:00:00.000Z",
      due_at: "2027-04-01T00:00:00.000Z",
    }, "amd-accept-1");
    assert.equal(replay.status, 201);
    assert.deepEqual(replay.json, proposed.json);

    const accepted = await request(
      "POST",
      `/projects/${project.id}/amendments/${proposed.json.amendment.external_id}/accept`,
      {
        token: seller.token,
        idempotencyKey: "amd-accept-do",
        body: {
          expected_version: row.version,
          expected_hash: proposed.json.amendment.new_snapshot_hash,
        },
      }
    );
    assert.equal(accepted.status, 200, accepted.text);
    assert.equal(accepted.json.amendment.status, "accepted");
    assert.equal(accepted.json.term_version.represented_state, "agreed");
    assert.equal(accepted.json.term_version.content_hash, proposed.json.amendment.new_snapshot_hash);
    assert.equal(accepted.json.amendment.current_term_version, accepted.json.term_version.version_number);
    assert.ok(accepted.json.term_version.version_number > row.agreed_term_version);

    const after = await projectRow(project.id);
    assert.equal(after.version, row.version + 1);
    assert.equal(after.agreed_term_version, accepted.json.term_version.version_number);
    assert.equal(after.state, "accepted");
    assert.equal(after.title, "Renamed session");
    assert.equal(after.requirements, "New stems");
    assert.equal(after.revision_limit, 3);
    assert.deepEqual(after.service_snapshot, { service_id: "mix" });
    assert.equal(after.price_amount, row.price_amount);
    assert.equal(after.currency, "INR");
    assert.equal(after.delivery_days, row.delivery_days);
    assert.equal(await termCount(project.id), beforeTerms + 1);
    assert.deepEqual(await milestoneRow(project.id), beforeMilestones);

    const oldVersion = await pool.query(
      `SELECT title, content_hash FROM project_term_versions
       WHERE project_id = $1 AND version_number = $2`,
      [project.id, row.agreed_term_version]
    );
    assert.equal(oldVersion.rows[0].title, beforeHash.rows[0].title);
    assert.equal(oldVersion.rows[0].content_hash, beforeHash.rows[0].content_hash);

    const events = await pool.query(
      `SELECT event_type, payload FROM outbox_messages
       WHERE aggregate_id = $1 AND event_type = 'ProjectTermsChanged'`,
      [project.external_id]
    );
    assert.equal(events.rows.length, 1);
    assert.equal(events.rows[0].payload.amendment_external_id, proposed.json.amendment.external_id);
    assert.deepEqual(events.rows[0].payload.affected_field_codes, [
      "brief",
      "due_at",
      "revision_limit",
      "service_snapshot",
      "start_at",
      "title",
    ]);

    const silent = await pgError("UPDATE projects SET title = 'Silent' WHERE id = $1", [project.id]);
    assert.equal(silent.code, "23514");
    const rewritten = await pgError(
      "UPDATE project_term_versions SET title = 'Silent' WHERE project_id = $1",
      [project.id]
    );
    assert.equal(rewritten.code, "23514");
    assert.equal((await projectRow(project.id)).title, "Renamed session");
  });

  it("a rejected amendment changes nothing", async () => {
    const buyer = await signupAndLogin(nextId("buyer-rej"));
    const seller = await signupAndLogin(nextId("seller-rej"));
    const { project, row } = await acceptedProject(buyer, seller);
    const beforeTerms = await termCount(project.id);
    const proposed = await propose(seller, project, row, { title: "Seller title" }, "amd-reject-1");
    assert.equal(proposed.status, 201, proposed.text);

    const rejected = await request(
      "POST",
      `/projects/${project.id}/amendments/${proposed.json.amendment.external_id}/reject`,
      {
        token: buyer.token,
        idempotencyKey: "amd-reject-do",
        body: { expected_version: row.version },
      }
    );
    assert.equal(rejected.status, 200, rejected.text);
    assert.equal(rejected.json.amendment.status, "rejected");

    const after = await projectRow(project.id);
    assert.equal(after.version, row.version);
    assert.equal(after.agreed_term_version, row.agreed_term_version);
    assert.equal(after.title, row.title);
    assert.equal(after.state, row.state);
    assert.equal(await termCount(project.id), beforeTerms);
    const events = await pool.query(
      `SELECT COUNT(*)::int AS count FROM outbox_messages
       WHERE aggregate_id = $1 AND event_type = 'ProjectTermsChanged'`,
      [project.external_id]
    );
    assert.equal(events.rows[0].count, 0);
    const audits = await pool.query(
      `SELECT action, outcome FROM project_audit_events
       WHERE project_id = $1 AND event_type = 'AUD-PROJECTS-004'
       ORDER BY created_at`,
      [project.id]
    );
    assert.deepEqual(audits.rows.map((item) => `${item.action}:${item.outcome}`), [
      "propose:proposed",
      "reject:rejected",
    ]);
  });

  it("withdraws only for the proposer and conceals the wrong role", async () => {
    const buyer = await signupAndLogin(nextId("buyer-wd"));
    const seller = await signupAndLogin(nextId("seller-wd"));
    const outsider = await signupAndLogin(nextId("outsider-wd"));
    const { project, row } = await acceptedProject(buyer, seller);
    const proposed = await propose(buyer, project, row, { brief: "Wider brief" }, "amd-wd-1");
    assert.equal(proposed.status, 201, proposed.text);
    const path = `/projects/${project.id}/amendments/${proposed.json.amendment.external_id}/withdraw`;

    const sellerWithdraw = await request("POST", path, {
      token: seller.token,
      idempotencyKey: "wd-seller",
      body: { expected_version: row.version },
    });
    assert.equal(sellerWithdraw.status, 404);
    assert.equal(sellerWithdraw.json.error, "Amendment not found");

    const outsiderPropose = await propose(outsider, project, row, { title: "Nope" }, "wd-outsider");
    assert.equal(outsiderPropose.status, 404);
    assert.equal(outsiderPropose.json.error, "Project not found");

    const withdrawn = await request("POST", path, {
      token: buyer.token,
      idempotencyKey: "wd-buyer",
      body: { expected_version: row.version },
    });
    assert.equal(withdrawn.status, 200, withdrawn.text);
    assert.equal(withdrawn.json.amendment.status, "withdrawn");
    assert.equal((await projectRow(project.id)).agreed_term_version, row.agreed_term_version);
  });

  it("denies the proposer accept, an unrelated user, and a suspended account", async () => {
    const buyer = await signupAndLogin(nextId("buyer-auth"));
    const seller = await signupAndLogin(nextId("seller-auth"));
    const outsider = await signupAndLogin(nextId("outsider-auth"));
    const { project, row } = await acceptedProject(buyer, seller);
    const proposed = await propose(buyer, project, row, { title: "Auth title" }, "amd-auth-1");
    const path = `/projects/${project.id}/amendments/${proposed.json.amendment.external_id}/accept`;
    const body = {
      expected_version: row.version,
      expected_hash: proposed.json.amendment.new_snapshot_hash,
    };

    const proposer = await request("POST", path, {
      token: buyer.token,
      idempotencyKey: "auth-proposer",
      body,
    });
    assert.equal(proposer.status, 404);
    assert.equal(proposer.json.error, "Amendment not found");

    const stranger = await request("POST", path, {
      token: outsider.token,
      idempotencyKey: "auth-stranger",
      body,
    });
    assert.equal(stranger.status, 404);
    assert.equal(stranger.json.error, "Project not found");

    await pool.query("UPDATE users SET status = 'suspended'::user_status WHERE id = $1", [seller.userId]);
    const suspended = await request("POST", path, {
      token: seller.token,
      idempotencyKey: "auth-suspended",
      body,
    });
    assert.equal(suspended.status, 401);
    assert.equal(proposed.json.amendment.status, "proposed");
    assert.equal(await termCount(project.id), 2);
  });

  it("rejects policy changes, a second pending amendment, a stale version, and a hash mismatch", async () => {
    const buyer = await signupAndLogin(nextId("buyer-pol"));
    const seller = await signupAndLogin(nextId("seller-pol"));
    const { project, row } = await acceptedProject(buyer, seller);

    const currency = await propose(buyer, project, row, { currency: "USD" }, "pol-currency");
    assert.equal(currency.status, 422);
    assert.equal(currency.json.error, "Amendment changes are not allowed");
    const total = await propose(buyer, project, row, { total_amount: 50 }, "pol-total");
    assert.equal(total.status, 422);
    const milestone = await propose(buyer, project, row, { milestones: [{ amount: 50 }] }, "pol-ms");
    assert.equal(milestone.status, 422);
    const empty = await propose(buyer, project, row, {}, "pol-empty");
    assert.equal(empty.status, 422);
    assert.equal(await termCount(project.id), 2);

    const draft = await createProject(buyer, seller);
    const tooSoon = await propose(buyer, draft, { version: draft.version }, { title: "Early" }, "pol-early");
    assert.equal(tooSoon.status, 409);
    assert.equal(tooSoon.json.error, "Project is not accepted");

    const proposed = await propose(buyer, project, row, { title: "First change" }, "pol-first");
    assert.equal(proposed.status, 201, proposed.text);
    const second = await propose(seller, project, row, { title: "Second change" }, "pol-second");
    assert.equal(second.status, 409);
    assert.equal(second.json.error, "A pending amendment already exists");

    const stale = await request(
      "POST",
      `/projects/${project.id}/amendments/${proposed.json.amendment.external_id}/accept`,
      {
        token: seller.token,
        idempotencyKey: "pol-stale",
        body: {
          expected_version: row.version + 9,
          expected_hash: proposed.json.amendment.new_snapshot_hash,
        },
      }
    );
    assert.equal(stale.status, 409);
    assert.equal(stale.json.error, "Project version is stale");

    const mismatch = await request(
      "POST",
      `/projects/${project.id}/amendments/${proposed.json.amendment.external_id}/accept`,
      {
        token: seller.token,
        idempotencyKey: "pol-hash",
        body: {
          expected_version: row.version,
          expected_hash: "a".repeat(64),
        },
      }
    );
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.json.error, "Amendment hash does not match");
    assert.equal((await projectRow(project.id)).title, "Session");
    assert.equal((await projectRow(project.id)).agreed_term_version, row.agreed_term_version);
  });

  it("expires a due amendment without writing a term version and then allows a new proposal", async () => {
    const buyer = await signupAndLogin(nextId("buyer-exp"));
    const seller = await signupAndLogin(nextId("seller-exp"));
    const { project, row } = await acceptedProject(buyer, seller);
    const inserted = await pool.query(
      `INSERT INTO project_amendments (
         external_id, project_id, proposer_user_id, counterparty_user_id,
         base_project_version, base_term_version, patch, old_snapshot_hash,
         new_snapshot_hash, expires_at, created_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, '{"title":"Late"}'::jsonb,
         repeat('a', 64), repeat('b', 64),
         clock_timestamp() - interval '1 minute',
         clock_timestamp() - interval '2 minutes'
       )
       RETURNING external_id`,
      [
        `amd_${"c".repeat(20)}`,
        project.id,
        buyer.userId,
        seller.userId,
        row.version,
        row.agreed_term_version,
      ]
    );
    const expired = await request(
      "POST",
      `/projects/${project.id}/amendments/${inserted.rows[0].external_id}/accept`,
      {
        token: seller.token,
        idempotencyKey: "exp-accept",
        body: { expected_version: row.version, expected_hash: "b".repeat(64) },
      }
    );
    assert.equal(expired.status, 409, expired.text);
    assert.equal(expired.json.error, "Amendment has expired");
    const stored = await pool.query(
      "SELECT status FROM project_amendments WHERE external_id = $1",
      [inserted.rows[0].external_id]
    );
    assert.equal(stored.rows[0].status, "expired");
    assert.equal((await projectRow(project.id)).version, row.version);
    assert.equal(await termCount(project.id), 2);

    const next = await propose(buyer, project, row, { title: "After expiry" }, "exp-next");
    assert.equal(next.status, 201, next.text);
    assert.equal(next.json.amendment.status, "proposed");
  });

  it("holds disputed and suspended projects", async () => {
    const buyer = await signupAndLogin(nextId("buyer-hold"));
    const seller = await signupAndLogin(nextId("seller-hold"));
    const { project, row } = await acceptedProject(buyer, seller);
    await pool.query("UPDATE projects SET state = 'in_progress'::project_state WHERE id = $1", [project.id]);
    await pool.query(
      "UPDATE projects SET state = 'disputed'::project_state, resume_state = 'in_progress'::project_state WHERE id = $1",
      [project.id]
    );
    const disputed = await propose(buyer, project, row, { title: "During dispute" }, "hold-1");
    assert.equal(disputed.status, 409);
    assert.equal(disputed.json.error, "Project is held");
    await pool.query(
      "UPDATE projects SET state = 'suspended'::project_state, resume_state = 'in_progress'::project_state WHERE id = $1",
      [project.id]
    );
    const suspended = await propose(buyer, project, row, { title: "During suspension" }, "hold-2");
    assert.equal(suspended.status, 409);
    assert.equal(suspended.json.error, "Project is held");
    assert.equal(await termCount(project.id), 2);
  });

  it("lets exactly one of accept and withdraw win", async () => {
    const buyer = await signupAndLogin(nextId("buyer-race"));
    const seller = await signupAndLogin(nextId("seller-race"));
    const { project, row } = await acceptedProject(buyer, seller);
    const before = await termCount(project.id);
    const proposed = await propose(buyer, project, row, { title: "Race title" }, "race-propose");
    assert.equal(proposed.status, 201, proposed.text);
    const path = `/projects/${project.id}/amendments/${proposed.json.amendment.external_id}`;
    const [accepted, withdrawn] = await Promise.all([
      request("POST", `${path}/accept`, {
        token: seller.token,
        idempotencyKey: "race-accept",
        body: {
          expected_version: row.version,
          expected_hash: proposed.json.amendment.new_snapshot_hash,
        },
      }),
      request("POST", `${path}/withdraw`, {
        token: buyer.token,
        idempotencyKey: "race-withdraw",
        body: { expected_version: row.version },
      }),
    ]);
    const statuses = [accepted.status, withdrawn.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const winner = accepted.status === 200 ? accepted : withdrawn;
    assert.ok(winner.json.amendment.status === "accepted" || winner.json.amendment.status === "withdrawn");
    const loser = accepted.status === 409 ? accepted : withdrawn;
    assert.equal(loser.json.error, "Amendment is no longer proposed");
    const after = await termCount(project.id);
    assert.equal(after, winner.json.amendment.status === "accepted" ? before + 1 : before);
    const versions = await pool.query(
      "SELECT COUNT(*)::int AS count FROM project_term_versions WHERE project_id = $1 AND title = 'Race title'",
      [project.id]
    );
    assert.equal(versions.rows[0].count, winner.json.amendment.status === "accepted" ? 1 : 0);
  });
});
