const { enqueueOutboxMessage } = require("../infrastructure/outbox");
const { hashRequest } = require("../infrastructure/canonical-json");
const invitations = require("../projects/invitation-repository");
const { commitTransition } = require("../projects/transition-service");
const { applyLockedSystemMilestone } = require("../milestones/transition-service");
const projectRepository = require("../projects/transition-repository");
const ledger = require("./ledger-service");

function rejection(status, body) {
  const error = new Error(body.error || "funding confirmation rejected");
  error.status = status;
  error.body = body;
  return error;
}

async function advanceProject(client, projectId, eventId, amount, currency) {
  let locked = await projectRepository.lockProjectById(client, projectId);
  let project = locked.rows[0];
  if (!project) {
    throw rejection(409, { error: "Project is not fundable" });
  }
  if (project.state === "accepted") {
    const opened = await commitTransition(client, {
      project,
      action: "project.open_funding",
      targetState: "awaiting_funding",
      actorType: "system",
      actorId: "system",
      expectedVersion: project.version,
      facts: { eventId },
      sourceFactId: eventId,
    });
    if (opened.status !== 200) {
      throw rejection(opened.status, opened.body);
    }
    project = opened.project;
  }
  if (project.state !== "awaiting_funding") {
    throw rejection(409, { error: "Project is not awaiting funding" });
  }
  const funded = await commitTransition(client, {
    project,
    action: "project.consume_funding",
    targetState: "funded",
    actorType: "system",
    actorId: "system",
    expectedVersion: project.version,
    facts: {
      producer: "escrow",
      eventId: `${eventId}:project`,
      currency,
      amount,
    },
    sourceFactId: `${eventId}:project`,
  });
  if (funded.status !== 200) {
    throw rejection(funded.status, funded.body);
  }
}

async function confirmFunding(client, { escrow, payment, allocations, eventId }) {
  const amount = Number(payment.amount);
  if (!Number.isSafeInteger(amount) || amount !== Number(escrow.expected_amount)) {
    throw rejection(409, { error: "Funding fact does not match the escrow" });
  }
  if (payment.currency !== escrow.currency) {
    throw rejection(409, { error: "Funding fact does not match the escrow" });
  }
  await client.query("SELECT set_config('musicapp.ledger_posting', 'on', true)");
  const moved = await client.query(
    `UPDATE escrows
     SET status = 'funded', funded_at = now()
     WHERE id = $1 AND status = 'created'
     RETURNING id`,
    [escrow.id]
  );
  if (moved.rows.length !== 1) {
    throw rejection(409, { error: "Escrow is not awaiting funding" });
  }
  const entries = [
    {
      entryType: "funded",
      amount,
      sourceAccount: "EXTERNAL_BUYER",
      destinationAccount: "ESCROW_UNALLOCATED",
      paymentId: payment.id,
    },
  ];
  for (const allocation of allocations) {
    entries.push({
      entryType: "allocated_to_milestone",
      amount: Number(allocation.allocated_amount),
      sourceAccount: "ESCROW_UNALLOCATED",
      destinationAccount: "ESCROW_ALLOCATION",
      allocationId: allocation.allocation_id,
      milestoneId: allocation.milestone_id,
      paymentId: payment.id,
    });
  }
  const journal = await ledger.applyJournal(client, {
    escrowId: escrow.id,
    idempotencyKey: `fund-${eventId}`.slice(0, 180),
    correlationId: eventId.slice(0, 255),
    entries,
  });
  if (journal.status !== 200) {
    throw rejection(journal.status, journal.body);
  }
  for (const allocation of allocations) {
    await client.query(
      `UPDATE escrow_allocations
       SET allocation_status = 'funded',
           funded_amount = allocated_amount
       WHERE id = $1 AND allocation_status = 'planned'`,
      [allocation.allocation_id]
    );
  }
  const drifted = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM escrow_allocations
     WHERE escrow_id = $1 AND allocation_status <> 'funded'`,
    [escrow.id]
  );
  if (drifted.rows[0].count !== 0) {
    throw rejection(409, { error: "Funding fact does not match the escrow" });
  }
  await advanceProject(client, escrow.project_id, eventId, amount, escrow.currency);
  for (const allocation of allocations) {
    const milestone = await applyLockedSystemMilestone(client, {
      projectId: escrow.project_id,
      milestoneId: allocation.milestone_id,
      action: "escrow.allocation_funded",
      actorType: "system",
      actorId: "system",
      facts: {
        event_id: `${eventId}:${allocation.milestone_id}`,
        amount: Number(allocation.amount),
        currency: allocation.currency,
        currency_exponent: Number(allocation.currency_exponent),
        term_version: Number(allocation.current_term_version),
      },
    });
    if (milestone.status !== 200) {
      throw rejection(milestone.status, milestone.body);
    }
  }
  const changeHash = hashRequest({
    action: "escrow.funding_confirmed",
    escrow_external_id: escrow.external_id,
    payment_external_id: payment.external_id,
    amount,
    currency: escrow.currency,
  });
  await invitations.insertAuditEvent(client, [
    invitations.makeAuditExternalId(),
    escrow.project_id,
    "AUD-ESCROW-002",
    "system",
    "system",
    "system",
    "escrow.funding_confirmed",
    "funded",
    null,
    "created",
    "funded",
    Number(escrow.version) + 1,
    eventId,
    eventId,
    changeHash,
  ]);
  await enqueueOutboxMessage(client, {
    eventType: "EscrowFunded",
    eventVersion: 1,
    aggregateType: "escrow",
    aggregateId: escrow.external_id,
    aggregateVersion: Number(escrow.version) + 1,
    payload: {
      escrow_external_id: escrow.external_id,
      payment_external_id: payment.external_id,
      amount,
      currency: escrow.currency,
    },
  });
  return { journal };
}

module.exports = {
  confirmFunding,
};
