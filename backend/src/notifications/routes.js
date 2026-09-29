const express = require("express");
const { requireAuth } = require("../auth/routes");
const service = require("./service");

const router = express.Router();

router.get("/notifications", requireAuth, async (req, res) => {
  const result = await service.listNotifications(
    { id: req.auth.sub },
    req.query
  );
  res.status(result.status).json(result.body);
});

router.get("/notifications/:externalId", requireAuth, async (req, res) => {
  const result = await service.readNotification(
    { id: req.auth.sub },
    req.params.externalId
  );
  res.status(result.status).json(result.body);
});

router.post("/notifications/:externalId/mark-read", requireAuth, async (req, res) => {
  const result = await service.markNotificationRead(
    { id: req.auth.sub },
    req.params.externalId
  );
  res.status(result.status).json(result.body);
});

module.exports = router;
