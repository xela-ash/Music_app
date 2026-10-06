const crypto = require("crypto");
const { buildProfileSearchWhere } = require("./search");

function makeProfileExternalId() {
  return `prf_${crypto.randomBytes(10).toString("hex")}`;
}

function insertProfile(db, values) {
  return db.query(
    `INSERT INTO profiles (
      external_id, user_id, handle, first_name, last_name, artist_name,
      artist_name_is_legal_name, display_name, genres, city, country,
      bio, profile_photo_asset_id, dob
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14
    )
    RETURNING *`,
    values
  );
}

function insertSignupProfile(db, values) {
  return db.query(
    `INSERT INTO profiles (
      external_id, user_id, handle, first_name, last_name, artist_name,
      artist_name_is_legal_name, display_name, genres, city, country,
      bio, dob
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13
    )
    RETURNING *`,
    values
  );
}

const PROFILE_LIST_COLUMNS = `
  id, external_id, user_id, handle, first_name, last_name, artist_name,
  artist_name_is_legal_name, display_name, genres, city, country, bio,
  profile_photo_asset_id, created_at, updated_at
`;

function listProfiles(db, { filters, limit, offset }) {
  const { whereSql, params } = buildProfileSearchWhere(filters);
  const values = [...params, limit + 1, offset];
  const limitPosition = params.length + 1;
  const offsetPosition = params.length + 2;
  return db.query(
    `SELECT ${PROFILE_LIST_COLUMNS}
     FROM profiles
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT $${limitPosition}
     OFFSET $${offsetPosition}`,
    values
  );
}

module.exports = {
  makeProfileExternalId,
  insertProfile,
  insertSignupProfile,
  listProfiles,
};
