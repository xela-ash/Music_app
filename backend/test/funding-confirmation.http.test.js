process.env.PAYMENT_PROVIDER = "mock";
process.env.MOCK_PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { ensureMigrated, resetApplicationData, startServer, closeServer, stopPool } = require("./harness");
const pool = require("../db/db");
const { withMilestoneTerms } = require("./milestone-fixture");
const { sign } = require("../src/payments/mock-adapter");

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

async function request(method, requestPath, { token, body, idempotencyKey, raw, headers } = {}) {
  const requestHeaders = { ...(headers || {}) };
  if (token) {
    requestHeaders.authorization = `Bearer ${token}`;
  }
  if (idempotencyKey) {
    requestHeaders["idempotency-key"] = idempotencyKey;
  }
  let payload;
  if (raw !== undefined) {
    payload = raw;
  } else if (body !== undefined) {
    requestHeaders["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers: requestHeaders,
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
    "SELECT version, state FROM projects WHERE id = $1",
    [project.id]
  );
  return { buyer, seller, project, stored: stored.rows[0] };
}

async function openFunding(agreed) {
  const intent = await request("POST", `/projects/${agreed.project.id}/funding-intent`, {
    token: agreed.buyer.token,
    idempotencyKey: nextId("intent"),
    body: { expected_version: agreed.stored.version },
  });
  assert.equal(intent.status, 200, intent.text);
  const version = await pool.query("SELECT version FROM projects WHERE id = $1", [agreed.project.id]);
  const payment = await request("POST", `/projects/${agreed.project.id}/funding-payments`, {
    token: agreed.buyer.token,
    idempotencyKey: nextId("pay"),
    body: { expected_version: version.rows[0].version },
  });
  assert.equal(payment.status, 200, payment.text);
  return payment.json.payment;
}

function webhook(event) {
  const raw = Buffer.from(JSON.stringify(event));
  return request("POST", "/payments/webhooks/mock", {
    raw,
    headers: {
      "content-type": "application/json",
      "x-musicapp-signature": sign(raw),
    },
  });
}

describe("MVP-025 funding confirmation", { concurrency: 1, timeout: 30000 }, () => {
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

  it("confirms funding from the mock provider and funds the escrow", async () => {
    const agreed = await agreeProject([100000, 25050]);
    const payment = await openFunding(agreed);
    assert.equal(payment.status, "requires_action");
    assert.equal(payment.amount, 125050);
    assert.equal(payment.currency, "INR");
    assert.equal(payment.provider, "mock");
    const confirmed = await webhook({
      event_id: nextId("evt"),
      type: "payment.succeeded",
      provider_reference: payment.continuation.provider_reference,
      amount_minor: 125050,
      currency: "INR",
      occurred_at: new Date().toISOString(),
    });
    assert.equal(confirmed.status, 200, confirmed.text);
    assert.equal(confirmed.json.outcome, "applied");
    const stored = await pool.query(
      `SELECT payment.status AS payment_status, escrow.status AS escrow_status,
              escrow.funded_amount, project.state AS project_state
       FROM payments payment
       JOIN escrows escrow ON escrow.id = payment.escrow_id
       JOIN projects project ON project.id = payment.project_id
       WHERE payment.external_id = $1`,
      [payment.external_id]
    );
    assert.equal(stored.rows[0].payment_status, "succeeded");
    assert.equal(stored.rows[0].escrow_status, "funded");
    assert.equal(Number(stored.rows[0].funded_amount), 125050);
    assert.equal(stored.rows[0].project_state, "funded");
    const milestones = await pool.query(
      `SELECT state FROM project_milestones WHERE project_id = $1 ORDER BY milestone_no`,
      [agreed.project.id]
    );
    assert.deepEqual(milestones.rows.map((row) => row.state), ["funded", "funded"]);
  });

  it("rejects a client amount, a seller, and a forged webhook", async () => {
    const agreed = await agreeProject([500]);
    const intent = await request("POST", `/projects/${agreed.project.id}/funding-intent`, {
      token: agreed.buyer.token,
      idempotencyKey: nextId("intent"),
      body: { expected_version: agreed.stored.version },
    });
    assert.equal(intent.status, 200, intent.text);
    const version = await pool.query("SELECT version FROM projects WHERE id = $1", [agreed.project.id]);
    const clientAmount = await request("POST", `/projects/${agreed.project.id}/funding-payments`, {
      token: agreed.buyer.token,
      idempotencyKey: nextId("pay"),
      body: { expected_version: version.rows[0].version, amount: 1 },
    });
    assert.equal(clientAmount.status, 400);
    const seller = await request("POST", `/projects/${agreed.project.id}/funding-payments`, {
      token: agreed.seller.token,
      idempotencyKey: nextId("pay"),
      body: { expected_version: version.rows[0].version },
    });
    assert.equal(seller.status, 403);
    const paymentResponse = await request("POST", `/projects/${agreed.project.id}/funding-payments`, {
      token: agreed.buyer.token,
      idempotencyKey: nextId("pay"),
      body: { expected_version: version.rows[0].version },
    });
    assert.equal(paymentResponse.status, 200, paymentResponse.text);
    const payment = paymentResponse.json.payment;
    const forged = await request("POST", "/payments/webhooks/mock", {
      raw: Buffer.from("{}"),
      headers: { "x-musicapp-signature": "forged" },
    });
    assert.equal(forged.status, 401);
    const unchanged = await pool.query(
      "SELECT status FROM payments WHERE external_id = $1",
      [payment.external_id]
    );
    assert.equal(unchanged.rows[0].status, "requires_action");
  });

  it("quarantines an amount mismatch and does not fund", async () => {
    const agreed = await agreeProject([800]);
    const payment = await openFunding(agreed);
    const mismatch = await webhook({
      event_id: nextId("evt"),
      type: "payment.succeeded",
      provider_reference: payment.continuation.provider_reference,
      amount_minor: 801,
      currency: "INR",
      occurred_at: new Date().toISOString(),
    });
    assert.equal(mismatch.status, 200, mismatch.text);
    assert.equal(mismatch.json.outcome, "quarantined");
    const escrow = await pool.query(
      `SELECT escrow.status FROM escrows escrow
       JOIN payments payment ON payment.escrow_id = escrow.id
       WHERE payment.external_id = $1`,
      [payment.external_id]
    );
    assert.equal(escrow.rows[0].status, "created");
  });

  it("deduplicates a webhook and ignores a failed event after success", async () => {
    const agreed = await agreeProject([900]);
    const payment = await openFunding(agreed);
    const event = {
      event_id: nextId("evt"),
      type: "payment.succeeded",
      provider_reference: payment.continuation.provider_reference,
      amount_minor: 900,
      currency: "INR",
      occurred_at: new Date().toISOString(),
    };
    const first = await webhook(event);
    const second = await webhook(event);
    assert.equal(first.json.outcome, "applied");
    assert.equal(second.json.outcome, "duplicate");
    const reversed = await webhook({
      ...event,
      event_id: nextId("evt"),
      type: "payment.failed",
      occurred_at: new Date(Date.now() + 1000).toISOString(),
    });
    assert.equal(reversed.json.outcome, "ignored");
    const journals = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM escrow_ledger ledger
       JOIN payments payment ON payment.escrow_id = ledger.escrow_id
       WHERE payment.external_id = $1 AND ledger.entry_type = 'funded'`,
      [payment.external_id]
    );
    assert.equal(journals.rows[0].count, 1);
    const status = await pool.query(
      "SELECT status FROM payments WHERE external_id = $1",
      [payment.external_id]
    );
    assert.equal(status.rows[0].status, "succeeded");
  });

  it("does not fund an expired attempt and lets a new attempt use its own key", async () => {
    const agreed = await agreeProject([700]);
    const payment = await openFunding(agreed);
    await pool.query(
      "UPDATE payments SET expires_at = now() - interval '1 minute' WHERE external_id = $1",
      [payment.external_id]
    );
    const expired = await webhook({
      event_id: nextId("evt"),
      type: "payment.succeeded",
      provider_reference: payment.continuation.provider_reference,
      amount_minor: 700,
      currency: "INR",
      occurred_at: new Date().toISOString(),
    });
    assert.equal(expired.json.outcome, "ignored");
    const version = await pool.query("SELECT version FROM projects WHERE id = $1", [agreed.project.id]);
    const retry = await request("POST", `/projects/${agreed.project.id}/funding-payments`, {
      token: agreed.buyer.token,
      idempotencyKey: nextId("pay"),
      body: { expected_version: version.rows[0].version },
    });
    assert.equal(retry.status, 200, retry.text);
    assert.notEqual(retry.json.payment.external_id, payment.external_id);
    const confirmed = await webhook({
      event_id: nextId("evt"),
      type: "payment.succeeded",
      provider_reference: retry.json.payment.continuation.provider_reference,
      amount_minor: 700,
      currency: "INR",
      occurred_at: new Date().toISOString(),
    });
    assert.equal(confirmed.json.outcome, "applied");
  });

  it("replays the same funding payment idempotency key", async () => {
    const agreed = await agreeProject([600]);
    const intent = await request("POST", `/projects/${agreed.project.id}/funding-intent`, {
      token: agreed.buyer.token,
      idempotencyKey: nextId("intent"),
      body: { expected_version: agreed.stored.version },
    });
    assert.equal(intent.status, 200, intent.text);
    const version = await pool.query("SELECT version FROM projects WHERE id = $1", [agreed.project.id]);
    const key = nextId("pay");
    const first = await request("POST", `/projects/${agreed.project.id}/funding-payments`, {
      token: agreed.buyer.token,
      idempotencyKey: key,
      body: { expected_version: version.rows[0].version },
    });
    const second = await request("POST", `/projects/${agreed.project.id}/funding-payments`, {
      token: agreed.buyer.token,
      idempotencyKey: key,
      body: { expected_version: version.rows[0].version },
    });
    assert.equal(first.status, 200, first.text);
    assert.equal(second.status, 200, second.text);
    assert.equal(second.json.payment.external_id, first.json.payment.external_id);
    const count = await pool.query(
      "SELECT COUNT(*)::int AS count FROM payments WHERE project_id = $1",
      [agreed.project.id]
    );
    assert.equal(count.rows[0].count, 1);
  });
});
