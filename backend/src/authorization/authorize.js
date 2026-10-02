// Shared authorization decision for the rules that already exist on protected
// routes. Authentication (requireAuth / requireLiveStatus) runs before this
// function. Account-status denial stays there (BR-AUTHZ-005) and is not
// repeated here.
//
// The five migrated checks, named by the repository lines in Authorization
// §30.2 and §31.1:
// 1. project.create seller eligibility — active user with a profile, else 404
// 2. project.create buyer identity — server-derived from the actor
// 3. project.list participant scope — buyer or seller
// 4. project.lock_milestones buyer relationship — concealing 404
// 5. project.lock_milestones state — already locked 409, then non-draft 400
//
// Messaging (BR-AUTHZ-014, BR-AUTHZ-015, Messaging §7 and §11):
// conversation.read and conversation.send allow the live Buyer or the active
// accepted Seller. message.tombstone additionally requires the original sender.
// A stale or unrelated actor receives the same concealing 404. Account status
// stays in requireAuth.
//
// Self-dealing on create is part of check 2's action: the actor cannot also
// be the named seller. A named seller_user_id is not an active Seller
// (BR-AUTHZ-032, SEC-AUTHZ-007). Active Seller access is an accepted
// participant, carried on the project as active_seller_user_id.

const PROJECT_CREATE = "project.create";
const PROJECT_LIST = "project.list";
const PROJECT_LOCK_MILESTONES = "project.lock_milestones";
const PROJECT_INVITE_SELLER = "project.invite_seller";
const PROJECT_WITHDRAW_INVITATION = "project.withdraw_invitation";
const PROJECT_ACCEPT_INVITATION = "project.accept_invitation";
const PROJECT_DECLINE_INVITATION = "project.decline_invitation";
const PROJECT_REVIEW_INVITATION = "project.review_invitation";
const NOTIFICATION_LIST = "notification.list";
const NOTIFICATION_READ = "notification.read";
const NOTIFICATION_MARK_READ = "notification.mark_read";
const CONVERSATION_READ = "conversation.read";
const CONVERSATION_SEND = "conversation.send";
const MESSAGE_TOMBSTONE = "message.tombstone";
const ROLE_ASSIGN = "role.assign";
const ROLE_REVOKE = "role.revoke";

function participantWhereSql(alias) {
  return `${alias}.buyer_user_id = $1 OR EXISTS (SELECT 1 FROM project_participants pp WHERE pp.project_id = ${alias}.id AND pp.user_id = $1 AND pp.category = 'seller' AND pp.status = 'active')`;
}

function isProjectParticipant(actorId, project) {
  return project.buyer_user_id === actorId || project.active_seller_user_id === actorId;
}

function deny(status, error) {
  return { allowed: false, status, error };
}

function allow(obligations) {
  return { allowed: true, obligations: obligations ?? {} };
}

function actorId(actor) {
  if (!actor || typeof actor.id !== "string" || actor.id.length === 0) {
    return null;
  }
  return actor.id;
}

function authorizeProjectCreate(actor, resource) {
  const sellerUserId = resource && resource.sellerUserId;
  if (sellerUserId === actor.id) {
    return deny(400, "You cannot start a project with yourself");
  }
  if (!resource || resource.sellerEligible !== true) {
    return deny(404, "Seller not found");
  }
  return allow({ buyerUserId: actor.id });
}

function authorizeProjectList(actor, resource) {
  if (resource == null) {
    return allow({
      scope: "participant",
      whereSql: participantWhereSql("pr"),
      params: [actor.id],
    });
  }
  if (isProjectParticipant(actor.id, resource)) {
    return allow();
  }
  return deny(404, "Project not found");
}

function authorizeLockMilestones(actor, project) {
  if (!project || project.buyer_user_id !== actor.id) {
    return deny(404, "Project not found");
  }
  if (project.milestones_locked_at !== null) {
    return deny(409, "Project milestones are already locked");
  }
  if (project.state !== "draft") {
    return deny(400, "Only draft projects can lock milestones");
  }
  return allow();
}

function authorizeInviteSeller(actor, resource) {
  if (!resource || resource.buyerUserId !== actor.id) {
    return deny(404, "Project not found");
  }
  if (resource.inviteeUserId === actor.id) {
    return deny(400, "You cannot invite yourself");
  }
  if (resource.inviteeEligible !== true) {
    return deny(404, "Seller not found");
  }
  if (resource.hasActiveSeller === true) {
    return deny(409, "An accepted seller already exists");
  }
  return allow();
}

function authorizeWithdrawInvitation(actor, resource) {
  if (!resource || resource.buyerUserId !== actor.id) {
    return deny(404, "Invitation not found");
  }
  return allow();
}

function authorizeInviteeCommand(actor, resource) {
  if (!resource || resource.inviteeUserId !== actor.id) {
    return deny(404, "Invitation not found");
  }
  return allow();
}

function authorizeReviewInvitation(actor, resource) {
  if (!resource || (resource.buyerUserId !== actor.id && resource.inviteeUserId !== actor.id)) {
    return deny(404, "Invitation not found");
  }
  return allow();
}

function authorizeNotificationList(actor) {
  return allow({ recipientUserId: actor.id });
}

function authorizeOwnNotification(actor, resource) {
  if (!resource || resource.recipientUserId !== actor.id) {
    return deny(404, "Notification not found");
  }
  return allow();
}

function isLiveMessagingParticipant(actorId, resource) {
  if (!resource) {
    return false;
  }
  return resource.buyerUserId === actorId || resource.activeSellerUserId === actorId;
}

function authorizeConversation(actor, resource) {
  if (!isLiveMessagingParticipant(actor.id, resource)) {
    return deny(404, "Project not found");
  }
  return allow();
}

function hasActiveAdministrator(resource) {
  const roles = resource && resource.activePlatformRoles;
  return Array.isArray(roles) && roles.includes("administrator");
}

function authorizeRoleCommand(resource) {
  if (!hasActiveAdministrator(resource)) {
    return deny(403, "Forbidden");
  }
  return deny(403, "step-up required");
}

function authorizeTombstone(actor, resource) {
  if (!isLiveMessagingParticipant(actor.id, resource)) {
    return deny(404, "Project not found");
  }
  if (!resource || resource.senderUserId !== actor.id) {
    return deny(403, "Forbidden");
  }
  return allow();
}

function authorize(actor, action, resource) {
  const id = actorId(actor);
  if (!id) {
    return deny(401, "Unauthorized");
  }
  const principal = { id };

  if (action === PROJECT_CREATE) {
    return authorizeProjectCreate(principal, resource);
  }
  if (action === PROJECT_LIST) {
    return authorizeProjectList(principal, resource);
  }
  if (action === PROJECT_LOCK_MILESTONES) {
    return authorizeLockMilestones(principal, resource);
  }
  if (action === PROJECT_INVITE_SELLER) {
    return authorizeInviteSeller(principal, resource);
  }
  if (action === PROJECT_WITHDRAW_INVITATION) {
    return authorizeWithdrawInvitation(principal, resource);
  }
  if (action === PROJECT_ACCEPT_INVITATION || action === PROJECT_DECLINE_INVITATION) {
    return authorizeInviteeCommand(principal, resource);
  }
  if (action === PROJECT_REVIEW_INVITATION) {
    return authorizeReviewInvitation(principal, resource);
  }
  if (action === NOTIFICATION_LIST) {
    return authorizeNotificationList(principal);
  }
  if (action === NOTIFICATION_READ || action === NOTIFICATION_MARK_READ) {
    return authorizeOwnNotification(principal, resource);
  }
  if (action === CONVERSATION_READ || action === CONVERSATION_SEND) {
    return authorizeConversation(principal, resource);
  }
  if (action === MESSAGE_TOMBSTONE) {
    return authorizeTombstone(principal, resource);
  }
  if (action === ROLE_ASSIGN || action === ROLE_REVOKE) {
    return authorizeRoleCommand(resource);
  }
  return deny(403, "Forbidden");
}

module.exports = {
  PROJECT_CREATE,
  PROJECT_LIST,
  PROJECT_LOCK_MILESTONES,
  PROJECT_INVITE_SELLER,
  PROJECT_WITHDRAW_INVITATION,
  PROJECT_ACCEPT_INVITATION,
  PROJECT_DECLINE_INVITATION,
  PROJECT_REVIEW_INVITATION,
  NOTIFICATION_LIST,
  NOTIFICATION_READ,
  NOTIFICATION_MARK_READ,
  CONVERSATION_READ,
  CONVERSATION_SEND,
  MESSAGE_TOMBSTONE,
  ROLE_ASSIGN,
  ROLE_REVOKE,
  participantWhereSql,
  authorize,
};
