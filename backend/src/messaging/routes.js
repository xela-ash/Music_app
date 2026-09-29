const express = require("express");
const { requireAuth } = require("../auth/routes");
const service = require("./service");

const router = express.Router();

router.post("/projects/:projectExternalId/messages", requireAuth, async (req, res) => {
  const result = await service.sendMessage(
    req.params.projectExternalId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

router.get("/projects/:projectExternalId/messages", requireAuth, async (req, res) => {
  const result = await service.listMessages(
    req.params.projectExternalId,
    req.auth.sub,
    req.query
  );
  res.status(result.status).json(result.body);
});

router.post(
  "/projects/:projectExternalId/messages/:messageExternalId/tombstone",
  requireAuth,
  async (req, res) => {
    const result = await service.tombstoneMessage(
      req.params.projectExternalId,
      req.params.messageExternalId,
      req.auth.sub,
      req.get("Idempotency-Key")
    );
    res.status(result.status).json(result.body);
  }
);

module.exports = router;
