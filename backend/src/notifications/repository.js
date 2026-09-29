const crypto = require("crypto");

const SAFE_NOTIFICATION_FIELDS = `
  d.external_id,
  i.topic,
  i.mandatory_class,
  d.status,
  i.created_at,
  d.read_at
`;

function makeIntentExternalId() {
  return `ntf_${crypto.randomBytes(10).toString("hex")}`;
}

function makeDeliveryExternalId() {
  return `ndl_${crypto.randomBytes(10).toString("hex")}`;
}

function makeAuditExternalId() {
  return `nau_${crypto.randomBytes(10).toString("hex")}`;
}

function insertIntent(db, values) {
  return db.query(
    `INSERT INTO notification_intents (
       external_id, recipient_user_id, topic, mandatory_class,
       source_domain, source_event_id, dedupe_key, template_reference
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id, external_id, recipient_user_id, topic, mandatory_class, dedupe_key`,
    values
  );
}

function lockIntentByDedupe(db, dedupeKey) {
  return db.query(
    `SELECT id, external_id, recipient_user_id, topic, mandatory_class, dedupe_key
     FROM notification_intents
     WHERE dedupe_key = $1
     FOR UPDATE`,
    [dedupeKey]
  );
}

function findInAppDelivery(db, intentId) {
  return db.query(
    `SELECT id, external_id, status, read_at, channel
     FROM notification_deliveries
     WHERE intent_id = $1 AND channel = 'IN_APP'`,
    [intentId]
  );
}

function insertInAppDelivery(db, values) {
  return db.query(
    `INSERT INTO notification_deliveries (
       external_id, intent_id, channel, status, attempt_count, idempotency_key
     )
     VALUES ($1, $2, 'IN_APP', 'PENDING', 0, $3)
     RETURNING id, external_id, status, channel`,
    values
  );
}

function markInAppSent(db, deliveryId, providerReference) {
  return db.query(
    `UPDATE notification_deliveries
     SET status = 'SENT',
         provider_reference = $2,
         attempt_count = attempt_count + 1,
         last_attempted_at = clock_timestamp(),
         updated_at = clock_timestamp()
     WHERE id = $1 AND status = 'PENDING'
     RETURNING id, external_id, status, read_at, channel, provider_reference`,
    [deliveryId, providerReference]
  );
}

function assertRecipientScope(recipientUserId) {
  if (typeof recipientUserId !== "string" || recipientUserId.length === 0) {
    throw new Error("notification.list requires the recipient scope from authorize()");
  }
}

function listInAppForRecipient(db, recipientUserId, limit, offset) {
  assertRecipientScope(recipientUserId);
  return db.query(
    `SELECT ${SAFE_NOTIFICATION_FIELDS}
     FROM notification_deliveries d
     JOIN notification_intents i ON i.id = d.intent_id
     WHERE i.recipient_user_id = $1
       AND d.channel = 'IN_APP'
     ORDER BY i.created_at DESC, d.id DESC
     LIMIT $2 OFFSET $3`,
    [recipientUserId, limit, offset]
  );
}

const IN_APP_FOR_RECIPIENT_SQL = `
  SELECT
    d.id,
    d.external_id,
    d.status,
    d.read_at,
    d.channel,
    i.topic,
    i.mandatory_class,
    i.created_at,
    i.recipient_user_id,
    i.external_id AS intent_external_id
  FROM notification_deliveries d
  JOIN notification_intents i ON i.id = d.intent_id
  WHERE d.external_id = $1
    AND i.recipient_user_id = $2
    AND d.channel = 'IN_APP'
`;

function findInAppForRecipient(db, externalId, recipientUserId) {
  assertRecipientScope(recipientUserId);
  return db.query(IN_APP_FOR_RECIPIENT_SQL, [externalId, recipientUserId]);
}

function lockInAppForRecipient(db, externalId, recipientUserId) {
  assertRecipientScope(recipientUserId);
  return db.query(`${IN_APP_FOR_RECIPIENT_SQL} FOR UPDATE OF d`, [
    externalId,
    recipientUserId,
  ]);
}

function markRead(db, deliveryId) {
  return db.query(
    `UPDATE notification_deliveries
     SET read_at = clock_timestamp(),
         updated_at = clock_timestamp()
     WHERE id = $1 AND read_at IS NULL
     RETURNING read_at`,
    [deliveryId]
  );
}

function insertAuditEvent(db, values) {
  return db.query(
    `INSERT INTO notification_audit_events (
       external_id, event_type, recipient_user_id, topic, channel,
       intent_external_id, delivery_external_id, actor_type, actor_id, change_hash
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    values
  );
}

module.exports = {
  SAFE_NOTIFICATION_FIELDS,
  makeIntentExternalId,
  makeDeliveryExternalId,
  makeAuditExternalId,
  insertIntent,
  lockIntentByDedupe,
  findInAppDelivery,
  insertInAppDelivery,
  markInAppSent,
  listInAppForRecipient,
  findInAppForRecipient,
  lockInAppForRecipient,
  markRead,
  insertAuditEvent,
};
