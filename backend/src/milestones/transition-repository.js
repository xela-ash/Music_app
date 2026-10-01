const crypto = require("crypto");

const MILESTONE_COLUMNS = `
  id, external_id, project_id, milestone_no, title, state, version,
  terms_status, current_term_version, revision_allowance, amount, currency,
  currency_exponent, funded_at, started_at, delivered_at, approved_at,
  completed_at, cancelled_at, resume_state, interruption_reason, interrupted_at
`;

function hexId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function lockProject(db, projectId) {
  return db.query(
    `SELECT id, external_id, buyer_user_id, seller_user_id, state, version
     FROM projects
     WHERE id = $1
     FOR UPDATE`,
    [projectId]
  );
}

function lockMilestone(db, milestoneId) {
  return db.query(
    `SELECT ${MILESTONE_COLUMNS}
     FROM project_milestones
     WHERE id = $1
     FOR UPDATE`,
    [milestoneId]
  );
}

// Milestones §24: after the project row, lock every milestone of that project
// in ascending number so a start command cannot deadlock with another
// milestone command on the same project.
function lockProjectMilestones(db, projectId) {
  return db.query(
    `SELECT ${MILESTONE_COLUMNS}
     FROM project_milestones
     WHERE project_id = $1
     ORDER BY milestone_no
     FOR UPDATE`,
    [projectId]
  );
}

function activeSeller(db, projectId) {
  return db.query(
    `SELECT user_id
     FROM project_participants
     WHERE project_id = $1 AND category = 'seller' AND status = 'active'`,
    [projectId]
  );
}

function predecessorStates(db, projectId, milestoneNo) {
  return db.query(
    `SELECT state
     FROM project_milestones
     WHERE project_id = $1 AND milestone_no < $2`,
    [projectId, milestoneNo]
  );
}

function activeSibling(db, projectId, milestoneId) {
  return db.query(
    `SELECT id
     FROM project_milestones
     WHERE project_id = $1
       AND id <> $2
       AND state IN ('in_progress', 'delivered')`,
    [projectId, milestoneId]
  );
}

function latestDelivery(db, milestoneId) {
  return db.query(
    `SELECT source_fact_id
     FROM milestone_state_transitions
     WHERE milestone_id = $1
       AND trigger_type = 'delivery.ready'
       AND outcome = 'succeeded'
     ORDER BY created_at DESC
     LIMIT 1`,
    [milestoneId]
  );
}

function revisionCount(db, milestoneId) {
  return db.query(
    `SELECT COUNT(*)::int AS count
     FROM milestone_revision_requests
     WHERE milestone_id = $1`,
    [milestoneId]
  );
}

function approvalCount(db, milestoneId) {
  return db.query(
    "SELECT COUNT(*)::int AS count FROM milestone_approvals WHERE milestone_id = $1",
    [milestoneId]
  );
}

function insertTransition(db, values) {
  return db.query(
    `INSERT INTO milestone_state_transitions (
       external_id, milestone_id, source_state, target_state, trigger_type,
       actor_type, actor_id, source_fact_id, precondition_version, outcome,
       reason_code, term_version
     )
     VALUES ($1, $2, $3::milestone_state, $4::milestone_state, $5, $6, $7, $8, $9, 'succeeded', $10, $11)`,
    values
  );
}

function insertRevision(db, values) {
  return db.query(
    `INSERT INTO milestone_revision_requests (
       external_id, milestone_id, cycle_number, buyer_user_id, submission_ref,
       reason_code, detail, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')`,
    values
  );
}

function answerOpenRevision(db, milestoneId, submissionRef) {
  return db.query(
    `UPDATE milestone_revision_requests
     SET status = 'answered', answering_submission_ref = $2
     WHERE milestone_id = $1 AND status = 'open'`,
    [milestoneId, submissionRef]
  );
}

function withdrawOpenRevision(db, milestoneId) {
  return db.query(
    `UPDATE milestone_revision_requests
     SET status = 'withdrawn_by_dispute'
     WHERE milestone_id = $1 AND status = 'open'`,
    [milestoneId]
  );
}

function insertApproval(db, values) {
  return db.query(
    `INSERT INTO milestone_approvals (
       external_id, milestone_id, term_version, submission_ref, buyer_user_id,
       idempotency_key, correlation_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING external_id`,
    values
  );
}

function applyState(db, { milestoneId, expectedVersion, targetState, timestamps, interruption }) {
  const sets = [
    "state = $3::milestone_state",
    "version = version + 1",
    "updated_at = clock_timestamp()",
  ];
  const values = [milestoneId, expectedVersion, targetState];
  if (timestamps.fundedAt === "set") {
    sets.push("funded_at = clock_timestamp()");
  }
  if (timestamps.fundedAt === "clear") {
    sets.push("funded_at = NULL");
  }
  if (timestamps.startedAt === "set") {
    sets.push("started_at = clock_timestamp()");
  }
  if (timestamps.deliveredAt === "set") {
    sets.push("delivered_at = clock_timestamp()");
  }
  if (timestamps.approvedAt === "set") {
    sets.push("approved_at = clock_timestamp()");
  }
  if (timestamps.completedAt === "set") {
    sets.push("completed_at = clock_timestamp()");
  }
  if (timestamps.cancelledAt === "set") {
    sets.push("cancelled_at = clock_timestamp()");
  }
  if (interruption) {
    sets.push(`resume_state = $${values.length + 1}::milestone_state`);
    values.push(interruption.resumeState);
    sets.push(`interruption_reason = $${values.length + 1}`);
    values.push(interruption.reason);
    sets.push("interrupted_at = clock_timestamp()");
  } else {
    sets.push("resume_state = NULL");
    sets.push("interruption_reason = NULL");
    sets.push("interrupted_at = NULL");
  }
  return db.query(
    `UPDATE project_milestones
     SET ${sets.join(", ")}
     WHERE id = $1 AND version = $2
     RETURNING ${MILESTONE_COLUMNS}`,
    values
  );
}

function recordCreation(db, milestone, actorId) {
  return insertTransition(db, [
    hexId("mst"),
    milestone.id,
    null,
    "planned",
    "project.milestone.create",
    "user",
    actorId,
    null,
    milestone.version,
    null,
    null,
  ]);
}

module.exports = {
  activeSeller,
  activeSibling,
  answerOpenRevision,
  applyState,
  approvalCount,
  hexId,
  insertApproval,
  insertRevision,
  insertTransition,
  latestDelivery,
  lockMilestone,
  lockProject,
  lockProjectMilestones,
  predecessorStates,
  recordCreation,
  revisionCount,
  withdrawOpenRevision,
};
