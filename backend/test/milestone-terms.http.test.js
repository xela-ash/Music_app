const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  ensureMigrated,
  resetApplicationData,
  startServer,
  closeServer,
  stopPool,
} = require("./harness");
const pool = require("../db/db");
const { formatAmount } = require("../src/money/amount");
const { proposalHash } = require("../src/projects/invitation-rules");
const transitionRepository = require("../src/projects/transition-repository");

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

function hexId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function migrationFunction(filename) {
  const sql = fs.readFileSync(path.join(__dirname, "../db", filename), "utf8");
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION protect_locked_milestones()");
  const end = sql.indexOf("$$ LANGUAGE plpgsql;", start);
  return sql.slice(start, end);
}

async function seedProposedWithoutSnapshots(buyer, seller, { incomplete, state }) {
  const created = await request("POST", "/projects", {
    token: buyer.token,
    body: projectBody(seller.userId, {
      title: "Master",
      amount: 125050,
      due_at: futureIso(30),
      revision_allowance: 0,
      deliverable_definition: {
        required_deliverables: ["final_master_wav"],
        other_description: null,
      },
    }),
  });
  assert.equal(created.status, 201, created.text);
  const projectId = created.json.project.id;
  const milestoneId = created.json.milestones[0].id;
  const proposal = await transitionRepository.insertProposalVersion(pool, projectId, hexId("ptv"));
  const proposalVersion = proposal.rows[0].version_number;
  await pool.query(
    "UPDATE projects SET state = $2::project_state, proposal_version = $3 WHERE id = $1",
    [projectId, state, proposalVersion]
  );
  if (incomplete) {
    await pool.query(
      `UPDATE project_milestones
       SET revision_allowance = NULL, deliverable_definition = NULL
       WHERE id = $1`,
      [milestoneId]
    );
  }
  const project = await pool.query(
    `SELECT title, requirements, price_amount, currency, delivery_days, revision_limit, version
     FROM projects WHERE id = $1`,
    [projectId]
  );
  const milestones = await pool.query(
    `SELECT milestone_no, title, description, deliverable_definition, revision_allowance,
            amount, currency, currency_exponent, due_at
     FROM project_milestones
     WHERE project_id = $1
     ORDER BY milestone_no`,
    [projectId]
  );
  const externalId = hexId("inv");
  if (state === "seller_invited") {
    await pool.query(
      `INSERT INTO project_invitations (
         external_id, project_id, inviter_user_id, invitee_user_id,
         proposal_version, proposal_hash, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, clock_timestamp() + interval '7 days')`,
      [
        externalId,
        projectId,
        buyer.userId,
        seller.userId,
        proposalVersion,
        proposalHash(project.rows[0], milestones.rows),
      ]
    );
  }
  return {
    projectId,
    milestoneId,
    externalId,
    proposalVersion,
    version: project.rows[0].version,
  };
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

  it("keeps agreed terms complete and rejects a later incomplete freeze", async () => {
    const migration016 = fs.readFileSync(path.join(__dirname, "../db/016_milestone_term_versions.sql"), "utf8");
    const backfill = migration016.indexOf("SET terms_status = 'frozen'");
    const replacement = migration016.indexOf("CREATE OR REPLACE FUNCTION protect_locked_milestones()");
    assert.ok(backfill > 0 && backfill < replacement);
    assert.equal(migration016.includes("project_milestones_frozen_terms_complete"), false);
    const migration017 = fs.readFileSync(path.join(__dirname, "../db/017_milestone_terms_repair.sql"), "utf8");
    assert.match(migration017, /DROP CONSTRAINT IF EXISTS project_milestones_frozen_terms_complete/);
    assert.equal(migrationFunction("016_milestone_term_versions.sql"), migrationFunction("017_milestone_terms_repair.sql"));

    const constraints = await pool.query(
      `SELECT conname
       FROM pg_constraint
       WHERE conname IN (
         'project_milestones_frozen_terms_complete',
         'project_milestones_agreed_terms_complete'
       )`
    );
    assert.deepEqual(
      constraints.rows.map((row) => row.conname),
      ["project_milestones_agreed_terms_complete"]
    );
    const definition = await pool.query(
      `SELECT pg_get_functiondef(proname::regproc) AS def
       FROM pg_proc
       WHERE proname = 'protect_locked_milestones'`
    );
    assert.match(definition.rows[0].def, /Milestone terms are incomplete/);
  });

  it("refuses to lock a milestone that has no revision allowance", async () => {
    const buyer = await signupAndLogin(nextId("buyer"));
    const seller = await signupAndLogin(nextId("seller"));
    const created = await request("POST", "/projects", {
      token: buyer.token,
      body: projectBody(seller.userId, {
        title: "Master",
        amount: 100,
        due_at: futureIso(30),
        revision_allowance: 0,
        deliverable_definition: {
          required_deliverables: ["lyrics"],
          other_description: null,
        },
      }),
    });
    assert.equal(created.status, 201, created.text);
    await pool.query(
      "UPDATE project_milestones SET revision_allowance = NULL WHERE id = $1",
      [created.json.milestones[0].id]
    );
    const locked = await request("POST", `/projects/${created.json.project.id}/lock-milestones`, {
      token: buyer.token,
    });
    assert.equal(locked.status, 400, locked.text);
    assert.equal(
      locked.json.error,
      "Each milestone must include a revision allowance and a catalogue selection"
    );
    const stored = await pool.query(
      "SELECT milestones_locked_at FROM projects WHERE id = $1",
      [created.json.project.id]
    );
    assert.equal(stored.rows[0].milestones_locked_at, null);
  });

  it("does not invite a proposal whose revision allowance is missing", async () => {
    const buyer = await signupAndLogin(nextId("buyer"));
    const seller = await signupAndLogin(nextId("seller"));
    const seeded = await seedProposedWithoutSnapshots(buyer, seller, {
      incomplete: true,
      state: "proposed",
    });
    const invited = await request("POST", `/projects/${seeded.projectId}/invitations`, {
      token: buyer.token,
      idempotencyKey: nextId("invite"),
      body: {
        invitee_user_id: seller.userId,
        expires_at: futureIso(7),
        expected_version: seeded.version,
      },
    });
    assert.equal(invited.status, 409, invited.text);
    assert.equal(invited.json.error, "Proposal is not ready for invitation");
  });

  it("accepts a proposal that has complete live terms and no milestone snapshots", async () => {
    const buyer = await signupAndLogin(nextId("buyer"));
    const seller = await signupAndLogin(nextId("seller"));
    const seeded = await seedProposedWithoutSnapshots(buyer, seller, {
      incomplete: false,
      state: "seller_invited",
    });
    const accepted = await request(
      "POST",
      `/projects/${seeded.projectId}/invitations/${seeded.externalId}/accept`,
      {
        token: seller.token,
        idempotencyKey: nextId("accept"),
        body: {
          expected_version: seeded.version,
          expected_proposal_version: seeded.proposalVersion,
        },
      }
    );
    assert.equal(accepted.status, 200, accepted.text);
    const snapshots = await pool.query(
      `SELECT kind FROM milestone_term_versions WHERE milestone_id = $1 ORDER BY kind`,
      [seeded.milestoneId]
    );
    assert.deepEqual(
      snapshots.rows.map((row) => row.kind),
      ["agreed", "proposal"]
    );
    const live = await pool.query(
      "SELECT terms_status FROM project_milestones WHERE id = $1",
      [seeded.milestoneId]
    );
    assert.equal(live.rows[0].terms_status, "agreed");
  });

  it("returns 409 when acceptance has no snapshot and the live terms are incomplete", async () => {
    const buyer = await signupAndLogin(nextId("buyer"));
    const seller = await signupAndLogin(nextId("seller"));
    const seeded = await seedProposedWithoutSnapshots(buyer, seller, {
      incomplete: true,
      state: "seller_invited",
    });
    const accepted = await request(
      "POST",
      `/projects/${seeded.projectId}/invitations/${seeded.externalId}/accept`,
      {
        token: seller.token,
        idempotencyKey: nextId("accept"),
        body: {
          expected_version: seeded.version,
          expected_proposal_version: seeded.proposalVersion,
        },
      }
    );
    assert.equal(accepted.status, 409, accepted.text);
    assert.equal(accepted.json.error, "Proposal is not ready");
    const agreed = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM project_term_versions
       WHERE project_id = $1 AND represented_state = 'agreed'`,
      [seeded.projectId]
    );
    assert.equal(agreed.rows[0].count, 0);
    const snapshots = await pool.query(
      "SELECT COUNT(*)::int AS count FROM milestone_term_versions WHERE milestone_id = $1",
      [seeded.milestoneId]
    );
    assert.equal(snapshots.rows[0].count, 0);
    const invitation = await pool.query(
      "SELECT status FROM project_invitations WHERE external_id = $1",
      [seeded.externalId]
    );
    assert.equal(invitation.rows[0].status, "pending");
  });
});
