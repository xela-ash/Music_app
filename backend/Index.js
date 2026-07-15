const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db/db");

// =====================
// JWT Configuration
// =====================
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const JWT_ISSUER = "musicapp-api";
const JWT_AUDIENCE = "musicapp-web";

if (!JWT_SECRET || !JWT_SECRET.trim()) {
  console.error("JWT_SECRET is required but missing or blank. Set it in backend/.env.");
  process.exit(1);
}

// =====================
// Auth Middleware
// =====================
function requireAuth(req, res, next) {
  const UNAUTHORIZED = { error: "Unauthorized" };
  const authHeader = req.headers.authorization;

  if (typeof authHeader !== "string") {
    return res.status(401).json(UNAUTHORIZED);
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    return res.status(401).json(UNAUTHORIZED);
  }

  const token = parts[1];

  try {
    req.auth = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    next();
  } catch (err) {
    return res.status(401).json(UNAUTHORIZED);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// =====================
// Health Checks
// =====================
app.get("/", (req, res) => {
  res.json({ message: "Backend is alive" });
});

app.get("/db-health", async (req, res) => {
  try {
    const result = await pool.query("SELECT 1 AS ok");
    res.json({ db: "connected", result: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ db: "error", message: err.message });
  }
});

// =====================
// USERS
// =====================
function makeExternalId() {
  return `usr_${crypto.randomBytes(10).toString("hex")}`;
}

app.post("/users", async (req, res) => {
  try {
    const { external_id, email = null, phone_e164 = null, status } = req.body;

    if (!email && !phone_e164) {
      return res.status(400).json({ error: "Either email or phone_e164 is required" });
    }

    const extId = external_id || makeExternalId();

    const result = await pool.query(
      `INSERT INTO users (external_id, email, phone_e164, status)
       VALUES ($1, $2, $3, COALESCE($4::user_status, 'active'::user_status))
       RETURNING id, external_id, email, phone_e164, status, created_at`,
      [extId, email, phone_e164, status]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Unique constraint violation", detail: err.detail });
    }
    if (err.code === "23514") {
      return res.status(400).json({ error: "Constraint violation", detail: err.detail });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/users", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, external_id, email, phone_e164, status, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =====================
// PROFILES
// =====================
function makeProfileExternalId() {
  return `prf_${crypto.randomBytes(10).toString("hex")}`;
}

app.post("/profiles", async (req, res) => {
  try {
    const {
      external_id,
      user_id,
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
      profile_photo_asset_id = null,
      dob = null,
    } = req.body;

    if (!user_id) return res.status(400).json({ error: "user_id is required" });
    if (!handle) return res.status(400).json({ error: "handle is required" });
    if (!first_name) return res.status(400).json({ error: "first_name is required" });
    if (!artist_name) return res.status(400).json({ error: "artist_name is required" });
    if (!display_name) return res.status(400).json({ error: "display_name is required" });
    if (!city) return res.status(400).json({ error: "city is required" });
    if (!country) return res.status(400).json({ error: "country is required" });

    const extId = external_id || makeProfileExternalId();

    const result = await pool.query(
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
      [
        extId,
        user_id,
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
        profile_photo_asset_id,
        dob,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Unique constraint violation", detail: err.detail });
    }
    if (err.code === "23503") {
      return res.status(400).json({ error: "Foreign key violation", detail: err.detail });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});
// =====================
// AUTH-LITE (MVP): SIGNUP creates user + profile
// =====================
app.post("/auth/signup", async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      email = null,
      phone_e164 = null,
      password,

      // profile fields
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
    } = req.body ?? {};

    if (!email && !phone_e164) {
      return res.status(400).json({ error: "Either email or phone_e164 is required" });
    }
    if (typeof password !== "string") {
      return res.status(400).json({ error: "password is required and must be a string" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "password must be at least 8 characters" });
    }
    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ error: "password must not exceed 72 bytes" });
    }
    if (!handle) return res.status(400).json({ error: "handle is required" });
    if (!first_name) return res.status(400).json({ error: "first_name is required" });
    if (!artist_name) return res.status(400).json({ error: "artist_name is required" });
    if (!display_name) return res.status(400).json({ error: "display_name is required" });
    if (!city) return res.status(400).json({ error: "city is required" });
    if (!country) return res.status(400).json({ error: "country is required" });

    const userExternalId = makeExternalId();
    const profileExternalId = makeProfileExternalId();

    const passwordHash = await bcrypt.hash(password, 12);

    await client.query("BEGIN");

    const userResult = await client.query(
      `INSERT INTO users (external_id, email, phone_e164, status)
       VALUES ($1, $2, $3, 'active'::user_status)
       RETURNING id, external_id, email, phone_e164, status, created_at`,
      [userExternalId, email, phone_e164]
    );

    const user = userResult.rows[0];

    const profileResult = await client.query(
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
      [
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
      ]
    );

    await client.query(
      `INSERT INTO auth_credentials (user_id, password_hash)
       VALUES ($1, $2)`,
      [user.id, passwordHash]
    );

    await client.query("COMMIT");

    res.status(201).json({ user, profile: profileResult.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      return res.status(409).json({ error: "Unique constraint violation", detail: err.detail });
    }
    if (err.code === "23514") {
      return res.status(400).json({ error: "Constraint violation", detail: err.detail });
    }
    if (err.code === "23503") {
      return res.status(400).json({ error: "Foreign key violation", detail: err.detail });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// =====================
// AUTH-LITE (MVP): LOGIN
// =====================
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ error: "email is required and must be a non-empty string" });
    }
    if (typeof password !== "string") {
      return res.status(400).json({ error: "password is required and must be a string" });
    }

    const result = await pool.query(
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

    const row = result.rows[0];
    const INVALID_CREDENTIALS = { error: "Invalid email or password" };

    if (!row) {
      return res.status(401).json(INVALID_CREDENTIALS);
    }

    const passwordMatches = await bcrypt.compare(password, row.password_hash);
    if (!passwordMatches) {
      return res.status(401).json(INVALID_CREDENTIALS);
    }

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

    res.status(200).json({ token, user, profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =====================
// AUTH-LITE (MVP): CURRENT USER
// =====================
app.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
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
      [req.auth.sub]
    );

    const row = result.rows[0];

    if (!row) {
      return res.status(401).json({ error: "Unauthorized" });
    }

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

    res.status(200).json({ user, profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =====================
// START SERVER
// =====================
app.get("/profiles", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.email, u.phone_e164
       FROM profiles p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC
       LIMIT 100`
    );
    res.json({ profiles: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});