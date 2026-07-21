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
app.get("/profiles", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         id, external_id, user_id, handle, first_name, last_name, artist_name,
         artist_name_is_legal_name, display_name, genres, city, country, bio,
         profile_photo_asset_id, created_at, updated_at
       FROM profiles
       ORDER BY created_at DESC
       LIMIT 100`
    );
    res.json({ profiles: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =====================
// PROJECTS
// =====================
function makeProjectExternalId() {
  return `prj_${crypto.randomBytes(10).toString("hex")}`;
}

function makeMilestoneExternalId() {
  return `mls_${crypto.randomBytes(10).toString("hex")}`;
}

const SAFE_PROJECT_FIELDS = `
  id, external_id, buyer_user_id, seller_user_id, title, requirements,
  price_amount, currency, delivery_days, revision_limit, state,
  accepted_at, delivered_at, completed_at, milestones_locked_at, created_at, updated_at
`;

const SAFE_MILESTONE_FIELDS = `
  id, external_id, project_id, milestone_no, title, description,
  amount, currency, due_at, state, created_at, updated_at
`;

// projects.price_amount and project_milestones.amount are PostgreSQL INTEGER
// columns — values above this would overflow the column at INSERT time
// (22003) instead of failing validation cleanly.
const POSTGRES_INT_MAX = 2147483647;

// MusicApp launches India-first: every newly created project and milestone is
// stamped with this currency server-side. Clients cannot supply or override
// it. Existing historical rows created before this constant existed may still
// hold other currencies (e.g. USD) and are left as-is.
const PROJECT_CURRENCY = "INR";

// Pure validation for the milestones array in a POST /projects body. Runs
// before any DB access so malformed input never reaches a query. Returns
// either { ok: true, milestones: <normalized array> } or { ok: false, error }.
function validateMilestonesInput(milestones) {
  if (milestones === undefined) {
    return { ok: false, error: "milestones is required" };
  }
  if (!Array.isArray(milestones)) {
    return { ok: false, error: "milestones must be an array" };
  }
  if (milestones.length === 0) {
    return { ok: false, error: "milestones must contain at least one item" };
  }

  const normalized = [];

  for (let i = 0; i < milestones.length; i++) {
    const item = milestones[i];

    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { ok: false, error: "Each milestone must be an object" };
    }

    const { title, description, amount, due_at } = item;

    if (typeof title !== "string" || !title.trim()) {
      return { ok: false, error: "Each milestone title is required and must be a non-empty string" };
    }

    let normalizedDescription = null;
    if (description !== undefined && description !== null) {
      if (typeof description !== "string") {
        return { ok: false, error: "Milestone description must be a string" };
      }
      normalizedDescription = description.trim() ? description.trim() : null;
    }

    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount <= 0 ||
      amount > POSTGRES_INT_MAX
    ) {
      return {
        ok: false,
        error: `milestones[${i}].amount must be an integer between 1 and ${POSTGRES_INT_MAX}`,
      };
    }

    let normalizedDueAt = null;
    if (due_at !== undefined && due_at !== null) {
      if (typeof due_at !== "string" || !due_at.trim()) {
        return { ok: false, error: "Milestone due_at must be a non-empty string if provided" };
      }
      const parsedDate = new Date(due_at);
      if (Number.isNaN(parsedDate.getTime())) {
        return { ok: false, error: "Milestone due_at must be a valid date" };
      }
      normalizedDueAt = due_at.trim();
    }

    normalized.push({
      title: title.trim(),
      description: normalizedDescription,
      amount,
      due_at: normalizedDueAt,
    });
  }

  return { ok: true, milestones: normalized };
}

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

// Matches the canonical 8-4-4-4-12 hex form PostgreSQL's uuid type expects,
// rejecting malformed values before they can reach a query (avoids 22P02).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.post("/projects", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      seller_user_id,
      title,
      requirements,
      price_amount,
      delivery_days,
      revision_limit,
      milestones,
    } = req.body ?? {};

    if (typeof seller_user_id !== "string" || !seller_user_id.trim()) {
      return res.status(400).json({ error: "seller_user_id is required and must be a non-empty string" });
    }
    if (!UUID_PATTERN.test(seller_user_id.trim())) {
      return res.status(400).json({ error: "seller_user_id must be a valid UUID" });
    }
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title is required and must be a non-empty string" });
    }
    if (typeof requirements !== "string" || !requirements.trim()) {
      return res.status(400).json({ error: "requirements is required and must be a non-empty string" });
    }
    if (
      typeof price_amount !== "number" ||
      !Number.isInteger(price_amount) ||
      price_amount <= 0 ||
      price_amount > POSTGRES_INT_MAX
    ) {
      return res
        .status(400)
        .json({ error: `price_amount must be an integer between 1 and ${POSTGRES_INT_MAX}` });
    }
    if (typeof delivery_days !== "number" || !Number.isInteger(delivery_days) || delivery_days <= 0) {
      return res.status(400).json({ error: "delivery_days must be an integer greater than 0" });
    }

    let revisionLimitValue = 0;
    if (revision_limit !== undefined) {
      if (typeof revision_limit !== "number" || !Number.isInteger(revision_limit) || revision_limit < 0) {
        return res.status(400).json({ error: "revision_limit must be an integer greater than or equal to 0" });
      }
      revisionLimitValue = revision_limit;
    }

    const milestoneValidation = validateMilestonesInput(milestones);
    if (!milestoneValidation.ok) {
      return res.status(400).json({ error: milestoneValidation.error });
    }
    const normalizedMilestones = milestoneValidation.milestones;

    let milestoneTotal = 0;
    for (const milestone of normalizedMilestones) {
      milestoneTotal += milestone.amount;
      if (milestoneTotal > Number.MAX_SAFE_INTEGER || milestoneTotal > POSTGRES_INT_MAX) {
        return res.status(400).json({ error: "Total milestone amount exceeds the supported project limit" });
      }
    }
    if (milestoneTotal !== price_amount) {
      return res.status(400).json({ error: "Milestone amounts must equal the project price" });
    }

    if (seller_user_id === req.auth.sub) {
      return res.status(400).json({ error: "You cannot start a project with yourself" });
    }

    const sellerResult = await client.query(
      `SELECT u.id
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1 AND u.status = 'active'::user_status`,
      [seller_user_id]
    );

    if (sellerResult.rows.length === 0) {
      return res.status(404).json({ error: "Seller not found" });
    }

    const externalId = makeProjectExternalId();

    await client.query("BEGIN");

    const projectResult = await client.query(
      `INSERT INTO projects (
         external_id, buyer_user_id, seller_user_id,
         title, requirements, price_amount, currency, delivery_days, revision_limit
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${SAFE_PROJECT_FIELDS}`,
      [
        externalId,
        req.auth.sub,
        seller_user_id,
        title.trim(),
        requirements.trim(),
        price_amount,
        PROJECT_CURRENCY,
        delivery_days,
        revisionLimitValue,
      ]
    );

    const project = projectResult.rows[0];
    const insertedMilestones = [];

    for (let i = 0; i < normalizedMilestones.length; i++) {
      const milestone = normalizedMilestones[i];
      const milestoneExternalId = makeMilestoneExternalId();

      const milestoneResult = await client.query(
        `INSERT INTO project_milestones (
           external_id, project_id, milestone_no, title, description, amount, currency, due_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${SAFE_MILESTONE_FIELDS}`,
        [
          milestoneExternalId,
          project.id,
          i + 1,
          milestone.title,
          milestone.description,
          milestone.amount,
          PROJECT_CURRENCY,
          milestone.due_at,
        ]
      );

      insertedMilestones.push(milestoneResult.rows[0]);
    }

    await client.query("COMMIT");

    res.status(201).json({ project, milestones: insertedMilestones });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23503") {
      return res.status(400).json({ error: "Foreign key violation" });
    }
    if (err.code === "23505") {
      return res.status(409).json({ error: "Unique constraint violation" });
    }
    if (err.code === "23514") {
      return res.status(400).json({ error: "Constraint violation" });
    }
    if (err.code === "23502") {
      return res.status(400).json({ error: "A required field is missing" });
    }
    if (err.code === "22P02") {
      return res.status(400).json({ error: "Invalid value provided" });
    }
    if (err.code === "22003") {
      return res.status(400).json({ error: "Amount exceeds the supported limit" });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

app.get("/projects", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
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
      [req.auth.sub]
    );

    const projects = result.rows.map((row) => ({
      id: row.id,
      external_id: row.external_id,
      buyer_user_id: row.buyer_user_id,
      seller_user_id: row.seller_user_id,
      title: row.title,
      requirements: row.requirements,
      price_amount: row.price_amount,
      currency: row.currency,
      delivery_days: row.delivery_days,
      revision_limit: row.revision_limit,
      state: row.state,
      accepted_at: row.accepted_at,
      delivered_at: row.delivered_at,
      completed_at: row.completed_at,
      milestones_locked_at: row.milestones_locked_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      buyer_profile: {
        user_id: row.buyer_profile_user_id,
        display_name: row.buyer_profile_display_name,
        handle: row.buyer_profile_handle,
        artist_name: row.buyer_profile_artist_name,
      },
      seller_profile: {
        user_id: row.seller_profile_user_id,
        display_name: row.seller_profile_display_name,
        handle: row.seller_profile_handle,
        artist_name: row.seller_profile_artist_name,
      },
    }));

    res.json({ projects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Locks a project's milestone plan: after this, the protect_locked_milestones
// trigger (migration 008) rejects any add/remove/commercial-field edit to
// this project's milestones. Does not touch escrow, funding, or work state —
// those are separate, later steps.
app.post("/projects/:projectId/lock-milestones", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { projectId } = req.params;

    if (!UUID_PATTERN.test(projectId)) {
      return res.status(400).json({ error: "projectId must be a valid UUID" });
    }

    await client.query("BEGIN");

    const projectResult = await client.query(
      `SELECT ${SAFE_PROJECT_FIELDS} FROM projects WHERE id = $1 FOR UPDATE`,
      [projectId]
    );
    const project = projectResult.rows[0];

    // Same safe 404 for "doesn't exist" and "exists but you're not the buyer" —
    // sellers/unrelated users must not learn a project exists via a different
    // error shape.
    if (!project || project.buyer_user_id !== req.auth.sub) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.milestones_locked_at !== null) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Project milestones are already locked" });
    }

    if (project.state !== "draft") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Only draft projects can lock milestones" });
    }

    const milestonesResult = await client.query(
      `SELECT ${SAFE_MILESTONE_FIELDS} FROM project_milestones WHERE project_id = $1 ORDER BY milestone_no`,
      [projectId]
    );
    const milestones = milestonesResult.rows;

    if (milestones.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Project must have at least one milestone before locking" });
    }

    let milestoneTotal = 0;
    for (const milestone of milestones) {
      if (milestone.state !== "planned") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Only planned milestones can be locked" });
      }
      if (milestone.currency !== project.currency) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "All milestones must use the project currency" });
      }
      milestoneTotal += milestone.amount;
    }

    if (milestoneTotal !== project.price_amount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Milestone amounts must equal the project price" });
    }

    const updateResult = await client.query(
      `UPDATE projects
       SET milestones_locked_at = now(),
           updated_at = now()
       WHERE id = $1
       RETURNING ${SAFE_PROJECT_FIELDS}`,
      [projectId]
    );

    await client.query("COMMIT");

    res.status(200).json({ project: updateResult.rows[0], milestones });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});