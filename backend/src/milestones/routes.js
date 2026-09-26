const express = require("express");
const { requireAuth } = require("../auth/routes");
const service = require("./service");

const router = express.Router();

router.post("/projects/:projectId/lock-milestones", requireAuth, async (req, res) => {
  const result = await service.lockMilestones(req.params.projectId, req.auth.sub);
  res.status(result.status).json(result.body);
});

module.exports = router;
