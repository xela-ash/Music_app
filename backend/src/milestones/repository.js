const crypto = require("crypto");

const SAFE_MILESTONE_FIELDS = `
  id, external_id, project_id, milestone_no, title, description,
  deliverable_definition, revision_allowance, amount, currency, currency_exponent,
  due_at, state, terms_status, current_term_version, version, created_at, updated_at
`;

function makeMilestoneExternalId() {
  return `mls_${crypto.randomBytes(10).toString("hex")}`;
}

function presentMilestone(row) {
  if (!row) {
    return row;
  }
  return {
    ...row,
    amount: Number(row.amount),
    currency_exponent: Number(row.currency_exponent),
    revision_allowance: row.revision_allowance === null ? null : Number(row.revision_allowance),
    current_term_version: row.current_term_version === null ? null : Number(row.current_term_version),
    version: row.version === null || row.version === undefined ? row.version : Number(row.version),
  };
}

function insertMilestone(db, values) {
  return db.query(
    `INSERT INTO project_milestones (
       external_id, project_id, milestone_no, title, description,
       deliverable_definition, revision_allowance, amount, currency, currency_exponent, due_at
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
     RETURNING ${SAFE_MILESTONE_FIELDS}`,
    values
  ).then((result) => {
    result.rows = result.rows.map(presentMilestone);
    return result;
  });
}

function listMilestonesForProject(db, projectId) {
  return db.query(
    `SELECT ${SAFE_MILESTONE_FIELDS}
     FROM project_milestones
     WHERE project_id = $1
     ORDER BY milestone_no`,
    [projectId]
  ).then((result) => {
    result.rows = result.rows.map(presentMilestone);
    return result;
  });
}

module.exports = {
  makeMilestoneExternalId,
  insertMilestone,
  listMilestonesForProject,
};
