const MAX_TEXT_LENGTH = 255;
const MAX_ERROR_LENGTH = 500;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_BASE_RETRY_MS = 1000;
const DEFAULT_MAX_RETRY_MS = 5 * 60 * 1000;

const OUTBOX_COLUMNS = `id, sequence, event_id, event_type, event_version, aggregate_type, aggregate_id,
  aggregate_version, payload, correlation_id, causation_id, attempts, occurred_at`;

function assertText(name, value, { optional = false } = {}) {
  if (optional && (value === undefined || value === null)) {
    return;
  }
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TEXT_LENGTH) {
    throw new TypeError(`outbox: ${name} must be a non-empty string of at most ${MAX_TEXT_LENGTH} characters`);
  }
}

function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Writes an event inside the caller's open transaction, so the event exists
// if and only if the state change that produced it commits. Nothing is sent
// here; publishPendingOutbox delivers after commit. Payloads carry opaque
// references and least data (Projects §25.2), never secrets or raw content.
async function enqueueOutboxMessage(
  client,
  {
    eventType,
    eventVersion = 1,
    aggregateType,
    aggregateId,
    aggregateVersion = null,
    payload = {},
    correlationId = null,
    causationId = null,
  }
) {
  assertText("eventType", eventType);
  assertText("aggregateType", aggregateType);
  assertText("aggregateId", aggregateId);
  assertText("correlationId", correlationId, { optional: true });
  assertText("causationId", causationId, { optional: true });
  if (!Number.isInteger(eventVersion) || eventVersion < 1) {
    throw new TypeError("outbox: eventVersion must be a positive integer");
  }
  if (aggregateVersion !== null && (!Number.isInteger(aggregateVersion) || aggregateVersion < 1)) {
    throw new TypeError("outbox: aggregateVersion must be a positive integer or null");
  }
  if (!isPlainObject(payload)) {
    throw new TypeError("outbox: payload must be a plain object");
  }

  const result = await client.query(
    `INSERT INTO outbox_messages
       (event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, correlation_id, causation_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     RETURNING event_id, sequence`,
    [
      eventType,
      eventVersion,
      aggregateType,
      aggregateId,
      aggregateVersion,
      JSON.stringify(payload),
      correlationId,
      causationId,
    ]
  );
  return { eventId: result.rows[0].event_id, sequence: result.rows[0].sequence };
}

function defaultRetryDelayMs(attempts) {
  return Math.min(DEFAULT_BASE_RETRY_MS * 2 ** (attempts - 1), DEFAULT_MAX_RETRY_MS);
}

function toMessage(row) {
  return {
    eventId: row.event_id,
    sequence: row.sequence,
    eventType: row.event_type,
    eventVersion: row.event_version,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    payload: row.payload,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    occurredAt: row.occurred_at,
  };
}

function describeError(err) {
  const text = err && typeof err.message === "string" && err.message ? err.message : String(err);
  return text.slice(0, MAX_ERROR_LENGTH);
}

// Delivers due pending messages through the injected, transport-neutral
// publish(message) function. Delivery is at-least-once: a crash after
// publish and before the status update republishes the same event_id, which
// consumers deduplicate through the inbox. Rows are claimed with SKIP LOCKED,
// so concurrent dispatchers never deliver the same message in one pass. A
// failed message is retried with bounded backoff and dead-lettered after
// maxAttempts; later messages are not held back by it.
async function publishPendingOutbox(
  pool,
  publish,
  {
    batchSize = DEFAULT_BATCH_SIZE,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    retryDelayMs = defaultRetryDelayMs,
    now = new Date(),
  } = {}
) {
  if (typeof publish !== "function") {
    throw new TypeError("outbox: publish must be a function");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new TypeError("outbox: batchSize must be a positive integer");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError("outbox: maxAttempts must be a positive integer");
  }
  if (typeof retryDelayMs !== "function") {
    throw new TypeError("outbox: retryDelayMs must be a function");
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("outbox: now must be a valid Date");
  }

  const summary = { published: 0, retried: 0, deadLettered: 0 };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const due = await client.query(
      `SELECT ${OUTBOX_COLUMNS}
       FROM outbox_messages
       WHERE status = 'pending' AND available_at <= $1
       ORDER BY sequence
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [now, batchSize]
    );

    for (const row of due.rows) {
      const attempts = row.attempts + 1;
      try {
        await publish(toMessage(row));
      } catch (err) {
        if (attempts >= maxAttempts) {
          await client.query(
            `UPDATE outbox_messages
             SET status = 'dead_letter', attempts = $2, last_attempt_at = $3, last_error = $4
             WHERE id = $1`,
            [row.id, attempts, now, describeError(err)]
          );
          summary.deadLettered += 1;
        } else {
          const delayMs = retryDelayMs(attempts);
          if (!Number.isFinite(delayMs) || delayMs < 0) {
            throw new TypeError("outbox: retryDelayMs must return a non-negative number");
          }
          const nextAt = new Date(now.getTime() + delayMs);
          await client.query(
            `UPDATE outbox_messages
             SET attempts = $2, last_attempt_at = $3, last_error = $4, available_at = $5
             WHERE id = $1`,
            [row.id, attempts, now, describeError(err), nextAt]
          );
          summary.retried += 1;
        }
        continue;
      }

      await client.query(
        `UPDATE outbox_messages
         SET status = 'published', attempts = $2, last_attempt_at = $3, last_error = NULL, published_at = $3
         WHERE id = $1`,
        [row.id, attempts, now]
      );
      summary.published += 1;
    }

    await client.query("COMMIT");
    return summary;
  } catch (err) {
    // Keep the original error: a failed ROLLBACK must not replace it.
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  enqueueOutboxMessage,
  publishPendingOutbox,
};
