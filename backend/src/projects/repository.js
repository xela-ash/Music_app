const crypto = require("crypto");

const SAFE_PROJECT_FIELDS = `
  id, external_id, buyer_user_id, seller_user_id, title, requirements,
  price_amount, currency, delivery_days, revision_limit, state,
  accepted_at, delivered_at, completed_at, milestones_locked_at, created_at, updated_at
`;

// Table-prefixed variant for the GET /projects listing query below, which
// joins profiles twice (buyer + seller) — bare column names like `id` or
// `created_at` would otherwise be ambiguous against those joined tables.
// Kept separate from SAFE_PROJECT_FIELDS so POST /projects (no joins) is
// untouched.
const SAFE_PROJECT_FIELDS_JOINED = `
  pr.id, pr.external_id, pr.buyer_user_id, pr.seller_user_id, pr.title, pr.requirements,
  pr.price_amount, pr.currency, pr.delivery_days, pr.revision_limit, pr.state,
  pr.accepted_at, pr.delivered_at, pr.completed_at, pr.milestones_locked_at, pr.created_at, pr.updated_at
`;

function makeProjectExternalId() {
  return `prj_${crypto.randomBytes(10).toString("hex")}`;
}

function findActiveSellerWithProfile(db, sellerUserId) {
  return db.query(
    `SELECT u.id
     FROM users u
     JOIN profiles p ON p.user_id = u.id
     WHERE u.id = $1 AND u.status = 'active'::user_status`,
    [sellerUserId]
  );
}

function insertProject(db, values) {
  return db.query(
    `INSERT INTO projects (
       external_id, buyer_user_id, seller_user_id,
       title, requirements, price_amount, currency, delivery_days, revision_limit
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${SAFE_PROJECT_FIELDS}`,
    values
  );
}

function listProjectsForParticipant(db, userId) {
  return db.query(
    `SELECT
       ${SAFE_PROJECT_FIELDS_JOINED},
       bp.user_id AS buyer_profile_user_id,
       bp.display_name AS buyer_profile_display_name,
       bp.handle AS buyer_profile_handle,
       bp.artist_name AS buyer_profile_artist_name,
       sp.user_id AS seller_profile_user_id,
       sp.display_name AS seller_profile_display_name,
       sp.handle AS seller_profile_handle,
       sp.artist_name AS seller_profile_artist_name
     FROM projects pr
     JOIN profiles bp ON bp.user_id = pr.buyer_user_id
     JOIN profiles sp ON sp.user_id = pr.seller_user_id
     WHERE pr.buyer_user_id = $1 OR pr.seller_user_id = $1
     ORDER BY pr.created_at DESC`,
    [userId]
  );
}

function lockProjectForUpdate(db, projectId) {
  return db.query(
    `SELECT ${SAFE_PROJECT_FIELDS} FROM projects WHERE id = $1 FOR UPDATE`,
    [projectId]
  );
}

function lockProjectMilestones(db, projectId) {
  return db.query(
    `UPDATE projects
     SET milestones_locked_at = now(),
         updated_at = now()
     WHERE id = $1
     RETURNING ${SAFE_PROJECT_FIELDS}`,
    [projectId]
  );
}

module.exports = {
  makeProjectExternalId,
  findActiveSellerWithProfile,
  insertProject,
  listProjectsForParticipant,
  lockProjectForUpdate,
  lockProjectMilestones,
};
