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
const { withMilestoneTerms } = require("./milestone-fixture");
const { formatAmount } = require("../src/money/amount");
const { postJournal } = require("../src/escrow/ledger-service");

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

async function agreedEscrow(amounts) {
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
  const stored = await pool.query("SELECT version FROM projects WHERE id = $1", [project.id]);
  const funded = await request("POST", `/projects/${project.id}/funding-intent`, {
    token: buyer.token,
    idempotencyKey: nextId("fund"),
    body: { expected_version: stored.rows[0].version },
  });
  assert.equal(funded.status, 200, funded.text);
  const escrow = await pool.query(
    `SELECT id, status, funded_amount, currency, currency_exponent
     FROM escrows WHERE project_id = $1`,
    [project.id]
  );
  return escrow.rows[0];
}

function netZero(amount) {
  return [
    {
      entryType: "funded",
      amount,
      sourceAccount: "EXTERNAL_BUYER",
      destinationAccount: "ESCROW_UNALLOCATED",
    },
    {
      entryType: "funding_reversed",
      amount,
      sourceAccount: "ESCROW_UNALLOCATED",
      destinationAccount: "EXTERNAL_BUYER",
    },
  ];
}

describe("MVP-026 ledger posting", { concurrency: 1, timeout: 30000 }, () => {
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

  it("posts a balanced journal and reads 125050 with exponent 2 as 1,250.50", async () => {
    const escrow = await agreedEscrow([100000, 25050]);
    assert.equal(escrow.status, "created");
    assert.equal(escrow.funded_amount, "0");

    const posted = await postJournal({
      escrowId: escrow.id,
      idempotencyKey: "journal-125050",
      correlationId: "corr-125050",
      entries: netZero(125050),
    });
    assert.equal(posted.status, 200, JSON.stringify(posted.body));
    assert.equal(posted.body.journal.entries.length, 2);
    assert.equal(posted.body.journal.entries[0].amount, 125050);
    assert.equal(posted.body.journal.entries[0].currency, "INR");
    assert.equal(posted.body.journal.entries[0].currency_exponent, 2);
    assert.equal(formatAmount(posted.body.journal.entries[0].amount, 2), "1,250.50");
    assert.notEqual(formatAmount(posted.body.journal.entries[0].amount, 2), "125,000.50");

    const stored = await pool.query(
      `SELECT amount, currency_exponent, entry_type
       FROM escrow_ledger
       WHERE escrow_id = $1
       ORDER BY sequence`,
      [escrow.id]
    );
    assert.equal(stored.rows[0].amount, "125050");
    assert.equal(Number(stored.rows[0].currency_exponent), 2);
    assert.equal(formatAmount(stored.rows[0].amount, Number(stored.rows[0].currency_exponent)), "1,250.50");
    assert.notEqual(formatAmount(stored.rows[0].amount, Number(stored.rows[0].currency_exponent)), "125,000.50");

    const projection = await pool.query(
      `SELECT status, funded_amount, released_amount, refunded_amount
       FROM escrows WHERE id = $1`,
      [escrow.id]
    );
    assert.equal(projection.rows[0].status, "created");
    assert.equal(projection.rows[0].funded_amount, "0");
    assert.equal(projection.rows[0].released_amount, "0");
    assert.equal(projection.rows[0].refunded_amount, "0");

    const replay = await postJournal({
      escrowId: escrow.id,
      idempotencyKey: "journal-125050",
      correlationId: "corr-125050",
      entries: netZero(125050),
    });
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body, posted.body);
    const count = await pool.query(
      "SELECT COUNT(*) FROM escrow_ledger WHERE escrow_id = $1",
      [escrow.id]
    );
    assert.equal(count.rows[0].count, "2");
  });

  it("rejects a second body for the same key and a journal that would fund a created escrow", async () => {
    const escrow = await agreedEscrow([100000, 25050]);
    const first = await postJournal({
      escrowId: escrow.id,
      idempotencyKey: "journal-once",
      correlationId: "corr-once",
      entries: netZero(125050),
    });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const mismatch = await postJournal({
      escrowId: escrow.id,
      idempotencyKey: "journal-once",
      correlationId: "corr-once",
      entries: netZero(100),
    });
    assert.equal(mismatch.status, 409);

    const funding = await postJournal({
      escrowId: escrow.id,
      idempotencyKey: "journal-fund",
      correlationId: "corr-fund",
      entries: [netZero(125050)[0]],
    });
    assert.equal(funding.status, 409);
    assert.equal(funding.body.error, "A created escrow cannot hold confirmed funds");
    const rows = await pool.query(
      "SELECT COUNT(*) FROM escrow_ledger WHERE escrow_id = $1",
      [escrow.id]
    );
    assert.equal(rows.rows[0].count, "2");
    const clientCurrency = await postJournal({
      escrowId: escrow.id,
      idempotencyKey: "journal-currency",
      correlationId: "corr-currency",
      entries: [{ ...netZero(125050)[0], currency: "USD" }],
    });
    assert.equal(clientCurrency.status, 422);
    assert.equal(clientCurrency.body.error, "Ledger currency is taken from the escrow");
  });

  it("stores a bigint amount above the 32-bit maximum and rejects a negative or same-account insert", async () => {
    const column = await pool.query(
      `SELECT data_type
       FROM information_schema.columns
       WHERE table_name = 'escrow_ledger' AND column_name = 'amount'`
    );
    assert.equal(column.rows[0].data_type, "bigint");
    const escrow = await agreedEscrow([100000, 25050]);
    const posted = await postJournal({
      escrowId: escrow.id,
      idempotencyKey: "journal-bigint",
      correlationId: "corr-bigint",
      entries: netZero(3000000000),
    });
    assert.equal(posted.status, 200, JSON.stringify(posted.body));
    const stored = await pool.query(
      `SELECT amount FROM escrow_ledger
       WHERE escrow_id = $1 AND entry_type = 'funded'`,
      [escrow.id]
    );
    assert.equal(stored.rows[0].amount, "3000000000");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await assert.rejects(
        client.query(
          `INSERT INTO escrow_ledger (
             external_id, journal_id, sequence, escrow_id, project_id, entry_type,
             amount, currency, currency_exponent, source_account, destination_account,
             idempotency_key, correlation_id, actor_type, source
           )
           SELECT 'led_' || substr(md5(random()::text), 1, 20), gen_random_uuid(), 99,
                  id, project_id, 'funded', -1, currency, currency_exponent,
                  'EXTERNAL_BUYER', 'ESCROW_UNALLOCATED', 'negative', 'corr', 'system', 'test'
           FROM escrows WHERE id = $1`,
          [escrow.id]
        ),
        /escrow_ledger_amount_positive|amount/
      );
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await assert.rejects(
        client.query(
          `INSERT INTO escrow_ledger (
             external_id, journal_id, sequence, escrow_id, project_id, entry_type,
             amount, currency, currency_exponent, source_account, destination_account,
             idempotency_key, correlation_id, actor_type, source
           )
           SELECT 'led_' || substr(md5(random()::text), 1, 20), gen_random_uuid(), 98,
                  id, project_id, 'funded', 1, currency, currency_exponent,
                  'EXTERNAL_BUYER', 'EXTERNAL_BUYER', 'same-account', 'corr', 'system', 'test'
           FROM escrows WHERE id = $1`,
          [escrow.id]
        ),
        /accounts_distinct|accounts do not match/
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("rejects update, delete, and truncate, and a direct insert that skips projections", async () => {
    const escrow = await agreedEscrow([100000, 25050]);
    const posted = await postJournal({
      escrowId: escrow.id,
      idempotencyKey: "journal-immutable",
      correlationId: "corr-immutable",
      entries: netZero(10),
    });
    assert.equal(posted.status, 200, JSON.stringify(posted.body));
    const entryId = posted.body.journal.entries[0].external_id;

    await assert.rejects(
      pool.query("UPDATE escrow_ledger SET amount = 11 WHERE external_id = $1", [entryId]),
      /append-only|permission denied/i
    );
    await assert.rejects(
      pool.query("DELETE FROM escrow_ledger WHERE external_id = $1", [entryId]),
      /append-only|permission denied/i
    );
    await assert.rejects(
      pool.query("TRUNCATE TABLE escrow_ledger"),
      /append-only|permission denied/i
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("GRANT UPDATE, DELETE, TRUNCATE ON escrow_ledger TO musicapp");
      await client.query("SAVEPOINT mutation");
      await assert.rejects(
        client.query("UPDATE escrow_ledger SET amount = 11 WHERE external_id = $1", [entryId]),
        /escrow_ledger is append-only/
      );
      await client.query("ROLLBACK TO SAVEPOINT mutation");
      await assert.rejects(
        client.query("DELETE FROM escrow_ledger WHERE external_id = $1", [entryId]),
        /escrow_ledger is append-only/
      );
      await client.query("ROLLBACK TO SAVEPOINT mutation");
      await assert.rejects(
        client.query("TRUNCATE TABLE escrow_ledger"),
        /escrow_ledger is append-only/
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    await pool.query("REVOKE UPDATE, DELETE, TRUNCATE ON escrow_ledger FROM musicapp");

    const direct = await pool.connect();
    try {
      await direct.query("BEGIN");
      await direct.query(
        `INSERT INTO escrow_ledger (
           external_id, journal_id, sequence, escrow_id, project_id, entry_type,
           amount, currency, currency_exponent, source_account, destination_account,
           idempotency_key, correlation_id, actor_type, source
         )
         SELECT $2, $3, 50, id, project_id, 'funded', 1, currency, currency_exponent,
                'EXTERNAL_BUYER', 'ESCROW_UNALLOCATED', 'direct-unprojected', 'corr-direct',
                'system', 'test'
         FROM escrows WHERE id = $1`,
        [escrow.id, `led_${crypto.randomBytes(10).toString("hex")}`, crypto.randomUUID()]
      );
      await assert.rejects(
        direct.query("COMMIT"),
        /escrow projections must equal the ledger/
      );
    } finally {
      try {
        await direct.query("ROLLBACK");
      } catch {
        // Commit already closed the transaction.
      }
      direct.release();
    }
    const remaining = await pool.query(
      "SELECT COUNT(*) FROM escrow_ledger WHERE escrow_id = $1",
      [escrow.id]
    );
    assert.equal(remaining.rows[0].count, "2");

    const keys = await pool.query(
      `SELECT confdeltype
       FROM pg_constraint
       WHERE conrelid = 'escrow_ledger'::regclass AND contype = 'f'`
    );
    assert.ok(keys.rows.length >= 5);
    for (const row of keys.rows) {
      assert.equal(row.confdeltype, "r");
    }
  });

  it("lets one of two concurrent journals win the same key and keeps both distinct journals", async () => {
    const escrow = await agreedEscrow([100000, 25050]);
    const same = await Promise.all([
      postJournal({
        escrowId: escrow.id,
        idempotencyKey: "journal-race",
        correlationId: "corr-race",
        entries: netZero(125050),
      }),
      postJournal({
        escrowId: escrow.id,
        idempotencyKey: "journal-race",
        correlationId: "corr-race",
        entries: netZero(125050),
      }),
    ]);
    assert.equal(same[0].status, 200, JSON.stringify(same[0].body));
    assert.equal(same[1].status, 200, JSON.stringify(same[1].body));
    assert.deepEqual(same[0].body, same[1].body);

    const distinct = await Promise.all([
      postJournal({
        escrowId: escrow.id,
        idempotencyKey: "journal-a",
        correlationId: "corr-a",
        entries: netZero(10),
      }),
      postJournal({
        escrowId: escrow.id,
        idempotencyKey: "journal-b",
        correlationId: "corr-b",
        entries: netZero(20),
      }),
    ]);
    assert.equal(distinct[0].status, 200, JSON.stringify(distinct[0].body));
    assert.equal(distinct[1].status, 200, JSON.stringify(distinct[1].body));
    assert.notEqual(distinct[0].body.journal.journal_id, distinct[1].body.journal.journal_id);
    const count = await pool.query(
      "SELECT COUNT(*) FROM escrow_ledger WHERE escrow_id = $1",
      [escrow.id]
    );
    assert.equal(count.rows[0].count, "6");
  });
});
