const pool = require("../../db/db");
const {
  validateIdempotencyKey,
  claimIdempotencyKey,
  completeIdempotencyKey,
} = require("../infrastructure/idempotency");
const { hashRequest } = require("../infrastructure/canonical-json");
const { consumeInboxEvent } = require("../infrastructure/inbox");
const invitations = require("../projects/invitation-repository");
const projectRepository = require("../projects/transition-repository");
const escrowRepository = require("../escrow/repository");
const { confirmFunding } = require("../escrow/funding-confirmation");
const { adapter, selectedName } = require("./registry");
const repository = require("./repository");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FUNDABLE_STATES = new Set(["accepted", "awaiting_funding"]);
const EXPIRY_MS = 24 * 60 * 60 * 1000;

function fundingAttemptExpired(payment) {
  if (!payment || payment.status === "succeeded" || payment.status === "failed") {
    return false;
  }
  if (payment.status === "cancelled") {
    return true;
  }
  return Boolean(payment.expires_at) && new Date(payment.expires_at).getTime() <= Date.now();
}
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
  if (error && error.code === "payment_provider_uncertain") {
    return {
      status: 503,
      body: { error: "Payment provider did not confirm the funding attempt. Retry the same Idempotency-Key" },
    };
  }
  return null;
}

function normalizedBody(body) {
  return JSON.parse(JSON.stringify(body));
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
  let prepared;
  try {
    await client.query("BEGIN");
    prepared = await prepareFundingPayment(
      client,
      projectId,
      body.expected_version,
      actorUserId,
      key.key,
      selected
    );
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The transaction is already closed.
    }
    if (error && error.status) {
      return { status: error.status, body: error.body };
    }
    if (error && error.code === "23505") {
      return { status: 409, body: { error: "A funding payment is already open" } };
    }
    console.error(error);
    return { status: 500, body: { error: "Internal server error" } };
  } finally {
    client.release();
  }
  if (prepared.response) {
    return prepared.response;
  }
  return settleProviderCall(prepared, selected, key.key);
}

async function prepareFundingPayment(client, projectId, expectedVersion, actorUserId, idempotencyKey, selected) {
  const locked = await projectRepository.lockProjectById(client, projectId);
  const project = locked.rows[0];
  if (!project) {
    return { response: concealed() };
  }
  if (project.buyer_user_id !== actorUserId) {
    const seller = await projectRepository.activeSeller(client, project.id);
    const sellerUserId = seller.rows[0] ? seller.rows[0].user_id : null;
    if (sellerUserId === actorUserId) {
      return { response: { status: 403, body: { error: "Only the project buyer can fund" } } };
    }
    return { response: concealed() };
  }
  const account = await escrowRepository.actorAccountStatus(client, actorUserId);
  if (!account.rows[0] || account.rows[0].status !== "active") {
    return { response: { status: 403, body: { error: "Account cannot fund" } } };
  }
  if (project.version !== expectedVersion) {
    return { response: { status: 409, body: { error: "Project version is stale" } } };
  }
  if (!FUNDABLE_STATES.has(project.state) || !project.agreed_term_version) {
    return { response: { status: 409, body: { error: "Project is not fundable" } } };
  }
  const escrows = await repository.lockEscrowForProject(client, project.id);
  const escrow = escrows.rows.find((row) => row.status === "created");
  if (!escrow || escrows.rows.some((row) => row.status === "funded")) {
    return { response: { status: 409, body: { error: "Project is not fundable" } } };
  }
  if (escrow.currency !== "INR" || Number(escrow.currency_exponent) !== 2) {
    return { response: { status: 409, body: { error: "Project is not fundable" } } };
  }
  if (minorUnits(escrow.expected_amount) !== Number(project.price_amount)) {
    return { response: { status: 409, body: { error: "Project is not fundable" } } };
  }
  const existing = await repository.lockPaymentByKey(client, escrow.id, idempotencyKey);
  let current = existing.rows[0] || null;
  let currentExpired = false;
  const open = await repository.lockOpenFundingPayment(client, escrow.id);
  for (const row of open.rows) {
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      await repository.cancelPayment(client, row.id);
      await auditPayment(
        client,
        project.id,
        "payments.status",
        "cancelled",
        row.status,
        "cancelled",
        project.version,
        row.idempotency_key,
        hashRequest({
          action: "payments.status",
          payment_external_id: row.external_id,
          source: row.status,
          target: "cancelled",
        })
      );
      if (current && row.id === current.id) {
        currentExpired = true;
        current = { ...current, status: "cancelled" };
      }
    } else if (!current || row.id !== current.id) {
      return { response: { status: 409, body: { error: "A funding payment is already open" } } };
    }
  }
  const claim = await claimIdempotencyKey(client, {
    actorType: "user",
    actorId: actorUserId,
    operation: "payments.create_funding",
    resourceRef: project.id,
    key: idempotencyKey,
    requestHash: hashRequest({ expected_version: expectedVersion }),
  });
  if (claim.outcome === "replay") {
    if (currentExpired || fundingAttemptExpired(current)) {
      return { response: { status: 409, body: { error: "Funding attempt expired" } } };
    }
    return { response: { status: claim.response.status, body: claim.response.body } };
  }
  if (claim.outcome === "mismatch") {
    return {
      response: { status: 409, body: { error: "Idempotency-Key was already used with a different request" } },
    };
  }
  if (claim.outcome === "in_progress") {
    if (!current) {
      return {
        response: { status: 409, body: { error: "A request with this Idempotency-Key is still in progress" } },
      };
    }
    if (currentExpired || fundingAttemptExpired(current)) {
      return { response: { status: 409, body: { error: "Funding attempt expired" } } };
    }
    if (current.status === "created") {
      return {
        payment: current,
        project,
        escrow,
        idempotencyRecordId: claim.recordId,
      };
    }
    const body = normalizedBody(publicPayment(current));
    await completeIdempotencyKey(client, claim.recordId, { status: 200, body });
    return { response: { status: 200, body } };
  }
  if (current) {
    return { response: { status: 200, body: normalizedBody(publicPayment(current)) } };
  }
  const providerReference = selected.allocateReference();
  const inserted = await repository.insertFundingPayment(client, [
    repository.makePaymentExternalId(),
    project.id,
    escrow.id,
    actorUserId,
    minorUnits(escrow.expected_amount),
    escrow.currency,
    Number(escrow.currency_exponent),
    selected.name,
    providerReference,
    idempotencyKey,
    new Date(Date.now() + EXPIRY_MS),
  ]);
  await auditPayment(
    client,
    project.id,
    "payments.create_funding",
    "created",
    null,
    "created",
    project.version,
    idempotencyKey,
    hashRequest({
      action: "payments.create_funding",
      payment_external_id: inserted.rows[0].external_id,
      amount: minorUnits(inserted.rows[0].amount),
      currency: inserted.rows[0].currency,
      provider: selected.name,
      provider_reference: providerReference,
    })
  );
  return {
    payment: inserted.rows[0],
    project,
    escrow,
    idempotencyRecordId: claim.recordId,
  };
}

async function settleProviderCall(prepared, selected, idempotencyKey) {
  let created;
  try {
    created = await selected.createFundingIntent({
      providerReference: prepared.payment.provider_payment_id,
      amountMinor: BigInt(minorUnits(prepared.payment.amount)),
      exponent: Number(prepared.payment.currency_exponent),
      currency: prepared.payment.currency,
      idempotencyKey,
    });
  } catch (error) {
    const mapped = providerError(error);
    if (error && error.code === "payment_provider_rejected") {
      await recordProviderSettlement(prepared, idempotencyKey, "rejected", "failed", null, mapped);
      return mapped;
    }
    if (error && error.code === "payment_provider_uncertain") {
      await recordProviderCall(prepared, idempotencyKey, "uncertain");
      return mapped;
    }
    if (mapped) {
      return mapped;
    }
    console.error(error);
    return { status: 500, body: { error: "Internal server error" } };
  }
  const body = await recordProviderSettlement(
    prepared,
    idempotencyKey,
    "accepted",
    "requires_action",
    created.continuation,
    null
  );
  return { status: 200, body };
}

async function recordProviderCall(prepared, idempotencyKey, outcome) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await auditPayment(
      client,
      prepared.project.id,
      "payments.provider_call",
      outcome,
      prepared.payment.status,
      prepared.payment.status,
      prepared.project.version,
      idempotencyKey,
      hashRequest({
        action: "payments.provider_call",
        payment_external_id: prepared.payment.external_id,
        provider_reference: prepared.payment.provider_payment_id,
        outcome,
      })
    );
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

async function recordProviderSettlement(prepared, idempotencyKey, callOutcome, nextStatus, continuation, failure) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let stored = prepared.payment;
    if (nextStatus === "failed") {
      await repository.markPayment(client, prepared.payment.id, "failed", null);
    } else {
      const updated = await repository.storeProviderContinuation(
        client,
        prepared.payment.id,
        continuation,
        nextStatus
      );
      if (updated.rows[0]) {
        stored = updated.rows[0];
      }
    }
    await auditPayment(
      client,
      prepared.project.id,
      "payments.provider_call",
      callOutcome,
      "created",
      nextStatus,
      prepared.project.version,
      idempotencyKey,
      hashRequest({
        action: "payments.provider_call",
        payment_external_id: prepared.payment.external_id,
        provider_reference: prepared.payment.provider_payment_id,
        outcome: callOutcome,
      })
    );
    await auditPayment(
      client,
      prepared.project.id,
      "payments.status",
      nextStatus,
      "created",
      nextStatus,
      prepared.project.version,
      idempotencyKey,
      hashRequest({
        action: "payments.status",
        payment_external_id: prepared.payment.external_id,
        source: "created",
        target: nextStatus,
      })
    );
    const response = failure || { status: 200, body: normalizedBody(publicPayment(stored)) };
    await completeIdempotencyKey(client, prepared.idempotencyRecordId, response);
    await client.query("COMMIT");
    return response.body;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The transaction is already closed.
    }
    throw error;
  } finally {
    client.release();
  }
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
  const event = verified.event || {};
  if (event.outcome !== "succeeded" && event.outcome !== "failed") {
    await recordReceipt(providerName, "ignored", event.eventId || null, null);
    return { status: 200, body: { outcome: "ignored" } };
  }
  if (
    typeof event.eventId !== "string"
    || event.eventId.length === 0
    || event.eventId.length > 255
    || typeof event.providerReference !== "string"
    || event.amountMinor === null
    || event.amountMinor === undefined
    || typeof event.currency !== "string"
  ) {
    await recordReceipt(providerName, "quarantined", event.eventId || null, null);
    return { status: 200, body: { outcome: "quarantined" } };
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
      const outcome = await applyWebhook(client, payment, event);
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
        outcome,
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

async function auditStatusChange(client, payment, source, target) {
  const projectVersion = await client.query(
    "SELECT version FROM projects WHERE id = $1",
    [payment.project_id]
  );
  await auditPayment(
    client,
    payment.project_id,
    "payments.status",
    target,
    source,
    target,
    projectVersion.rows[0].version,
    payment.idempotency_key,
    hashRequest({
      action: "payments.status",
      payment_external_id: payment.external_id,
      source,
      target,
    })
  );
}

async function applyWebhook(client, payment, event) {
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
    await auditStatusChange(client, payment, payment.status, "cancelled");
    return "ignored";
  }
  if (payment.status === "succeeded" || payment.status === "failed" || payment.status === "cancelled") {
    return "ignored";
  }
  if (event.outcome === "failed") {
    await repository.markPayment(client, payment.id, "failed", occurredAt);
    await auditStatusChange(client, payment, payment.status, "failed");
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
  await auditStatusChange(client, payment, payment.status, "succeeded");
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
