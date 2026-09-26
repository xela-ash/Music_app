const crypto = require("crypto");

const SAFE_MILESTONE_FIELDS = `
  id, external_id, project_id, milestone_no, title, description,
  amount, currency, due_at, state, created_at, updated_at
`;

function makeMilestoneExternalId() {
  return `mls_${crypto.randomBytes(10).toString("hex")}`;
}

function insertMilestone(db, values) {
  return db.query(
    `INSERT INTO project_milestones (
       external_id, project_id, milestone_no, title, description, amount, currency, due_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${SAFE_MILESTONE_FIELDS}`,
    values
  );
}

function listMilestonesForProject(db, projectId) {
  return db.query(
    `SELECT ${SAFE_MILESTONE_FIELDS} FROM project_milestones WHERE project_id = $1 ORDER BY milestone_no`,
    [projectId]
  );
}

module.exports = {
  makeMilestoneExternalId,
  insertMilestone,
  listMilestonesForProject,
};
