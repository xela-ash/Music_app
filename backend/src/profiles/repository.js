const crypto = require("crypto");

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

function listProfiles(db) {
  return db.query(
    `SELECT
       id, external_id, user_id, handle, first_name, last_name, artist_name,
       artist_name_is_legal_name, display_name, genres, city, country, bio,
       profile_photo_asset_id, created_at, updated_at
     FROM profiles
     ORDER BY created_at DESC
     LIMIT 100`
  );
}

module.exports = {
  makeProfileExternalId,
  insertProfile,
  insertSignupProfile,
  listProfiles,
};
