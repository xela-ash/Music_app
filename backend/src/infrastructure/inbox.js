const MAX_TEXT_LENGTH = 255;
const INBOX_RESULTS = new Set(["applied", "ignored", "quarantined"]);

function assertText(name, value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TEXT_LENGTH) {
    throw new TypeError(`inbox: ${name} must be a non-empty string of at most ${MAX_TEXT_LENGTH} characters`);
  }
}

// Applies an inbound event at most once per (consumer, source, event_id),
// inside the caller's open transaction. The inbox row is inserted before the
// handler runs, so a concurrent duplicate blocks on the unique key until
// this transaction ends and then sees it as already consumed. If the handler
// throws, the caller rolls back and the event can be redelivered. Callers
// that lock aggregate rows lock them before calling this (Milestones §24).
//
// handler(client) returns "applied" (the default), "ignored", or
// "quarantined"; the result is recorded once and never changes.
async function consumeInboxEvent(client, { consumer, source, eventId, eventType }, handler) {
  assertText("consumer", consumer);
  assertText("source", source);
  assertText("eventId", eventId);
  assertText("eventType", eventType);

  const inserted = await client.query(
    `INSERT INTO inbox_events (consumer, source, event_id, event_type)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ON CONSTRAINT inbox_events_consumer_source_event_unique DO NOTHING
     RETURNING id`,
    [consumer, source, eventId, eventType]
  );

  if (inserted.rows.length === 0) {
    const existing = await client.query(
      `SELECT result FROM inbox_events WHERE consumer = $1 AND source = $2 AND event_id = $3`,
      [consumer, source, eventId]
    );
    return { duplicate: true, result: existing.rows[0] ? existing.rows[0].result : null };
  }

  const returned = await handler(client);
  const result = returned === undefined ? "applied" : returned;
  if (!INBOX_RESULTS.has(result)) {
    throw new TypeError("inbox: handler must return 'applied', 'ignored', or 'quarantined'");
  }

  await client.query(
    `UPDATE inbox_events SET result = $2, processed_at = now() WHERE id = $1`,
    [inserted.rows[0].id, result]
  );
  return { duplicate: false, result };
}

module.exports = {
  consumeInboxEvent,
};
