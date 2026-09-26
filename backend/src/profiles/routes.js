const express = require("express");
const { requireAuth } = require("../auth/routes");
const service = require("./service");

const router = express.Router();

router.post("/profiles", async (req, res) => {
  const result = await service.createProfile(req.body);
  res.status(result.status).json(result.body);
});

router.get("/profiles", requireAuth, async (req, res) => {
  const result = await service.listProfiles();
  res.status(result.status).json(result.body);
});

module.exports = router;
