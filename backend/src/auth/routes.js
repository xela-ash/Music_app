const express = require("express");
const pool = require("../../db/db");
const { accountMayAuthenticate } = require("./account-status");
const repository = require("./repository");
const service = require("./service");

const UNAUTHORIZED = { error: "Unauthorized" };
const INTERNAL = { error: "Internal server error" };

async function requireLiveStatus(req, res, next) {
  const userId = req.auth && req.auth.sub;
  if (typeof userId !== "string" || userId.length === 0) {
    return res.status(401).json(UNAUTHORIZED);
  }

  try {
    const result = await repository.findUserStatusById(pool, userId);
    const row = result.rows[0];
    if (!row || !accountMayAuthenticate(row.status)) {
      return res.status(401).json(UNAUTHORIZED);
    }
    req.auth = { ...req.auth, status: row.status };
    return next();
  } catch (err) {
    if (err && err.code === "22P02") {
      return res.status(401).json(UNAUTHORIZED);
    }
    console.error(err);
    return res.status(500).json(INTERNAL);
  }
}

function requireAuth(req, res, next) {
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
    req.auth = service.verifyAccessToken(token);
  } catch (err) {
    return res.status(401).json(UNAUTHORIZED);
  }

  return requireLiveStatus(req, res, next);
}

const router = express.Router();

router.post("/auth/signup", async (req, res) => {
  const result = await service.signup(req.body);
  res.status(result.status).json(result.body);
});

router.post("/auth/login", async (req, res) => {
  const result = await service.login(req.body);
  res.status(result.status).json(result.body);
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const result = await service.currentUser(req.auth.sub);
  res.status(result.status).json(result.body);
});

module.exports = {
  router,
  requireAuth,
  requireLiveStatus,
};
