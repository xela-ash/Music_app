const crypto = require("crypto");

function makeEscrowExternalId() {
  return `esc_${crypto.randomBytes(10).toString("hex")}`;
}

function makeAllocationExternalId() {
  return `eal_${crypto.randomBytes(10).toString("hex")}`;
}

function makeFeeSnapshotExternalId() {
  return `efs_${crypto.randomBytes(10).toString("hex")}`;
}

function actorAccountStatus(db, userId) {
  return db.query(
    `SELECT status FROM users WHERE id = $1`,
    [userId]
  );
}

function lockMilestonesForFunding(db, projectId, agreedTermVersion) {
  return db.query(
    `SELECT milestone.id, milestone.external_id, milestone.milestone_no,
            milestone.amount, milestone.currency, milestone.currency_exponent,
            milestone.terms_status, milestone.current_term_version, milestone.state,
            snapshot.amount AS snapshot_amount,
            snapshot.currency AS snapshot_currency,
            snapshot.currency_exponent AS snapshot_exponent
     FROM project_milestones milestone
     LEFT JOIN milestone_term_versions snapshot
       ON snapshot.milestone_id = milestone.id
      AND snapshot.project_term_version = $2
      AND snapshot.kind = 'agreed'
     WHERE milestone.project_id = $1
     ORDER BY milestone.milestone_no
     FOR UPDATE OF milestone`,
    [projectId, agreedTermVersion]
  );
}

function activeEscrowForProject(db, projectId) {
  return db.query(
    `SELECT id, external_id, status
     FROM escrows
     WHERE project_id = $1 AND status <> 'cancelled'`,
    [projectId]
  );
}

function insertFeeSnapshot(db, values) {
  return db.query(
    `INSERT INTO escrow_fee_snapshots (
       external_id, schedule_version, fee_lines, currency, currency_exponent
     )
     VALUES ($1, NULL, '[]'::jsonb, $2, $3)
     RETURNING id, external_id, schedule_version, fee_lines, currency, currency_exponent`,
    values
  );
}

function insertEscrow(db, values) {
  return db.query(
    `INSERT INTO escrows (
       external_id, project_id, buyer_user_id, seller_user_id, agreed_term_version,
       currency, currency_exponent, expected_amount, fee_snapshot_id, status, version
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'created', 1)
     RETURNING id, external_id, status, currency, currency_exponent, expected_amount,
               agreed_term_version, version, funded_amount, released_amount, refunded_amount`,
    values
  );
}

function insertAllocation(db, values) {
  return db.query(
    `INSERT INTO escrow_allocations (
       external_id, escrow_id, milestone_id, revision_number, term_version,
       allocated_amount, currency, currency_exponent, allocation_status, version
     )
     VALUES ($1, $2, $3, 1, $4, $5, $6, $7, 'planned', 1)
     RETURNING external_id, allocated_amount, currency, currency_exponent,
               allocation_status, revision_number, funded_amount`,
    values
  );
}

module.exports = {
  makeEscrowExternalId,
  makeAllocationExternalId,
  makeFeeSnapshotExternalId,
  actorAccountStatus,
  lockMilestonesForFunding,
  activeEscrowForProject,
  insertFeeSnapshot,
  insertEscrow,
  insertAllocation,
};
