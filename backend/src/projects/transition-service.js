const pool = require("../../db/db");
const { validateIdempotencyKey, executeIdempotent } = require("../infrastructure/idempotency");
const { enqueueOutboxMessage } = require("../infrastructure/outbox");
const { hashRequest } = require("../infrastructure/canonical-json");
const { findTransition } = require("./transition-rules");
const repository = require("./transition-repository");
const invitations = require("./invitation-repository");
const milestonesRepository = require("../milestones/repository");
const { assertSnapshotReady } = require("../milestones/catalogue");
const { authorize, PROJECT_LIST } = require("../authorization/authorize");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function concealed() {
  return { status: 404, body: { error: "Project not found" } };
}

function invalidTransition() {
  return { status: 409, body: { error: "Invalid project transition" } };
}

function stale() {
  return { status: 409, body: { error: "Project version is stale" } };
}

function notReady(status) {
  return { status, body: { error: "Proposal is not ready" } };
}

function publicProject(project, termVersion) {
  const body = {
    project: {
      id: project.id,
      external_id: project.external_id,
      state: project.state,
      version: project.version,
      proposal_version: project.proposal_version,
      agreed_term_version: project.agreed_term_version,
      resume_state: project.resume_state,
    },
  };
  if (termVersion) {
    body.term_version = {
      version_number: termVersion.version_number,
      represented_state: termVersion.represented_state,
      total_amount: Number(termVersion.total_amount),
      currency: termVersion.currency,
      content_hash: termVersion.content_hash,
    };
  }
  return body;
}

function actorMatches(edge, project, actor, activeSellerUserId) {
  if (actor.actorType === "system") {
    return edge.actors.includes("system");
  }
  if (edge.actors.includes("buyer") && actor.actorId === project.buyer_user_id) {
    return true;
  }
  if (edge.actors.includes("invitee") && actor.facts && actor.facts.inviteeUserId === actor.actorId) {
    return true;
  }
  if (edge.actors.includes("seller") && activeSellerUserId && activeSellerUserId === actor.actorId) {
    return true;
  }
  if (edge.actors.includes("accepted_party")) {
    return actor.actorId === project.buyer_user_id || actor.actorId === activeSellerUserId;
  }
  return false;
}

function hasFactId(facts) {
  return Boolean(facts && typeof facts.eventId === "string" && facts.eventId.length > 0 && facts.eventId.length <= 255);
}

async function statusMap(client, projectId) {
  const counts = await repository.invitationStatusCounts(client, projectId);
  const map = {};
  for (const row of counts.rows) {
    map[row.status] = row.count;
  }
  return map;
}

async function preconditionFailure(client, project, edge, actor) {
  const facts = actor.facts || {};
  const seller = await repository.activeSeller(client, project.id);
  const sellerUserId = seller.rows[0] ? seller.rows[0].user_id : null;
  if (!actorMatches(edge, project, { ...actor, facts }, sellerUserId)) {
    return invalidTransition();
  }
  for (const requirement of edge.requires) {
    if (requirement === "expected_version" && project.version !== actor.expectedVersion) {
      return stale();
    }
    if (requirement === "proposal_ready") {
      const ready = await repository.proposalReadiness(client, project.id);
      const row = ready.rows[0];
      const aligned = row.milestone_count >= 1
        && row.deadlines_future === true
        && row.same_currency === true
        && row.terms_complete === true
        && row.milestone_total === project.price_amount;
      const milestones = await milestonesRepository.listMilestonesForProject(client, project.id);
      if (
        !project.title
        || !project.requirements
        || project.currency !== "INR"
        || project.currency_exponent !== 2
        || project.price_amount <= 0
        || project.delivery_days <= 0
        || !aligned
        || !assertSnapshotReady(milestones.rows, project).ok
      ) {
        return notReady(edge.actions.includes("project.propose") ? 422 : 409);
      }
    }
    if (requirement === "no_pending_or_accepted_seller") {
      const pending = await repository.pendingInvitationCount(client, project.id);
      if (pending.rows[0].count > 0 || sellerUserId) {
        return invalidTransition();
      }
    }
    if (requirement === "pending_invitation") {
      const pending = await repository.pendingInvitationCount(client, project.id);
      if (pending.rows[0].count !== 1) {
        return invalidTransition();
      }
    }
    if (requirement === "accepted_invitation" || requirement === "declined_invitation" || requirement === "released_invitation") {
      const statuses = await statusMap(client, project.id);
      if (requirement === "accepted_invitation" && !statuses.accepted) {
        return invalidTransition();
      }
      if (requirement === "declined_invitation" && !statuses.declined) {
        return invalidTransition();
      }
      if (requirement === "released_invitation" && !statuses.withdrawn && !statuses.expired) {
        return invalidTransition();
      }
    }
    if (requirement === "active_seller" && !sellerUserId) {
      return invalidTransition();
    }
    if (requirement === "proposal_version" && !project.proposal_version) {
      return invalidTransition();
    }
    if (requirement === "agreed_snapshot") {
      if (!project.agreed_term_version) {
        return invalidTransition();
      }
      const agreed = await repository.agreedVersion(client, project.id, project.agreed_term_version);
      if (agreed.rows.length !== 1) {
        return invalidTransition();
      }
    }
    if (requirement === "no_accepted_seller" && sellerUserId) {
      return invalidTransition();
    }
    if (requirement === "no_financial_activity" && (project.funded_at || project.agreed_term_version && project.state === "funded")) {
      return invalidTransition();
    }
    if (requirement === "funded" && !project.funded_at) {
      return invalidTransition();
    }
    if (requirement === "funding_fact" || requirement === "refund_fact") {
      const agreed = await repository.agreedVersion(client, project.id, project.agreed_term_version);
      const snapshot = agreed.rows[0];
      if (
        facts.producer !== "escrow"
        || !hasFactId(facts)
        || !snapshot
        || facts.currency !== snapshot.currency
        || Number(facts.amount) !== Number(snapshot.total_amount)
      ) {
        return invalidTransition();
      }
    }
    if (requirement === "no_refund_due" && !(hasFactId(facts) && facts.refundDue === 0 && facts.hold !== true)) {
      return invalidTransition();
    }
    if (requirement === "mutual_consent") {
      if (facts.consent !== "mutual" || !hasFactId(facts)) {
        return invalidTransition();
      }
      if (facts.buyerUserId !== project.buyer_user_id || facts.sellerUserId !== sellerUserId) {
        return invalidTransition();
      }
    }
    if ((requirement === "submission_fact" || requirement === "delivered_fact" || requirement === "revision_fact" || requirement === "approval_fact" || requirement === "settlement_fact" || requirement === "completion_fact" || requirement === "dispute_fact" || requirement === "suspend_fact") && !hasFactId(facts)) {
      return invalidTransition();
    }
    if (requirement === "settlement_fact" && facts.hold === true) {
      return invalidTransition();
    }
    if (requirement === "completion_fact" && facts.converged !== true) {
      return invalidTransition();
    }
    if (requirement === "no_hold" && facts.hold === true) {
      return invalidTransition();
    }
    if (requirement === "resolution_matches_resume") {
      if (!hasFactId(facts) || project.resume_state !== actor.targetState) {
        return invalidTransition();
      }
    }
  }
  return null;
}

async function insertLiveProposalSnapshots(client, project, termVersion) {
  const milestones = await repository.milestoneSnapshotRows(client, project.id);
  for (const milestone of milestones.rows) {
    await repository.insertMilestoneSnapshot(client, [
      repository.makeMilestoneTermExternalId(),
      milestone.id,
      termVersion,
      "proposal",
      milestone.milestone_no,
      milestone.title,
      milestone.description,
      JSON.stringify(milestone.deliverable_definition),
      milestone.revision_allowance,
      milestone.amount,
      milestone.currency,
      milestone.currency_exponent,
      milestone.due_at,
    ]);
  }
  return milestones.rows.length;
}

async function captureMilestoneSnapshots(client, project, termVersion) {
  const count = await insertLiveProposalSnapshots(client, project, termVersion);
  if (count === 0) {
    return false;
  }
  const updated = await repository.setMilestoneTermsStatus(client, project.id, "draft", "frozen", termVersion);
  return updated.rowCount === count;
}

async function ensureProposalSnapshots(client, project) {
  const existing = await repository.proposalMilestoneSnapshots(client, project.id, project.proposal_version);
  if (existing.rows.length > 0) {
    return true;
  }
  const milestones = await milestonesRepository.listMilestonesForProject(client, project.id);
  if (!assertSnapshotReady(milestones.rows, project).ok) {
    return false;
  }
  const count = await insertLiveProposalSnapshots(client, project, project.proposal_version);
  if (count === 0) {
    return false;
  }
  const updated = await repository.setMilestoneTermsStatus(client, project.id, "draft", "frozen", project.proposal_version);
  if (updated.rowCount === count) {
    return true;
  }
  const frozen = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM project_milestones
     WHERE project_id = $1 AND terms_status IN ('frozen', 'agreed')`,
    [project.id]
  );
  return frozen.rows[0].count === count;
}

async function captureAgreedMilestoneSnapshots(client, project, proposalVersion, agreedVersion) {
  const snapshots = await repository.proposalMilestoneSnapshots(client, project.id, proposalVersion);
  if (snapshots.rows.length === 0) {
    return false;
  }
  for (const snapshot of snapshots.rows) {
    await repository.insertMilestoneSnapshot(client, [
      repository.makeMilestoneTermExternalId(),
      snapshot.milestone_id,
      agreedVersion,
      "agreed",
      snapshot.milestone_no,
      snapshot.title,
      snapshot.description,
      JSON.stringify(snapshot.deliverable_definition),
      snapshot.revision_allowance,
      snapshot.amount,
      snapshot.currency,
      snapshot.currency_exponent,
      snapshot.due_at,
    ]);
  }
  const updated = await repository.setMilestoneTermsStatus(client, project.id, "frozen", "agreed", agreedVersion);
  return updated.rowCount === snapshots.rows.length;
}

async function commitTransition(client, { project, action, targetState, actorType, actorId, expectedVersion, facts, sourceFactId }) {
  const edge = findTransition(project.state, targetState, action);
  if (!edge) {
    return invalidTransition();
  }
  const actor = { actorType, actorId, expectedVersion, facts: facts || {}, targetState };
  const failure = await preconditionFailure(client, project, edge, actor);
  if (failure) {
    return failure;
  }

  let termVersion = null;
  let proposalVersion = null;
  let agreedTermVersion = null;
  if (edge.effect === "freeze_proposal") {
    const inserted = await repository.insertProposalVersion(client, project.id, repository.makeTermExternalId());
    if (inserted.rows.length !== 1) {
      return notReady(409);
    }
    termVersion = inserted.rows[0];
    proposalVersion = termVersion.version_number;
    const captured = await captureMilestoneSnapshots(client, project, proposalVersion);
    if (!captured) {
      throw new Error("Milestone proposal snapshot was not captured");
    }
  }
  if (edge.effect === "freeze_agreed") {
    const ready = await ensureProposalSnapshots(client, project);
    if (!ready) {
      return notReady(409);
    }
    const inserted = await repository.insertAgreedVersion(
      client,
      project.id,
      repository.makeTermExternalId(),
      project.proposal_version
    );
    if (inserted.rows.length !== 1) {
      return invalidTransition();
    }
    termVersion = inserted.rows[0];
    agreedTermVersion = termVersion.version_number;
    const captured = await captureAgreedMilestoneSnapshots(client, project, project.proposal_version, agreedTermVersion);
    if (!captured) {
      return notReady(409);
    }
  }

  const resumeState = edge.effect === "save_resume" || edge.effect === "archive"
    ? project.state
    : null;
  const updated = await repository.applyProjectTransition(client, {
    projectId: project.id,
    expectedVersion: project.version,
    targetState,
    resumeState,
    clearResume: edge.effect === "clear_resume" || edge.effect === "clear_and_cancel" || edge.effect === "restore_archive",
    timestamps: {
      fundedAt: edge.effect === "mark_funded",
      startedAt: edge.effect === "mark_started",
      deliveredAt: edge.effect === "mark_delivered",
      completedAt: edge.effect === "mark_completed",
      cancelledAt: edge.effect === "mark_cancelled" || edge.effect === "clear_and_cancel",
      archivedAt: edge.effect === "archive",
      clearArchivedAt: edge.effect === "restore_archive",
    },
    proposalVersion,
    agreedTermVersion,
  });
  if (updated.rows.length !== 1) {
    return stale();
  }
  const next = updated.rows[0];
  await repository.insertStateTransition(client, [
    repository.makeTransitionExternalId(),
    project.id,
    project.state,
    targetState,
    action,
    actorType,
    actorId,
    sourceFactId || null,
    project.version,
    null,
  ]);
  const changeHash = hashRequest({
    action,
    outcome: "completed",
    project_external_id: project.external_id,
    source_state: project.state,
    target_state: targetState,
  });
  await invitations.insertAuditEvent(client, [
    invitations.makeAuditExternalId(),
    project.id,
    "AUD-PROJECTS-003",
    actorType,
    actorId,
    actorType === "system" ? "system" : "participant",
    action,
    "completed",
    null,
    project.state,
    targetState,
    next.version,
    null,
    sourceFactId || null,
    changeHash,
  ]);
  if (termVersion) {
    const versionHash = hashRequest({
      action: "term_version",
      project_external_id: project.external_id,
      represented_state: termVersion.represented_state,
      version_number: termVersion.version_number,
    });
    await invitations.insertAuditEvent(client, [
      invitations.makeAuditExternalId(),
      project.id,
      "AUD-PROJECTS-001",
      actorType,
      actorId,
      actorType === "system" ? "system" : "participant",
      action,
      "term_version_created",
      null,
      project.state,
      targetState,
      next.version,
      null,
      sourceFactId || null,
      versionHash,
    ]);
  }
  if (edge.effect === "freeze_proposal" || edge.effect === "freeze_agreed") {
    const termAuditVersion = edge.effect === "freeze_proposal" ? proposalVersion : agreedTermVersion;
    const termAuditHash = hashRequest({
      action: edge.effect === "freeze_proposal" ? "milestone_terms_frozen" : "milestone_terms_agreed",
      currency: project.currency,
      currency_exponent: project.currency_exponent,
      plan_sum: project.price_amount,
      term_version: termAuditVersion,
    });
    await invitations.insertAuditEvent(client, [
      invitations.makeAuditExternalId(),
      project.id,
      "AUD-PROJECTS-008",
      actorType,
      actorId,
      actorType === "system" ? "system" : "participant",
      edge.effect === "freeze_proposal" ? "milestone_terms_frozen" : "milestone_terms_agreed",
      "completed",
      null,
      edge.effect === "freeze_proposal" ? "draft" : "frozen",
      edge.effect === "freeze_proposal" ? "frozen" : "agreed",
      next.version,
      null,
      sourceFactId || null,
      termAuditHash,
    ]);
  }
  await enqueueOutboxMessage(client, {
    eventType: "ProjectStateChanged",
    eventVersion: 1,
    aggregateType: "project",
    aggregateId: project.external_id,
    aggregateVersion: next.version,
    payload: {
      action,
      project_external_id: project.external_id,
      source_state: project.state,
      target_state: targetState,
      agreed_term_version: next.agreed_term_version,
      proposal_version: next.proposal_version,
    },
  });
  return { status: 200, body: publicProject(next, termVersion), project: next, termVersion };
}

async function withProjectCommand(projectId, body, actorUserId, idempotencyKeyHeader, operation, run) {
  if (!UUID_PATTERN.test(projectId)) {
    return { status: 400, body: { error: "projectId must be a valid UUID" } };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, body: { error: "Request body must be an object" } };
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
    const locked = await repository.lockProjectById(client, projectId);
    const project = locked.rows[0];
    if (!project || project.buyer_user_id !== actorUserId) {
      const seller = project ? await repository.activeSeller(client, project.id) : { rows: [] };
      const sellerUserId = seller.rows[0] ? seller.rows[0].user_id : null;
      if (!project || (sellerUserId !== actorUserId && project.buyer_user_id !== actorUserId)) {
        await client.query("COMMIT");
        return concealed();
      }
    }
    const decision = authorize({ id: actorUserId }, PROJECT_LIST, null);
    if (!decision.allowed) {
      await client.query("COMMIT");
      return { status: decision.status, body: { error: decision.error } };
    }
    const idempotent = await executeIdempotent(
      client,
      {
        actorType: "user",
        actorId: actorUserId,
        operation,
        resourceRef: project.id,
        key: key.key,
        request: { expected_version: body.expected_version },
      },
      async () => run(client, project, body.expected_version, key.key)
    );
    await client.query("COMMIT");
    return { status: idempotent.status, body: idempotent.body };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error(rollbackErr);
    }
    if (err && err.code === "23505") {
      return { status: 409, body: { error: "Project transition conflict" } };
    }
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  } finally {
    client.release();
  }
}

function userTransition(projectId, body, actorUserId, idempotencyKeyHeader, operation, action, targetState) {
  return withProjectCommand(projectId, body, actorUserId, idempotencyKeyHeader, operation, (client, project, expectedVersion, idempotencyKey) => {
    return commitTransition(client, {
      project,
      action,
      targetState,
      actorType: "user",
      actorId: actorUserId,
      expectedVersion,
      facts: {},
      sourceFactId: idempotencyKey,
    });
  });
}

function proposeProject(projectId, body, actorUserId, idempotencyKeyHeader) {
  return userTransition(projectId, body, actorUserId, idempotencyKeyHeader, "project.propose", "project.propose", "proposed");
}

function seekSeller(projectId, body, actorUserId, idempotencyKeyHeader) {
  return userTransition(projectId, body, actorUserId, idempotencyKeyHeader, "project.seek_seller", "project.seek_seller", "awaiting_seller");
}

function cancelProject(projectId, body, actorUserId, idempotencyKeyHeader) {
  return withProjectCommand(projectId, body, actorUserId, idempotencyKeyHeader, "project.cancel", (client, project, expectedVersion, idempotencyKey) => {
    return commitTransition(client, {
      project,
      action: "project.cancel",
      targetState: "cancelled",
      actorType: "user",
      actorId: actorUserId,
      expectedVersion,
      facts: {},
      sourceFactId: idempotencyKey,
    });
  });
}

function startProject(projectId, body, actorUserId, idempotencyKeyHeader) {
  return userTransition(projectId, body, actorUserId, idempotencyKeyHeader, "project.start", "project.start", "in_progress");
}

function archiveProject(projectId, body, actorUserId, idempotencyKeyHeader) {
  return userTransition(projectId, body, actorUserId, idempotencyKeyHeader, "project.archive", "project.archive", "archived");
}

function restoreProject(projectId, body, actorUserId, idempotencyKeyHeader) {
  return withProjectCommand(projectId, body, actorUserId, idempotencyKeyHeader, "project.restore", async (client, project, expectedVersion, idempotencyKey) => {
    return commitTransition(client, {
      project,
      action: "project.restore",
      targetState: project.resume_state,
      actorType: "user",
      actorId: actorUserId,
      expectedVersion,
      facts: { eventId: idempotencyKey, hold: false },
      sourceFactId: idempotencyKey,
    });
  });
}

async function applySystemTransition(projectId, { action, targetState, expectedVersion, facts }) {
  if (!UUID_PATTERN.test(projectId)) {
    return { status: 400, body: { error: "projectId must be a valid UUID" } };
  }
  if (!facts || !hasFactId(facts)) {
    return { status: 400, body: { error: "event_id is required" } };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await repository.lockProjectById(client, projectId);
    const project = locked.rows[0];
    if (!project) {
      await client.query("COMMIT");
      return concealed();
    }
    const idempotent = await executeIdempotent(
      client,
      {
        actorType: "system",
        actorId: "system",
        operation: action,
        resourceRef: project.id,
        key: facts.eventId,
        request: { action, target_state: targetState, expected_version: expectedVersion || null, facts },
      },
      () => commitTransition(client, {
        project,
        action,
        targetState,
        actorType: "system",
        actorId: "system",
        expectedVersion: expectedVersion === undefined ? project.version : expectedVersion,
        facts,
        sourceFactId: facts.eventId,
      })
    );
    await client.query("COMMIT");
    return { status: idempotent.status, body: idempotent.body };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error(rollbackErr);
    }
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  } finally {
    client.release();
  }
}

module.exports = {
  commitTransition,
  proposeProject,
  seekSeller,
  cancelProject,
  startProject,
  archiveProject,
  restoreProject,
  applySystemTransition,
};
