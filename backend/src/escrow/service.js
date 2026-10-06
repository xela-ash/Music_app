const pool = require("../../db/db");
const { validateIdempotencyKey, executeIdempotent } = require("../infrastructure/idempotency");
const { enqueueOutboxMessage } = require("../infrastructure/outbox");
const { hashRequest } = require("../infrastructure/canonical-json");
const projectRepository = require("../projects/transition-repository");
const invitations = require("../projects/invitation-repository");
const repository = require("./repository");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FUNDABLE_STATES = new Set(["accepted", "awaiting_funding"]);
const CLIENT_MONEY_MESSAGE = "Funding amount and currency are taken from the agreed terms";

function concealed() {
  return { status: 404, body: { error: "Project not found" } };
}

function notFundable() {
  return { status: 409, body: { error: "Project is not fundable" } };
}

function minorUnits(value) {
  if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      return null;
    }
    return Number(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  return null;
}

function rejection(status, body) {
  const error = new Error("funding intent rejected");
  error.status = status;
  error.body = body;
  return error;
}

function publicEscrow(escrow, snapshot, allocations) {
  return {
    escrow: {
      external_id: escrow.external_id,
      project_external_id: escrow.project_external_id,
      status: escrow.status,
      currency: escrow.currency,
      currency_exponent: Number(escrow.currency_exponent),
      expected_amount: minorUnits(escrow.expected_amount),
      agreed_term_version: Number(escrow.agreed_term_version),
      version: Number(escrow.version),
      fee_snapshot: {
        external_id: snapshot.external_id,
        schedule_version: snapshot.schedule_version,
        fee_lines: snapshot.fee_lines,
      },
      allocations: allocations.map((row) => ({
        external_id: row.external_id,
        milestone_external_id: row.milestone_external_id,
        milestone_no: Number(row.milestone_no),
        allocated_amount: minorUnits(row.allocated_amount),
        currency: row.currency,
        currency_exponent: Number(row.currency_exponent),
        allocation_status: row.allocation_status,
        revision_number: Number(row.revision_number),
      })),
    },
  };
}

function milestoneIsAgreed(row, project) {
  const amount = minorUnits(row.amount);
  const snapshotAmount = minorUnits(row.snapshot_amount);
  return row.state === "planned"
    && row.terms_status === "agreed"
    && Number(row.current_term_version) === Number(project.agreed_term_version)
    && amount !== null
    && amount > 0
    && amount === snapshotAmount
    && row.currency === project.currency
    && row.snapshot_currency === project.currency
    && Number(row.currency_exponent) === Number(project.currency_exponent)
    && Number(row.snapshot_exponent) === Number(project.currency_exponent);
}

async function createFundingIntent(projectId, body, actorUserId, idempotencyKeyHeader) {
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
    const account = await repository.actorAccountStatus(client, actorUserId);
    if (!account.rows[0] || account.rows[0].status !== "active") {
      await client.query("ROLLBACK");
      return { status: 403, body: { error: "Account cannot fund" } };
    }

    const idempotent = await executeIdempotent(
      client,
      {
        actorType: "user",
        actorId: actorUserId,
        operation: "escrow.funding_intent",
        resourceRef: project.id,
        key: key.key,
        request: { expected_version: body.expected_version },
      },
      () => applyFundingIntent(client, project, actorUserId, body.expected_version, key.key)
    );
    if (idempotent.status !== 200) {
      throw rejection(idempotent.status, idempotent.body);
    }
    await client.query("COMMIT");
    return { status: idempotent.status, body: idempotent.body };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error(rollbackErr);
    }
    if (err && err.status) {
      return { status: err.status, body: err.body };
    }
    if (err && err.code === "23505") {
      return { status: 409, body: { error: "An active escrow already exists" } };
    }
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  } finally {
    client.release();
  }
}

async function applyFundingIntent(client, project, actorUserId, expectedVersion, idempotencyKey) {
  if (project.version !== expectedVersion) {
    return { status: 409, body: { error: "Project version is stale" } };
  }
  if (!FUNDABLE_STATES.has(project.state) || !project.agreed_term_version) {
    return notFundable();
  }
  if (project.currency !== "INR" || Number(project.currency_exponent) !== 2) {
    return notFundable();
  }

  const seller = await projectRepository.activeSeller(client, project.id);
  const sellerUserId = seller.rows[0] ? seller.rows[0].user_id : null;
  if (!sellerUserId || sellerUserId !== project.seller_user_id) {
    return notFundable();
  }

  const agreed = await projectRepository.agreedVersion(client, project.id, project.agreed_term_version);
  const term = agreed.rows[0];
  if (!term || term.represented_state !== "agreed") {
    return notFundable();
  }
  const termTotal = minorUnits(term.total_amount);
  if (
    termTotal === null
    || term.currency !== project.currency
    || Number(term.currency_exponent) !== Number(project.currency_exponent)
    || termTotal !== project.price_amount
  ) {
    return notFundable();
  }

  const milestones = await repository.lockMilestonesForFunding(
    client,
    project.id,
    project.agreed_term_version
  );
  if (milestones.rows.length === 0 || !milestones.rows.every((row) => milestoneIsAgreed(row, project))) {
    return notFundable();
  }
  let planSum = 0;
  for (const row of milestones.rows) {
    planSum += minorUnits(row.amount);
  }
  if (planSum !== termTotal) {
    return notFundable();
  }

  const existing = await repository.activeEscrowForProject(client, project.id);
  if (existing.rows.length > 0) {
    return { status: 409, body: { error: "An active escrow already exists" } };
  }

  const snapshot = await repository.insertFeeSnapshot(client, [
    repository.makeFeeSnapshotExternalId(),
    project.currency,
    project.currency_exponent,
  ]);
  const escrow = await repository.insertEscrow(client, [
    repository.makeEscrowExternalId(),
    project.id,
    project.buyer_user_id,
    sellerUserId,
    project.agreed_term_version,
    project.currency,
    project.currency_exponent,
    planSum,
    snapshot.rows[0].id,
  ]);

  const allocations = [];
  for (const milestone of milestones.rows) {
    const inserted = await repository.insertAllocation(client, [
      repository.makeAllocationExternalId(),
      escrow.rows[0].id,
      milestone.id,
      project.agreed_term_version,
      minorUnits(milestone.amount),
      project.currency,
      project.currency_exponent,
    ]);
    allocations.push({
      ...inserted.rows[0],
      milestone_external_id: milestone.external_id,
      milestone_no: milestone.milestone_no,
    });
  }

  const storedEscrow = {
    ...escrow.rows[0],
    project_external_id: project.external_id,
  };
  const body = publicEscrow(storedEscrow, snapshot.rows[0], allocations);
  const changeHash = hashRequest({
    action: "escrow.create",
    outcome: "created",
    project_external_id: project.external_id,
    escrow_external_id: storedEscrow.external_id,
    agreed_term_version: Number(project.agreed_term_version),
    currency: project.currency,
    currency_exponent: Number(project.currency_exponent),
    expected_amount: planSum,
    fee_lines: [],
    allocations: allocations.map((row) => ({
      milestone_external_id: row.milestone_external_id,
      allocated_amount: minorUnits(row.allocated_amount),
      currency: row.currency,
      revision_number: 1,
    })),
    source_state: null,
    target_state: "created",
  });
  await invitations.insertAuditEvent(client, [
    invitations.makeAuditExternalId(),
    project.id,
    "AUD-ESCROW-001",
    "user",
    actorUserId,
    "buyer",
    "escrow.create",
    "created",
    null,
    null,
    "created",
    project.version,
    null,
    idempotencyKey,
    changeHash,
  ]);
  await enqueueOutboxMessage(client, {
    eventType: "EscrowStateChanged",
    eventVersion: 1,
    aggregateType: "escrow",
    aggregateId: storedEscrow.external_id,
    aggregateVersion: 1,
    payload: {
      escrow_external_id: storedEscrow.external_id,
      project_external_id: project.external_id,
      source_state: null,
      target_state: "created",
      trigger_fact_id: idempotencyKey,
      version: 1,
    },
  });
  return { status: 200, body };
}

module.exports = {
  createFundingIntent,
};
