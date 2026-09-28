const { hashRequest } = require("./canonical-json");

// Visible ASCII only, so a key survives an HTTP header round trip unchanged.
// Mirrors the idempotency_keys_key_format constraint (migration 009).
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;
const ACTOR_TYPES = new Set(["user", "system"]);
const MAX_SCOPE_LENGTH = 255;

// Pure validation for a client-supplied idempotency key. Runs before any
// database access. Returns { ok: true, key } or { ok: false, error }.
function validateIdempotencyKey(value) {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    return {
      ok: false,
      error: "Idempotency-Key must be 1 to 255 visible ASCII characters",
    };
  }
  return { ok: true, key: value };
}

// The scope is server-derived (actor from the verified token or the named
// System actor, operation and resource from the route), never client input,
// so an invalid scope is a programming error rather than a 400.
function assertScope({ actorType, actorId, operation, resourceRef }) {
  if (!ACTOR_TYPES.has(actorType)) {
    throw new TypeError("idempotency: actorType must be 'user' or 'system'");
  }
  for (const [name, value] of [["actorId", actorId], ["operation", operation]]) {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_SCOPE_LENGTH) {
      throw new TypeError(`idempotency: ${name} must be a non-empty string of at most ${MAX_SCOPE_LENGTH} characters`);
    }
  }
  if (typeof resourceRef !== "string" || resourceRef.length > MAX_SCOPE_LENGTH) {
    throw new TypeError(`idempotency: resourceRef must be a string of at most ${MAX_SCOPE_LENGTH} characters`);
  }
}

function assertResult(result) {
  if (
    typeof result !== "object" ||
    result === null ||
    !Number.isInteger(result.status) ||
    result.status < 100 ||
    result.status > 599
  ) {
    throw new TypeError("idempotency: handler must return { status, body } with an HTTP status");
  }
}

// Claims the key inside the caller's open transaction. Callers that lock
// aggregate rows must lock them before calling this, so the lock order stays
// Project, Milestones, idempotency record, inbox record (Milestones §24).
//
// A concurrent claim of the same scope and key blocks on the unique index
// until the first transaction ends. If that transaction commits, this one
// sees the committed row; if it rolls back, this one claims the key. Seeing
// the committed row relies on READ COMMITTED (PostgreSQL's default). Under
// REPEATABLE READ or SERIALIZABLE the waiting claim fails with 40001, and
// the caller must retry the whole transaction.
//
// A replay returns the stored response body, so callers authorize the actor
// before calling this and never put tokens or secrets in the body.
async function claimIdempotencyKey(client, { actorType, actorId, operation, resourceRef = "", key, requestHash }) {
  assertScope({ actorType, actorId, operation, resourceRef });
  const inserted = await client.query(
    `INSERT INTO idempotency_keys (actor_type, actor_id, operation, resource_ref, idempotency_key, request_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ON CONSTRAINT idempotency_keys_scope_unique DO NOTHING
     RETURNING id`,
    [actorType, actorId, operation, resourceRef, key, requestHash]
  );
  if (inserted.rows.length === 1) {
    return { outcome: "claimed", recordId: inserted.rows[0].id };
  }

  const existing = await client.query(
    `SELECT id, request_hash, status, response_status, response_body
     FROM idempotency_keys
     WHERE actor_type = $1 AND actor_id = $2 AND operation = $3
       AND resource_ref = $4 AND idempotency_key = $5`,
    [actorType, actorId, operation, resourceRef, key]
  );
  const record = existing.rows[0];
  if (!record) {
    throw new Error("idempotency: conflicting key row is not visible");
  }
  if (record.request_hash !== requestHash) {
    return { outcome: "mismatch", recordId: record.id };
  }
  if (record.status !== "completed") {
    return { outcome: "in_progress", recordId: record.id };
  }
  return {
    outcome: "replay",
    recordId: record.id,
    response: { status: record.response_status, body: record.response_body },
  };
}

async function completeIdempotencyKey(client, recordId, { status, body }) {
  assertResult({ status, body });
  const result = await client.query(
    `UPDATE idempotency_keys
     SET status = 'completed', response_status = $2, response_body = $3::jsonb, completed_at = now()
     WHERE id = $1 AND status = 'in_progress'`,
    [recordId, status, body === undefined ? null : JSON.stringify(body)]
  );
  if (result.rowCount !== 1) {
    throw new Error("idempotency: record is not in progress");
  }
}

// Runs handler(client) at most once per scope and key, inside the caller's
// transaction. The handler's { status, body } is stored with the state change
// it made, so both commit or roll back together, and a replay of the same
// request returns that stored result without calling the handler again.
async function executeIdempotent(client, { actorType, actorId, operation, resourceRef = "", key, request }, handler) {
  const requestHash = hashRequest(request);
  const claim = await claimIdempotencyKey(client, {
    actorType,
    actorId,
    operation,
    resourceRef,
    key,
    requestHash,
  });

  if (claim.outcome === "replay") {
    return { outcome: "replay", status: claim.response.status, body: claim.response.body };
  }
  if (claim.outcome === "mismatch") {
    return {
      outcome: "mismatch",
      status: 409,
      body: { error: "Idempotency-Key was already used with a different request" },
    };
  }
  if (claim.outcome === "in_progress") {
    return {
      outcome: "in_progress",
      status: 409,
      body: { error: "A request with this Idempotency-Key is still in progress" },
    };
  }

  const result = await handler(client);
  assertResult(result);
  await completeIdempotencyKey(client, claim.recordId, result);
  // Return the JSON form that was stored, so the first response and every
  // replay carry identical values (a Date, for example, becomes a string).
  const body = result.body === undefined ? null : JSON.parse(JSON.stringify(result.body));
  return { outcome: "executed", status: result.status, body };
}

module.exports = {
  IDEMPOTENCY_KEY_PATTERN,
  validateIdempotencyKey,
  claimIdempotencyKey,
  completeIdempotencyKey,
  executeIdempotent,
};
