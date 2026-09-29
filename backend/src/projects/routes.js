const express = require("express");
const { requireAuth } = require("../auth/routes");
const service = require("./service");
const invitations = require("./invitation-service");

const router = express.Router();

router.post("/projects", requireAuth, async (req, res) => {
  const result = await service.createProject(req.body, req.auth.sub);
  res.status(result.status).json(result.body);
});

router.get("/projects", requireAuth, async (req, res) => {
  const result = await service.listProjects(req.auth.sub);
  res.status(result.status).json(result.body);
});

router.post("/projects/:projectId/invitations", requireAuth, async (req, res) => {
  const result = await invitations.inviteSeller(
    req.params.projectId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

router.get("/projects/:projectId/invitations/:invitationId", requireAuth, async (req, res) => {
  const result = await invitations.reviewInvitation(
    req.params.projectId,
    req.params.invitationId,
    req.auth.sub
  );
  res.status(result.status).json(result.body);
});

router.post("/projects/:projectId/invitations/:invitationId/accept", requireAuth, async (req, res) => {
  const result = await invitations.acceptInvitation(
    req.params.projectId,
    req.params.invitationId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

router.post("/projects/:projectId/invitations/:invitationId/decline", requireAuth, async (req, res) => {
  const result = await invitations.declineInvitation(
    req.params.projectId,
    req.params.invitationId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

router.post("/projects/:projectId/invitations/:invitationId/withdraw", requireAuth, async (req, res) => {
  const result = await invitations.withdrawInvitation(
    req.params.projectId,
    req.params.invitationId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

module.exports = router;
