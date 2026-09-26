const crypto = require("crypto");

function makeExternalId() {
  return `usr_${crypto.randomBytes(10).toString("hex")}`;
}

function insertUser(db, externalId, email, phoneE164, status) {
  return db.query(
    `INSERT INTO users (external_id, email, phone_e164, status)
     VALUES ($1, $2, $3, COALESCE($4::user_status, 'active'::user_status))
     RETURNING id, external_id, email, phone_e164, status, created_at`,
    [externalId, email, phoneE164, status]
  );
}

function insertActiveUser(db, externalId, email, phoneE164) {
  return db.query(
    `INSERT INTO users (external_id, email, phone_e164, status)
     VALUES ($1, $2, $3, 'active'::user_status)
     RETURNING id, external_id, email, phone_e164, status, created_at`,
    [externalId, email, phoneE164]
  );
}

function listUsers(db) {
  return db.query(
    `SELECT id, external_id, email, phone_e164, status, created_at
     FROM users
     ORDER BY created_at DESC`
  );
}

module.exports = {
  makeExternalId,
  insertUser,
  insertActiveUser,
  listUsers,
};
