const crypto = require("crypto");

const PROJECT_COLUMNS = `
  id, external_id, buyer_user_id, seller_user_id, title, requirements,
  service_snapshot, price_amount, currency, currency_exponent, delivery_days,
  revision_limit, state, version, proposal_version, agreed_term_version,
  resume_state, accepted_at, funded_at, started_at, delivered_at, completed_at,
  cancelled_at, archived_at
`;

function makeTermExternalId() {
  return `ptv_${crypto.randomBytes(10).toString("hex")}`;
}

function makeTransitionExternalId() {
  return `pst_${crypto.randomBytes(10).toString("hex")}`;
}

function lockProjectById(db, projectId) {
  return db.query(
    `SELECT ${PROJECT_COLUMNS}
     FROM projects
     WHERE id = $1
     FOR UPDATE`,
    [projectId]
  );
}

function proposalReadiness(db, projectId) {
  return db.query(
    `SELECT
       COUNT(*)::int AS milestone_count,
       COALESCE(SUM(amount), 0)::int AS milestone_total,
       COALESCE(bool_and(due_at IS NOT NULL AND due_at > clock_timestamp()), false) AS deadlines_future,
       COALESCE(bool_and(currency = 'INR'), false) AS same_currency,
       COALESCE(bool_and(
         revision_allowance IS NOT NULL
         AND currency_exponent = (SELECT currency_exponent FROM projects WHERE id = $1)
         AND deliverable_definition IS NOT NULL
         AND jsonb_typeof(deliverable_definition -> 'required_deliverables') = 'array'
         AND jsonb_array_length(deliverable_definition -> 'required_deliverables') > 0
       ), false) AS terms_complete
     FROM project_milestones
     WHERE project_id = $1`,
    [projectId]
  );
}

function pendingInvitationCount(db, projectId) {
  return db.query(
    `SELECT COUNT(*)::int AS count
     FROM project_invitations
     WHERE project_id = $1 AND status = 'pending'`,
    [projectId]
  );
}

function invitationStatusCounts(db, projectId) {
  return db.query(
    `SELECT status, COUNT(*)::int AS count
     FROM project_invitations
     WHERE project_id = $1
     GROUP BY status`,
    [projectId]
  );
}

function activeSeller(db, projectId) {
  return db.query(
    `SELECT user_id
     FROM project_participants
     WHERE project_id = $1
       AND category = 'seller'
       AND status = 'active'`,
    [projectId]
  );
}

function insertProposalVersion(db, projectId, externalId) {
  return db.query(
    `INSERT INTO project_term_versions (
       external_id, project_id, version_number, represented_state,
       title, brief, service_snapshot, genre_ids, skill_ids,
       currency, currency_exponent, total_amount, start_at, due_at,
       revision_limit, content_hash
     )
     SELECT
       $2,
       projects.id,
       COALESCE((
         SELECT MAX(version_number) FROM project_term_versions existing
         WHERE existing.project_id = projects.id
       ), 0) + 1,
       'proposed',
       projects.title,
       projects.requirements,
       projects.service_snapshot,
       '[]'::jsonb,
       '[]'::jsonb,
       projects.currency,
       projects.currency_exponent,
       projects.price_amount,
       NULL,
       clock_timestamp() + (projects.delivery_days * INTERVAL '1 day'),
       projects.revision_limit,
       repeat('0', 64)
     FROM projects
     WHERE projects.id = $1
     RETURNING version_number, represented_state, total_amount, currency, content_hash`,
    [projectId, externalId]
  );
}

function insertAgreedVersion(db, projectId, externalId, proposalVersion) {
  return db.query(
    `INSERT INTO project_term_versions (
       external_id, project_id, version_number, represented_state,
       title, brief, service_snapshot, genre_ids, skill_ids,
       currency, currency_exponent, total_amount, start_at, due_at,
       revision_limit, content_hash
     )
     SELECT
       $3,
       source.project_id,
       COALESCE((
         SELECT MAX(version_number) FROM project_term_versions existing
         WHERE existing.project_id = source.project_id
       ), 0) + 1,
       'agreed',
       source.title,
       source.brief,
       source.service_snapshot,
       source.genre_ids,
       source.skill_ids,
       source.currency,
       source.currency_exponent,
       source.total_amount,
       source.start_at,
       source.due_at,
       source.revision_limit,
       repeat('0', 64)
     FROM project_term_versions source
     WHERE source.project_id = $1
       AND source.version_number = $2
       AND source.represented_state = 'proposed'
     RETURNING version_number, represented_state, total_amount, currency, content_hash`,
    [projectId, proposalVersion, externalId]
  );
}

function makeMilestoneTermExternalId() {
  return `mtv_${crypto.randomBytes(10).toString("hex")}`;
}

function milestoneSnapshotRows(db, projectId) {
  return db.query(
    `SELECT id, milestone_no, title, description, deliverable_definition,
            revision_allowance, amount, currency, currency_exponent, due_at
     FROM project_milestones
     WHERE project_id = $1
     ORDER BY milestone_no`,
    [projectId]
  );
}

function insertMilestoneSnapshot(db, values) {
  return db.query(
    `INSERT INTO milestone_term_versions (
       external_id, milestone_id, project_term_version, kind,
       milestone_no, title, description, deliverable_definition,
       revision_allowance, amount, currency, currency_exponent, due_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)`,
    values
  );
}

function proposalMilestoneSnapshots(db, projectId, proposalVersion) {
  return db.query(
    `SELECT snapshot.milestone_id, snapshot.milestone_no, snapshot.title, snapshot.description,
            snapshot.deliverable_definition, snapshot.revision_allowance, snapshot.amount,
            snapshot.currency, snapshot.currency_exponent, snapshot.due_at
     FROM milestone_term_versions snapshot
     JOIN project_milestones milestone ON milestone.id = snapshot.milestone_id
     WHERE milestone.project_id = $1
       AND snapshot.project_term_version = $2
       AND snapshot.kind = 'proposal'
     ORDER BY snapshot.milestone_no`,
    [projectId, proposalVersion]
  );
}

function setMilestoneTermsStatus(db, projectId, fromStatus, toStatus, termVersion) {
  return db.query(
    `UPDATE project_milestones
     SET terms_status = $3,
         current_term_version = $4,
         updated_at = clock_timestamp()
     WHERE project_id = $1
       AND terms_status = $2`,
    [projectId, fromStatus, toStatus, termVersion]
  );
}

function agreedVersion(db, projectId, versionNumber) {
  return db.query(
    `SELECT version_number, represented_state, total_amount, currency, currency_exponent
     FROM project_term_versions
     WHERE project_id = $1 AND version_number = $2 AND represented_state = 'agreed'`,
    [projectId, versionNumber]
  );
}

function applyProjectTransition(db, { projectId, expectedVersion, targetState, resumeState, clearResume, timestamps, proposalVersion, agreedTermVersion }) {
  const sets = [
    "state = $3::project_state",
    "version = version + 1",
    "updated_at = clock_timestamp()",
  ];
  const values = [projectId, expectedVersion, targetState];
  function add(column, value) {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  if (clearResume) {
    sets.push("resume_state = NULL");
  } else if (resumeState) {
    values.push(resumeState);
    sets.push(`resume_state = $${values.length}::project_state`);
  }
  if (proposalVersion) {
    add("proposal_version", proposalVersion);
  }
  if (agreedTermVersion) {
    add("agreed_term_version", agreedTermVersion);
  }
  if (timestamps.fundedAt) {
    sets.push("funded_at = clock_timestamp()");
  }
  if (timestamps.startedAt) {
    sets.push("started_at = clock_timestamp()");
  }
  if (timestamps.deliveredAt) {
    sets.push("delivered_at = clock_timestamp()");
  }
  if (timestamps.completedAt) {
    sets.push("completed_at = clock_timestamp()");
  }
  if (timestamps.cancelledAt) {
    sets.push("cancelled_at = clock_timestamp()");
  }
  if (timestamps.archivedAt) {
    sets.push("archived_at = clock_timestamp()");
  }
  if (timestamps.clearArchivedAt) {
    sets.push("archived_at = NULL");
  }
  return db.query(
    `UPDATE projects
     SET ${sets.join(", ")}
     WHERE id = $1 AND version = $2
     RETURNING ${PROJECT_COLUMNS}`,
    values
  );
}

function insertStateTransition(db, values) {
  return db.query(
    `INSERT INTO project_state_transitions (
       external_id, project_id, source_state, target_state, trigger_action,
       actor_type, actor_id, source_fact_id, precondition_version, outcome, reason_code
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed', $10)`,
    values
  );
}

module.exports = {
  makeTermExternalId,
  makeTransitionExternalId,
  lockProjectById,
  proposalReadiness,
  pendingInvitationCount,
  invitationStatusCounts,
  activeSeller,
  makeMilestoneTermExternalId,
  milestoneSnapshotRows,
  insertMilestoneSnapshot,
  proposalMilestoneSnapshots,
  setMilestoneTermsStatus,
  insertProposalVersion,
  insertAgreedVersion,
  agreedVersion,
  applyProjectTransition,
  insertStateTransition,
};
