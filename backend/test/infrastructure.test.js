const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { ensureMigrated, resetApplicationData, stopPool } = require("./harness");
const pool = require("../db/db");
const { hashRequest } = require("../src/infrastructure/canonical-json");
const {
  claimIdempotencyKey,
  completeIdempotencyKey,
  executeIdempotent,
} = require("../src/infrastructure/idempotency");
const { enqueueOutboxMessage, publishPendingOutbox } = require("../src/infrastructure/outbox");
const { consumeInboxEvent } = require("../src/infrastructure/inbox");
const { createRandom } = require("./random");

// MVP-003: shared idempotency, outbox, and inbox infrastructure, against the
// isolated PostgreSQL test database.
//
// Acceptance criteria:
//   AC1 duplicate request with the same key returns the original result
//   AC2 duplicate inbound event is a no-op
//   AC3 property test for both
// Rules: BR-PROJECTS-026, BR-PROJECTS-027, BR-PROJECTS-049, BR-ESCROW-027,
// BR-ESCROW-041; findings SEC-PROJECTS-011, SEC-PROJECTS-013, SEC-ESCROW-003,
// SEC-ESCROW-018, SEC-ESCROW-020.

let sequence = 0;
function unique(prefix) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

async function inTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function rejects(sql, params, code) {
  await assert.rejects(
    inTransaction((client) => client.query(sql, params)),
    (err) => {
      assert.equal(err.code, code, err.message);
      return true;
    }
  );
}

async function effectCount(aggregateId) {
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM outbox_messages WHERE aggregate_id = $1",
    [aggregateId]
  );
  return rows[0].n;
}

// A handler that records a real side effect (an outbox event, the same
// atomic boundary a domain command uses) and counts its own invocations.
function effectHandler(aggregateId, response) {
  const handler = async (client) => {
    handler.calls += 1;
    await enqueueOutboxMessage(client, {
      eventType: "TestEffect",
      aggregateType: "test",
      aggregateId,
      payload: { call: handler.calls },
    });
    return response;
  };
  handler.calls = 0;
  return handler;
}

function scope(overrides = {}) {
  return {
    actorType: "user",
    actorId: "00000000-0000-4000-8000-000000000001",
    operation: "test.create",
    resourceRef: "prj_test",
    ...overrides,
  };
}

const RAISE = "P0001";
const CHECK = "23514";
const UNIQUE = "23505";

before(async () => {
  ensureMigrated();
  await resetApplicationData();
});

after(async () => {
  await stopPool();
});

describe("idempotency keys", () => {
  it("AC1: a duplicate request with the same key returns the original result without a second effect", async () => {
    const aggregateId = unique("agg");
    const handler = effectHandler(aggregateId, { status: 201, body: { project: { external_id: "prj_1", amount: 500 } } });
    const request = { title: "Album", amount: 500, milestones: [{ n: 1 }, { n: 2 }] };
    const key = unique("key");

    const first = await inTransaction((client) => executeIdempotent(client, { ...scope(), key, request }, handler));
    // Same request, different key order: still the same request.
    const second = await inTransaction((client) =>
      executeIdempotent(client, { ...scope(), key, request: { milestones: [{ n: 1 }, { n: 2 }], amount: 500, title: "Album" } }, handler)
    );

    assert.equal(first.outcome, "executed");
    assert.equal(second.outcome, "replay");
    assert.equal(second.status, first.status);
    assert.deepEqual(second.body, first.body);
    assert.equal(handler.calls, 1);
    assert.equal(await effectCount(aggregateId), 1);
  });

  it("rejects the same key with a different request and changes nothing", async () => {
    const aggregateId = unique("agg");
    const handler = effectHandler(aggregateId, { status: 201, body: { ok: true } });
    const key = unique("key");

    await inTransaction((client) => executeIdempotent(client, { ...scope(), key, request: { amount: 100 } }, handler));
    const reused = await inTransaction((client) =>
      executeIdempotent(client, { ...scope(), key, request: { amount: 999 } }, handler)
    );

    assert.equal(reused.outcome, "mismatch");
    assert.equal(reused.status, 409);
    assert.deepEqual(reused.body, { error: "Idempotency-Key was already used with a different request" });
    assert.equal(handler.calls, 1);
    assert.equal(await effectCount(aggregateId), 1);

    const { rows } = await pool.query(
      "SELECT request_hash, response_status FROM idempotency_keys WHERE idempotency_key = $1",
      [key]
    );
    assert.deepEqual(rows, [{ request_hash: hashRequest({ amount: 100 }), response_status: 201 }]);
  });

  it("forgets a claim whose transaction rolled back, so a retry executes", async () => {
    const aggregateId = unique("agg");
    const key = unique("key");
    const failing = async (client) => {
      await enqueueOutboxMessage(client, { eventType: "TestEffect", aggregateType: "test", aggregateId });
      throw new Error("handler failed");
    };

    await assert.rejects(
      inTransaction((client) => executeIdempotent(client, { ...scope(), key, request: { a: 1 } }, failing)),
      /handler failed/
    );
    assert.equal(await effectCount(aggregateId), 0);

    const handler = effectHandler(aggregateId, { status: 200, body: { retried: true } });
    const retry = await inTransaction((client) => executeIdempotent(client, { ...scope(), key, request: { a: 1 } }, handler));
    assert.equal(retry.outcome, "executed");
    assert.equal(await effectCount(aggregateId), 1);
  });

  it("scopes a key to actor, operation, and resource", async () => {
    const aggregateId = unique("agg");
    const handler = effectHandler(aggregateId, { status: 200, body: {} });
    const key = unique("key");
    const scopes = [
      scope(),
      scope({ actorId: "00000000-0000-4000-8000-000000000002" }),
      scope({ actorType: "system", actorId: "escrow-worker" }),
      scope({ operation: "test.other" }),
      scope({ resourceRef: "prj_other" }),
    ];
    for (const s of scopes) {
      const result = await inTransaction((client) => executeIdempotent(client, { ...s, key, request: {} }, handler));
      assert.equal(result.outcome, "executed");
    }
    assert.equal(handler.calls, scopes.length);
  });

  it("reports a committed but unfinished claim as a retryable 409", async () => {
    const key = unique("key");
    const requestHash = hashRequest({ step: 1 });
    await inTransaction((client) => claimIdempotencyKey(client, { ...scope(), key, requestHash }));

    const handler = effectHandler(unique("agg"), { status: 200, body: {} });
    const result = await inTransaction((client) => executeIdempotent(client, { ...scope(), key, request: { step: 1 } }, handler));
    assert.equal(result.outcome, "in_progress");
    assert.equal(result.status, 409);
    assert.equal(handler.calls, 0);
  });

  it("concurrency: parallel requests with one key execute once and every other request replays", async () => {
    const aggregateId = unique("agg");
    const key = unique("key");
    const request = { amount: 700 };
    let calls = 0;
    const handler = async (client) => {
      calls += 1;
      await enqueueOutboxMessage(client, { eventType: "TestEffect", aggregateType: "test", aggregateId });
      // Hold the claim open so the other transactions contend for it.
      await client.query("SELECT pg_sleep(0.1)");
      return { status: 201, body: { winner: true } };
    };

    const results = await Promise.all(
      Array.from({ length: 6 }, () => inTransaction((client) => executeIdempotent(client, { ...scope(), key, request }, handler)))
    );

    assert.equal(calls, 1);
    assert.equal(results.filter((r) => r.outcome === "executed").length, 1);
    assert.equal(results.filter((r) => r.outcome === "replay").length, 5);
    for (const result of results) {
      assert.equal(result.status, 201);
      assert.deepEqual(result.body, { winner: true });
    }
    assert.equal(await effectCount(aggregateId), 1);
  });

  it("concurrency: parallel different requests with one key have exactly one winner", async () => {
    const aggregateId = unique("agg");
    const key = unique("key");
    const handler = async (client) => {
      await enqueueOutboxMessage(client, { eventType: "TestEffect", aggregateType: "test", aggregateId });
      await client.query("SELECT pg_sleep(0.1)");
      return { status: 201, body: {} };
    };

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        inTransaction((client) => executeIdempotent(client, { ...scope(), key, request: { amount: i + 1 } }, handler))
      )
    );

    assert.equal(results.filter((r) => r.outcome === "executed").length, 1);
    assert.equal(results.filter((r) => r.outcome === "mismatch" && r.status === 409).length, 5);
    assert.equal(await effectCount(aggregateId), 1);
  });

  it("AC3 property: any replay sequence yields one effect per key and the first request's result", async () => {
    const seed = 3003;
    const random = createRandom(seed);
    const actors = ["00000000-0000-4000-8000-00000000000a", "00000000-0000-4000-8000-00000000000b"];
    const keys = Array.from({ length: 5 }, () => unique("pkey"));
    const payloads = [{ amount: 1 }, { amount: 2 }, { amount: 3, note: "n" }];
    const aggregatePrefix = unique("pagg");
    const model = new Map();
    let calls = 0;

    for (let step = 0; step < 150; step++) {
      const actorId = random.pick(actors);
      const key = random.pick(keys);
      const payloadIndex = random.int(0, payloads.length - 1);
      const scopeKey = `${actorId}|${key}`;
      const handler = async (client) => {
        calls += 1;
        await enqueueOutboxMessage(client, {
          eventType: "TestEffect",
          aggregateType: "test",
          aggregateId: `${aggregatePrefix}|${scopeKey}`,
        });
        return { status: 201, body: { payloadIndex, step } };
      };

      const result = await inTransaction((client) =>
        executeIdempotent(client, { ...scope({ actorId }), key, request: payloads[payloadIndex] }, handler)
      );
      const message = `seed ${seed} step ${step}`;
      const first = model.get(scopeKey);
      if (!first) {
        assert.equal(result.outcome, "executed", message);
        model.set(scopeKey, { payloadIndex, body: { payloadIndex, step } });
      } else if (first.payloadIndex === payloadIndex) {
        assert.equal(result.outcome, "replay", message);
        assert.deepEqual(result.body, first.body, message);
      } else {
        assert.equal(result.outcome, "mismatch", message);
      }
    }

    assert.equal(calls, model.size);
    const { rows } = await pool.query(
      `SELECT aggregate_id, count(*)::int AS n FROM outbox_messages
       WHERE aggregate_id LIKE $1 GROUP BY aggregate_id`,
      [`${aggregatePrefix}|%`]
    );
    assert.equal(rows.length, model.size);
    assert.ok(rows.every((row) => row.n === 1));
  });

  describe("database constraints (application checks bypassed)", () => {
    const hash = "a".repeat(64);
    const insert = `INSERT INTO idempotency_keys (actor_type, actor_id, operation, resource_ref, idempotency_key, request_hash, status, response_status, completed_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

    it("rejects a duplicate scope and key", async () => {
      const key = unique("dup");
      await inTransaction((client) => client.query(insert, ["user", "u1", "op", "", key, hash, "in_progress", null, null]));
      await rejects(insert, ["user", "u1", "op", "", key, hash, "in_progress", null, null], UNIQUE);
    });

    it("rejects malformed rows", async () => {
      const cases = [
        ["robot", "u1", "op", "", unique("k"), hash, "in_progress", null, null],
        ["user", "", "op", "", unique("k"), hash, "in_progress", null, null],
        ["user", "u1", "", "", unique("k"), hash, "in_progress", null, null],
        ["user", "u1", "op", "", "has space", hash, "in_progress", null, null],
        ["user", "u1", "op", "", unique("k"), "not-a-hash", "in_progress", null, null],
        ["user", "u1", "op", "", unique("k"), hash, "done", null, null],
        ["user", "u1", "op", "", unique("k"), hash, "completed", null, null],
        ["user", "u1", "op", "", unique("k"), hash, "in_progress", 200, null],
        ["user", "u1", "op", "", unique("k"), hash, "completed", 42, new Date()],
      ];
      for (const params of cases) {
        await rejects(insert, params, CHECK);
      }
    });

    it("keeps the scope and hash immutable, freezes completed rows, and blocks deletes", async () => {
      const key = unique("imm");
      const recordId = await inTransaction(async (client) => {
        const claim = await claimIdempotencyKey(client, { ...scope(), key, requestHash: hash });
        return claim.recordId;
      });

      await rejects("UPDATE idempotency_keys SET request_hash = $2 WHERE id = $1", [recordId, "b".repeat(64)], RAISE);
      await rejects("UPDATE idempotency_keys SET idempotency_key = 'other' WHERE id = $1", [recordId], RAISE);
      await rejects("DELETE FROM idempotency_keys WHERE id = $1", [recordId], RAISE);

      await inTransaction((client) => completeIdempotencyKey(client, recordId, { status: 200, body: { v: 1 } }));
      await rejects("UPDATE idempotency_keys SET response_body = '{\"v\":2}' WHERE id = $1", [recordId], RAISE);
      await rejects(
        "UPDATE idempotency_keys SET status = 'in_progress', response_status = NULL, response_body = NULL, completed_at = NULL WHERE id = $1",
        [recordId],
        RAISE
      );
    });
  });
});

describe("transactional outbox", () => {
  it("writes an event only when the enclosing transaction commits", async () => {
    const aggregateId = unique("agg");
    await assert.rejects(
      inTransaction(async (client) => {
        await enqueueOutboxMessage(client, { eventType: "ProjectCreated", aggregateType: "project", aggregateId });
        throw new Error("state change failed");
      }),
      /state change failed/
    );
    assert.equal(await effectCount(aggregateId), 0);

    const { eventId } = await inTransaction((client) =>
      enqueueOutboxMessage(client, {
        eventType: "ProjectCreated",
        aggregateType: "project",
        aggregateId,
        aggregateVersion: 1,
        payload: { state: "draft" },
        correlationId: "req-1",
      })
    );
    const { rows } = await pool.query(
      "SELECT event_id, status, attempts, payload, published_at FROM outbox_messages WHERE aggregate_id = $1",
      [aggregateId]
    );
    assert.deepEqual(rows, [{ event_id: eventId, status: "pending", attempts: 0, payload: { state: "draft" }, published_at: null }]);
  });

  it("rejects invalid events before writing them", async () => {
    const base = { eventType: "E", aggregateType: "a", aggregateId: "id" };
    for (const bad of [
      { ...base, eventType: "" },
      { ...base, aggregateId: undefined },
      { ...base, eventVersion: 0 },
      { ...base, aggregateVersion: 1.5 },
      { ...base, payload: [1] },
      { ...base, payload: "text" },
      { ...base, correlationId: "" },
    ]) {
      await assert.rejects(inTransaction((client) => enqueueOutboxMessage(client, bad)), TypeError);
    }
  });

  describe("dispatcher", () => {
    // Each dispatcher test starts from an empty outbox, so only its own
    // messages are due.
    async function freshOutbox() {
      await resetApplicationData();
    }

    async function enqueue(count, prefix) {
      const ids = [];
      for (let i = 0; i < count; i++) {
        const { eventId } = await inTransaction((client) =>
          enqueueOutboxMessage(client, { eventType: "E", aggregateType: "test", aggregateId: `${prefix}-${i}` })
        );
        ids.push(eventId);
      }
      return ids;
    }

    it("publishes due messages once, in sequence order, after commit", async () => {
      await freshOutbox();
      const ids = await enqueue(3, unique("ord"));
      const delivered = [];
      const now = new Date(Date.now() + 1000);

      const summary = await publishPendingOutbox(pool, async (message) => delivered.push(message.eventId), { now });
      assert.deepEqual(summary, { published: 3, retried: 0, deadLettered: 0 });
      assert.deepEqual(delivered, ids);

      const again = await publishPendingOutbox(pool, async (message) => delivered.push(message.eventId), { now });
      assert.deepEqual(again, { published: 0, retried: 0, deadLettered: 0 });
      assert.equal(delivered.length, 3);

      const { rows } = await pool.query("SELECT DISTINCT status FROM outbox_messages");
      assert.deepEqual(rows, [{ status: "published" }]);
    });

    it("retries a failed message with backoff, dead-letters it at the limit, and does not hold back later messages", async () => {
      await freshOutbox();
      const [failing, healthy] = await enqueue(2, unique("retry"));
      const start = new Date(Date.now() + 1000);
      const publish = async (message) => {
        if (message.eventId === failing) throw new Error("broker unavailable");
      };
      const options = { maxAttempts: 3, retryDelayMs: (attempts) => attempts * 1000 };

      assert.deepEqual(await publishPendingOutbox(pool, publish, { ...options, now: start }), {
        published: 1,
        retried: 1,
        deadLettered: 0,
      });
      const after1 = await pool.query(
        "SELECT status, attempts, available_at, last_error FROM outbox_messages WHERE event_id = $1",
        [failing]
      );
      assert.equal(after1.rows[0].status, "pending");
      assert.equal(after1.rows[0].attempts, 1);
      assert.equal(after1.rows[0].available_at.getTime(), start.getTime() + 1000);
      assert.equal(after1.rows[0].last_error, "broker unavailable");

      // Not due yet.
      assert.deepEqual(await publishPendingOutbox(pool, publish, { ...options, now: new Date(start.getTime() + 999) }), {
        published: 0,
        retried: 0,
        deadLettered: 0,
      });

      const second = new Date(start.getTime() + 1000);
      assert.equal((await publishPendingOutbox(pool, publish, { ...options, now: second })).retried, 1);
      const third = new Date(second.getTime() + 2000);
      assert.equal((await publishPendingOutbox(pool, publish, { ...options, now: third })).deadLettered, 1);

      const { rows } = await pool.query(
        "SELECT event_id, status, attempts FROM outbox_messages ORDER BY sequence"
      );
      assert.deepEqual(rows, [
        { event_id: failing, status: "dead_letter", attempts: 3 },
        { event_id: healthy, status: "published", attempts: 1 },
      ]);
    });

    it("concurrency: parallel dispatchers deliver each message exactly once", async () => {
      await freshOutbox();
      const ids = await enqueue(6, unique("par"));
      const delivered = [];
      const publish = async (message) => {
        delivered.push(message.eventId);
        await new Promise((resolve) => setTimeout(resolve, 20));
      };
      const now = new Date(Date.now() + 1000);

      const summaries = await Promise.all(
        Array.from({ length: 3 }, () => publishPendingOutbox(pool, publish, { batchSize: 2, now }))
      );
      let total = summaries.reduce((sum, s) => sum + s.published, 0);
      while (total < ids.length) {
        const summary = await publishPendingOutbox(pool, publish, { now });
        assert.ok(summary.published > 0);
        total += summary.published;
      }

      assert.equal(delivered.length, ids.length);
      assert.deepEqual([...delivered].sort(), [...ids].sort());
    });

    it("BR-PROJECTS-027: a lost publish acknowledgement redelivers, and the inbox keeps the effect single", async () => {
      await freshOutbox();
      const [eventId] = await enqueue(1, unique("ack"));
      const effectAggregate = unique("consumer-effect");
      let deliveries = 0;
      let failAck = true;

      const publish = async (message) => {
        // The consumer's own follow-on event is not part of this scenario.
        if (message.eventType !== "E") return;
        deliveries += 1;
        await inTransaction((client) =>
          consumeInboxEvent(
            client,
            { consumer: "test-consumer", source: "outbox", eventId: message.eventId, eventType: message.eventType },
            async (tx) => {
              await enqueueOutboxMessage(tx, { eventType: "Consumed", aggregateType: "test", aggregateId: effectAggregate });
            }
          )
        );
        if (failAck) {
          failAck = false;
          throw new Error("acknowledgement lost");
        }
      };

      const start = new Date(Date.now() + 1000);
      await publishPendingOutbox(pool, publish, { now: start, retryDelayMs: () => 0 });
      await publishPendingOutbox(pool, publish, { now: start, retryDelayMs: () => 0 });

      assert.equal(deliveries, 2);
      assert.equal(await effectCount(effectAggregate), 1);
      const { rows } = await pool.query("SELECT status FROM outbox_messages WHERE event_id = $1", [eventId]);
      assert.equal(rows[0].status, "published");
    });
  });

  describe("database constraints (application checks bypassed)", () => {
    async function pendingMessage() {
      const { eventId } = await inTransaction((client) =>
        enqueueOutboxMessage(client, { eventType: "E", aggregateType: "test", aggregateId: unique("c"), payload: { a: 1 } })
      );
      return eventId;
    }

    it("rejects a duplicate event_id and a non-object payload", async () => {
      const eventId = await pendingMessage();
      await rejects(
        "INSERT INTO outbox_messages (event_id, event_type, aggregate_type, aggregate_id) VALUES ($1, 'E', 'test', 'x')",
        [eventId],
        UNIQUE
      );
      await rejects(
        "INSERT INTO outbox_messages (event_type, aggregate_type, aggregate_id, payload) VALUES ('E', 'test', 'x', '[1]'::jsonb)",
        [],
        CHECK
      );
      await rejects(
        "INSERT INTO outbox_messages (event_type, aggregate_type, aggregate_id, status) VALUES ('E', 'test', 'x', 'published')",
        [],
        CHECK
      );
    });

    it("keeps event content immutable, freezes published rows, and blocks deletes", async () => {
      const eventId = await pendingMessage();
      await rejects("UPDATE outbox_messages SET payload = '{\"a\":2}' WHERE event_id = $1", [eventId], RAISE);
      await rejects("UPDATE outbox_messages SET event_type = 'Other' WHERE event_id = $1", [eventId], RAISE);
      await rejects("UPDATE outbox_messages SET attempts = attempts - 1 WHERE event_id = $1", [eventId], RAISE);
      await rejects("DELETE FROM outbox_messages WHERE event_id = $1", [eventId], RAISE);

      await inTransaction((client) =>
        client.query("UPDATE outbox_messages SET attempts = 2 WHERE event_id = $1", [eventId])
      );
      await rejects("UPDATE outbox_messages SET attempts = 1 WHERE event_id = $1", [eventId], RAISE);

      await inTransaction((client) =>
        client.query(
          "UPDATE outbox_messages SET status = 'published', published_at = now(), attempts = 3 WHERE event_id = $1",
          [eventId]
        )
      );
      await rejects(
        "UPDATE outbox_messages SET status = 'pending', published_at = NULL WHERE event_id = $1",
        [eventId],
        RAISE
      );
    });
  });
});

describe("inbox deduplication", () => {
  function inboxEvent(overrides = {}) {
    return { consumer: "milestones", source: "escrow", eventId: unique("evt"), eventType: "AllocationFunded", ...overrides };
  }

  it("AC2: a duplicate inbound event is a no-op", async () => {
    const event = inboxEvent();
    const aggregateId = unique("agg");
    let calls = 0;
    const handler = async (client) => {
      calls += 1;
      await enqueueOutboxMessage(client, { eventType: "TestEffect", aggregateType: "test", aggregateId });
      return "applied";
    };

    const first = await inTransaction((client) => consumeInboxEvent(client, event, handler));
    const second = await inTransaction((client) => consumeInboxEvent(client, event, handler));

    assert.deepEqual(first, { duplicate: false, result: "applied" });
    assert.deepEqual(second, { duplicate: true, result: "applied" });
    assert.equal(calls, 1);
    assert.equal(await effectCount(aggregateId), 1);
  });

  it("records ignored and quarantined outcomes once, and a duplicate reports the original outcome", async () => {
    for (const outcome of ["ignored", "quarantined"]) {
      const event = inboxEvent();
      const first = await inTransaction((client) => consumeInboxEvent(client, event, async () => outcome));
      const second = await inTransaction((client) => consumeInboxEvent(client, event, async () => "applied"));
      assert.deepEqual(first, { duplicate: false, result: outcome });
      assert.deepEqual(second, { duplicate: true, result: outcome });
    }
  });

  it("BR-ESCROW-041: deduplicates by (provider, provider_event_id) and keeps consumers independent", async () => {
    const eventId = unique("evt_provider");
    const seen = [];
    const handler = (label) => async () => {
      seen.push(label);
    };
    const deliveries = [
      [{ consumer: "payments", source: "mock-provider", eventId, eventType: "payment.succeeded" }, "payments/mock"],
      [{ consumer: "payments", source: "mock-provider", eventId, eventType: "payment.succeeded" }, "payments/mock again"],
      [{ consumer: "payments", source: "other-provider", eventId, eventType: "payment.succeeded" }, "payments/other"],
      [{ consumer: "escrow", source: "mock-provider", eventId, eventType: "payment.succeeded" }, "escrow/mock"],
    ];
    for (const [event, label] of deliveries) {
      await inTransaction((client) => consumeInboxEvent(client, event, handler(label)));
    }
    assert.deepEqual(seen, ["payments/mock", "payments/other", "escrow/mock"]);
  });

  it("lets an event be redelivered after its handler failed", async () => {
    const event = inboxEvent();
    await assert.rejects(
      inTransaction((client) =>
        consumeInboxEvent(client, event, async () => {
          throw new Error("consumer failed");
        })
      ),
      /consumer failed/
    );
    const retry = await inTransaction((client) => consumeInboxEvent(client, event, async () => "applied"));
    assert.deepEqual(retry, { duplicate: false, result: "applied" });
  });

  it("rejects an unknown handler outcome", async () => {
    const event = inboxEvent();
    await assert.rejects(
      inTransaction((client) => consumeInboxEvent(client, event, async () => "done")),
      TypeError
    );
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM inbox_events WHERE event_id = $1", [event.eventId]);
    assert.equal(rows[0].n, 0);
  });

  it("concurrency: parallel deliveries of one event apply it exactly once", async () => {
    const event = inboxEvent();
    const aggregateId = unique("agg");
    let calls = 0;
    const handler = async (client) => {
      calls += 1;
      await enqueueOutboxMessage(client, { eventType: "TestEffect", aggregateType: "test", aggregateId });
      await client.query("SELECT pg_sleep(0.1)");
    };

    const results = await Promise.all(
      Array.from({ length: 6 }, () => inTransaction((client) => consumeInboxEvent(client, event, handler)))
    );
    assert.equal(calls, 1);
    assert.equal(results.filter((r) => !r.duplicate).length, 1);
    assert.equal(results.filter((r) => r.duplicate && r.result === "applied").length, 5);
    assert.equal(await effectCount(aggregateId), 1);
  });

  it("AC3 property: any redelivery order applies each distinct event exactly once", async () => {
    const seed = 3004;
    const random = createRandom(seed);
    const prefix = unique("pevt");
    const distinct = Array.from({ length: 12 }, (_, i) => `${prefix}-${i}`);
    const deliveries = [];
    for (const id of distinct) {
      const copies = random.int(1, 4);
      for (let i = 0; i < copies; i++) deliveries.push(id);
    }
    const order = random.shuffle(deliveries);
    const applied = new Map();
    const firstSeen = new Set();

    for (let step = 0; step < order.length; step++) {
      const eventId = order[step];
      const result = await inTransaction((client) =>
        consumeInboxEvent(client, { consumer: "property", source: "test", eventId, eventType: "E" }, async (tx) => {
          applied.set(eventId, (applied.get(eventId) || 0) + 1);
          await enqueueOutboxMessage(tx, { eventType: "TestEffect", aggregateType: "test", aggregateId: eventId });
        })
      );
      assert.equal(result.duplicate, firstSeen.has(eventId), `seed ${seed} step ${step}`);
      firstSeen.add(eventId);
    }

    assert.ok(order.length > distinct.length, "the sequence contained duplicates");
    assert.deepEqual([...applied.keys()].sort(), [...distinct].sort());
    assert.ok([...applied.values()].every((n) => n === 1));
    for (const id of distinct) {
      assert.equal(await effectCount(id), 1, `seed ${seed} event ${id}`);
    }
  });

  describe("database constraints (application checks bypassed)", () => {
    const insert = "INSERT INTO inbox_events (consumer, source, event_id, event_type, result, processed_at) VALUES ($1, $2, $3, $4, $5, $6)";

    it("rejects a duplicate (consumer, source, event_id) and malformed rows", async () => {
      const eventId = unique("dup");
      await inTransaction((client) => client.query(insert, ["c", "s", eventId, "E", null, null]));
      await rejects(insert, ["c", "s", eventId, "E2", null, null], UNIQUE);
      await rejects(insert, ["", "s", unique("x"), "E", null, null], CHECK);
      await rejects(insert, ["c", "s", unique("x"), "E", "done", new Date()], CHECK);
      await rejects(insert, ["c", "s", unique("x"), "E", "applied", null], CHECK);
    });

    it("records the result once and blocks deletes", async () => {
      const event = inboxEvent();
      await inTransaction((client) => consumeInboxEvent(client, event, async () => "applied"));
      await rejects("UPDATE inbox_events SET result = 'ignored' WHERE event_id = $1", [event.eventId], RAISE);
      await rejects("UPDATE inbox_events SET event_id = 'other' WHERE event_id = $1", [event.eventId], RAISE);
      await rejects("DELETE FROM inbox_events WHERE event_id = $1", [event.eventId], RAISE);
    });
  });
});
