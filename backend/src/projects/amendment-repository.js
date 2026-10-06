const crypto = require("crypto");
const invitations = require("./invitation-repository");

const AMENDMENT_FIELDS = `
  id, external_id, project_id, proposer_user_id, counterparty_user_id,
  base_project_version, base_term_version, current_term_version, patch,
  old_snapshot_hash, new_snapshot_hash, status, expires_at, decided_at,
  decided_by_user_id, version, created_at, updated_at
`;

const PATCHED_TITLE = `CASE WHEN $2::jsonb ? 'title' THEN $2::jsonb->>'title' ELSE source.title END`;
const PATCHED_BRIEF = `CASE WHEN $2::jsonb ? 'brief' THEN $2::jsonb->>'brief' ELSE source.brief END`;
const PATCHED_SERVICE = `CASE WHEN $2::jsonb ? 'service_snapshot' THEN $2::jsonb->'service_snapshot' ELSE source.service_snapshot END`;
const PATCHED_START = `CASE WHEN $2::jsonb ? 'start_at' THEN ($2::jsonb->>'start_at')::timestamptz ELSE source.start_at END`;
const PATCHED_DUE = `CASE WHEN $2::jsonb ? 'due_at' THEN ($2::jsonb->>'due_at')::timestamptz ELSE source.due_at END`;
const PATCHED_REVISION = `CASE WHEN $2::jsonb ? 'revision_limit' THEN ($2::jsonb->>'revision_limit')::integer ELSE source.revision_limit END`;

function makeAmendmentExternalId() {
  return `amd_${crypto.randomBytes(10).toString("hex")}`;
}

function lockPendingAmendment(db, projectId) {
  return db.query(
    `SELECT ${AMENDMENT_FIELDS}
     FROM project_amendments
     WHERE project_id = $1 AND status = 'proposed'
     FOR UPDATE`,
    [projectId]
  );
}

function lockAmendment(db, projectId, externalId) {
  return db.query(
    `SELECT ${AMENDMENT_FIELDS}
     FROM project_amendments
     WHERE project_id = $1 AND external_id = $2
     FOR UPDATE`,
    [projectId, externalId]
  );
}

function hashPatchedTerms(db, projectId, termVersion, patch) {
  return db.query(
    `SELECT
       source.content_hash AS old_hash,
       project_term_version_content_hash(
         'agreed',
         ${PATCHED_TITLE},
         ${PATCHED_BRIEF},
         ${PATCHED_SERVICE},
         source.genre_ids,
         source.skill_ids,
         source.currency,
         source.currency_exponent,
         source.total_amount,
         ${PATCHED_START},
         ${PATCHED_DUE},
         ${PATCHED_REVISION}
       ) AS new_hash
     FROM project_term_versions source
     WHERE source.project_id = $1
       AND source.version_number = $3
       AND source.represented_state = 'agreed'`,
    [projectId, JSON.stringify(patch), termVersion]
  );
}

function insertPatchedAgreedVersion(db, projectId, externalId, termVersion, patch) {
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
       ${PATCHED_TITLE},
       ${PATCHED_BRIEF},
       ${PATCHED_SERVICE},
       source.genre_ids,
       source.skill_ids,
       source.currency,
       source.currency_exponent,
       source.total_amount,
       ${PATCHED_START},
       ${PATCHED_DUE},
       ${PATCHED_REVISION},
       repeat('0', 64)
     FROM project_term_versions source
     WHERE source.project_id = $1
       AND source.version_number = $4
       AND source.represented_state = 'agreed'
     RETURNING version_number, represented_state, content_hash, title, brief,
               revision_limit, total_amount, currency`,
    [projectId, JSON.stringify(patch), externalId, termVersion]
  );
}

function insertAmendment(db, values) {
  return db.query(
    `INSERT INTO project_amendments (
       external_id, project_id, proposer_user_id, counterparty_user_id,
       base_project_version, base_term_version, patch, old_snapshot_hash,
       new_snapshot_hash, status, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, 'proposed', $10::timestamptz)
     RETURNING ${AMENDMENT_FIELDS}`,
    values
  );
}

function decideAmendment(db, { id, status, decidedBy, currentTermVersion }) {
  return db.query(
    `UPDATE project_amendments
     SET status = $2::project_amendment_status,
         decided_at = clock_timestamp(),
         decided_by_user_id = $3,
         current_term_version = $4,
         version = version + 1,
         updated_at = clock_timestamp()
     WHERE id = $1 AND status = 'proposed'
     RETURNING ${AMENDMENT_FIELDS}`,
    [id, status, decidedBy, currentTermVersion]
  );
}

function applyAcceptedTerms(db, projectId, expectedVersion, patch, agreedTermVersion) {
  return db.query(
    `UPDATE projects
     SET version = version + 1,
         agreed_term_version = $4,
         title = CASE WHEN $2::jsonb ? 'title' THEN $2::jsonb->>'title' ELSE title END,
         requirements = CASE WHEN $2::jsonb ? 'brief' THEN $2::jsonb->>'brief' ELSE requirements END,
         revision_limit = CASE
           WHEN $2::jsonb ? 'revision_limit' THEN ($2::jsonb->>'revision_limit')::integer
           ELSE revision_limit
         END,
         service_snapshot = CASE
           WHEN $2::jsonb ? 'service_snapshot' THEN $2::jsonb->'service_snapshot'
           ELSE service_snapshot
         END,
         updated_at = clock_timestamp()
     WHERE id = $1 AND version = $3
     RETURNING version, agreed_term_version, state, external_id, title, requirements,
               revision_limit, price_amount, currency, delivery_days`,
    [projectId, JSON.stringify(patch), expectedVersion, agreedTermVersion]
  );
}

function termVersionRow(db, projectId, versionNumber) {
  return db.query(
    `SELECT version_number, represented_state, content_hash, title
     FROM project_term_versions
     WHERE project_id = $1 AND version_number = $2`,
    [projectId, versionNumber]
  );
}

module.exports = {
  makeAmendmentExternalId,
  makeAuditExternalId: invitations.makeAuditExternalId,
  makeTermExternalId: require("./transition-repository").makeTermExternalId,
  lockPendingAmendment,
  lockAmendment,
  hashPatchedTerms,
  insertPatchedAgreedVersion,
  insertAmendment,
  decideAmendment,
  applyAcceptedTerms,
  termVersionRow,
  insertAuditEvent: invitations.insertAuditEvent,
  expiryIsPast: invitations.expiryIsPast,
  findActiveSeller: invitations.findActiveSeller,
  lockProjectById: invitations.lockProjectById,
};
