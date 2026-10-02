const express = require("express");
const { requireAuth } = require("../auth/routes");
const service = require("./service");

const router = express.Router();

router.post("/asset-upload-sessions", requireAuth, async (req, res) => {
  const result = await service.createUploadSession(req.body, req.auth.sub, req.get("Idempotency-Key"));
  res.status(result.status).json(result.body);
});

router.put("/asset-upload-sessions/:externalId/content", requireAuth, async (req, res) => {
  const result = await service.writeSessionBytes(req.params.externalId, req.auth.sub, null, req);
  res.status(result.status).json(result.body);
});

router.post("/asset-upload-sessions/:externalId/parts/:partNumber/grant", requireAuth, async (req, res) => {
  const partNumber = Number(req.params.partNumber);
  const result = await service.grantPartUpload(req.params.externalId, req.auth.sub, partNumber);
  res.status(result.status).json(result.body);
});

router.put("/asset-upload-sessions/:externalId/parts/:partNumber", requireAuth, async (req, res) => {
  const partNumber = Number(req.params.partNumber);
  if (!Number.isInteger(partNumber)) {
    req.resume();
    res.status(400).json({ error: "part number must be an integer" });
    return;
  }
  const result = await service.writeSessionBytes(req.params.externalId, req.auth.sub, partNumber, req);
  res.status(result.status).json(result.body);
});

router.post("/asset-upload-sessions/:externalId/complete", requireAuth, async (req, res) => {
  const result = await service.completeUploadSession(
    req.params.externalId,
    req.body && Object.keys(req.body).length > 0 ? req.body : {},
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

router.get("/asset-upload-sessions/:externalId", requireAuth, async (req, res) => {
  const result = await service.readUploadSession(req.params.externalId, req.auth.sub);
  res.status(result.status).json(result.body);
});

module.exports = router;
