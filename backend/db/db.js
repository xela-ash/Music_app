require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "musicapp",
  password: process.env.DB_PASSWORD || "musicapp",
  database: process.env.DB_NAME || "musicapp",
});

module.exports = pool;