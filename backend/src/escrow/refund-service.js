const pool = require("../../db/db");
const { hashRequest } = require("../infrastructure/canonical-json");
const { validateIdempotencyKey, executeIdempotent } = require("../infrastructure/idempotency");
const { enqueueOutboxMessage } = require("../infrastructure/outbox");
const { toMinorBigInt } = require("../money/amount");
const invitations = require("../projects/invitation-repository");
const repository = require("./ledger-repository");
const { AUTHORIZED_SOURCES, exceedsCapturedFunding, refundableMinor } = require("./refund-rules");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMAND_FIELDS = new Set([
  "escrowId",
  "idempotencyKey",
  "correlationId",
  "source",
  "sourceReference",
  "allocationId",
  "amount",
  "reasonCode",
  "action",
]);
const SYSTEM_ACTOR_ID = "escrow-refund";

function rejection(status, body) {
  const error = new Error("refund instruction rejected");
  error.status = status;
  error.body = body;
  return error;
}

function asUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
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

function validateCommand(command) {
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    return { status: 400, body: { error: "Refund instruction must be an object" } };
  }
  for (const field of Object.keys(command)) {
    if (field === "currency" || field === "currencyExponent" || field === "currency_exponent") {
      return { status: 422, body: { error: "Refund currency is taken from the escrow" } };
    }
    if (!COMMAND_FIELDS.has(field)) {
      return { status: 422, body: { error: "Refund instruction contains an unknown field" } };
    }
  }
  if (command.action === "cancellation" || command.source === "cancellation") {
    return { status: 422, body: { error: "Cancellation is not a refund" } };
  }
  if (command.action !== undefined && command.action !== "refund") {
    return { status: 422, body: { error: "Refund instruction action must be refund" } };
  }
  if (!asUuid(command.escrowId)) {
    return { status: 400, body: { error: "escrowId must be a valid UUID" } };
  }
  const key = validateIdempotencyKey(command.idempotencyKey);
  if (!key.ok) {
    return { status: 400, body: { error: key.error } };
  }
  if (key.key.length > 200) {
    return { status: 400, body: { error: "Idempotency-Key must leave room for the journal sequence" } };
  }
  if (typeof command.correlationId !== "string" || command.correlationId.length === 0 || command.correlationId.length > 255) {
    return { status: 400, body: { error: "correlationId is required" } };
  }
  if (!AUTHORIZED_SOURCES.has(command.source)) {
    return { status: 422, body: { error: "Refund instruction source is not authorized" } };
  }
  if (typeof command.sourceReference !== "string" || command.sourceReference.length === 0) {
    return { status: 422, body: { error: "Refund instruction source reference is required" } };
  }
  if (!asUuid(command.allocationId)) {
    return { status: 422, body: { error: "A refund names an allocation" } };
  }
  let amount;
  try {
    amount = toMinorBigInt(command.amount);
  } catch {
    return { status: 422, body: { error: "Refund amount must be a positive integer minor-unit value" } };
  }
  if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { status: 422, body: { error: "Refund amount must be a positive integer minor-unit value" } };
  }
  if (command.source === "administrator" && (typeof command.reasonCode !== "string" || command.reasonCode.length === 0)) {
    return { status: 422, body: { error: "An administrator refund records a reason" } };
  }
  if (command.reasonCode !== undefined && command.reasonCode !== null && (typeof command.reasonCode !== "string" || command.reasonCode.length === 0)) {
    return { status: 422, body: { error: "Refund reason must be a non-empty string" } };
  }
  return {
    key: key.key,
    amount,
    allocationId: command.allocationId,
    reasonCode: command.reasonCode || null,
  };
}

function publicRefund(journalId, row, escrow, allocation, closed) {
  return {
    refund: {
      journal_id: journalId,
      entry_external_id: row.external_id,
      sequence: Number(row.sequence),
      entry_type: row.entry_type,
      amount: minorUnits(row.amount),
      currency: row.currency,
      currency_exponent: Number(row.currency_exponent),
      source_account: row.source_account,
      destination_account: row.destination_account,
      allocation_external_id: allocation.external_id,
      escrow_external_id: escrow.external_id,
      escrow_status: closed ? "refunded" : "funded",
    },
  };
}

async function applyRefund(client, command) {
  const validated = validateCommand(command);
  if (validated.status) {
    return validated;
  }
  const preview = await client.query(
    `SELECT project_id FROM escrows WHERE id = $1`,
    [command.escrowId]
  );
  if (preview.rows.length === 0) {
    return { status: 404, body: { error: "Escrow not found" } };
  }
  await repository.lockProject(client, preview.rows[0].project_id);
  const locked = await repository.lockEscrow(client, command.escrowId);
  const escrow = locked.rows[0];
  if (!escrow) {
    return { status: 404, body: { error: "Escrow not found" } };
  }
  const allocations = await repository.lockAllocationDetails(client, escrow.id);
  const allocation = allocations.rows.find((row) => row.id === validated.allocationId);
  if (!allocation) {
    return { status: 422, body: { error: "Allocation does not belong to the escrow" } };
  }

  const request = {
    escrowId: command.escrowId,
    correlationId: command.correlationId,
    source: command.source,
    sourceReference: command.sourceReference,
    allocationId: validated.allocationId,
    amount: Number(validated.amount),
    reasonCode: validated.reasonCode,
    action: "refund",
  };

  return executeIdempotent(client, {
    actorType: "system",
    actorId: SYSTEM_ACTOR_ID,
    operation: "escrow.refund_instruction",
    resourceRef: escrow.id,
    key: validated.key,
    request,
  }, async () => {
    if (escrow.status === "created") {
      throw rejection(409, { error: "A created escrow has no captured funding" });
    }
    if (escrow.status === "cancelled" || escrow.status === "released" || escrow.status === "refunded") {
      throw rejection(409, { error: "A closed escrow cannot accept a refund" });
    }
    if (escrow.status !== "funded") {
      throw rejection(409, { error: "Refund requires a funded escrow" });
    }
    if (allocation.allocation_status !== "funded") {
      throw rejection(409, { error: "Refund requires captured funding on the allocation" });
    }
    if (exceedsCapturedFunding(escrow.funded_amount, escrow.refunded_amount, validated.amount)) {
      throw rejection(409, { error: "Cumulative refunds cannot exceed captured funding" });
    }
    const escrowRefundable = refundableMinor(
      escrow.funded_amount,
      escrow.released_amount,
      escrow.refunded_amount,
      0n
    );
    if (validated.amount > escrowRefundable) {
      throw rejection(409, { error: "Refund exceeds the refundable amount" });
    }
    const allocationRefundable = refundableMinor(
      allocation.funded_amount,
      allocation.released_amount,
      allocation.refunded_amount,
      0n
    );
    if (validated.amount > allocationRefundable) {
      throw rejection(409, { error: "Refund exceeds the allocation refundable amount" });
    }

    const sequenceRow = await repository.nextSequence(client, escrow.id);
    const sequence = Number(sequenceRow.rows[0].sequence) + 1;
    const journalId = require("crypto").randomUUID();
    const inserted = await repository.insertEntry(client, [
      repository.makeLedgerExternalId(),
      journalId,
      sequence,
      escrow.id,
      escrow.project_id,
      allocation.milestone_id,
      allocation.id,
      null,
      "refunded_to_buyer",
      Number(validated.amount),
      escrow.currency,
      escrow.currency_exponent,
      "ESCROW_ALLOCATION",
      "REFUND_IN_TRANSIT",
      null,
      null,
      `${validated.key}#${sequence}`,
      command.correlationId,
      "system",
      null,
      "escrow.refund_instruction",
      null,
      validated.reasonCode,
      JSON.stringify({
        journal_key: validated.key,
        instruction_source: command.source,
        source_reference: command.sourceReference,
      }),
    ]);

    await client.query("SELECT set_config('musicapp.ledger_posting', 'on', true)");
    const totals = await repository.ledgerTotals(client, escrow.id);
    const projected = await repository.writeProjections(
      client,
      escrow.id,
      totals.rows[0].funded_amount,
      totals.rows[0].released_amount,
      totals.rows[0].refunded_amount
    );
    const nextRefunded = toMinorBigInt(allocation.refunded_amount) + validated.amount;
    const fundedAmount = toMinorBigInt(allocation.funded_amount);
    const releasedAmount = toMinorBigInt(allocation.released_amount);
    const allocationStatus = nextRefunded + releasedAmount === fundedAmount && releasedAmount === 0n
      ? "refunded"
      : "funded";
    await repository.writeAllocationRefund(
      client,
      allocation.id,
      nextRefunded.toString(),
      allocationStatus
    );

    let escrowStatus = projected.rows[0].status;
    let escrowVersion = Number(projected.rows[0].version);
    const unsettled = await repository.countUnsettledAllocations(client, escrow.id);
    const escrowReleased = toMinorBigInt(projected.rows[0].released_amount);
    const escrowRefunded = toMinorBigInt(projected.rows[0].refunded_amount);
    let closed = false;
    if (unsettled.rows[0].open_count === 0 && escrowReleased === 0n && escrowRefunded > 0n) {
      const closedRow = await repository.closeEscrowRefunded(client, escrow.id);
      escrowStatus = closedRow.rows[0].status;
      escrowVersion = Number(closedRow.rows[0].version);
      closed = true;
    }

    const project = await client.query(
      `SELECT external_id FROM projects WHERE id = $1`,
      [escrow.project_id]
    );
    const body = publicRefund(journalId, inserted.rows[0], escrow, allocation, closed);
    const changeHash = hashRequest({
      action: "escrow.refund",
      outcome: closed ? "refunded" : "funded",
      source: command.source,
      source_reference: command.sourceReference,
      amount: Number(validated.amount),
      currency: escrow.currency,
      currency_exponent: Number(escrow.currency_exponent),
      allocation_external_id: allocation.external_id,
      journal_id: journalId,
      escrow_status: escrowStatus,
    });
    await invitations.insertAuditEvent(client, [
      invitations.makeAuditExternalId(),
      escrow.project_id,
      "AUD-ESCROW-004",
      "system",
      SYSTEM_ACTOR_ID,
      "system",
      "escrow.refund",
      closed ? "refunded" : "applied",
      validated.reasonCode,
      "funded",
      escrowStatus,
      escrowVersion,
      command.correlationId,
      validated.key,
      changeHash,
    ]);
    await enqueueOutboxMessage(client, {
      eventType: "AllocationRefunded",
      eventVersion: 1,
      aggregateType: "escrow_allocation",
      aggregateId: allocation.external_id,
      aggregateVersion: escrowVersion,
      correlationId: command.correlationId,
      payload: {
        allocation_external_id: allocation.external_id,
        milestone_external_id: allocation.milestone_external_id,
        term_version: Number(allocation.term_version),
        currency: escrow.currency,
        currency_exponent: Number(escrow.currency_exponent),
        amount: Number(validated.amount),
        instruction_source: command.source,
        source_reference: command.sourceReference,
        project_external_id: project.rows[0].external_id,
      },
    });
    if (closed) {
      await enqueueOutboxMessage(client, {
        eventType: "EscrowClosed",
        eventVersion: 1,
        aggregateType: "escrow",
        aggregateId: escrow.external_id,
        aggregateVersion: escrowVersion,
        correlationId: command.correlationId,
        payload: {
          escrow_external_id: escrow.external_id,
          project_external_id: project.rows[0].external_id,
          closing_state: "refunded",
          released_amount: Number(escrowReleased),
          refunded_amount: Number(escrowRefunded),
          currency: escrow.currency,
          currency_exponent: Number(escrow.currency_exponent),
        },
      });
    }
    return { status: 200, body };
  });
}

async function executeRefundInstruction(command) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await applyRefund(client, command);
    if (result.status !== 200) {
      throw rejection(result.status, result.body);
    }
    await client.query("COMMIT");
    return { status: result.status, body: result.body };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The transaction is already closed.
    }
    if (error.status) {
      return { status: error.status, body: error.body };
    }
    if (error && typeof error.message === "string" && (
      error.message.includes("ledger")
      || error.message.includes("projection")
      || error.message.includes("allocation")
    )) {
      return { status: 422, body: { error: "Refund journal was rejected" } };
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  executeRefundInstruction,
};
