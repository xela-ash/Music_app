const pool = require("../../db/db");
const { validateIdempotencyKey, executeIdempotent } = require("../infrastructure/idempotency");
const { enqueueOutboxMessage } = require("../infrastructure/outbox");
const { hashRequest } = require("../infrastructure/canonical-json");
const {
  CONVERSATION_READ,
  CONVERSATION_SEND,
  MESSAGE_TOMBSTONE,
  authorize,
} = require("../authorization/authorize");
const repository = require("./repository");
const {
  parseMessageExternalId,
  parseMessageListQuery,
  parseProjectExternalId,
  parseSendBody,
} = require("./rules");

function iso(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function publicMessage(row, conversationExternalId) {
  const tombstoned = row.tombstoned_at != null;
  return {
    external_id: row.external_id,
    conversation_external_id: conversationExternalId,
    sequence_number: row.sequence_number,
    message_type: row.message_type,
    sender_user_id: row.sender_user_id,
    body: tombstoned ? null : row.body,
    sent_at: iso(row.sent_at),
    tombstoned_at: iso(row.tombstoned_at),
  };
}

function publicConversation(row, projectExternalId, messageCount) {
  return {
    external_id: row.external_id,
    project_external_id: projectExternalId,
    message_count: messageCount,
    version: row.version,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function participantResource(project) {
  return {
    buyerUserId: project.buyer_user_id,
    activeSellerUserId: project.active_seller_user_id,
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
    if (err && err.code === "23505") {
      return { status: 409, body: { error: "Message conflict" } };
    }
    if (err && err.code === "23514") {
      return { status: 400, body: { error: "Constraint violation" } };
    }
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  } finally {
    client.release();
  }
}

function concealed() {
  return { status: 404, body: { error: "Project not found" } };
}

async function writeAudit(client, values) {
  const changeHash = hashRequest({
    action: values.action,
    conversation_external_id: values.conversationExternalId,
    message_external_id: values.messageExternalId,
    outcome: values.outcome,
    project_external_id: values.projectExternalId,
  });
  await repository.insertAuditEvent(client, [
    repository.makeAuditExternalId(),
    values.projectId,
    values.conversationId,
    values.messageId,
    "user",
    values.actorId,
    values.action,
    values.outcome,
    values.aggregateVersion,
    values.idempotencyKey,
    changeHash,
  ]);
}

async function writeEvent(client, { eventType, conversation, projectExternalId, message, aggregateVersion }) {
  await enqueueOutboxMessage(client, {
    eventType,
    eventVersion: 1,
    aggregateType: "conversation",
    aggregateId: conversation.external_id,
    aggregateVersion,
    payload: {
      conversation_external_id: conversation.external_id,
      message_external_id: message ? message.external_id : null,
      project_external_id: projectExternalId,
      sequence_number: message ? message.sequence_number : null,
    },
  });
}

async function sendMessage(projectExternalId, body, actorUserId, idempotencyKeyHeader) {
  const projectId = parseProjectExternalId(projectExternalId);
  if (!projectId.ok) {
    return { status: 400, body: { error: projectId.error } };
  }
  const parsed = parseSendBody(body);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.error } };
  }
  const key = validateIdempotencyKey(idempotencyKeyHeader);
  if (!key.ok) {
    return { status: 400, body: { error: key.error } };
  }
  const command = parsed.value;

  return withTransaction(async (client) => {
    const locked = await repository.lockProjectByExternalId(client, projectId.value);
    const project = locked.rows[0];
    if (!project) {
      return concealed();
    }
    const decision = authorize({ id: actorUserId }, CONVERSATION_SEND, participantResource(project));
    if (!decision.allowed) {
      return { status: decision.status, body: { error: decision.error } };
    }

    let conversationResult = await repository.lockConversationByProjectId(client, project.id);
    let createdConversation = false;
    if (conversationResult.rows.length === 0) {
      conversationResult = await repository.insertConversation(
        client,
        repository.makeConversationExternalId(),
        project.id
      );
      createdConversation = true;
    }
    const conversation = conversationResult.rows[0];

    const idempotent = await executeIdempotent(
      client,
      {
        actorType: "user",
        actorId: actorUserId,
        operation: "messaging.send",
        resourceRef: conversation.id,
        key: key.key,
        request: command,
      },
      async () => {
        const sequence = await repository.nextSequence(client, conversation.id);
        const inserted = await repository.insertMessage(client, [
          repository.makeMessageExternalId(),
          conversation.id,
          sequence.rows[0].sequence_number,
          actorUserId,
          command.body,
          repository.contentHash(command.body),
          key.key,
        ]);
        const message = inserted.rows[0];
        const nextVersion = createdConversation ? conversation.version : conversation.version + 1;
        const pointed = await repository.pointConversationAtMessage(
          client,
          conversation.id,
          message.id,
          nextVersion
        );
        const current = pointed.rows[0];
        if (createdConversation) {
          await writeAudit(client, {
            projectId: project.id,
            projectExternalId: project.external_id,
            conversationId: current.id,
            conversationExternalId: current.external_id,
            messageId: null,
            messageExternalId: null,
            actorId: actorUserId,
            action: "conversation_created",
            outcome: "created",
            aggregateVersion: current.version,
            idempotencyKey: key.key,
          });
          await writeEvent(client, {
            eventType: "ConversationCreated",
            conversation: current,
            projectExternalId: project.external_id,
            message: null,
            aggregateVersion: current.version,
          });
        }
        await writeAudit(client, {
          projectId: project.id,
          projectExternalId: project.external_id,
          conversationId: current.id,
          conversationExternalId: current.external_id,
          messageId: message.id,
          messageExternalId: message.external_id,
          actorId: actorUserId,
          action: "message_created",
          outcome: "created",
          aggregateVersion: current.version,
          idempotencyKey: key.key,
        });
        await writeEvent(client, {
          eventType: "MessageSent",
          conversation: current,
          projectExternalId: project.external_id,
          message,
          aggregateVersion: current.version,
        });
        return {
          status: 201,
          body: { message: publicMessage(message, current.external_id) },
        };
      }
    );
    return { status: idempotent.status, body: idempotent.body };
  });
}

async function listMessages(projectExternalId, actorUserId, query) {
  const projectId = parseProjectExternalId(projectExternalId);
  if (!projectId.ok) {
    return { status: 400, body: { error: projectId.error } };
  }
  const page = parseMessageListQuery(query);
  if (!page.ok) {
    return { status: 400, body: { error: page.error } };
  }
  try {
    const found = await repository.findProjectByExternalId(pool, projectId.value);
    const project = found.rows[0];
    if (!project) {
      return concealed();
    }
    const decision = authorize({ id: actorUserId }, CONVERSATION_READ, participantResource(project));
    if (!decision.allowed) {
      return { status: decision.status, body: { error: decision.error } };
    }
    const conversationResult = await repository.findConversationByProjectId(pool, project.id);
    const conversation = conversationResult.rows[0];
    if (!conversation) {
      return {
        status: 200,
        body: {
          conversation: null,
          messages: [],
          page: { limit: page.limit, offset: page.offset, has_more: false },
        },
      };
    }
    const counted = await repository.countMessages(pool, conversation.id);
    const listed = await repository.listMessages(pool, conversation.id, page.limit + 1, page.offset);
    const hasMore = listed.rows.length > page.limit;
    const messages = listed.rows
      .slice(0, page.limit)
      .map((row) => publicMessage(row, conversation.external_id));
    return {
      status: 200,
      body: {
        conversation: publicConversation(
          conversation,
          project.external_id,
          counted.rows[0].message_count
        ),
        messages,
        page: { limit: page.limit, offset: page.offset, has_more: hasMore },
      },
    };
  } catch (err) {
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

async function tombstoneMessage(projectExternalId, messageExternalId, actorUserId, idempotencyKeyHeader) {
  const projectId = parseProjectExternalId(projectExternalId);
  if (!projectId.ok) {
    return { status: 400, body: { error: projectId.error } };
  }
  const messageId = parseMessageExternalId(messageExternalId);
  if (!messageId.ok) {
    return { status: 400, body: { error: messageId.error } };
  }
  const key = validateIdempotencyKey(idempotencyKeyHeader);
  if (!key.ok) {
    return { status: 400, body: { error: key.error } };
  }

  return withTransaction(async (client) => {
    const locked = await repository.lockProjectByExternalId(client, projectId.value);
    const project = locked.rows[0];
    if (!project) {
      return concealed();
    }
    const readDecision = authorize({ id: actorUserId }, CONVERSATION_READ, participantResource(project));
    if (!readDecision.allowed) {
      return { status: readDecision.status, body: { error: readDecision.error } };
    }
    const conversationResult = await repository.lockConversationByProjectId(client, project.id);
    const conversation = conversationResult.rows[0];
    if (!conversation) {
      return { status: 404, body: { error: "Message not found" } };
    }
    const messageResult = await repository.lockMessageInConversation(
      client,
      conversation.id,
      messageId.value
    );
    const message = messageResult.rows[0];
    if (!message) {
      return { status: 404, body: { error: "Message not found" } };
    }
    const decision = authorize({ id: actorUserId }, MESSAGE_TOMBSTONE, {
      ...participantResource(project),
      senderUserId: message.sender_user_id,
    });
    if (!decision.allowed) {
      return { status: decision.status, body: { error: decision.error } };
    }

    const idempotent = await executeIdempotent(
      client,
      {
        actorType: "user",
        actorId: actorUserId,
        operation: "messaging.tombstone",
        resourceRef: message.id,
        key: key.key,
        request: { message_external_id: message.external_id },
      },
      async () => {
        if (message.tombstoned_at != null) {
          return {
            status: 200,
            body: { message: publicMessage(message, conversation.external_id) },
          };
        }
        const updated = await repository.tombstoneMessage(client, message.id, actorUserId);
        const tombstoned = updated.rows[0];
        await writeAudit(client, {
          projectId: project.id,
          projectExternalId: project.external_id,
          conversationId: conversation.id,
          conversationExternalId: conversation.external_id,
          messageId: tombstoned.id,
          messageExternalId: tombstoned.external_id,
          actorId: actorUserId,
          action: "message_tombstoned",
          outcome: "tombstoned",
          aggregateVersion: conversation.version,
          idempotencyKey: key.key,
        });
        await writeEvent(client, {
          eventType: "MessageTombstoned",
          conversation,
          projectExternalId: project.external_id,
          message: tombstoned,
          aggregateVersion: conversation.version,
        });
        return {
          status: 200,
          body: { message: publicMessage(tombstoned, conversation.external_id) },
        };
      }
    );
    return { status: idempotent.status, body: idempotent.body };
  });
}

module.exports = {
  sendMessage,
  listMessages,
  tombstoneMessage,
  publicMessage,
};
