const express = require("express");
const { requireAuth } = require("../auth/routes");
const service = require("./service");

const router = express.Router();

router.post("/projects", requireAuth, async (req, res) => {
  const result = await service.createProject(req.body, req.auth.sub);
  res.status(result.status).json(result.body);
});

router.get("/projects", requireAuth, async (req, res) => {
  const result = await service.listProjects(req.auth.sub);
  res.status(result.status).json(result.body);
});

module.exports = router;
