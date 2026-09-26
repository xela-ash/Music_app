function insertCredentials(db, userId, passwordHash) {
  return db.query(
    `INSERT INTO auth_credentials (user_id, password_hash)
     VALUES ($1, $2)`,
    [userId, passwordHash]
  );
}

function findLoginByEmail(db, email) {
  return db.query(
    `SELECT
       u.id, u.external_id, u.email, u.phone_e164, u.status, u.created_at,
       p.id AS profile_id, p.external_id AS profile_external_id, p.handle,
       p.first_name, p.last_name, p.artist_name, p.artist_name_is_legal_name,
       p.display_name, p.genres, p.city, p.country, p.bio,
       p.profile_photo_asset_id, p.dob,
       p.created_at AS profile_created_at, p.updated_at AS profile_updated_at,
       ac.password_hash
     FROM users u
     JOIN profiles p ON p.user_id = u.id
     JOIN auth_credentials ac ON ac.user_id = u.id
     WHERE lower(u.email) = lower($1) AND u.status = 'active'::user_status`,
    [email]
  );
}

function findActiveUserById(db, userId) {
  return db.query(
    `SELECT
       u.id, u.external_id, u.email, u.phone_e164, u.status, u.created_at,
       p.id AS profile_id, p.external_id AS profile_external_id, p.handle,
       p.first_name, p.last_name, p.artist_name, p.artist_name_is_legal_name,
       p.display_name, p.genres, p.city, p.country, p.bio,
       p.profile_photo_asset_id, p.dob,
       p.created_at AS profile_created_at, p.updated_at AS profile_updated_at
     FROM users u
     JOIN profiles p ON p.user_id = u.id
     WHERE u.id = $1 AND u.status = 'active'::user_status`,
    [userId]
  );
}

module.exports = {
  insertCredentials,
  findLoginByEmail,
  findActiveUserById,
};
