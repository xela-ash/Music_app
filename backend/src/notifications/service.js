const pool = require("../../db/db");
const { hashRequest } = require("../infrastructure/canonical-json");
const {
  NOTIFICATION_LIST,
  NOTIFICATION_MARK_READ,
  NOTIFICATION_READ,
  authorize,
} = require("../authorization/authorize");
const { sendInApp } = require("./in-app-adapter");
const repository = require("./repository");
const {
  deliveryExternalIdIsValid,
  parseNotificationListQuery,
  parseVerifiedEvent,
} = require("./rules");
const { createsDurableInApp, topicRecord } = require("./topics");

function publicNotification(row) {
  return {
    external_id: row.external_id,
    topic: row.topic,
    mandatory_class: row.mandatory_class,
    status: row.status,
    created_at: row.created_at,
    read_at: row.read_at,
  };
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error(rollbackErr);
    }
    if (err && err.status && err.body) {
      return { status: err.status, body: err.body };
    }
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  } finally {
    client.release();
  }
}

function denied(decision) {
  const error = new Error("denied");
  error.status = decision.status;
  error.body = { error: decision.error };
  throw error;
}

async function writeAudit(client, values) {
  await repository.insertAuditEvent(client, [
    repository.makeAuditExternalId(),
    values.eventType,
    values.recipientUserId,
    values.topic,
    values.channel,
    values.intentExternalId,
    values.deliveryExternalId,
    values.actorType,
    values.actorId,
    hashRequest({
      channel: values.channel,
      delivery_external_id: values.deliveryExternalId,
      event_type: values.eventType,
      intent_external_id: values.intentExternalId,
      recipient_user_id: values.recipientUserId,
      topic: values.topic,
    }),
  ]);
}

// Trusted in-process producer entry (INT-NOTIFICATIONS-001).
// A preference object is accepted and ignored. User Settings is not read
// here. A mandatory topic always gets an in-app record. Any other topic
// follows the matrix default, which is the specified result when a preference
// read is unavailable.
async function submitVerifiedEvent(input) {
  const parsed = parseVerifiedEvent(input);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const event = parsed.value;
  const record = topicRecord(event.topic);
  const dedupeKey = hashRequest({
    recipient_user_id: event.recipientUserId,
    source_event_id: event.sourceEventId,
    topic: event.topic,
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await repository.insertIntent(client, [
      repository.makeIntentExternalId(),
      event.recipientUserId,
      event.topic,
      record.mandatoryClass,
      event.sourceDomain,
      event.sourceEventId,
      dedupeKey,
      `topic:${event.topic}`,
    ]);

    let intent = inserted.rows[0];
    const created = Boolean(intent);
    if (!intent) {
      const locked = await repository.lockIntentByDedupe(client, dedupeKey);
      intent = locked.rows[0];
    }
    if (!intent) {
      throw new Error("notification intent dedupe missed the inserted row");
    }

    let delivery = null;
    const existing = await repository.findInAppDelivery(client, intent.id);
    delivery = existing.rows[0] || null;

    if (created && createsDurableInApp(record)) {
      const pending = await repository.insertInAppDelivery(client, [
        repository.makeDeliveryExternalId(),
        intent.id,
        `in_app:${dedupeKey}`,
      ]);
      const sent = sendInApp({
        recipientUserId: intent.recipient_user_id,
        deliveryExternalId: pending.rows[0].external_id,
        idempotencyKey: `in_app:${dedupeKey}`,
      });
      if (!sent.ok) {
        throw new Error("in-app adapter rejected the delivery");
      }
      const marked = await repository.markInAppSent(
        client,
        pending.rows[0].id,
        sent.providerReference
      );
      delivery = marked.rows[0];
    }

    if (created) {
      await writeAudit(client, {
        eventType: "AUD-NOTIFICATIONS-001",
        recipientUserId: intent.recipient_user_id,
        topic: intent.topic,
        channel: delivery ? "IN_APP" : null,
        intentExternalId: intent.external_id,
        deliveryExternalId: delivery ? delivery.external_id : null,
        actorType: "system",
        actorId: event.sourceDomain,
      });
    }

    await client.query("COMMIT");
    return {
      ok: true,
      created,
      intent_external_id: intent.external_id,
      delivery_external_id: delivery ? delivery.external_id : null,
      status: delivery ? delivery.status : null,
      mandatory_class: intent.mandatory_class,
      topic: intent.topic,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error(rollbackErr);
    }
    if (err && err.code === "23503") {
      return { ok: false, error: "Recipient not found" };
    }
    if (err && err.code === "23505") {
      return { ok: false, error: "Notification conflict" };
    }
    console.error(err);
    return { ok: false, error: "Internal server error" };
  } finally {
    client.release();
  }
}

async function listNotifications(actor, query) {
  const decision = authorize(actor, NOTIFICATION_LIST, null);
  if (!decision.allowed) {
    return { status: decision.status, body: { error: decision.error } };
  }
  const parsed = parseNotificationListQuery(query);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.error } };
  }
  try {
    const result = await repository.listInAppForRecipient(
      pool,
      decision.obligations.recipientUserId,
      parsed.limit + 1,
      parsed.offset
    );
    const notifications = result.rows.slice(0, parsed.limit).map(publicNotification);
    return { status: 200, body: { notifications } };
  } catch (err) {
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

async function readNotification(actor, externalId) {
  if (!deliveryExternalIdIsValid(externalId)) {
    return { status: 400, body: { error: "Notification id is invalid" } };
  }
  const actorDecision = authorize(actor, NOTIFICATION_LIST, null);
  if (!actorDecision.allowed) {
    return { status: actorDecision.status, body: { error: actorDecision.error } };
  }
  try {
    const found = await repository.findInAppForRecipient(
      pool,
      externalId,
      actorDecision.obligations.recipientUserId
    );
    const row = found.rows[0] || null;
    const decision = authorize(
      actor,
      NOTIFICATION_READ,
      row ? { recipientUserId: row.recipient_user_id } : null
    );
    if (!decision.allowed) {
      return { status: decision.status, body: { error: decision.error } };
    }
    return { status: 200, body: { notification: publicNotification(row) } };
  } catch (err) {
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

async function markNotificationRead(actor, externalId) {
  if (!deliveryExternalIdIsValid(externalId)) {
    return { status: 400, body: { error: "Notification id is invalid" } };
  }
  const actorDecision = authorize(actor, NOTIFICATION_LIST, null);
  if (!actorDecision.allowed) {
    return { status: actorDecision.status, body: { error: actorDecision.error } };
  }
  return withTransaction(async (client) => {
    const locked = await repository.lockInAppForRecipient(
      client,
      externalId,
      actorDecision.obligations.recipientUserId
    );
    const row = locked.rows[0] || null;
    const decision = authorize(
      actor,
      NOTIFICATION_MARK_READ,
      row ? { recipientUserId: row.recipient_user_id } : null
    );
    if (!decision.allowed) {
      denied(decision);
    }
    if (row.read_at) {
      return { status: 200, body: { notification: publicNotification(row) } };
    }
    const updated = await repository.markRead(client, row.id);
    const readAt = updated.rows[0] ? updated.rows[0].read_at : row.read_at;
    await writeAudit(client, {
      eventType: "AUD-NOTIFICATIONS-002",
      recipientUserId: row.recipient_user_id,
      topic: null,
      channel: "IN_APP",
      intentExternalId: row.intent_external_id,
      deliveryExternalId: row.external_id,
      actorType: "user",
      actorId: row.recipient_user_id,
    });
    return {
      status: 200,
      body: { notification: publicNotification({ ...row, read_at: readAt }) },
    };
  });
}

module.exports = {
  submitVerifiedEvent,
  listNotifications,
  readNotification,
  markNotificationRead,
};
