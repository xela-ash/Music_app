const express = require("express");
const { requireAuth } = require("../auth/routes");
const service = require("./service");
const invitations = require("./invitation-service");
const transitions = require("./transition-service");
const amendments = require("./amendment-service");
const escrow = require("../escrow/service");

const router = express.Router();

router.post("/projects", requireAuth, async (req, res) => {
  const result = await service.createProject(req.body, req.auth.sub);
  res.status(result.status).json(result.body);
});

router.get("/projects", requireAuth, async (req, res) => {
  const result = await service.listProjects(req.auth.sub);
  res.status(result.status).json(result.body);
});

router.post("/projects/:projectId/propose", requireAuth, async (req, res) => {
  const result = await transitions.proposeProject(
    req.params.projectId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

router.post("/projects/:projectId/seek-seller", requireAuth, async (req, res) => {
  const result = await transitions.seekSeller(
    req.params.projectId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

router.post("/projects/:projectId/cancel", requireAuth, async (req, res) => {
  const result = await transitions.cancelProject(
    req.params.projectId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

router.post("/projects/:projectId/start", requireAuth, async (req, res) => {
  const result = await transitions.startProject(
    req.params.projectId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

router.post("/projects/:projectId/archive", requireAuth, async (req, res) => {
  const result = await transitions.archiveProject(
    req.params.projectId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

router.post("/projects/:projectId/restore", requireAuth, async (req, res) => {
  const result = await transitions.restoreProject(
    req.params.projectId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
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

router.post("/projects/:projectId/amendments", requireAuth, async (req, res) => {
  const result = await amendments.proposeAmendment(
    req.params.projectId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

router.post("/projects/:projectId/amendments/:amendmentId/accept", requireAuth, async (req, res) => {
  const result = await amendments.acceptAmendment(
    req.params.projectId,
    req.params.amendmentId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

router.post("/projects/:projectId/amendments/:amendmentId/reject", requireAuth, async (req, res) => {
  const result = await amendments.rejectAmendment(
    req.params.projectId,
    req.params.amendmentId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

router.post("/projects/:projectId/amendments/:amendmentId/withdraw", requireAuth, async (req, res) => {
  const result = await amendments.withdrawAmendment(
    req.params.projectId,
    req.params.amendmentId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

router.post("/projects/:projectId/funding-intent", requireAuth, async (req, res) => {
  const result = await escrow.createFundingIntent(
    req.params.projectId,
    req.body,
    req.auth.sub,
    req.get("Idempotency-Key")
  );
  res.status(result.status).json(result.body);
});

module.exports = router;
