const express = require("express");
const { requireAuth } = require("../auth/routes");
const service = require("./service");

const router = express.Router();

router.post("/verifications", requireAuth, async (req, res) => {
  const result = await service.submitVerification(req.auth.sub, req.body, req.get("X-Correlation-Id"));
  res.status(result.status).json(result.body);
});

router.get("/verifications", requireAuth, async (req, res) => {
  const result = await service.listReviewQueue(req.auth.sub, req.query);
  res.status(result.status).json(result.body);
});

router.get("/verifications/me", requireAuth, async (req, res) => {
  const result = await service.readOwnVerification(req.auth.sub);
  res.status(result.status).json(result.body);
});

router.get("/verifications/access/:token", requireAuth, async (req, res) => {
  const result = await service.redeemDocumentAccess(
    req.auth.sub,
    req.params.token,
    req.get("X-Correlation-Id")
  );
  if (result.headers) {
    res.status(result.status);
    for (const [name, value] of Object.entries(result.headers)) {
      res.set(name, value);
    }
    res.send(result.body);
    return;
  }
  res.status(result.status).json(result.body);
});

router.get("/verifications/:externalId", requireAuth, async (req, res) => {
  const result = await service.readVerification(req.auth.sub, req.params.externalId);
  res.status(result.status).json(result.body);
});

router.post("/verifications/:externalId/decision", requireAuth, async (req, res) => {
  const result = await service.decideVerification(
    req.auth.sub,
    req.params.externalId,
    req.body,
    req.get("X-Correlation-Id")
  );
  res.status(result.status).json(result.body);
});

router.post("/verifications/:externalId/documents/:documentExternalId/access", requireAuth, async (req, res) => {
  const result = await service.createDocumentAccess(
    req.auth.sub,
    req.params.externalId,
    req.params.documentExternalId
  );
  res.status(result.status).json(result.body);
});

module.exports = router;
