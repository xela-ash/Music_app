const express = require("express");
const { requireAuth } = require("../auth/routes");
const service = require("./service");

const router = express.Router();

router.get("/profiles", requireAuth, async (req, res) => {
  const result = await service.listProfiles(req.query);
  res.status(result.status).json(result.body);
});

module.exports = router;
