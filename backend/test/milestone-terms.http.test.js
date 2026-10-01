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
const { formatAmount } = require("../src/money/amount");

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

function projectBody(sellerUserId, milestone) {
  return {
    seller_user_id: sellerUserId,
    title: "Session",
    requirements: "Stems",
    price_amount: milestone.amount,
    delivery_days: 7,
    revision_limit: 4,
    milestones: [milestone],
  };
}

describe("MVP-017 milestone term snapshots", { concurrency: 1, timeout: 30000 }, () => {
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

  it("requires an explicit revision allowance and catalogue selection", async () => {
    const buyer = await signupAndLogin(nextId("buyer"));
    const seller = await signupAndLogin(nextId("seller"));
    const base = {
      title: "Only",
      amount: 100,
      due_at: futureIso(30),
    };
    const omitted = await request("POST", "/projects", {
      token: buyer.token,
      body: projectBody(seller.userId, {
        ...base,
        deliverable_definition: { required_deliverables: ["lyrics"], other_description: null },
      }),
    });
    assert.equal(omitted.status, 400, omitted.text);
    assert.match(omitted.json.error, /revision_allowance/);

    const currency = await request("POST", "/projects", {
      token: buyer.token,
      body: projectBody(seller.userId, {
        ...base,
        revision_allowance: 0,
        currency: "USD",
        currency_exponent: 2,
        deliverable_definition: { required_deliverables: ["lyrics"], other_description: null },
      }),
    });
    assert.equal(currency.status, 400, currency.text);
    assert.equal(currency.json.error, "Milestone currency is taken from the project");
  });

  it("stores 125050 with exponent 2 as 1,250.50 and freezes an immutable snapshot", async () => {
    const buyer = await signupAndLogin(nextId("buyer"));
    const seller = await signupAndLogin(nextId("seller"));
    const created = await request("POST", "/projects", {
      token: buyer.token,
      body: projectBody(seller.userId, {
        title: "Master",
        amount: 125050,
        due_at: futureIso(30),
        revision_allowance: 0,
        deliverable_definition: {
          required_deliverables: ["final_master_wav", "vocal_stems", "vocal_stems"],
          other_description: null,
        },
      }),
    });
    assert.equal(created.status, 201, created.text);
    const milestone = created.json.milestones[0];
    assert.equal(milestone.amount, 125050);
    assert.equal(milestone.currency, "INR");
    assert.equal(milestone.currency_exponent, 2);
    assert.equal(milestone.revision_allowance, 0);
    assert.equal(created.json.project.revision_limit, 4);
    assert.notEqual(milestone.revision_allowance, created.json.project.revision_limit);
    assert.deepEqual(milestone.deliverable_definition.required_deliverables, ["final_master_wav", "vocal_stems"]);
    assert.equal(formatAmount(milestone.amount, milestone.currency_exponent), "1,250.50");
    assert.notEqual(formatAmount(milestone.amount, milestone.currency_exponent), "125,000.50");
    assert.equal(milestone.terms_status, "draft");

    const proposed = await request("POST", `/projects/${created.json.project.id}/propose`, {
      token: buyer.token,
      idempotencyKey: "propose-terms",
      body: { expected_version: created.json.project.version },
    });
    assert.equal(proposed.status, 200, proposed.text);

    const proposalRows = await pool.query(
      `SELECT kind, amount, currency, currency_exponent, revision_allowance, deliverable_definition, title
       FROM milestone_term_versions
       WHERE milestone_id = $1
       ORDER BY kind`,
      [milestone.id]
    );
    assert.equal(proposalRows.rows.length, 1);
    assert.equal(proposalRows.rows[0].kind, "proposal");
    assert.equal(Number(proposalRows.rows[0].amount), 125050);
    assert.equal(proposalRows.rows[0].currency, "INR");
    assert.equal(Number(proposalRows.rows[0].currency_exponent), 2);
    assert.equal(proposalRows.rows[0].revision_allowance, 0);
    assert.deepEqual(proposalRows.rows[0].deliverable_definition.required_deliverables, ["final_master_wav", "vocal_stems"]);
    assert.equal(formatAmount(proposalRows.rows[0].amount, Number(proposalRows.rows[0].currency_exponent)), "1,250.50");

    const live = await pool.query(
      "SELECT terms_status, current_term_version FROM project_milestones WHERE id = $1",
      [milestone.id]
    );
    assert.equal(live.rows[0].terms_status, "frozen");
    assert.equal(live.rows[0].current_term_version, proposed.json.term_version.version_number);

    await assert.rejects(
      pool.query("UPDATE project_milestones SET title = 'Changed' WHERE id = $1", [milestone.id]),
      /locked/
    );
    await assert.rejects(
      pool.query("UPDATE milestone_term_versions SET title = 'Changed' WHERE milestone_id = $1", [milestone.id]),
      /append-only/
    );
    await assert.rejects(
      pool.query("DELETE FROM milestone_term_versions WHERE milestone_id = $1", [milestone.id]),
      /append-only/
    );

    const audit = await pool.query(
      `SELECT event_type, action FROM project_audit_events
       WHERE project_id = $1 AND event_type = 'AUD-PROJECTS-008'`,
      [created.json.project.id]
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].action, "milestone_terms_frozen");

    const invited = await request("POST", `/projects/${created.json.project.id}/invitations`, {
      token: buyer.token,
      idempotencyKey: "invite-terms",
      body: {
        invitee_user_id: seller.userId,
        expires_at: futureIso(7),
        expected_version: proposed.json.project.version,
      },
    });
    assert.equal(invited.status, 201, invited.text);
    const reviewed = await request(
      "GET",
      `/projects/${created.json.project.id}/invitations/${invited.json.invitation.external_id}`,
      { token: seller.token }
    );
    assert.equal(reviewed.status, 200, reviewed.text);
    assert.equal(reviewed.json.proposal.milestones[0].amount, 125050);
    assert.equal(reviewed.json.proposal.milestones[0].currency_exponent, 2);
    assert.equal(reviewed.json.proposal.milestones[0].revision_allowance, 0);
    assert.equal(formatAmount(reviewed.json.proposal.milestones[0].amount, reviewed.json.proposal.milestones[0].currency_exponent), "1,250.50");

    const accepted = await request(
      "POST",
      `/projects/${created.json.project.id}/invitations/${invited.json.invitation.external_id}/accept`,
      {
        token: seller.token,
        idempotencyKey: "accept-terms",
        body: {
          expected_version: invited.json.invitation.project_version,
          expected_proposal_version: invited.json.invitation.proposal_version,
        },
      }
    );
    assert.equal(accepted.status, 200, accepted.text);

    const snapshots = await pool.query(
      `SELECT kind, amount, currency, currency_exponent, revision_allowance, deliverable_definition, title, milestone_no
       FROM milestone_term_versions
       WHERE milestone_id = $1
       ORDER BY kind`,
      [milestone.id]
    );
    assert.deepEqual(
      snapshots.rows.map((row) => row.kind).sort(),
      ["agreed", "proposal"]
    );
    const agreed = snapshots.rows.find((row) => row.kind === "agreed");
    const proposal = snapshots.rows.find((row) => row.kind === "proposal");
    assert.equal(Number(agreed.amount), Number(proposal.amount));
    assert.equal(agreed.currency, proposal.currency);
    assert.equal(Number(agreed.currency_exponent), Number(proposal.currency_exponent));
    assert.equal(agreed.revision_allowance, proposal.revision_allowance);
    assert.deepEqual(agreed.deliverable_definition, proposal.deliverable_definition);
    assert.equal(agreed.title, proposal.title);

    const agreedLive = await pool.query(
      "SELECT terms_status FROM project_milestones WHERE id = $1",
      [milestone.id]
    );
    assert.equal(agreedLive.rows[0].terms_status, "agreed");
    await assert.rejects(
      pool.query("UPDATE project_milestones SET amount = 1 WHERE id = $1", [milestone.id]),
      /locked/
    );
    await assert.rejects(
      pool.query(
        "UPDATE project_milestones SET revision_allowance = 9 WHERE id = $1",
        [milestone.id]
      ),
      /locked/
    );

    const agreedAudit = await pool.query(
      `SELECT action FROM project_audit_events
       WHERE project_id = $1 AND event_type = 'AUD-PROJECTS-008'
       ORDER BY created_at`,
      [created.json.project.id]
    );
    assert.deepEqual(
      agreedAudit.rows.map((row) => row.action),
      ["milestone_terms_frozen", "milestone_terms_agreed"]
    );
  });
});
