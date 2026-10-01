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
const { formatAmount } = require("../src/money/amount");
const { createFundingIntent } = require("../src/escrow/service");

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

async function agreeProject(amounts) {
  const buyer = await signupAndLogin(nextId("buyer"));
  const seller = await signupAndLogin(nextId("seller"));
  const price = amounts.reduce((sum, amount) => sum + amount, 0);
  const created = await request("POST", "/projects", {
    token: buyer.token,
    body: {
      seller_user_id: seller.userId,
      title: "Session",
      requirements: "Stems",
      price_amount: price,
      delivery_days: 7,
      milestones: amounts.map((amount, index) => withMilestoneTerms({
        title: `Milestone ${index + 1}`,
        amount,
        due_at: futureIso(30 + index),
      })),
    },
  });
  assert.equal(created.status, 201, created.text);
  const project = created.json.project;
  const current = await pool.query("SELECT version FROM projects WHERE id = $1", [project.id]);
  const proposed = await request("POST", `/projects/${project.id}/propose`, {
    token: buyer.token,
    idempotencyKey: nextId("propose"),
    body: { expected_version: current.rows[0].version },
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
  const stored = await pool.query(
    `SELECT version, state, agreed_term_version, currency, currency_exponent, price_amount, external_id
     FROM projects WHERE id = $1`,
    [project.id]
  );
  return { buyer, seller, project, stored: stored.rows[0] };
}

function fund(actor, projectId, version, key, extra) {
  return request("POST", `/projects/${projectId}/funding-intent`, {
    token: actor.token,
    idempotencyKey: key,
    body: { expected_version: version, ...extra },
  });
}

describe("MVP-024 funding intent", { concurrency: 1, timeout: 30000 }, () => {
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

  it("creates an escrow and planned allocations equal to the agreed milestone amounts", async () => {
    const agreed = await agreeProject([100000, 25050]);
    assert.equal(agreed.stored.state, "accepted");
    assert.equal(formatAmount(125050, 2), "1,250.50");
    assert.notEqual(formatAmount(125050, 2), "125,000.50");

    const created = await fund(agreed.buyer, agreed.project.id, agreed.stored.version, "fund-agreed");
    assert.equal(created.status, 200, created.text);
    const escrow = created.json.escrow;
    assert.equal(escrow.status, "created");
    assert.equal(escrow.currency, "INR");
    assert.equal(escrow.currency_exponent, 2);
    assert.equal(escrow.expected_amount, 125050);
    assert.equal(escrow.agreed_term_version, agreed.stored.agreed_term_version);
    assert.equal(escrow.project_external_id, agreed.stored.external_id);
    assert.deepEqual(escrow.fee_snapshot.fee_lines, []);
    assert.equal(escrow.fee_snapshot.schedule_version, null);
    assert.equal(escrow.allocations.length, 2);
    assert.deepEqual(
      escrow.allocations.map((row) => row.allocated_amount),
      [100000, 25050]
    );
    for (const allocation of escrow.allocations) {
      assert.equal(allocation.currency, "INR");
      assert.equal(allocation.currency_exponent, 2);
      assert.equal(allocation.allocation_status, "planned");
      assert.equal(allocation.revision_number, 1);
    }

    const stored = await pool.query(
      `SELECT status, currency, currency_exponent, expected_amount,
              funded_amount, released_amount, refunded_amount, allocated_amount
       FROM escrows WHERE external_id = $1`,
      [escrow.external_id]
    );
    assert.equal(stored.rows[0].status, "created");
    assert.equal(stored.rows[0].currency, "INR");
    assert.equal(Number(stored.rows[0].currency_exponent), 2);
    assert.equal(Number(stored.rows[0].expected_amount), 125050);
    assert.equal(Number(stored.rows[0].funded_amount), 0);
    assert.equal(Number(stored.rows[0].released_amount), 0);
    assert.equal(Number(stored.rows[0].refunded_amount), 0);
    assert.equal(Number(stored.rows[0].allocated_amount), 0);

    const project = await pool.query("SELECT state FROM projects WHERE id = $1", [agreed.project.id]);
    assert.equal(project.rows[0].state, "accepted");
    const milestones = await pool.query(
      "SELECT state FROM project_milestones WHERE project_id = $1 ORDER BY milestone_no",
      [agreed.project.id]
    );
    assert.deepEqual(milestones.rows.map((row) => row.state), ["planned", "planned"]);
    const ledger = await pool.query("SELECT COUNT(*)::int AS count FROM escrow_ledger");
    const payments = await pool.query("SELECT COUNT(*)::int AS count FROM payments");
    assert.equal(ledger.rows[0].count, 0);
    assert.equal(payments.rows[0].count, 0);

    const audit = await pool.query(
      `SELECT event_type, action, outcome, source_state, target_state
       FROM project_audit_events
       WHERE project_id = $1 AND event_type = 'AUD-ESCROW-001'`,
      [agreed.project.id]
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].action, "escrow.create");
    assert.equal(audit.rows[0].outcome, "created");
    assert.equal(audit.rows[0].source_state, null);
    assert.equal(audit.rows[0].target_state, "created");

    const outbox = await pool.query(
      `SELECT event_type, payload
       FROM outbox_messages
       WHERE aggregate_id = $1`,
      [escrow.external_id]
    );
    assert.equal(outbox.rows.length, 1);
    assert.equal(outbox.rows[0].event_type, "EscrowStateChanged");
    assert.equal(outbox.rows[0].payload.target_state, "created");
    assert.equal(outbox.rows[0].payload.source_state, null);
    assert.equal(outbox.rows[0].payload.trigger_fact_id, "fund-agreed");
    assert.equal(outbox.rows[0].payload.project_external_id, agreed.stored.external_id);

    const replay = await fund(agreed.buyer, agreed.project.id, agreed.stored.version, "fund-agreed");
    assert.equal(replay.status, 200, replay.text);
    assert.deepEqual(replay.json, created.json);
    const rows = await pool.query(
      "SELECT COUNT(*)::int AS count FROM escrows WHERE project_id = $1",
      [agreed.project.id]
    );
    assert.equal(rows.rows[0].count, 1);

    const again = await fund(agreed.buyer, agreed.project.id, agreed.stored.version, "fund-again");
    assert.equal(again.status, 409);
    assert.equal(again.json.error, "An active escrow already exists");
    const stillOne = await pool.query(
      "SELECT COUNT(*)::int AS count FROM escrows WHERE project_id = $1",
      [agreed.project.id]
    );
    assert.equal(stillOne.rows[0].count, 1);
  });

  it("rejects a client amount or currency and an unagreed project", async () => {
    const agreed = await agreeProject([125050]);
    const priced = await fund(
      agreed.buyer,
      agreed.project.id,
      agreed.stored.version,
      "fund-client-amount",
      { amount: 1, currency: "USD", currency_exponent: 0 }
    );
    assert.equal(priced.status, 400);
    assert.equal(priced.json.error, "Funding amount and currency are taken from the agreed terms");
    const none = await pool.query(
      "SELECT COUNT(*)::int AS count FROM escrows WHERE project_id = $1",
      [agreed.project.id]
    );
    assert.equal(none.rows[0].count, 0);

    const buyer = await signupAndLogin(nextId("draft-buyer"));
    const seller = await signupAndLogin(nextId("draft-seller"));
    const draft = await request("POST", "/projects", {
      token: buyer.token,
      body: {
        seller_user_id: seller.userId,
        title: "Draft",
        requirements: "Stems",
        price_amount: 100,
        delivery_days: 7,
        milestones: [withMilestoneTerms({ title: "Only", amount: 100, due_at: futureIso(30) })],
      },
    });
    assert.equal(draft.status, 201, draft.text);
    const version = await pool.query("SELECT version FROM projects WHERE id = $1", [draft.json.project.id]);
    const unagreed = await fund(buyer, draft.json.project.id, version.rows[0].version, "fund-draft");
    assert.equal(unagreed.status, 409);
    assert.equal(unagreed.json.error, "Project is not fundable");
  });

  it("denies an unrelated user, the seller, and a non-active buyer", async () => {
    const agreed = await agreeProject([100]);
    const stranger = await signupAndLogin(nextId("stranger"));
    const hidden = await fund(stranger, agreed.project.id, agreed.stored.version, "fund-stranger");
    assert.equal(hidden.status, 404);
    assert.equal(hidden.json.error, "Project not found");

    const sellerAttempt = await fund(agreed.seller, agreed.project.id, agreed.stored.version, "fund-seller");
    assert.equal(sellerAttempt.status, 403);
    assert.equal(sellerAttempt.json.error, "Only the project buyer can fund");

    await pool.query("UPDATE users SET status = 'suspended' WHERE id = $1", [agreed.buyer.userId]);
    try {
      const httpDenied = await fund(agreed.buyer, agreed.project.id, agreed.stored.version, "fund-suspended-http");
      assert.equal(httpDenied.status, 401);
      const direct = await createFundingIntent(
        agreed.project.id,
        { expected_version: agreed.stored.version },
        agreed.buyer.userId,
        "fund-suspended-direct"
      );
      assert.equal(direct.status, 403);
      assert.equal(direct.body.error, "Account cannot fund");
      await pool.query("UPDATE users SET status = 'deleted' WHERE id = $1", [agreed.buyer.userId]);
      const deleted = await createFundingIntent(
        agreed.project.id,
        { expected_version: agreed.stored.version },
        agreed.buyer.userId,
        "fund-deleted-direct"
      );
      assert.equal(deleted.status, 403);
      assert.equal(deleted.body.error, "Account cannot fund");
    } finally {
      await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [agreed.buyer.userId]);
    }
    const absent = await pool.query(
      "SELECT COUNT(*)::int AS count FROM escrows WHERE project_id = $1",
      [agreed.project.id]
    );
    assert.equal(absent.rows[0].count, 0);
  });

  it("lets one of two concurrent intents create the only escrow", async () => {
    const agreed = await agreeProject([400, 600]);
    const [first, second] = await Promise.all([
      fund(agreed.buyer, agreed.project.id, agreed.stored.version, "fund-race-a"),
      fund(agreed.buyer, agreed.project.id, agreed.stored.version, "fund-race-b"),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const winner = first.status === 200 ? first : second;
    assert.equal(winner.json.escrow.expected_amount, 1000);
    assert.equal(winner.json.escrow.currency, "INR");
    const rows = await pool.query(
      "SELECT COUNT(*)::int AS count FROM escrows WHERE project_id = $1",
      [agreed.project.id]
    );
    assert.equal(rows.rows[0].count, 1);
    const allocations = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM escrow_allocations allocation
       JOIN escrows escrow ON escrow.id = allocation.escrow_id
       WHERE escrow.project_id = $1`,
      [agreed.project.id]
    );
    assert.equal(allocations.rows[0].count, 2);
  });

  it("rejects a stale version and keeps the same key reusable after that rejection", async () => {
    const agreed = await agreeProject([80]);
    const stale = await fund(agreed.buyer, agreed.project.id, agreed.stored.version + 1, "fund-stale");
    assert.equal(stale.status, 409);
    assert.equal(stale.json.error, "Project version is stale");
    const created = await fund(agreed.buyer, agreed.project.id, agreed.stored.version, "fund-stale");
    assert.equal(created.status, 200, created.text);
    assert.equal(created.json.escrow.expected_amount, 80);
  });

  it("stores expected amount as bigint minor units and rejects a mismatched allocation", async () => {
    const column = await pool.query(
      `SELECT data_type
       FROM information_schema.columns
       WHERE table_name = 'escrows' AND column_name = 'expected_amount'`
    );
    assert.equal(column.rows[0].data_type, "bigint");

    const agreed = await agreeProject([125050]);
    const funded = await fund(agreed.buyer, agreed.project.id, agreed.stored.version, "fund-constraints");
    assert.equal(funded.status, 200, funded.text);
    const escrow = await pool.query(
      `SELECT id, buyer_user_id, seller_user_id, agreed_term_version, currency, currency_exponent
       FROM escrows WHERE external_id = $1`,
      [funded.json.escrow.external_id]
    );
    const milestone = await pool.query(
      "SELECT id, amount FROM project_milestones WHERE project_id = $1",
      [agreed.project.id]
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await assert.rejects(
        client.query(
          `INSERT INTO escrow_allocations (
             external_id, escrow_id, milestone_id, revision_number, term_version,
             allocated_amount, currency, currency_exponent, allocation_status
           )
           VALUES ($1, $2, $3, 2, $4, $5, 'INR', 2, 'planned')`,
          [
            "eal_0123456789abcdef0123",
            escrow.rows[0].id,
            milestone.rows[0].id,
            escrow.rows[0].agreed_term_version,
            Number(milestone.rows[0].amount) + 1,
          ]
        ),
        /allocation amount must equal the milestone agreed amount/
      );
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await assert.rejects(
        client.query(
          `UPDATE escrows SET funded_amount = expected_amount WHERE id = $1`,
          [escrow.rows[0].id]
        ),
        /escrow projections and status change only through ledger posting/
      );
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await assert.rejects(
        client.query(
          `UPDATE escrows SET status = 'funded' WHERE id = $1`,
          [escrow.rows[0].id]
        ),
        /escrow projections and status change only through ledger posting|legacy escrow status/
      );
      await client.query("ROLLBACK");

      const foreignKeys = await client.query(
        `SELECT conname, confdeltype
         FROM pg_constraint
         WHERE conname IN (
           'escrows_project_fk',
           'escrow_allocations_escrow_fk',
           'escrow_allocations_milestone_fk'
         )
         ORDER BY conname`
      );
      assert.deepEqual(
        foreignKeys.rows.map((row) => [row.conname, row.confdeltype]),
        [
          ["escrow_allocations_escrow_fk", "r"],
          ["escrow_allocations_milestone_fk", "r"],
          ["escrows_project_fk", "r"],
        ]
      );
    } finally {
      client.release();
    }

    const other = await agreeProject([10]);
    const otherClient = await pool.connect();
    try {
      await otherClient.query("BEGIN");
      const snapshot = await otherClient.query(
        `INSERT INTO escrow_fee_snapshots (external_id, fee_lines, currency, currency_exponent)
         VALUES ('efs_0123456789abcdef0123', '[]'::jsonb, 'INR', 2)
         RETURNING id`
      );
      const inserted = await otherClient.query(
        `INSERT INTO escrows (
           external_id, project_id, buyer_user_id, seller_user_id, agreed_term_version,
           currency, currency_exponent, expected_amount, fee_snapshot_id, status
         )
         VALUES ('esc_0123456789abcdef0123', $1, $2, $3, $4, 'INR', 2, $5, $6, 'created')
         RETURNING expected_amount`,
        [
          other.project.id,
          escrow.rows[0].buyer_user_id,
          escrow.rows[0].seller_user_id,
          other.stored.agreed_term_version,
          "3000000000",
          snapshot.rows[0].id,
        ]
      );
      assert.equal(inserted.rows[0].expected_amount, "3000000000");
      await otherClient.query("ROLLBACK");

      await otherClient.query("BEGIN");
      const secondSnapshot = await otherClient.query(
        `INSERT INTO escrow_fee_snapshots (external_id, fee_lines, currency, currency_exponent)
         VALUES ('efs_abcdef0123456789abcd', '[]'::jsonb, 'INR', 2)
         RETURNING id`
      );
      await assert.rejects(
        otherClient.query(
          `INSERT INTO escrows (
             external_id, project_id, buyer_user_id, seller_user_id, agreed_term_version,
             currency, currency_exponent, expected_amount, fee_snapshot_id, status
           )
           VALUES ('esc_abcdef0123456789abcd', $1, $2, $3, $4, 'INR', 2, 10, $5, 'created')`,
          [
            agreed.project.id,
            escrow.rows[0].buyer_user_id,
            escrow.rows[0].seller_user_id,
            agreed.stored.agreed_term_version,
            secondSnapshot.rows[0].id,
          ]
        ),
        /escrows_one_active_per_project/
      );
    } finally {
      await otherClient.query("ROLLBACK").catch(() => {});
      otherClient.release();
    }
  });
});
