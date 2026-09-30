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
const { findTransition, listedTargets } = require("../src/projects/transition-rules");
const { commitTransition } = require("../src/projects/transition-service");
const repository = require("../src/projects/transition-repository");

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

async function request(method, requestPath, { token, body, idempotencyKey } = {}) {
  const headers = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (idempotencyKey) {
    headers["idempotency-key"] = idempotencyKey;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
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

function hexId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

const POST_AGREED = new Set([
  "accepted",
  "awaiting_funding",
  "funded",
  "in_progress",
  "delivery_pending",
  "delivered",
  "buyer_approved",
  "ratings_pending",
  "completed",
  "refunded",
]);

const FUNDED = new Set([
  "funded",
  "in_progress",
  "delivery_pending",
  "delivered",
  "buyer_approved",
  "ratings_pending",
  "completed",
  "refunded",
]);

function resumeFor(from, to, edge) {
  if (from === "disputed" || from === "suspended") {
    return edge.requires.includes("resolution_matches_resume") ? to : "funded";
  }
  if (from === "archived") {
    return to;
  }
  return null;
}

async function seedProject(buyerId, sellerId, from, to, edge) {
  const needsAgreed = edge.requires.includes("agreed_snapshot")
    || edge.requires.includes("funding_fact")
    || edge.requires.includes("refund_fact")
    || POST_AGREED.has(from)
    || (from === "cancelled" && edge.requires.includes("refund_fact"))
    || (from === "disputed" && edge.requires.includes("refund_fact"))
    || (from === "suspended" && edge.requires.includes("refund_fact"));
  const needsProposal = needsAgreed || from !== "draft";
  const resume = resumeFor(from, to, edge);
  const created = await pool.query(
    `INSERT INTO projects (
       external_id, buyer_user_id, seller_user_id, title, requirements,
       price_amount, currency, delivery_days, revision_limit, state, resume_state, funded_at
     )
     VALUES ($1, $2, $3, 'Session', 'Stems', 100, 'INR', 7, 1, $4::project_state, $5::project_state, $6)
     RETURNING id, version, proposal_version, agreed_term_version`,
    [
      hexId("prj"),
      buyerId,
      sellerId,
      from,
      resume,
      FUNDED.has(from) ? new Date() : null,
    ]
  );
  const projectId = created.rows[0].id;
  await pool.query(
    `INSERT INTO project_milestones (external_id, project_id, milestone_no, title, amount, currency, due_at)
     VALUES ($1, $2, 1, 'Only', 100, 'INR', clock_timestamp() + interval '30 days')`,
    [hexId("mls"), projectId]
  );
  if (needsProposal) {
    const proposal = await repository.insertProposalVersion(pool, projectId, hexId("ptv"));
    await pool.query(
      "UPDATE projects SET proposal_version = $2 WHERE id = $1",
      [projectId, proposal.rows[0].version_number]
    );
  }
  if (needsAgreed) {
    const proposalVersion = (await pool.query(
      "SELECT proposal_version FROM projects WHERE id = $1",
      [projectId]
    )).rows[0].proposal_version;
    const agreed = await repository.insertAgreedVersion(pool, projectId, hexId("ptv"), proposalVersion);
    await pool.query(
      "UPDATE projects SET agreed_term_version = $2 WHERE id = $1",
      [projectId, agreed.rows[0].version_number]
    );
  }
  let invitationId = null;
  const needsSeller = (
    edge.requires.includes("active_seller")
    || edge.requires.includes("accepted_invitation")
    || edge.actors.includes("seller")
    || edge.actors.includes("accepted_party")
  ) && !edge.requires.includes("no_accepted_seller")
    && !edge.requires.includes("no_pending_or_accepted_seller");
  if (
    edge.requires.includes("pending_invitation")
    || edge.requires.includes("accepted_invitation")
    || edge.requires.includes("declined_invitation")
    || edge.requires.includes("released_invitation")
    || needsSeller
  ) {
    const status = edge.requires.includes("pending_invitation")
      ? "pending"
      : edge.requires.includes("declined_invitation")
        ? "declined"
        : edge.requires.includes("released_invitation")
          ? "withdrawn"
          : "accepted";
    const invitation = await pool.query(
      `INSERT INTO project_invitations (
         external_id, project_id, inviter_user_id, invitee_user_id, proposal_version,
         proposal_hash, status, expires_at, decided_at, withdrawn_at
       )
       VALUES (
         $1, $2, $3, $4, 1, repeat('ab', 32), $5::project_invitation_status,
         clock_timestamp() + interval '7 days',
         CASE WHEN $5 IN ('accepted', 'declined', 'expired') THEN clock_timestamp() ELSE NULL END,
         CASE WHEN $5 = 'withdrawn' THEN clock_timestamp() ELSE NULL END
       )
       RETURNING id`,
      [hexId("inv"), projectId, buyerId, sellerId, status]
    );
    invitationId = invitation.rows[0].id;
  }
  if (needsSeller) {
    await pool.query(
      `INSERT INTO project_participants (
         external_id, project_id, user_id, category, status, source_invitation_id, accepted_at
       )
       VALUES ($1, $2, $3, 'seller', 'active', $4, clock_timestamp())`,
      [hexId("ppt"), projectId, sellerId, invitationId]
    );
  }
  return projectId;
}

function actorFor(edge, buyerId, sellerId) {
  if (edge.actors.includes("system") && !edge.actors.includes("buyer") && !edge.actors.includes("invitee") && !edge.actors.includes("accepted_party") && !edge.actors.includes("seller")) {
    return { actorType: "system", actorId: "system" };
  }
  if (edge.actors.includes("invitee") && !edge.actors.includes("buyer")) {
    return { actorType: "user", actorId: sellerId };
  }
  if (edge.actors.includes("seller") && !edge.actors.includes("buyer") && !edge.actors.includes("accepted_party")) {
    return { actorType: "user", actorId: sellerId };
  }
  return { actorType: "user", actorId: buyerId };
}

function factsFor(edge, buyerId, sellerId, projectId, to) {
  const facts = { eventId: `fact-${projectId}-${to}-${crypto.randomBytes(4).toString("hex")}` };
  if (edge.requires.includes("funding_fact") || edge.requires.includes("refund_fact")) {
    facts.producer = "escrow";
    facts.currency = "INR";
    facts.amount = 100;
  }
  if (edge.requires.includes("no_refund_due")) {
    facts.refundDue = 0;
  }
  if (edge.requires.includes("mutual_consent")) {
    facts.consent = "mutual";
    facts.buyerUserId = buyerId;
    facts.sellerUserId = sellerId;
  }
  if (edge.requires.includes("completion_fact")) {
    facts.converged = true;
  }
  if (edge.actors.includes("invitee")) {
    facts.inviteeUserId = sellerId;
  }
  return facts;
}

describe("MVP-015 project term versions and state machine", { concurrency: 1, timeout: 120000 }, () => {
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

  it("freezes one proposal version and rejects an unlisted edge without changing it", async () => {
    const buyer = await signupAndLogin(nextId("buyer"));
    const seller = await signupAndLogin(nextId("seller"));
    const outsider = await signupAndLogin(nextId("outsider"));
    const created = await request("POST", "/projects", {
      token: buyer.token,
      body: projectBody(seller.userId),
    });
    assert.equal(created.status, 201, created.text);
    const project = created.json.project;

    const unreadied = await request("POST", "/projects", {
      token: buyer.token,
      body: projectBody(seller.userId),
    });
    assert.equal(unreadied.status, 201, unreadied.text);
    await pool.query("UPDATE projects SET requirements = '' WHERE id = $1", [unreadied.json.project.id]);
    const unready = await request("POST", `/projects/${unreadied.json.project.id}/propose`, {
      token: buyer.token,
      idempotencyKey: "propose-unready",
      body: { expected_version: unreadied.json.project.version },
    });
    assert.equal(unready.status, 422);
    assert.equal(unready.json.error, "Proposal is not ready");
    const stillDraft = await pool.query(
      "SELECT state FROM projects WHERE id = $1",
      [unreadied.json.project.id]
    );
    assert.equal(stillDraft.rows[0].state, "draft");
    const unreadyVersions = await pool.query(
      "SELECT COUNT(*)::int AS count FROM project_term_versions WHERE project_id = $1",
      [unreadied.json.project.id]
    );
    assert.equal(unreadyVersions.rows[0].count, 0);

    const missing = await request("POST", `/projects/${project.id}/propose`, {
      token: buyer.token,
      body: { expected_version: project.version },
    });
    assert.equal(missing.status, 400);

    const proposed = await request("POST", `/projects/${project.id}/propose`, {
      token: buyer.token,
      idempotencyKey: "propose-once",
      body: { expected_version: project.version },
    });
    assert.equal(proposed.status, 200, proposed.text);
    assert.equal(proposed.json.project.state, "proposed");
    assert.equal(proposed.json.term_version.represented_state, "proposed");
    assert.equal(proposed.json.term_version.version_number, 1);
    const audits = await pool.query(
      "SELECT event_type FROM project_audit_events WHERE project_id = $1",
      [project.id]
    );
    assert.deepEqual(audits.rows.map((row) => row.event_type).sort(), ["AUD-PROJECTS-001", "AUD-PROJECTS-003"]);
    const outbox = await pool.query(
      "SELECT event_type FROM outbox_messages WHERE aggregate_id = $1 AND event_type = 'ProjectStateChanged'",
      [project.external_id]
    );
    assert.equal(outbox.rows.length, 1);

    const replay = await request("POST", `/projects/${project.id}/propose`, {
      token: buyer.token,
      idempotencyKey: "propose-once",
      body: { expected_version: project.version },
    });
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.json, proposed.json);

    const unlisted = await request("POST", `/projects/${project.id}/start`, {
      token: buyer.token,
      idempotencyKey: "start-too-soon",
      body: { expected_version: proposed.json.project.version },
    });
    assert.equal(unlisted.status, 409);
    assert.equal(unlisted.json.error, "Invalid project transition");
    const unchanged = await pool.query(
      "SELECT state, proposal_version FROM projects WHERE id = $1",
      [project.id]
    );
    assert.equal(unchanged.rows[0].state, "proposed");
    assert.equal(unchanged.rows[0].proposal_version, 1);
    const transitions = await pool.query(
      "SELECT COUNT(*)::int AS count FROM project_state_transitions WHERE project_id = $1",
      [project.id]
    );
    assert.equal(transitions.rows[0].count, 1);

    const hidden = await request("POST", `/projects/${project.id}/propose`, {
      token: outsider.token,
      idempotencyKey: "outsider-propose",
      body: { expected_version: proposed.json.project.version },
    });
    assert.equal(hidden.status, 404);
    const sellerPropose = await request("POST", `/projects/${project.id}/propose`, {
      token: seller.token,
      idempotencyKey: "seller-propose",
      body: { expected_version: proposed.json.project.version },
    });
    assert.equal(sellerPropose.status, 404);
    await pool.query("UPDATE users SET status = 'suspended'::user_status WHERE id = $1", [buyer.userId]);
    const suspended = await request("POST", `/projects/${project.id}/propose`, {
      token: buyer.token,
      idempotencyKey: "suspended-propose",
      body: { expected_version: proposed.json.project.version },
    });
    assert.equal(suspended.status, 401);

    const versions = await pool.query(
      "SELECT COUNT(*)::int AS count FROM project_term_versions WHERE project_id = $1",
      [project.id]
    );
    assert.equal(versions.rows[0].count, 1);
  });

  it("lets exactly one concurrent proposal win", async () => {
    const buyer = await signupAndLogin(nextId("buyer-race"));
    const seller = await signupAndLogin(nextId("seller-race"));
    const created = await request("POST", "/projects", {
      token: buyer.token,
      body: projectBody(seller.userId),
    });
    const project = created.json.project;
    const [first, second] = await Promise.all([
      request("POST", `/projects/${project.id}/propose`, {
        token: buyer.token,
        idempotencyKey: "race-a",
        body: { expected_version: project.version },
      }),
      request("POST", `/projects/${project.id}/propose`, {
        token: buyer.token,
        idempotencyKey: "race-b",
        body: { expected_version: project.version },
      }),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const stored = await pool.query(
      `SELECT state, COUNT(project_term_versions.id)::int AS versions
       FROM projects
       LEFT JOIN project_term_versions ON project_term_versions.project_id = projects.id
       WHERE projects.id = $1
       GROUP BY projects.state`,
      [project.id]
    );
    assert.equal(stored.rows[0].state, "proposed");
    assert.equal(stored.rows[0].versions, 1);
  });

  it("keeps each project term sequence isolated and immutable", async () => {
    const buyer = await signupAndLogin(nextId("buyer-iso"));
    const seller = await signupAndLogin(nextId("seller-iso"));
    async function proposedProject(key) {
      const created = await request("POST", "/projects", {
        token: buyer.token,
        body: projectBody(seller.userId),
      });
      const proposed = await request("POST", `/projects/${created.json.project.id}/propose`, {
        token: buyer.token,
        idempotencyKey: key,
        body: { expected_version: created.json.project.version },
      });
      assert.equal(proposed.status, 200, proposed.text);
      return created.json.project.id;
    }
    const first = await proposedProject("iso-a");
    const second = await proposedProject("iso-b");
    const numbers = await pool.query(
      `SELECT project_id, version_number FROM project_term_versions WHERE project_id = ANY($1::uuid[]) ORDER BY version_number`,
      [[first, second]]
    );
    assert.equal(numbers.rows.length, 2);
    assert.equal(numbers.rows[0].version_number, 1);
    assert.equal(numbers.rows[1].version_number, 1);
    assert.notEqual(numbers.rows[0].project_id, numbers.rows[1].project_id);

    await assert.rejects(
      pool.query("UPDATE project_term_versions SET title = 'Changed' WHERE project_id = $1", [first]),
      /immutable/
    );
    await assert.rejects(
      pool.query("DELETE FROM project_term_versions WHERE project_id = $1", [first]),
      /immutable/
    );
    const columns = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'project_term_versions' AND column_name = 'engagement_model'`
    );
    assert.equal(columns.rows.length, 0);
    const milestoneColumns = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'project_term_versions'
         AND column_name IN ('milestone_amount', 'revision_allowance')`
    );
    assert.equal(milestoneColumns.rows.length, 0);
  });

  it("completes every listed transition and leaves an unlisted pair unchanged", async () => {
    const buyer = await signupAndLogin(nextId("buyer-matrix"));
    const seller = await signupAndLogin(nextId("seller-matrix"));
    for (const pair of listedTargets()) {
      const edge = findTransition(pair.from, pair.to, pair.action);
      const projectId = await seedProject(buyer.userId, seller.userId, pair.from, pair.to, edge);
      const locked = await repository.lockProjectById(pool, projectId);
      const actor = actorFor(edge, buyer.userId, seller.userId);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await repository.lockProjectById(client, projectId);
        const result = await commitTransition(client, {
          project: current.rows[0],
          action: pair.action,
          targetState: pair.to,
          actorType: actor.actorType,
          actorId: actor.actorId,
          expectedVersion: current.rows[0].version,
          facts: factsFor(edge, buyer.userId, seller.userId, projectId, pair.to),
          sourceFactId: `edge-${projectId}`,
        });
        assert.equal(result.status, 200, `${pair.from} -> ${pair.to}: ${JSON.stringify(result.body)}`);
        assert.equal(result.project.state, pair.to);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
      assert.equal(locked.rows[0].state, pair.from);
    }

    const stray = await seedProject(
      buyer.userId,
      seller.userId,
      "draft",
      "accepted",
      findTransition("draft", "proposed", "project.propose")
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await repository.lockProjectById(client, stray);
      const rejected = await commitTransition(client, {
        project: current.rows[0],
        action: "project.accept_invitation",
        targetState: "accepted",
        actorType: "user",
        actorId: seller.userId,
        expectedVersion: current.rows[0].version,
        facts: { inviteeUserId: seller.userId, eventId: "not-listed" },
        sourceFactId: "not-listed",
      });
      assert.equal(rejected.status, 409);
      await client.query("COMMIT");
      const stored = await pool.query("SELECT state FROM projects WHERE id = $1", [stray]);
      assert.equal(stored.rows[0].state, "draft");
    } finally {
      client.release();
    }

    const cancelEdge = findTransition("funded", "cancelled", "project.cancel_settled");
    const heldId = await seedProject(buyer.userId, seller.userId, "funded", "cancelled", cancelEdge);
    const heldClient = await pool.connect();
    try {
      await heldClient.query("BEGIN");
      const current = await repository.lockProjectById(heldClient, heldId);
      const held = await commitTransition(heldClient, {
        project: current.rows[0],
        action: "project.cancel_settled",
        targetState: "cancelled",
        actorType: "system",
        actorId: "system",
        expectedVersion: current.rows[0].version,
        facts: { eventId: "held-cancel", refundDue: 0, hold: true },
        sourceFactId: "held-cancel",
      });
      assert.equal(held.status, 409);
      await heldClient.query("COMMIT");
      const stored = await pool.query("SELECT state FROM projects WHERE id = $1", [heldId]);
      assert.equal(stored.rows[0].state, "funded");
    } finally {
      heldClient.release();
    }
  });
});
