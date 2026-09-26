const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../../db/db");
const repository = require("./repository");
const usersRepository = require("../users/repository");
const profilesRepository = require("../profiles/repository");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const JWT_ISSUER = "musicapp-api";
const JWT_AUDIENCE = "musicapp-web";

if (!JWT_SECRET || !JWT_SECRET.trim()) {
  console.error("JWT_SECRET is required but missing or blank. Set it in backend/.env.");
  process.exit(1);
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

function sessionFromRow(row) {
  const user = {
    id: row.id,
    external_id: row.external_id,
    email: row.email,
    phone_e164: row.phone_e164,
    status: row.status,
    created_at: row.created_at,
  };

  const profile = {
    id: row.profile_id,
    external_id: row.profile_external_id,
    user_id: row.id,
    handle: row.handle,
    first_name: row.first_name,
    last_name: row.last_name,
    artist_name: row.artist_name,
    artist_name_is_legal_name: row.artist_name_is_legal_name,
    display_name: row.display_name,
    genres: row.genres,
    city: row.city,
    country: row.country,
    bio: row.bio,
    profile_photo_asset_id: row.profile_photo_asset_id,
    dob: row.dob,
    created_at: row.profile_created_at,
    updated_at: row.profile_updated_at,
  };

  return { user, profile };
}

async function signup(body) {
  const client = await pool.connect();
  try {
    const {
      email = null,
      phone_e164 = null,
      password,

      handle,
      first_name,
      last_name = null,
      artist_name,
      artist_name_is_legal_name = false,
      display_name,
      genres = [],
      city,
      country,
      bio = null,
      dob = null,
    } = body ?? {};

    if (!email && !phone_e164) {
      return { status: 400, body: { error: "Either email or phone_e164 is required" } };
    }
    if (typeof password !== "string") {
      return { status: 400, body: { error: "password is required and must be a string" } };
    }
    if (password.length < 8) {
      return { status: 400, body: { error: "password must be at least 8 characters" } };
    }
    if (Buffer.byteLength(password, "utf8") > 72) {
      return { status: 400, body: { error: "password must not exceed 72 bytes" } };
    }
    if (!handle) return { status: 400, body: { error: "handle is required" } };
    if (!first_name) return { status: 400, body: { error: "first_name is required" } };
    if (!artist_name) return { status: 400, body: { error: "artist_name is required" } };
    if (!display_name) return { status: 400, body: { error: "display_name is required" } };
    if (!city) return { status: 400, body: { error: "city is required" } };
    if (!country) return { status: 400, body: { error: "country is required" } };

    const userExternalId = usersRepository.makeExternalId();
    const profileExternalId = profilesRepository.makeProfileExternalId();

    const passwordHash = await bcrypt.hash(password, 12);

    await client.query("BEGIN");

    const userResult = await usersRepository.insertActiveUser(
      client,
      userExternalId,
      email,
      phone_e164
    );

    const user = userResult.rows[0];

    const profileResult = await profilesRepository.insertSignupProfile(client, [
      profileExternalId,
      user.id,
      handle,
      first_name,
      last_name,
      artist_name,
      artist_name_is_legal_name,
      display_name,
      genres,
      city,
      country,
      bio,
      dob,
    ]);

    await repository.insertCredentials(client, user.id, passwordHash);

    await client.query("COMMIT");

    return { status: 201, body: { user, profile: profileResult.rows[0] } };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      return { status: 409, body: { error: "Unique constraint violation", detail: err.detail } };
    }
    if (err.code === "23514") {
      return { status: 400, body: { error: "Constraint violation", detail: err.detail } };
    }
    if (err.code === "23503") {
      return { status: 400, body: { error: "Foreign key violation", detail: err.detail } };
    }
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  } finally {
    client.release();
  }
}

async function login(body) {
  try {
    const { email, password } = body ?? {};

    if (typeof email !== "string" || !email.trim()) {
      return { status: 400, body: { error: "email is required and must be a non-empty string" } };
    }
    if (typeof password !== "string") {
      return { status: 400, body: { error: "password is required and must be a string" } };
    }

    const result = await repository.findLoginByEmail(pool, email);

    const row = result.rows[0];
    const INVALID_CREDENTIALS = { error: "Invalid email or password" };

    if (!row) {
      return { status: 401, body: INVALID_CREDENTIALS };
    }

    const passwordMatches = await bcrypt.compare(password, row.password_hash);
    if (!passwordMatches) {
      return { status: 401, body: INVALID_CREDENTIALS };
    }

    const { user, profile } = sessionFromRow(row);

    const token = jwt.sign(
      {
        sub: user.id,
        external_id: user.external_id,
        profile_id: profile.id,
        status: user.status,
      },
      JWT_SECRET,
      {
        expiresIn: JWT_EXPIRES_IN,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }
    );

    return { status: 200, body: { token, user, profile } };
  } catch (err) {
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

async function currentUser(userId) {
  try {
    const result = await repository.findActiveUserById(pool, userId);

    const row = result.rows[0];

    if (!row) {
      return { status: 401, body: { error: "Unauthorized" } };
    }

    return { status: 200, body: sessionFromRow(row) };
  } catch (err) {
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

module.exports = {
  verifyAccessToken,
  signup,
  login,
  currentUser,
};
