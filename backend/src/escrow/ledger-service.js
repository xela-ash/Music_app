const pool = require("../../db/db");
const { validateIdempotencyKey, executeIdempotent } = require("../infrastructure/idempotency");
const { toMinorBigInt } = require("../money/amount");
const rules = require("./ledger-rules");
const repository = require("./ledger-repository");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTRY_FIELDS = new Set([
  "entryType",
  "amount",
  "sourceAccount",
  "destinationAccount",
  "allocationId",
  "milestoneId",
  "paymentId",
  "beneficiaryUserId",
  "providerReference",
  "reversesEntryId",
  "reasonCode",
  "metadata",
]);
const SYSTEM_ACTOR_ID = "escrow-ledger";

function rejection(status, body) {
  const error = new Error("ledger journal rejected");
  error.status = status;
  error.body = body;
  return error;
}

function asUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

function validateCommand(command) {
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    return { status: 400, body: { error: "Journal command must be an object" } };
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
  if (typeof command.correlationId !== "string" || command.correlationId.length === 0) {
    return { status: 400, body: { error: "correlationId is required" } };
  }
  if (!Array.isArray(command.entries) || command.entries.length === 0) {
    return { status: 422, body: { error: "A journal needs at least one entry" } };
  }
  const entries = [];
  for (const entry of command.entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { status: 422, body: { error: "Each ledger entry must be an object" } };
    }
    for (const field of Object.keys(entry)) {
      if (field === "currency" || field === "currencyExponent" || field === "currency_exponent") {
        return { status: 422, body: { error: "Ledger currency is taken from the escrow" } };
      }
      if (!ENTRY_FIELDS.has(field)) {
        return { status: 422, body: { error: "Ledger entry contains an unknown field" } };
      }
    }
    if (!rules.pairAllowed(entry.entryType, entry.sourceAccount, entry.destinationAccount)) {
      return { status: 422, body: { error: "Ledger entry accounts do not match the entry type" } };
    }
    let amount;
    try {
      amount = toMinorBigInt(entry.amount);
    } catch {
      return { status: 422, body: { error: "Ledger amount must be a positive integer minor-unit value" } };
    }
    if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
      return { status: 422, body: { error: "Ledger amount must be a positive integer minor-unit value" } };
    }
    const optionalUuid = (field) => {
      if (entry[field] === undefined || entry[field] === null) {
        return null;
      }
      const parsed = asUuid(entry[field]);
      if (!parsed) {
        return false;
      }
      return parsed;
    };
    const allocationId = optionalUuid("allocationId");
    const milestoneId = optionalUuid("milestoneId");
    const paymentId = optionalUuid("paymentId");
    const beneficiaryUserId = optionalUuid("beneficiaryUserId");
    const reversesEntryId = optionalUuid("reversesEntryId");
    if ([allocationId, milestoneId, paymentId, beneficiaryUserId, reversesEntryId].includes(false)) {
      return { status: 422, body: { error: "Ledger reference must be a UUID" } };
    }
    if (entry.entryType === "adjustment" && (!reversesEntryId || typeof entry.reasonCode !== "string" || entry.reasonCode.length === 0)) {
      return { status: 422, body: { error: "An adjustment reverses an existing entry and carries a reason" } };
    }
    if (entry.metadata !== undefined && (entry.metadata === null || typeof entry.metadata !== "object" || Array.isArray(entry.metadata))) {
      return { status: 422, body: { error: "Ledger metadata must be an object" } };
    }
    entries.push({
      ...entry,
      amount: Number(amount),
      allocationId,
      milestoneId,
      paymentId,
      beneficiaryUserId,
      reversesEntryId,
      currency: null,
    });
  }
  return { entries, key: key.key };
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

function publicJournal(journalId, rows) {
  return {
    journal: {
      journal_id: journalId,
      entries: rows.map((row) => ({
        external_id: row.external_id,
        sequence: Number(row.sequence),
        entry_type: row.entry_type,
        amount: minorUnits(row.amount),
        currency: row.currency,
        currency_exponent: Number(row.currency_exponent),
        source_account: row.source_account,
        destination_account: row.destination_account,
      })),
    },
  };
}

async function applyJournal(client, command) {
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
  await repository.lockAllocations(client, escrow.id);

  const stamped = validated.entries.map((entry) => ({
    ...entry,
    currency: escrow.currency,
  }));
  if (!rules.journalIsBalanced(stamped)) {
    return { status: 422, body: { error: "Ledger journal must balance in one currency" } };
  }

  const request = {
    escrowId: command.escrowId,
    correlationId: command.correlationId,
    entries: stamped.map((entry) => ({
      entryType: entry.entryType,
      amount: entry.amount,
      sourceAccount: entry.sourceAccount,
      destinationAccount: entry.destinationAccount,
      allocationId: entry.allocationId,
      milestoneId: entry.milestoneId,
      paymentId: entry.paymentId,
      beneficiaryUserId: entry.beneficiaryUserId,
      providerReference: entry.providerReference || null,
      reversesEntryId: entry.reversesEntryId,
      reasonCode: entry.reasonCode || null,
      metadata: entry.metadata || {},
    })),
  };

  return executeIdempotent(client, {
    actorType: "system",
    actorId: SYSTEM_ACTOR_ID,
    operation: "escrow.post_journal",
    resourceRef: escrow.id,
    key: validated.key,
    request,
  }, async () => {
    const delta = rules.projectionDelta(stamped);
    const currentFunded = BigInt(escrow.funded_amount);
    const currentReleased = BigInt(escrow.released_amount);
    const currentRefunded = BigInt(escrow.refunded_amount);
    const nextFunded = currentFunded + delta.funded;
    const nextReleased = currentReleased + delta.released;
    const nextRefunded = currentRefunded + delta.refunded;
    if (nextFunded < 0n || nextReleased < 0n || nextRefunded < 0n) {
      throw rejection(422, { error: "Ledger journal would make a projection negative" });
    }
    if (escrow.status === "created" && (nextFunded !== 0n || nextReleased !== 0n || nextRefunded !== 0n)) {
      throw rejection(409, { error: "A created escrow cannot hold confirmed funds" });
    }
    if (escrow.status === "cancelled" || escrow.status === "released" || escrow.status === "refunded") {
      throw rejection(409, { error: "A closed escrow cannot accept a journal" });
    }

    const sequenceRow = await repository.nextSequence(client, escrow.id);
    let sequence = Number(sequenceRow.rows[0].sequence);
    const journalId = require("crypto").randomUUID();
    const inserted = [];
    for (const entry of stamped) {
      sequence += 1;
      const row = await repository.insertEntry(client, [
        repository.makeLedgerExternalId(),
        journalId,
        sequence,
        escrow.id,
        escrow.project_id,
        entry.milestoneId,
        entry.allocationId,
        entry.paymentId,
        entry.entryType,
        entry.amount,
        escrow.currency,
        escrow.currency_exponent,
        entry.sourceAccount,
        entry.destinationAccount,
        entry.beneficiaryUserId,
        entry.providerReference || null,
        `${validated.key}#${sequence}`,
        command.correlationId,
        "system",
        null,
        "escrow.post_journal",
        entry.reversesEntryId,
        entry.reasonCode || null,
        JSON.stringify({ ...(entry.metadata || {}), journal_key: validated.key }),
      ]);
      inserted.push(row.rows[0]);
    }

    await client.query("SELECT set_config('musicapp.ledger_posting', 'on', true)");
    const totals = await repository.ledgerTotals(client, escrow.id);
    await repository.writeProjections(
      client,
      escrow.id,
      totals.rows[0].funded_amount,
      totals.rows[0].released_amount,
      totals.rows[0].refunded_amount
    );
    return { status: 200, body: publicJournal(journalId, inserted) };
  });
}

async function postJournal(command) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await applyJournal(client, command);
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
    if (error && typeof error.message === "string" && error.message.includes("escrow_ledger")) {
      return { status: 422, body: { error: "Ledger journal was rejected" } };
    }
    if (error && typeof error.message === "string" && (
      error.message.includes("ledger entry")
      || error.message.includes("ledger currency")
      || error.message.includes("ledger journal")
      || error.message.includes("projections must equal")
      || error.message.includes("allocation movements")
      || error.message.includes("does not belong")
    )) {
      return { status: 422, body: { error: "Ledger journal was rejected" } };
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  applyJournal,
  postJournal,
};
