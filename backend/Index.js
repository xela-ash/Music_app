const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const pool = require("./db/db");

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Backend is alive" });
});

// DB health
app.get("/db-health", async (req, res) => {
  try {
    const result = await pool.query("SELECT 1 AS ok");
    res.json({ db: "connected", result: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ db: "error", message: err.message });
  }
});

// --- USER CREATION LOGIC ---

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

// List users
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

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});