const pool = require("../../db/db");
const { validateIdempotencyKey, executeIdempotent } = require("../infrastructure/idempotency");
const { consumeInboxEvent } = require("../infrastructure/inbox");
const { hashRequest } = require("../infrastructure/canonical-json");
const invitations = require("../projects/invitation-repository");
const projectRepository = require("../projects/transition-repository");
const escrowRepository = require("../escrow/repository");
const { confirmFunding } = require("../escrow/funding-confirmation");
const { adapter, selectedName } = require("./registry");
const repository = require("./repository");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FUNDABLE_STATES = new Set(["accepted", "awaiting_funding"]);
const EXPIRY_MS = 24 * 60 * 60 * 1000;
const CLIENT_MONEY_MESSAGE = "Funding amount and currency are taken from the agreed terms";

function concealed() {
  return { status: 404, body: { error: "Project not found" } };
}

function rejection(status, body) {
  const error = new Error(body.error || "payment rejected");
  error.status = status;
  error.body = body;
  return error;
}

function minorUnits(value) {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number(value);
  }
  return Number(value);
}

function publicPayment(row) {
  return {
    payment: {
      external_id: row.external_id,
      status: row.status,
      amount: minorUnits(row.amount),
      currency: row.currency,
      currency_exponent: Number(row.currency_exponent),
      provider: row.provider,
      continuation: row.continuation || {},
      expires_at: row.expires_at,
    },
  };
}

function providerError(error) {
  if (error && error.code === "payment_provider_unconfigured") {
    return { status: 503, body: { error: "Payment provider is not configured" } };
  }
  if (error && error.code === "payment_provider_rejected") {
    return { status: 502, body: { error: "Payment provider did not accept the funding attempt" } };
  }
  return null;
}

function eventKind(type) {
  if (type === "payment.succeeded" || type === "PAYMENT_SUCCESS_WEBHOOK") {
    return "succeeded";
  }
  if (type === "payment.failed" || type === "PAYMENT_FAILED_WEBHOOK") {
    return "failed";
  }
  return "ignored";
}

async function auditPayment(client, projectId, action, outcome, source, target, aggregateVersion, key, hash) {
  await invitations.insertAuditEvent(client, [
    invitations.makeAuditExternalId(),
    projectId,
    "AUD-ESCROW-007",
    "system",
    "system",
    "system",
    action,
    outcome,
    null,
    source,
    target,
    aggregateVersion,
    null,
    key,
    hash,
  ]);
}

async function createFundingPayment(projectId, body, actorUserId, idempotencyKeyHeader) {
  if (!UUID_PATTERN.test(projectId)) {
    return { status: 400, body: { error: "projectId must be a valid UUID" } };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, body: { error: "Request body must be an object" } };
  }
  for (const key of Object.keys(body)) {
    if (key !== "expected_version") {
      return { status: 400, body: { error: CLIENT_MONEY_MESSAGE } };
    }
  }
  if (!Number.isInteger(body.expected_version)) {
    return { status: 400, body: { error: "expected_version must be an integer" } };
  }
  const key = validateIdempotencyKey(idempotencyKeyHeader);
  if (!key.ok) {
    return { status: 400, body: { error: key.error } };
  }
  let selected;
  try {
    selected = adapter();
  } catch (error) {
    const mapped = providerError(error);
    if (mapped) {
      return mapped;
    }
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await projectRepository.lockProjectById(client, projectId);
    const project = locked.rows[0];
    if (!project) {
      await client.query("ROLLBACK");
      return concealed();
    }
    if (project.buyer_user_id !== actorUserId) {
      const seller = await projectRepository.activeSeller(client, project.id);
      const sellerUserId = seller.rows[0] ? seller.rows[0].user_id : null;
      await client.query("ROLLBACK");
      if (sellerUserId === actorUserId) {
        return { status: 403, body: { error: "Only the project buyer can fund" } };
      }
      return concealed();
    }
    const account = await escrowRepository.actorAccountStatus(client, actorUserId);
    if (!account.rows[0] || account.rows[0].status !== "active") {
      await client.query("ROLLBACK");
      return { status: 403, body: { error: "Account cannot fund" } };
    }
    const idempotent = await executeIdempotent(client, {
      actorType: "user",
      actorId: actorUserId,
      operation: "payments.create_funding",
      resourceRef: project.id,
      key: key.key,
      request: { expected_version: body.expected_version },
    }, () => applyCreate(client, project, actorUserId, body.expected_version, key.key, selected));
    if (idempotent.status !== 200) {
      throw rejection(idempotent.status, idempotent.body);
    }
    await client.query("COMMIT");
    return { status: 200, body: idempotent.body };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The transaction is already closed.
    }
    if (error && error.status) {
      return { status: error.status, body: error.body };
    }
    const mapped = providerError(error);
    if (mapped) {
      return mapped;
    }
    if (error && error.code === "23505") {
      return { status: 409, body: { error: "A funding payment is already open" } };
    }
    console.error(error);
    return { status: 500, body: { error: "Internal server error" } };
  } finally {
    client.release();
  }
}

async function applyCreate(client, project, actorUserId, expectedVersion, idempotencyKey, selected) {
  if (project.version !== expectedVersion) {
    return { status: 409, body: { error: "Project version is stale" } };
  }
  if (!FUNDABLE_STATES.has(project.state) || !project.agreed_term_version) {
    return { status: 409, body: { error: "Project is not fundable" } };
  }
  const escrows = await repository.lockEscrowForProject(client, project.id);
  const escrow = escrows.rows.find((row) => row.status === "created");
  if (!escrow || escrows.rows.some((row) => row.status === "funded")) {
    return { status: 409, body: { error: "Project is not fundable" } };
  }
  if (escrow.currency !== "INR" || Number(escrow.currency_exponent) !== 2) {
    return { status: 409, body: { error: "Project is not fundable" } };
  }
  if (minorUnits(escrow.expected_amount) !== Number(project.price_amount)) {
    return { status: 409, body: { error: "Project is not fundable" } };
  }
  const existing = await repository.lockPaymentByKey(client, escrow.id, idempotencyKey);
  if (existing.rows[0]) {
    return { status: 200, body: publicPayment(existing.rows[0]) };
  }
  const open = await repository.lockOpenFundingPayment(client, escrow.id);
  for (const row of open.rows) {
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      await repository.cancelPayment(client, row.id);
    } else {
      return { status: 409, body: { error: "A funding payment is already open" } };
    }
  }
  const expiresAt = new Date(Date.now() + EXPIRY_MS);
  const inserted = await repository.insertFundingPayment(client, [
    repository.makePaymentExternalId(),
    project.id,
    escrow.id,
    actorUserId,
    minorUnits(escrow.expected_amount),
    escrow.currency,
    Number(escrow.currency_exponent),
    selected.name,
    idempotencyKey,
    expiresAt,
  ]);
  let created;
  try {
    created = await selected.createFundingIntent({
      amountMinor: BigInt(minorUnits(escrow.expected_amount)),
      exponent: Number(escrow.currency_exponent),
      currency: escrow.currency,
      idempotencyKey,
    });
  } catch (error) {
    const mapped = providerError(error);
    if (mapped) {
      throw rejection(mapped.status, mapped.body);
    }
    throw error;
  }
  const stored = await repository.storeProviderReference(
    client,
    inserted.rows[0].id,
    created.providerReference,
    created.continuation,
    created.status
  );
  const hash = hashRequest({
    action: "payments.create_funding",
    payment_external_id: stored.rows[0].external_id,
    amount: minorUnits(stored.rows[0].amount),
    currency: stored.rows[0].currency,
    provider: selected.name,
  });
  await auditPayment(
    client,
    project.id,
    "payments.create_funding",
    "created",
    null,
    stored.rows[0].status,
    project.version,
    idempotencyKey,
    hash
  );
  return { status: 200, body: publicPayment(stored.rows[0]) };
}

async function receiveWebhook(providerName, rawBody, headers) {
  if (providerName !== selectedName()) {
    return { status: 404, body: { error: "Payment provider is not configured" } };
  }
  let selected;
  try {
    selected = adapter();
  } catch (error) {
    const mapped = providerError(error);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""), "utf8");
  let verified;
  try {
    verified = selected.verifyWebhookSignature(body, headers);
  } catch (error) {
    const mapped = providerError(error);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
  if (!verified.ok) {
    await recordReceipt(providerName, "rejected_signature", null, null);
    return { status: 401, body: { error: "Webhook signature is invalid" } };
  }
  const event = verified.event;
  const kind = eventKind(event.type);
  if (
    typeof event.eventId !== "string"
    || event.eventId.length === 0
    || event.eventId.length > 255
    || typeof event.providerReference !== "string"
  ) {
    await recordReceipt(providerName, "quarantined", null, null);
    return { status: 200, body: { outcome: "quarantined" } };
  }
  if (kind === "ignored") {
    await recordReceipt(providerName, "ignored", event.eventId, null);
    return { status: 200, body: { outcome: "ignored" } };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await repository.lockPaymentByProviderReference(client, providerName, event.providerReference);
    const payment = locked.rows[0];
    if (!payment) {
      await repository.insertReceipt(client, [
        repository.makeReceiptExternalId(),
        providerName,
        "quarantined",
        event.eventId,
        null,
      ]);
      await client.query("COMMIT");
      return { status: 200, body: { outcome: "quarantined" } };
    }
    const consumed = await consumeInboxEvent(client, {
      consumer: "payments.webhook",
      source: providerName,
      eventId: event.eventId,
      eventType: event.type,
    }, async () => {
      const outcome = await applyWebhook(client, payment, event, kind);
      await repository.insertReceipt(client, [
        repository.makeReceiptExternalId(),
        providerName,
        outcome,
        event.eventId,
        payment.id,
      ]);
      const projectVersion = await client.query(
        "SELECT version FROM projects WHERE id = $1",
        [payment.project_id]
      );
      await invitations.insertAuditEvent(client, [
        invitations.makeAuditExternalId(),
        payment.project_id,
        "AUD-ESCROW-008",
        "system",
        "system",
        "system",
        "payments.webhook",
        outcome,
        null,
        payment.status,
        kind,
        projectVersion.rows[0].version,
        event.eventId,
        event.eventId,
        hashRequest({
          action: "payments.webhook",
          outcome,
          payment_external_id: payment.external_id,
          amount: minorUnits(payment.amount),
          currency: payment.currency,
        }),
      ]);
      return outcome === "quarantined" ? "quarantined" : outcome === "ignored" ? "ignored" : "applied";
    });
    await client.query("COMMIT");
    return { status: 200, body: { outcome: consumed.duplicate ? "duplicate" : consumed.result } };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The transaction is already closed.
    }
    if (error && error.status) {
      return { status: error.status, body: error.body };
    }
    console.error(error);
    return { status: 500, body: { error: "Internal server error" } };
  } finally {
    client.release();
  }
}

async function applyWebhook(client, payment, event, kind) {
  const reported = typeof event.amountMinor === "bigint"
    ? event.amountMinor
    : BigInt(event.amountMinor);
  if (reported !== BigInt(payment.amount) || event.currency !== payment.currency) {
    return "quarantined";
  }
  const occurredAt = typeof event.occurredAt === "string" && !Number.isNaN(Date.parse(event.occurredAt))
    ? new Date(event.occurredAt)
    : null;
  if (payment.expires_at && new Date(payment.expires_at).getTime() <= Date.now() && payment.status !== "succeeded") {
    await repository.cancelPayment(client, payment.id);
    return "ignored";
  }
  if (payment.status === "succeeded" || payment.status === "failed" || payment.status === "cancelled") {
    return "ignored";
  }
  if (kind === "failed") {
    await repository.markPayment(client, payment.id, "failed", occurredAt);
    return "applied";
  }
  const escrowRow = await client.query(
    `SELECT id, external_id, project_id, status, currency, currency_exponent, expected_amount, version
     FROM escrows WHERE id = $1 FOR UPDATE`,
    [payment.escrow_id]
  );
  const escrow = escrowRow.rows[0];
  if (!escrow || escrow.status !== "created") {
    return "quarantined";
  }
  const allocations = await repository.fundingAllocations(client, escrow.id);
  await confirmFunding(client, {
    escrow,
    payment,
    allocations: allocations.rows,
    eventId: event.eventId,
  });
  await repository.markPayment(client, payment.id, "succeeded", occurredAt);
  return "applied";
}

async function recordReceipt(providerName, outcome, eventId, paymentId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await repository.insertReceipt(client, [
      repository.makeReceiptExternalId(),
      providerName,
      outcome,
      eventId,
      paymentId,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The transaction is already closed.
    }
    console.error(error);
  } finally {
    client.release();
  }
}

module.exports = {
  createFundingPayment,
  receiveWebhook,
};
