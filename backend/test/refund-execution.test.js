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
const { postJournal } = require("../src/escrow/ledger-service");
const { executeRefundInstruction } = require("../src/escrow/refund-service");

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

async function agreedProject(amounts) {
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
  const stored = await pool.query("SELECT version, state FROM projects WHERE id = $1", [project.id]);
  const funded = await request("POST", `/projects/${project.id}/funding-intent`, {
    token: buyer.token,
    idempotencyKey: nextId("fund"),
    body: { expected_version: stored.rows[0].version },
  });
  assert.equal(funded.status, 200, funded.text);
  return { projectId: project.id, projectState: stored.rows[0].state, buyer };
}

async function loadEscrow(projectId) {
  const escrow = await pool.query(
    `SELECT id, status, funded_amount, refunded_amount, currency_exponent
     FROM escrows WHERE project_id = $1`,
    [projectId]
  );
  const allocations = await pool.query(
    `SELECT allocation.id, allocation.allocation_status, allocation.allocated_amount,
            allocation.milestone_id, milestone.state AS milestone_state
     FROM escrow_allocations allocation
     JOIN project_milestones milestone ON milestone.id = allocation.milestone_id
     WHERE allocation.escrow_id = $1
     ORDER BY milestone.milestone_no`,
    [escrow.rows[0].id]
  );
  return { escrow: escrow.rows[0], allocations: allocations.rows };
}

async function captureFunds(escrowId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('musicapp.ledger_posting', 'on', true)");
    const updated = await client.query(
      `UPDATE escrows
       SET status = 'funded', funded_at = clock_timestamp()
       WHERE id = $1 AND status = 'created'
       RETURNING id`,
      [escrowId]
    );
    assert.equal(updated.rowCount, 1);
    await client.query(
      `UPDATE escrow_allocations
       SET allocation_status = 'funded',
           funded_amount = allocated_amount,
           version = version + 1
       WHERE escrow_id = $1 AND allocation_status = 'planned'`,
      [escrowId]
    );
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The transaction is already closed.
    }
    throw error;
  } finally {
    client.release();
  }
  const allocations = await pool.query(
    `SELECT id, milestone_id, allocated_amount
     FROM escrow_allocations
     WHERE escrow_id = $1
     ORDER BY allocated_amount DESC`,
    [escrowId]
  );
  const total = allocations.rows.reduce((sum, row) => sum + Number(row.allocated_amount), 0);
  const posted = await postJournal({
    escrowId,
    idempotencyKey: `capture-${escrowId}`,
    correlationId: `capture-${escrowId}`,
    entries: [
      {
        entryType: "funded",
        amount: total,
        sourceAccount: "EXTERNAL_BUYER",
        destinationAccount: "ESCROW_UNALLOCATED",
      },
      ...allocations.rows.map((row) => ({
        entryType: "allocated_to_milestone",
        amount: Number(row.allocated_amount),
        sourceAccount: "ESCROW_UNALLOCATED",
        destinationAccount: "ESCROW_ALLOCATION",
        allocationId: row.id,
        milestoneId: row.milestone_id,
      })),
    ],
  });
  assert.equal(posted.status, 200, JSON.stringify(posted.body));
}

function refundCommand(escrowId, allocationId, amount, overrides = {}) {
  return {
    escrowId,
    allocationId,
    amount,
    idempotencyKey: overrides.idempotencyKey || nextId("refund"),
    correlationId: overrides.correlationId || nextId("corr"),
    source: overrides.source || "dispute_award",
    sourceReference: overrides.sourceReference || nextId("src"),
    ...overrides.extra,
  };
}

describe("MVP-029 refund execution", { concurrency: 1, timeout: 30000 }, () => {
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

  it("rejects a refund when captured funding is zero and writes nothing", async () => {
    const project = await agreedProject([125050]);
    const loaded = await loadEscrow(project.projectId);
    assert.equal(loaded.escrow.status, "created");
    assert.equal(loaded.escrow.funded_amount, "0");
    const refused = await executeRefundInstruction(refundCommand(
      loaded.escrow.id,
      loaded.allocations[0].id,
      1
    ));
    assert.equal(refused.status, 409, JSON.stringify(refused.body));
    assert.equal(refused.body.error, "A created escrow has no captured funding");
    const rows = await pool.query(
      `SELECT COUNT(*) FROM escrow_ledger
       WHERE escrow_id = $1 AND entry_type = 'refunded_to_buyer'`,
      [loaded.escrow.id]
    );
    assert.equal(rows.rows[0].count, "0");
    const status = await pool.query("SELECT status FROM escrows WHERE id = $1", [loaded.escrow.id]);
    assert.equal(status.rows[0].status, "created");
  });

  it("rejects a refund above captured funding and keeps the prior journal", async () => {
    const project = await agreedProject([100000, 25050]);
    const loaded = await loadEscrow(project.projectId);
    await captureFunds(loaded.escrow.id);
    const larger = loaded.allocations.find((row) => Number(row.allocated_amount) === 100000);
    const smaller = loaded.allocations.find((row) => Number(row.allocated_amount) === 25050);
    const over = await executeRefundInstruction(refundCommand(
      loaded.escrow.id,
      larger.id,
      125051
    ));
    assert.equal(over.status, 409, JSON.stringify(over.body));
    assert.equal(over.body.error, "Cumulative refunds cannot exceed captured funding");
    const first = await executeRefundInstruction(refundCommand(
      loaded.escrow.id,
      larger.id,
      100000,
      { idempotencyKey: "refund-100000", sourceReference: "award-1" }
    ));
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const second = await executeRefundInstruction(refundCommand(
      loaded.escrow.id,
      smaller.id,
      25051,
      { idempotencyKey: "refund-over", sourceReference: "award-2" }
    ));
    assert.equal(second.status, 409, JSON.stringify(second.body));
    assert.equal(second.body.error, "Cumulative refunds cannot exceed captured funding");
    const stored = await pool.query(
      `SELECT refunded_amount, status FROM escrows WHERE id = $1`,
      [loaded.escrow.id]
    );
    assert.equal(stored.rows[0].refunded_amount, "100000");
    assert.equal(stored.rows[0].status, "funded");
    const refunds = await pool.query(
      `SELECT COUNT(*) FROM escrow_ledger
       WHERE escrow_id = $1 AND entry_type = 'refunded_to_buyer'`,
      [loaded.escrow.id]
    );
    assert.equal(refunds.rows[0].count, "1");
  });

  it("posts one refund journal for 125050 and reads it as 1,250.50", async () => {
    const project = await agreedProject([125050]);
    const before = await loadEscrow(project.projectId);
    await captureFunds(before.escrow.id);
    const milestoneBefore = before.allocations[0].milestone_state;
    const refunded = await executeRefundInstruction(refundCommand(
      before.escrow.id,
      before.allocations[0].id,
      125050,
      {
        idempotencyKey: "refund-125050",
        correlationId: "corr-125050",
        source: "projects_cancellation_resolution",
        sourceReference: "resolution-125050",
      }
    ));
    assert.equal(refunded.status, 200, JSON.stringify(refunded.body));
    assert.equal(refunded.body.refund.amount, 125050);
    assert.equal(refunded.body.refund.currency, "INR");
    assert.equal(refunded.body.refund.currency_exponent, 2);
    assert.equal(refunded.body.refund.entry_type, "refunded_to_buyer");
    assert.equal(refunded.body.refund.destination_account, "REFUND_IN_TRANSIT");
    assert.equal(refunded.body.refund.escrow_status, "refunded");
    assert.equal(formatAmount(refunded.body.refund.amount, refunded.body.refund.currency_exponent), "1,250.50");
    assert.notEqual(formatAmount(refunded.body.refund.amount, refunded.body.refund.currency_exponent), "125,000.50");

    const stored = await pool.query(
      `SELECT amount, currency_exponent, entry_type, destination_account
       FROM escrow_ledger
       WHERE escrow_id = $1 AND entry_type = 'refunded_to_buyer'`,
      [before.escrow.id]
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].amount, "125050");
    assert.equal(Number(stored.rows[0].currency_exponent), 2);
    assert.equal(formatAmount(stored.rows[0].amount, Number(stored.rows[0].currency_exponent)), "1,250.50");
    const escrow = await pool.query(
      "SELECT status, refunded_amount, funded_amount FROM escrows WHERE id = $1",
      [before.escrow.id]
    );
    assert.equal(escrow.rows[0].status, "refunded");
    assert.equal(escrow.rows[0].refunded_amount, "125050");
    assert.equal(escrow.rows[0].funded_amount, "125050");
    const paid = await pool.query(
      `SELECT COUNT(*) FROM escrow_ledger
       WHERE escrow_id = $1 AND entry_type = 'refund_paid'`,
      [before.escrow.id]
    );
    assert.equal(paid.rows[0].count, "0");
    const payments = await pool.query("SELECT COUNT(*) FROM payments");
    assert.equal(payments.rows[0].count, "0");
    const milestone = await pool.query(
      "SELECT state FROM project_milestones WHERE id = $1",
      [before.allocations[0].milestone_id]
    );
    assert.equal(milestone.rows[0].state, milestoneBefore);
    const projectState = await pool.query("SELECT state FROM projects WHERE id = $1", [project.projectId]);
    assert.equal(projectState.rows[0].state, project.projectState);
    const audit = await pool.query(
      `SELECT event_type, action FROM project_audit_events
       WHERE project_id = $1 AND event_type = 'AUD-ESCROW-004'`,
      [project.projectId]
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].action, "escrow.refund");
    const events = await pool.query(
      `SELECT event_type FROM outbox_messages
       WHERE event_type IN ('AllocationRefunded', 'EscrowClosed')
       ORDER BY sequence`
    );
    const types = events.rows.map((row) => row.event_type);
    assert.ok(types.includes("AllocationRefunded"));
    assert.ok(types.includes("EscrowClosed"));

    const replay = await executeRefundInstruction(refundCommand(
      before.escrow.id,
      before.allocations[0].id,
      125050,
      {
        idempotencyKey: "refund-125050",
        correlationId: "corr-125050",
        source: "projects_cancellation_resolution",
        sourceReference: "resolution-125050",
      }
    ));
    assert.equal(replay.status, 200);
    assert.equal(replay.body.refund.journal_id, refunded.body.refund.journal_id);
    const mismatch = await executeRefundInstruction(refundCommand(
      before.escrow.id,
      before.allocations[0].id,
      1,
      {
        idempotencyKey: "refund-125050",
        correlationId: "corr-125050",
        source: "projects_cancellation_resolution",
        sourceReference: "resolution-125050",
      }
    ));
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.body.error, "Idempotency-Key was already used with a different request");
    const stillOne = await pool.query(
      `SELECT COUNT(*) FROM escrow_ledger
       WHERE escrow_id = $1 AND entry_type = 'refunded_to_buyer'`,
      [before.escrow.id]
    );
    assert.equal(stillOne.rows[0].count, "1");
  });

  it("rejects a cancellation, an unknown source, a client currency, and an administrator refund without a reason", async () => {
    const project = await agreedProject([125050]);
    const loaded = await loadEscrow(project.projectId);
    await captureFunds(loaded.escrow.id);
    const base = {
      escrowId: loaded.escrow.id,
      allocationId: loaded.allocations[0].id,
      amount: 1,
      idempotencyKey: "refund-reject",
      correlationId: "corr-reject",
      sourceReference: "src-reject",
    };
    const cancellation = await executeRefundInstruction({ ...base, source: "cancellation", action: "cancellation" });
    assert.equal(cancellation.status, 422);
    assert.equal(cancellation.body.error, "Cancellation is not a refund");
    const unknown = await executeRefundInstruction({ ...base, source: "buyer_request", idempotencyKey: "refund-buyer" });
    assert.equal(unknown.status, 422);
    assert.equal(unknown.body.error, "Refund instruction source is not authorized");
    const currency = await executeRefundInstruction({
      ...base,
      source: "dispute_award",
      idempotencyKey: "refund-currency",
      currency: "USD",
    });
    assert.equal(currency.status, 422);
    assert.equal(currency.body.error, "Refund currency is taken from the escrow");
    const admin = await executeRefundInstruction({
      ...base,
      source: "administrator",
      idempotencyKey: "refund-admin",
    });
    assert.equal(admin.status, 422);
    assert.equal(admin.body.error, "An administrator refund records a reason");
    const rows = await pool.query(
      `SELECT COUNT(*) FROM escrow_ledger
       WHERE escrow_id = $1 AND entry_type = 'refunded_to_buyer'`,
      [loaded.escrow.id]
    );
    assert.equal(rows.rows[0].count, "0");
  });

  it("has no client refund route", async () => {
    const project = await agreedProject([125050]);
    const missing = await request("POST", `/projects/${project.projectId}/refunds`, {
      token: project.buyer.token,
      idempotencyKey: nextId("http-refund"),
      body: { amount: 1 },
    });
    assert.equal(missing.status, 404);
  });

  it("lets one of two concurrent refunds win and does not refund twice", async () => {
    const sameProject = await agreedProject([125050]);
    const sameLoaded = await loadEscrow(sameProject.projectId);
    await captureFunds(sameLoaded.escrow.id);
    const sameCommand = {
      escrowId: sameLoaded.escrow.id,
      allocationId: sameLoaded.allocations[0].id,
      amount: 125050,
      correlationId: "corr-race",
      source: "verified_funding_exception",
      sourceReference: "reversal-1",
    };
    const raced = await Promise.all([
      executeRefundInstruction({ ...sameCommand, idempotencyKey: "refund-race" }),
      executeRefundInstruction({ ...sameCommand, idempotencyKey: "refund-race" }),
    ]);
    assert.equal(raced.filter((result) => result.status === 200).length, 2, JSON.stringify(raced));
    assert.equal(raced[0].body.refund.journal_id, raced[1].body.refund.journal_id);

    const project = await agreedProject([125050]);
    const loaded = await loadEscrow(project.projectId);
    await captureFunds(loaded.escrow.id);
    const competing = await Promise.all([
      executeRefundInstruction({
        escrowId: loaded.escrow.id,
        allocationId: loaded.allocations[0].id,
        amount: 125050,
        idempotencyKey: "refund-left",
        source: "dispute_award",
        sourceReference: "left",
        correlationId: "corr-left",
      }),
      executeRefundInstruction({
        escrowId: loaded.escrow.id,
        allocationId: loaded.allocations[0].id,
        amount: 125050,
        idempotencyKey: "refund-right",
        source: "dispute_award",
        sourceReference: "right",
        correlationId: "corr-right",
      }),
    ]);
    const statuses = competing.map((result) => result.status).sort();
    assert.deepEqual(statuses, [200, 409], JSON.stringify(competing));
    const stored = await pool.query(
      `SELECT status, refunded_amount FROM escrows WHERE id = $1`,
      [loaded.escrow.id]
    );
    assert.equal(stored.rows[0].refunded_amount, "125050");
    assert.equal(stored.rows[0].status, "refunded");
    const refunds = await pool.query(
      `SELECT COUNT(*) FROM escrow_ledger
       WHERE escrow_id = $1 AND entry_type = 'refunded_to_buyer'`,
      [loaded.escrow.id]
    );
    assert.equal(refunds.rows[0].count, "1");
  });
});
