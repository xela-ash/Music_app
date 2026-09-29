const pool = require("../../db/db");
const { validateIdempotencyKey, executeIdempotent } = require("../infrastructure/idempotency");
const { enqueueOutboxMessage } = require("../infrastructure/outbox");
const { hashRequest } = require("../infrastructure/canonical-json");
const { findActiveSellerWithProfile } = require("./repository");
const invitations = require("./invitation-repository");
const {
  invitationExternalIdIsValid,
  parseInviteBody,
  parseResponseBody,
  parseWithdrawBody,
  proposalHash,
} = require("./invitation-rules");
const {
  PROJECT_INVITE_SELLER,
  PROJECT_WITHDRAW_INVITATION,
  PROJECT_ACCEPT_INVITATION,
  PROJECT_DECLINE_INVITATION,
  PROJECT_REVIEW_INVITATION,
  authorize,
} = require("../authorization/authorize");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function publicInvitation(row, project) {
  return {
    external_id: row.external_id,
    project_id: row.project_id,
    project_external_id: project.external_id,
    inviter_user_id: row.inviter_user_id,
    invitee_user_id: row.invitee_user_id,
    proposal_version: row.proposal_version,
    proposal_hash: row.proposal_hash,
    status: row.status,
    expires_at: row.expires_at,
    decided_at: row.decided_at,
    withdrawn_at: row.withdrawn_at,
    version: row.version,
    project_version: project.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function publicProposal(project, milestones) {
  return {
    title: project.title,
    requirements: project.requirements,
    price_amount: project.price_amount,
    currency: project.currency,
    delivery_days: project.delivery_days,
    revision_limit: project.revision_limit,
    milestones: milestones.map((milestone) => ({
      milestone_no: milestone.milestone_no,
      title: milestone.title,
      description: milestone.description,
      amount: milestone.amount,
      currency: milestone.currency,
      due_at: milestone.due_at,
    })),
  };
}

async function writeAudit(client, { project, invitation, actorType, actorId, relationship, action, outcome, sourceState, targetState, aggregateVersion, idempotencyKey }) {
  const changeHash = hashRequest({
    action,
    invitation_external_id: invitation ? invitation.external_id : null,
    outcome,
    project_external_id: project.external_id,
    source_state: sourceState,
    target_state: targetState,
  });
  await invitations.insertAuditEvent(client, [
    invitations.makeAuditExternalId(),
    project.id,
    "AUD-PROJECTS-002",
    actorType,
    actorId,
    relationship,
    action,
    outcome,
    null,
    sourceState,
    targetState,
    aggregateVersion,
    null,
    idempotencyKey,
    changeHash,
  ]);
}

async function writeInvitationEvent(client, { project, invitation, outcome, actorType, aggregateVersion }) {
  await enqueueOutboxMessage(client, {
    eventType: outcome === "accepted" ? "SellerAccepted" : "SellerInvitationChanged",
    eventVersion: 1,
    aggregateType: "project",
    aggregateId: project.external_id,
    aggregateVersion,
    payload: {
      actor_type: actorType,
      expires_at: invitation.expires_at instanceof Date ? invitation.expires_at.toISOString() : invitation.expires_at,
      invitation_external_id: invitation.external_id,
      outcome,
      project_external_id: project.external_id,
      proposal_version: invitation.proposal_version,
    },
  });
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error(rollbackErr);
    }
    if (err && err.status && err.body) {
      return { status: err.status, body: err.body };
    }
    if (err && err.code === "23505") {
      return { status: 409, body: { error: "Invitation conflict" } };
    }
    if (err && err.code === "23514") {
      return { status: 400, body: { error: "Constraint violation" } };
    }
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  } finally {
    client.release();
  }
}

function concealed() {
  return { status: 404, body: { error: "Project not found" } };
}

function invitationConcealed() {
  return { status: 404, body: { error: "Invitation not found" } };
}

async function loadLockedProject(client, projectId) {
  const result = await invitations.lockProjectById(client, projectId);
  return result.rows[0] || null;
}

async function expireIfDue(client, project, invitation, idempotencyKey) {
  if (invitation.status !== "pending") {
    return { project, invitation, expiredNow: false };
  }
  const due = await invitations.expiryIsPast(client, invitation.expires_at);
  if (!due.rows[0].due) {
    return { project, invitation, expiredNow: false };
  }
  const bumped = await invitations.bumpProjectVersion(client, project.id, project.version);
  if (bumped.rows.length !== 1) {
    return { conflict: { status: 409, body: { error: "Project version is stale" } } };
  }
  const marked = await invitations.markInvitation(client, {
    id: invitation.id,
    status: "expired",
    decidedAt: new Date(),
    withdrawnAt: null,
    nextVersion: invitation.version + 1,
  });
  const nextProject = { ...project, version: bumped.rows[0].version };
  const nextInvitation = marked.rows[0];
  await writeAudit(client, {
    project: nextProject,
    invitation: nextInvitation,
    actorType: "system",
    actorId: "system",
    relationship: "system",
    action: "expire",
    outcome: "expired",
    sourceState: "pending",
    targetState: "expired",
    aggregateVersion: nextProject.version,
    idempotencyKey,
  });
  await writeInvitationEvent(client, {
    project: nextProject,
    invitation: nextInvitation,
    outcome: "expired",
    actorType: "system",
    aggregateVersion: nextProject.version,
  });
  return { project: nextProject, invitation: nextInvitation, expiredNow: true };
}

function sameTerminal(command, status) {
  return (
    (command === "accept" && status === "accepted") ||
    (command === "decline" && status === "declined") ||
    (command === "withdraw" && status === "withdrawn")
  );
}

async function inviteSeller(projectId, body, actorUserId, idempotencyKeyHeader) {
  if (!UUID_PATTERN.test(projectId)) {
    return { status: 400, body: { error: "projectId must be a valid UUID" } };
  }
  const parsed = parseInviteBody(body);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.error } };
  }
  const key = validateIdempotencyKey(idempotencyKeyHeader);
  if (!key.ok) {
    return { status: 400, body: { error: key.error } };
  }
  const command = parsed.value;

  return withTransaction(async (client) => {
    const project = await loadLockedProject(client, projectId);
    if (!project) {
      return concealed();
    }
    const invitee = await findActiveSellerWithProfile(client, command.inviteeUserId);
    const activeSeller = await invitations.findActiveSeller(client, project.id);
    const decision = authorize({ id: actorUserId }, PROJECT_INVITE_SELLER, {
      buyerUserId: project.buyer_user_id,
      state: project.state,
      inviteeUserId: command.inviteeUserId,
      inviteeEligible: invitee.rows.length > 0,
      hasActiveSeller: activeSeller.rows.length > 0,
    });
    if (!decision.allowed) {
      return { status: decision.status, body: { error: decision.error } };
    }
    if (project.seller_user_id && project.seller_user_id !== command.inviteeUserId) {
      return { status: 409, body: { error: "Project names a different seller" } };
    }

    const idempotent = await executeIdempotent(
      client,
      {
        actorType: "user",
        actorId: actorUserId,
        operation: "project.invite_seller",
        resourceRef: project.id,
        key: key.key,
        request: command,
      },
      async () => {
        if (project.version !== command.expectedVersion) {
          await writeAudit(client, {
            project,
            invitation: null,
            actorType: "user",
            actorId: actorUserId,
            relationship: "buyer",
            action: "invite",
            outcome: "stale_version",
            sourceState: project.state,
            targetState: project.state,
            aggregateVersion: project.version,
            idempotencyKey: key.key,
          });
          return { status: 409, body: { error: "Project version is stale" } };
        }
        const pending = await invitations.findPendingInvitation(client, project.id);
        if (pending.rows.length > 0) {
          return { status: 409, body: { error: "A pending invitation already exists" } };
        }
        const expiry = await invitations.expiryIsPast(client, command.expiresAt);
        if (expiry.rows[0].due) {
          return { status: 400, body: { error: "expires_at must be in the future" } };
        }
        const ready = await invitations.proposalIsReady(client, project.id);
        const readiness = ready.rows[0];
        if (
          project.state !== "draft" ||
          !project.title ||
          !project.requirements ||
          project.currency !== "INR" ||
          project.price_amount <= 0 ||
          readiness.milestone_count < 1 ||
          readiness.deadlines_future !== true
        ) {
          return { status: 409, body: { error: "Proposal is not ready for invitation" } };
        }
        const milestones = await invitations.listMilestonesForHash(client, project.id);
        const hash = proposalHash(project, milestones.rows);
        const inserted = await invitations.insertInvitation(client, [
          invitations.makeInvitationExternalId(),
          project.id,
          actorUserId,
          command.inviteeUserId,
          project.version,
          hash,
          command.expiresAt,
        ]);
        const bumped = await invitations.bumpProjectVersion(client, project.id, project.version);
        if (bumped.rows.length !== 1) {
          return { status: 409, body: { error: "Project version is stale" } };
        }
        const nextProject = { ...project, version: bumped.rows[0].version };
        const invitation = inserted.rows[0];
        await writeAudit(client, {
          project: nextProject,
          invitation,
          actorType: "user",
          actorId: actorUserId,
          relationship: "buyer",
          action: "invite",
          outcome: "pending",
          sourceState: null,
          targetState: "pending",
          aggregateVersion: nextProject.version,
          idempotencyKey: key.key,
        });
        await writeInvitationEvent(client, {
          project: nextProject,
          invitation,
          outcome: "pending",
          actorType: "user",
          aggregateVersion: nextProject.version,
        });
        return { status: 201, body: { invitation: publicInvitation(invitation, nextProject) } };
      }
    );
    return { status: idempotent.status, body: idempotent.body };
  });
}

async function reviewInvitation(projectId, invitationExternalId, actorUserId) {
  if (!UUID_PATTERN.test(projectId)) {
    return { status: 400, body: { error: "projectId must be a valid UUID" } };
  }
  if (!invitationExternalIdIsValid(invitationExternalId)) {
    return { status: 400, body: { error: "invitationId must be a valid invitation id" } };
  }
  return withTransaction(async (client) => {
    const project = await loadLockedProject(client, projectId);
    if (!project) {
      return concealed();
    }
    const locked = await invitations.lockInvitation(client, project.id, invitationExternalId);
    const invitation = locked.rows[0];
    if (!invitation) {
      return invitationConcealed();
    }
    const decision = authorize({ id: actorUserId }, PROJECT_REVIEW_INVITATION, {
      buyerUserId: project.buyer_user_id,
      inviteeUserId: invitation.invitee_user_id,
    });
    if (!decision.allowed) {
      return { status: decision.status, body: { error: decision.error } };
    }
    const expired = await expireIfDue(client, project, invitation, null);
    if (expired.conflict) {
      return expired.conflict;
    }
    const milestones = await invitations.listMilestonesForHash(client, project.id);
    return {
      status: 200,
      body: {
        invitation: publicInvitation(expired.invitation, expired.project),
        proposal: publicProposal(project, milestones.rows),
      },
    };
  });
}

async function respondToInvitation(projectId, invitationExternalId, body, actorUserId, idempotencyKeyHeader, commandName) {
  if (!UUID_PATTERN.test(projectId)) {
    return { status: 400, body: { error: "projectId must be a valid UUID" } };
  }
  if (!invitationExternalIdIsValid(invitationExternalId)) {
    return { status: 400, body: { error: "invitationId must be a valid invitation id" } };
  }
  const parsed = commandName === "withdraw" ? parseWithdrawBody(body) : parseResponseBody(body);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.error } };
  }
  const key = validateIdempotencyKey(idempotencyKeyHeader);
  if (!key.ok) {
    return { status: 400, body: { error: key.error } };
  }
  const command = parsed.value;
  const action = commandName === "accept"
    ? PROJECT_ACCEPT_INVITATION
    : commandName === "decline"
      ? PROJECT_DECLINE_INVITATION
      : PROJECT_WITHDRAW_INVITATION;

  return withTransaction(async (client) => {
    const project = await loadLockedProject(client, projectId);
    if (!project) {
      return concealed();
    }
    const locked = await invitations.lockInvitation(client, project.id, invitationExternalId);
    const invitation = locked.rows[0];
    if (!invitation) {
      return invitationConcealed();
    }
    const decision = authorize({ id: actorUserId }, action, {
      buyerUserId: project.buyer_user_id,
      inviteeUserId: invitation.invitee_user_id,
    });
    if (!decision.allowed) {
      return { status: decision.status, body: { error: decision.error } };
    }

    const operation = commandName === "accept"
      ? "project.accept_invitation"
      : commandName === "decline"
        ? "project.decline_invitation"
        : "project.withdraw_invitation";

    const idempotent = await executeIdempotent(
      client,
      {
        actorType: "user",
        actorId: actorUserId,
        operation,
        resourceRef: invitation.id,
        key: key.key,
        request: command,
      },
      async () => applyResponse(client, {
        project,
        invitation,
        command,
        commandName,
        actorUserId,
        idempotencyKey: key.key,
      })
    );
    return { status: idempotent.status, body: idempotent.body };
  });
}

async function applyResponse(client, { project, invitation, command, commandName, actorUserId, idempotencyKey }) {
  if (sameTerminal(commandName, invitation.status)) {
    return establishedResult(client, project, invitation);
  }
  if (invitation.status !== "pending") {
    await writeAudit(client, {
      project,
      invitation,
      actorType: "user",
      actorId: actorUserId,
      relationship: commandName === "withdraw" ? "buyer" : "invitee",
      action: commandName,
      outcome: "competing",
      sourceState: invitation.status,
      targetState: invitation.status,
      aggregateVersion: project.version,
      idempotencyKey,
    });
    return { status: 409, body: { error: "Invitation is no longer pending" } };
  }

  if (project.version !== command.expectedVersion) {
    await writeAudit(client, {
      project,
      invitation,
      actorType: "user",
      actorId: actorUserId,
      relationship: commandName === "withdraw" ? "buyer" : "invitee",
      action: commandName,
      outcome: "stale_version",
      sourceState: invitation.status,
      targetState: invitation.status,
      aggregateVersion: project.version,
      idempotencyKey,
    });
    return { status: 409, body: { error: "Project version is stale" } };
  }

  const expired = await expireIfDue(client, project, invitation, idempotencyKey);
  if (expired.conflict) {
    return expired.conflict;
  }
  if (expired.expiredNow) {
    return {
      status: 409,
      body: {
        error: "Invitation expired",
        invitation: publicInvitation(expired.invitation, expired.project),
      },
    };
  }

  if (expired.invitation.status !== "pending") {
    return {
      status: 409,
      body: {
        error: "Invitation expired",
        invitation: publicInvitation(expired.invitation, expired.project),
      },
    };
  }

  if (commandName !== "withdraw" && expired.invitation.proposal_version !== command.expectedProposalVersion) {
    await writeAudit(client, {
      project,
      invitation,
      actorType: "user",
      actorId: actorUserId,
      relationship: "invitee",
      action: commandName,
      outcome: "stale_proposal",
      sourceState: invitation.status,
      targetState: invitation.status,
      aggregateVersion: project.version,
      idempotencyKey,
    });
    return { status: 409, body: { error: "Proposal version does not match" } };
  }

  if (commandName === "accept") {
    const milestones = await invitations.listMilestonesForHash(client, project.id);
    const hash = proposalHash(project, milestones.rows);
    if (hash !== invitation.proposal_hash) {
      await writeAudit(client, {
        project,
        invitation,
        actorType: "user",
        actorId: actorUserId,
        relationship: "invitee",
        action: "accept",
        outcome: "stale_proposal",
        sourceState: "pending",
        targetState: "pending",
        aggregateVersion: project.version,
        idempotencyKey,
      });
      return { status: 409, body: { error: "Proposal changed since the invitation was created" } };
    }
    const activeSeller = await invitations.findActiveSeller(client, project.id);
    if (activeSeller.rows.length > 0) {
      return { status: 409, body: { error: "Invitation is no longer pending" } };
    }
    if (project.seller_user_id && project.seller_user_id !== invitation.invitee_user_id) {
      return { status: 409, body: { error: "Project names a different seller" } };
    }
  }

  const bumped = await invitations.bumpProjectVersion(client, project.id, project.version);
  if (bumped.rows.length !== 1) {
    return { status: 409, body: { error: "Project version is stale" } };
  }
  const nextVersion = bumped.rows[0].version;
  let participant = null;
  if (commandName === "accept") {
    const recorded = await invitations.recordAcceptanceOnProject(client, project.id, invitation.invitee_user_id);
    if (recorded.rows.length !== 1) {
      return { status: 409, body: { error: "Project names a different seller" } };
    }
    const inserted = await invitations.insertSellerParticipant(client, [
      invitations.makeParticipantExternalId(),
      project.id,
      invitation.invitee_user_id,
      invitation.id,
    ]);
    participant = inserted.rows[0];
  }

  const status = commandName === "accept" ? "accepted" : commandName === "decline" ? "declined" : "withdrawn";
  const marked = await invitations.markInvitation(client, {
    id: invitation.id,
    status,
    decidedAt: commandName === "withdraw" ? null : new Date(),
    withdrawnAt: commandName === "withdraw" ? new Date() : null,
    nextVersion: invitation.version + 1,
  });
  const nextProject = { ...project, version: nextVersion };
  const nextInvitation = marked.rows[0];
  await writeAudit(client, {
    project: nextProject,
    invitation: nextInvitation,
    actorType: "user",
    actorId: actorUserId,
    relationship: commandName === "withdraw" ? "buyer" : "invitee",
    action: commandName,
    outcome: status,
    sourceState: "pending",
    targetState: status,
    aggregateVersion: nextVersion,
    idempotencyKey,
  });
  await writeInvitationEvent(client, {
    project: nextProject,
    invitation: nextInvitation,
    outcome: status,
    actorType: "user",
    aggregateVersion: nextVersion,
  });
  const body = { invitation: publicInvitation(nextInvitation, nextProject) };
  if (participant) {
    body.participant = participant;
  }
  return { status: 200, body };
}

async function establishedResult(client, project, invitation) {
  const body = { invitation: publicInvitation(invitation, project) };
  if (invitation.status === "accepted") {
    const participant = await invitations.findSellerParticipantForInvitation(client, invitation.id);
    if (participant.rows[0]) {
      body.participant = participant.rows[0];
    }
  }
  return { status: 200, body };
}

function acceptInvitation(projectId, invitationExternalId, body, actorUserId, idempotencyKeyHeader) {
  return respondToInvitation(projectId, invitationExternalId, body, actorUserId, idempotencyKeyHeader, "accept");
}

function declineInvitation(projectId, invitationExternalId, body, actorUserId, idempotencyKeyHeader) {
  return respondToInvitation(projectId, invitationExternalId, body, actorUserId, idempotencyKeyHeader, "decline");
}

function withdrawInvitation(projectId, invitationExternalId, body, actorUserId, idempotencyKeyHeader) {
  return respondToInvitation(projectId, invitationExternalId, body, actorUserId, idempotencyKeyHeader, "withdraw");
}

module.exports = {
  inviteSeller,
  reviewInvitation,
  acceptInvitation,
  declineInvitation,
  withdrawInvitation,
};
