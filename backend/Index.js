const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const pool = require("./db/db");

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
    if (!handle) return res.status(400).json({ error: "handle is required" });
    if (!first_name) return res.status(400).json({ error: "first_name is required" });
    if (!artist_name) return res.status(400).json({ error: "artist_name is required" });
    if (!display_name) return res.status(400).json({ error: "display_name is required" });
    if (!city) return res.status(400).json({ error: "city is required" });
    if (!country) return res.status(400).json({ error: "country is required" });

    const userExternalId = makeExternalId();
    const profileExternalId = makeProfileExternalId();

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
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
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