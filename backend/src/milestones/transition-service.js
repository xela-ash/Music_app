const pool = require("../../db/db");
const { hashRequest } = require("../infrastructure/canonical-json");
const { consumeInboxEvent } = require("../infrastructure/inbox");
const { executeIdempotent } = require("../infrastructure/idempotency");
const { enqueueOutboxMessage } = require("../infrastructure/outbox");
const invitations = require("../projects/invitation-repository");
const {
  DISPUTE_OUTCOMES,
  RESOLVED_PREDECESSOR,
  RESUME_TARGETS,
  SUSPEND_OUTCOMES,
  SUSPEND_REASONS,
  findEdge,
} = require("./transition-rules");
const repository = require("./transition-repository");

const STARTABLE_PROJECT = new Set(["funded", "in_progress"]);
const INTERRUPTED_PROJECT = new Set(["disputed", "suspended"]);

function rejected(error, quarantine = false) {
  return { status: 409, body: { error }, quarantine };
}

function text(value, max) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const trimmed = value.trim();
  if (max && trimmed.length > max) {
    return null;
  }
  return trimmed;
}

function moneyMatches(milestone, facts) {
  return Number(facts.amount) === Number(milestone.amount)
    && facts.currency === milestone.currency
    && Number(facts.currency_exponent) === Number(milestone.currency_exponent)
    && Number(facts.term_version) === Number(milestone.current_term_version);
}

function auditType(edgeId) {
  if (edgeId === "M02" || edgeId === "M03") {
    return "AUD-PROJECTS-009";
  }
  if (edgeId === "M04" || edgeId === "M05" || edgeId === "M06" || edgeId === "M07") {
    return "AUD-PROJECTS-010";
  }
  if (edgeId === "M12" || edgeId === "M13") {
    return "AUD-PROJECTS-012";
  }
  return "AUD-PROJECTS-011";
}

async function writeAudit(client, { project, milestone, actorType, actorId, action, outcome, source, target, reason }) {
  await invitations.insertAuditEvent(client, [
    repository.hexId("aud"),
    project.id,
    auditType(action.edgeId),
    actorType,
    actorId,
    actorType === "system" ? "system" : action.actor,
    action.action,
    outcome,
    reason || null,
    source,
    target,
    milestone.version,
    null,
    action.sourceFactId || null,
    hashRequest({
      action: action.action,
      milestone_id: milestone.external_id,
      source,
      target,
    }),
  ]);
}

async function writeEvents(client, { project, milestone, edge, source, target, sourceFactId, facts, approvalExternalId }) {
  await enqueueOutboxMessage(client, {
    eventType: "EVT-PROJECTS-009",
    aggregateType: "milestone",
    aggregateId: milestone.external_id,
    aggregateVersion: milestone.version,
    payload: {
      project_external_id: project.external_id,
      milestone_external_id: milestone.external_id,
      source_state: source,
      target_state: target,
      trigger_type: edge.action,
      source_fact_id: sourceFactId,
    },
  });
  if (edge.id === "M07") {
    await enqueueOutboxMessage(client, {
      eventType: "EVT-PROJECTS-010",
      aggregateType: "milestone",
      aggregateId: milestone.external_id,
      aggregateVersion: milestone.version,
      payload: {
        project_external_id: project.external_id,
        milestone_external_id: milestone.external_id,
        term_version: milestone.current_term_version,
        submission_ref: text(facts.submission_ref, 255),
        approval_id: approvalExternalId,
        amount: Number(milestone.amount),
        currency: milestone.currency,
      },
    });
  }
  if (edge.id === "M09" || edge.id === "M10" || edge.id === "M12" || edge.id === "M13") {
    await enqueueOutboxMessage(client, {
      eventType: "EVT-PROJECTS-013",
      aggregateType: "milestone",
      aggregateId: milestone.external_id,
      aggregateVersion: milestone.version,
      payload: {
        milestone_external_id: milestone.external_id,
        source_state: source,
        target_state: target,
      },
    });
  }
}

async function preconditionFailure(client, { project, milestone, edge, actorType, actorId, facts }) {
  if (facts && Object.prototype.hasOwnProperty.call(facts, "target_state")) {
    return rejected("Clients cannot choose a milestone state", true);
  }
  if (edge.actor === "system" && actorType !== "system") {
    return rejected("Invalid milestone transition");
  }
  if (edge.actor === "buyer" && actorId !== project.buyer_user_id) {
    return rejected("Invalid milestone transition");
  }
  if (edge.actor === "seller") {
    const seller = await repository.activeSeller(client, project.id);
    if (!seller.rows[0] || seller.rows[0].user_id !== actorId) {
      return rejected("Invalid milestone transition");
    }
  }
  if (INTERRUPTED_PROJECT.has(project.state) && edge.id !== "M10" && edge.id !== "M11" && edge.id !== "M13" && edge.id !== "M14") {
    return rejected("Invalid milestone transition");
  }
  if (milestone.terms_status !== "agreed" && edge.id !== "M01" && edge.id !== "M15") {
    return rejected("Milestone terms are not agreed");
  }

  if (edge.id === "M02" || edge.id === "M16" || edge.id === "M17") {
    if (!moneyMatches(milestone, facts)) {
      return rejected("Milestone fact does not match", true);
    }
  }
  if (edge.id === "M08") {
    if (!moneyMatches(milestone, facts)) {
      return rejected("Milestone fact does not match", true);
    }
    const approvals = await repository.approvalCount(client, milestone.id);
    if (Number(approvals.rows[0].count) !== 1) {
      return rejected("Milestone fact does not match");
    }
  }
  if (edge.id === "M03" && edge.to === "planned" && milestone.started_at) {
    return rejected("Invalid milestone transition");
  }
  if (edge.id === "M03" && edge.to === "suspended" && !milestone.started_at) {
    return rejected("Invalid milestone transition");
  }
  if (edge.id === "M04") {
    if (!STARTABLE_PROJECT.has(project.state)) {
      return rejected("Invalid milestone transition");
    }
    const predecessors = await repository.predecessorStates(client, project.id, milestone.milestone_no);
    if (predecessors.rows.some((row) => !RESOLVED_PREDECESSOR.has(row.state))) {
      return rejected("Milestone predecessors are not resolved");
    }
    const active = await repository.activeSibling(client, project.id, milestone.id);
    if (active.rows.length > 0) {
      return rejected("Another milestone is already active");
    }
  }
  if (edge.id === "M05") {
    const submission = text(facts.submission_ref, 255);
    if (!submission || facts.ready !== true || facts.safe !== true || !moneyMatches(milestone, facts)) {
      return rejected("Milestone fact does not match", true);
    }
  }
  if (edge.id === "M06" || edge.id === "M07") {
    const latest = await repository.latestDelivery(client, milestone.id);
    const submission = text(facts.submission_ref, 255);
    if (!latest.rows[0] || !submission || latest.rows[0].source_fact_id !== submission) {
      return rejected("Submission reference is not current");
    }
  }
  if (edge.id === "M06") {
    const reason = text(facts.reason_code);
    const detail = text(facts.detail);
    if (!reason || !detail) {
      return rejected("A revision reason is required");
    }
    const count = await repository.revisionCount(client, milestone.id);
    if (Number(count.rows[0].count) >= Number(milestone.revision_allowance)) {
      return rejected("Revision allowance is exhausted");
    }
  }
  if (edge.id === "M07") {
    const approvals = await repository.approvalCount(client, milestone.id);
    if (approvals.rows[0].count > 0) {
      return rejected("Milestone is already approved");
    }
  }
  if (edge.id === "M10") {
    if (facts.resume_state !== milestone.resume_state || !RESUME_TARGETS.has(milestone.resume_state)) {
      return rejected("Milestone fact does not match", true);
    }
  }
  if (edge.id === "M11" && !DISPUTE_OUTCOMES.has(facts.outcome)) {
    return rejected("Milestone fact does not match", true);
  }
  if (edge.id === "M11" && (facts.outcome === "released" || facts.outcome === "refunded") && !moneyMatches(milestone, facts)) {
    return rejected("Milestone fact does not match", true);
  }
  if (edge.id === "M12" && !SUSPEND_REASONS.has(facts.reason)) {
    return rejected("Milestone fact does not match", true);
  }
  if (edge.id === "M13") {
    if (!RESUME_TARGETS.has(milestone.resume_state)) {
      return rejected("Milestone fact does not match", true);
    }
  }
  if (edge.id === "M14" && !SUSPEND_OUTCOMES.has(facts.outcome)) {
    return rejected("Milestone fact does not match", true);
  }
  if (edge.id === "M14" && facts.outcome === "refunded" && !moneyMatches(milestone, facts)) {
    return rejected("Milestone fact does not match", true);
  }
  if (edge.id === "M15" && facts.funds_held !== false) {
    return rejected("Milestone fact does not match", true);
  }
  return null;
}

function targetFor(edge, milestone, facts) {
  if (edge.id === "M10" || edge.id === "M13") {
    return milestone.resume_state;
  }
  if (edge.id === "M11" || edge.id === "M14") {
    return facts.outcome;
  }
  return edge.to;
}

function timestampsFor(edge, target) {
  return {
    fundedAt: edge.id === "M02" ? "set" : edge.id === "M03" && target === "planned" ? "clear" : null,
    startedAt: edge.id === "M04" ? "set" : null,
    deliveredAt: edge.id === "M05" ? "set" : null,
    approvedAt: edge.id === "M07" ? "set" : null,
    completedAt: target === "released" ? "set" : null,
    cancelledAt: target === "cancelled" ? "set" : null,
  };
}

function interruptionFor(edge, milestone, facts) {
  if (edge.to === "disputed" || edge.id === "M09") {
    return { resumeState: milestone.state, reason: "DISPUTE" };
  }
  if (edge.to === "suspended" || edge.id === "M12") {
    const reason = edge.id === "M03" ? "ADMIN_RISK" : facts.reason;
    return { resumeState: milestone.state, reason };
  }
  return null;
}

function auditReason(edge, facts, target) {
  if (edge.id === "M06") {
    return text(facts.reason_code);
  }
  if (edge.id === "M09") {
    return "DISPUTE";
  }
  if (edge.id === "M12") {
    return facts.reason;
  }
  if (edge.id === "M03" && target === "suspended") {
    return "ADMIN_RISK";
  }
  return null;
}

async function commitEdge(client, { project, milestone, edge, actorType, actorId, facts, sourceFactId }) {
  const target = targetFor(edge, milestone, facts);
  const sourceFact = sourceFactId || null;
  // M05's unique transition key is the submission reference. The inbox still
  // deduplicates the event id, so a later revision or approval can name the
  // submission without knowing that event id.
  const recordedFactId = edge.id === "M05" ? text(facts.submission_ref, 255) : sourceFact;
  if (edge.id === "M06") {
    const count = await repository.revisionCount(client, milestone.id);
    await repository.insertRevision(client, [
      repository.hexId("mrr"),
      milestone.id,
      count.rows[0].count + 1,
      actorId,
      text(facts.submission_ref, 255),
      text(facts.reason_code),
      text(facts.detail),
    ]);
  }
  let approvalExternalId = null;
  if (edge.id === "M07") {
    const approval = await repository.insertApproval(client, [
      repository.hexId("map"),
      milestone.id,
      milestone.current_term_version,
      text(facts.submission_ref, 255),
      actorId,
      sourceFact,
      facts.correlation_id || null,
    ]);
    approvalExternalId = approval.rows[0].external_id;
  }
  if (edge.id === "M05") {
    await repository.answerOpenRevision(client, milestone.id, text(facts.submission_ref, 255));
  }
  if (edge.id === "M09" || edge.id === "M12" || (edge.id === "M03" && target === "suspended")) {
    await repository.withdrawOpenRevision(client, milestone.id);
  }
  const updated = await repository.applyState(client, {
    milestoneId: milestone.id,
    expectedVersion: milestone.version,
    targetState: target,
    timestamps: timestampsFor(edge, target),
    interruption: interruptionFor(edge, milestone, facts),
  });
  if (updated.rows.length !== 1) {
    const error = new Error("Milestone version is stale");
    error.status = 409;
    error.body = { error: "Milestone version is stale" };
    throw error;
  }
  const next = updated.rows[0];
  await repository.insertTransition(client, [
    repository.hexId("mst"),
    milestone.id,
    milestone.state,
    target,
    edge.action,
    actorType,
    actorId,
    recordedFactId,
    milestone.version,
    edge.id === "M09" ? "DISPUTE" : edge.id === "M12" ? facts.reason : edge.id === "M03" && target === "suspended" ? "ADMIN_RISK" : null,
    milestone.current_term_version,
  ]);
  await writeAudit(client, {
    project,
    milestone: next,
    actorType,
    actorId,
    action: { ...edge, edgeId: edge.id, sourceFactId: sourceFact },
    outcome: "succeeded",
    source: milestone.state,
    target,
    reason: auditReason(edge, facts, target),
  });
  await writeEvents(client, {
    project,
    milestone: next,
    edge,
    source: milestone.state,
    target,
    sourceFactId: sourceFact,
    facts,
    approvalExternalId,
  });
  return {
    status: 200,
    body: {
      milestone: {
        id: next.id,
        external_id: next.external_id,
        state: next.state,
        version: next.version,
        resume_state: next.resume_state,
      },
    },
  };
}

async function applyInside(client, command, project, milestone) {
  if (milestone.version !== command.expectedVersion) {
    return rejected("Milestone version is stale");
  }
  const edge = findEdge(command.action, milestone.state);
  if (!edge) {
    return rejected("Invalid milestone transition");
  }
  const facts = command.facts || {};
  const failure = await preconditionFailure(client, {
    project,
    milestone,
    edge,
    actorType: command.actorType,
    actorId: command.actorId,
    facts,
  });
  if (failure) {
    return failure;
  }
  const sourceFactId = command.actorType === "system" ? text(facts.event_id, 255) : text(command.idempotencyKey, 255);
  if (!sourceFactId) {
    return { status: 400, body: { error: "A source fact id is required" } };
  }
  return commitEdge(client, {
    project,
    milestone,
    edge,
    actorType: command.actorType,
    actorId: command.actorId,
    facts,
    sourceFactId,
  });
}

function quarantineOrThrow(result) {
  if (result.status === 200) {
    return "applied";
  }
  if (result.quarantine) {
    return "quarantined";
  }
  const error = new Error(result.body && result.body.error ? result.body.error : "Milestone transition failed");
  error.status = result.status;
  error.body = result.body;
  throw error;
}

async function applyMilestoneTransition(command) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('musicapp.milestone_transition', 'on', true)");
    const projectResult = await repository.lockProject(client, command.projectId);
    const project = projectResult.rows[0];
    const milestoneResult = await repository.lockProjectMilestones(client, command.projectId);
    const milestone = milestoneResult.rows.find((row) => row.id === command.milestoneId);
    if (!project || !milestone) {
      await client.query("ROLLBACK");
      return { status: 404, body: { error: "Milestone not found" } };
    }
    let result;
    if (command.actorType === "system") {
      const eventId = text((command.facts || {}).event_id, 255);
      if (!eventId) {
        result = { status: 400, body: { error: "A source fact id is required" } };
      } else {
        const consumed = await consumeInboxEvent(client, {
          consumer: "milestones",
          source: command.action,
          eventId,
          eventType: command.action,
        }, async () => {
          result = await applyInside(client, command, project, milestone);
          return quarantineOrThrow(result);
        });
        if (consumed.duplicate) {
          result = consumed.result === "applied"
            ? { status: 200, body: { duplicate: true } }
            : rejected("Milestone fact does not match");
        }
      }
    } else {
      const key = text(command.idempotencyKey, 255);
      if (!key) {
        result = { status: 400, body: { error: "A source fact id is required" } };
      } else {
        const idempotent = await executeIdempotent(client, {
          actorType: command.actorType,
          actorId: command.actorId,
          operation: command.action,
          resourceRef: command.milestoneId,
          key,
          request: command,
        }, async () => applyInside(client, command, project, milestone));
        result = { status: idempotent.status, body: idempotent.body };
      }
    }
    if (result.status !== 200 && !result.quarantine) {
      await client.query("ROLLBACK");
      return result;
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The transaction is already closed.
    }
    if (error.code === "23505" && error.constraint === "project_milestones_one_active") {
      return rejected("Another milestone is already active");
    }
    if (error.status) {
      return { status: error.status, body: error.body || { error: error.message } };
    }
    throw error;
  } finally {
    client.release();
  }
}

async function recordMilestoneCreated(client, milestone, actorId, projectId) {
  await repository.recordCreation(client, milestone, actorId);
  const project = { id: projectId };
  await invitations.insertAuditEvent(client, [
    repository.hexId("aud"),
    project.id,
    "AUD-PROJECTS-007",
    "user",
    actorId,
    "buyer",
    "project.milestone.create",
    "succeeded",
    null,
    null,
    "planned",
    milestone.version,
    null,
    null,
    hashRequest({ action: "project.milestone.create", milestone_id: milestone.external_id }),
  ]);
}

module.exports = {
  applyMilestoneTransition,
  recordMilestoneCreated,
};
