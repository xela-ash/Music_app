const express = require("express");
const service = require("./service");

const UNAUTHORIZED = { error: "Unauthorized" };

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
    next();
  } catch (err) {
    return res.status(401).json(UNAUTHORIZED);
  }
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
};
