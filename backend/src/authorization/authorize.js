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
// Self-dealing on create is part of check 2's action: the actor cannot also
// be the named seller. Invitation and acceptance (SEC-AUTHZ-007) are not
// decided here.

const PROJECT_CREATE = "project.create";
const PROJECT_LIST = "project.list";
const PROJECT_LOCK_MILESTONES = "project.lock_milestones";

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

function isProjectParticipant(actor, project) {
  return project.buyer_user_id === actor.id || project.seller_user_id === actor.id;
}

function authorizeProjectList(actor, resource) {
  if (resource == null) {
    return allow({ scope: "participant" });
  }
  if (isProjectParticipant(actor, resource)) {
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
  return deny(403, "Forbidden");
}

module.exports = {
  PROJECT_CREATE,
  PROJECT_LIST,
  PROJECT_LOCK_MILESTONES,
  authorize,
};
