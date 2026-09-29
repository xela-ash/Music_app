const crypto = require("crypto");

const CONVERSATION_FIELDS = `
  id, external_id, project_id, latest_message_id, version, created_at, updated_at
`;

const MESSAGE_FIELDS = `
  id, external_id, conversation_id, sequence_number, message_type, sender_user_id,
  system_event_reference, body, content_hash, sent_at, idempotency_key,
  tombstoned_at, tombstoned_by_user_id, created_at
`;

function makeConversationExternalId() {
  return `cnv_${crypto.randomBytes(10).toString("hex")}`;
}

function makeMessageExternalId() {
  return `msg_${crypto.randomBytes(10).toString("hex")}`;
}

function makeAuditExternalId() {
  return `mae_${crypto.randomBytes(10).toString("hex")}`;
}

function contentHash(body) {
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

function lockProjectByExternalId(db, externalId) {
  return db.query(
    `SELECT p.id, p.external_id, p.buyer_user_id,
            (
              SELECT pp.user_id
              FROM project_participants pp
              WHERE pp.project_id = p.id
                AND pp.category = 'seller'
                AND pp.status = 'active'
              LIMIT 1
            ) AS active_seller_user_id
     FROM projects p
     WHERE p.external_id = $1
     FOR UPDATE`,
    [externalId]
  );
}

function findProjectByExternalId(db, externalId) {
  return db.query(
    `SELECT p.id, p.external_id, p.buyer_user_id,
            (
              SELECT pp.user_id
              FROM project_participants pp
              WHERE pp.project_id = p.id
                AND pp.category = 'seller'
                AND pp.status = 'active'
              LIMIT 1
            ) AS active_seller_user_id
     FROM projects p
     WHERE p.external_id = $1`,
    [externalId]
  );
}

function lockConversationByProjectId(db, projectId) {
  return db.query(
    `SELECT ${CONVERSATION_FIELDS}
     FROM conversations
     WHERE project_id = $1
     FOR UPDATE`,
    [projectId]
  );
}

function findConversationByProjectId(db, projectId) {
  return db.query(
    `SELECT ${CONVERSATION_FIELDS}
     FROM conversations
     WHERE project_id = $1`,
    [projectId]
  );
}

function insertConversation(db, externalId, projectId) {
  return db.query(
    `INSERT INTO conversations (external_id, project_id)
     VALUES ($1, $2)
     RETURNING ${CONVERSATION_FIELDS}`,
    [externalId, projectId]
  );
}

function nextSequence(db, conversationId) {
  return db.query(
    `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS sequence_number
     FROM messages
     WHERE conversation_id = $1`,
    [conversationId]
  );
}

function insertMessage(db, values) {
  return db.query(
    `INSERT INTO messages (
       external_id, conversation_id, sequence_number, message_type, sender_user_id,
       body, content_hash, idempotency_key
     )
     VALUES ($1, $2, $3, 'USER', $4, $5, $6, $7)
     RETURNING ${MESSAGE_FIELDS}`,
    values
  );
}

function pointConversationAtMessage(db, conversationId, messageId, nextVersion) {
  return db.query(
    `UPDATE conversations
     SET latest_message_id = $2,
         version = $3,
         updated_at = clock_timestamp()
     WHERE id = $1
     RETURNING ${CONVERSATION_FIELDS}`,
    [conversationId, messageId, nextVersion]
  );
}

function countMessages(db, conversationId) {
  return db.query(
    `SELECT COUNT(*)::int AS message_count
     FROM messages
     WHERE conversation_id = $1`,
    [conversationId]
  );
}

function listMessages(db, conversationId, limit, offset) {
  return db.query(
    `SELECT ${MESSAGE_FIELDS}
     FROM messages
     WHERE conversation_id = $1
     ORDER BY sequence_number ASC
     LIMIT $2 OFFSET $3`,
    [conversationId, limit, offset]
  );
}

function lockMessageInConversation(db, conversationId, externalId) {
  return db.query(
    `SELECT ${MESSAGE_FIELDS}
     FROM messages
     WHERE conversation_id = $1 AND external_id = $2
     FOR UPDATE`,
    [conversationId, externalId]
  );
}

function tombstoneMessage(db, messageId, actorUserId) {
  return db.query(
    `UPDATE messages
     SET tombstoned_at = clock_timestamp(),
         tombstoned_by_user_id = $2
     WHERE id = $1
       AND tombstoned_at IS NULL
     RETURNING ${MESSAGE_FIELDS}`,
    [messageId, actorUserId]
  );
}

function insertAuditEvent(db, values) {
  return db.query(
    `INSERT INTO messaging_audit_events (
       external_id, project_id, conversation_id, message_id, event_type,
       actor_type, actor_id, action, outcome, aggregate_version,
       idempotency_key, change_hash
     )
     VALUES ($1, $2, $3, $4, 'AUD-MESSAGING-001', $5, $6, $7, $8, $9, $10, $11)`,
    values
  );
}

module.exports = {
  makeConversationExternalId,
  makeMessageExternalId,
  makeAuditExternalId,
  contentHash,
  lockProjectByExternalId,
  findProjectByExternalId,
  lockConversationByProjectId,
  findConversationByProjectId,
  insertConversation,
  nextSequence,
  insertMessage,
  pointConversationAtMessage,
  countMessages,
  listMessages,
  lockMessageInConversation,
  tombstoneMessage,
  insertAuditEvent,
};
