const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  NOTIFICATION_LIST,
  NOTIFICATION_MARK_READ,
  NOTIFICATION_READ,
  PROJECT_CREATE,
  PROJECT_LIST,
  PROJECT_LOCK_MILESTONES,
  authorize,
} = require("../src/authorization/authorize");
const projectsRepository = require("../src/projects/repository");

const BUYER = "11111111-1111-4111-8111-111111111111";
const SELLER = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

function actor(id, extra) {
  return { id, ...extra };
}

describe("authorize project.create (BR-AUTHZ-024)", () => {
  it("denies self-dealing before seller eligibility", () => {
    const decision = authorize(actor(BUYER), PROJECT_CREATE, {
      sellerUserId: BUYER,
      sellerEligible: false,
    });
    assert.deepEqual(decision, {
      allowed: false,
      status: 400,
      error: "You cannot start a project with yourself",
    });
  });

  it("denies a seller who is missing or not an active user with a profile", () => {
    const decision = authorize(actor(BUYER), PROJECT_CREATE, {
      sellerUserId: SELLER,
      sellerEligible: false,
    });
    assert.deepEqual(decision, {
      allowed: false,
      status: 404,
      error: "Seller not found",
    });
  });

  it("allows an eligible seller and derives the buyer from the actor", () => {
    const decision = authorize(actor(BUYER), PROJECT_CREATE, {
      sellerUserId: SELLER,
      sellerEligible: true,
      buyerUserId: OUTSIDER,
    });
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.obligations, { buyerUserId: BUYER });
  });
});

describe("authorize project.list (BR-AUTHZ-023)", () => {
  const project = { buyer_user_id: BUYER, seller_user_id: SELLER };

  it("allows the list action with the participant SQL the repository must run", () => {
    const decision = authorize(actor(BUYER), PROJECT_LIST, null);
    assert.equal(decision.allowed, true);
    assert.equal(decision.obligations.scope, "participant");
    assert.equal(
      decision.obligations.whereSql,
      "pr.buyer_user_id = $1 OR EXISTS (SELECT 1 FROM project_participants pp WHERE pp.project_id = pr.id AND pp.user_id = $1 AND pp.category = 'seller' AND pp.status = 'active')"
    );
    assert.deepEqual(decision.obligations.params, [BUYER]);
  });

  it("allows the buyer and an accepted seller, and denies a named seller without acceptance", () => {
    assert.equal(authorize(actor(BUYER), PROJECT_LIST, project).allowed, true);
    assert.equal(authorize(actor(SELLER), PROJECT_LIST, project).allowed, false);
    assert.equal(
      authorize(actor(SELLER), PROJECT_LIST, { ...project, active_seller_user_id: SELLER }).allowed,
      true
    );
  });

  it("runs that obligation SQL and rejects a different scope", async () => {
    const decision = authorize(actor(BUYER), PROJECT_LIST, null);
    let captured;
    const db = {
      query(sql, params) {
        captured = { sql, params };
        return Promise.resolve({ rows: [] });
      },
    };
    await projectsRepository.listProjectsForParticipant(db, decision.obligations);
    assert.match(captured.sql, /project_participants pp/);
    assert.match(captured.sql, /pp\.category = 'seller'/);
    assert.deepEqual(captured.params, [BUYER]);
    assert.throws(
      () =>
        projectsRepository.listProjectsForParticipant(db, {
          scope: "participant",
          whereSql: "true",
          params: [BUYER],
        }),
      /participant scope from authorize/
    );
  });

  it("conceals the project from a non-participant", () => {
    assert.deepEqual(authorize(actor(OUTSIDER), PROJECT_LIST, project), {
      allowed: false,
      status: 404,
      error: "Project not found",
    });
  });
});

describe("authorize project.lock_milestones (Authorization §14.3)", () => {
  const draft = {
    buyer_user_id: BUYER,
    seller_user_id: SELLER,
    state: "draft",
    milestones_locked_at: null,
  };

  it("returns the same 404 when the project is missing or the actor is not the buyer", () => {
    const missing = authorize(actor(BUYER), PROJECT_LOCK_MILESTONES, null);
    const seller = authorize(actor(SELLER), PROJECT_LOCK_MILESTONES, draft);
    const outsider = authorize(actor(OUTSIDER), PROJECT_LOCK_MILESTONES, draft);
    for (const decision of [missing, seller, outsider]) {
      assert.deepEqual(decision, {
        allowed: false,
        status: 404,
        error: "Project not found",
      });
    }
  });

  it("denies an already-locked project with 409, including when the state is not draft", () => {
    const locked = {
      ...draft,
      milestones_locked_at: "2026-09-28T00:00:00.000Z",
      state: "accepted",
    };
    assert.deepEqual(authorize(actor(BUYER), PROJECT_LOCK_MILESTONES, locked), {
      allowed: false,
      status: 409,
      error: "Project milestones are already locked",
    });
  });

  it("denies a non-draft unlocked project with the existing 400", () => {
    assert.deepEqual(
      authorize(actor(BUYER), PROJECT_LOCK_MILESTONES, { ...draft, state: "accepted" }),
      {
        allowed: false,
        status: 400,
        error: "Only draft projects can lock milestones",
      }
    );
  });

  it("allows the buyer to lock a draft project that is not yet locked", () => {
    assert.deepEqual(authorize(actor(BUYER), PROJECT_LOCK_MILESTONES, draft), {
      allowed: true,
      obligations: {},
    });
  });
});

describe("authorize notification read (REQ-NOTIFICATIONS-006, BR-NOTIFICATIONS-002, SEC-NOTIFICATIONS-001)", () => {
  it("lists only the actor's recipient scope", () => {
    assert.deepEqual(authorize(actor(BUYER), NOTIFICATION_LIST, null), {
      allowed: true,
      obligations: { recipientUserId: BUYER },
    });
  });

  it("allows the recipient to read and mark their own notification", () => {
    const resource = { recipientUserId: BUYER };
    assert.deepEqual(authorize(actor(BUYER), NOTIFICATION_READ, resource), {
      allowed: true,
      obligations: {},
    });
    assert.deepEqual(authorize(actor(BUYER), NOTIFICATION_MARK_READ, resource), {
      allowed: true,
      obligations: {},
    });
  });

  it("conceals another user's notification and a missing notification", () => {
    assert.deepEqual(
      authorize(actor(OUTSIDER), NOTIFICATION_READ, { recipientUserId: BUYER }),
      { allowed: false, status: 404, error: "Notification not found" }
    );
    assert.deepEqual(authorize(actor(BUYER), NOTIFICATION_MARK_READ, null), {
      allowed: false,
      status: 404,
      error: "Notification not found",
    });
  });
});

describe("authorize fail-closed defaults (BR-AUTHZ-003, BR-AUTHZ-005)", () => {
  it("denies a missing principal", () => {
    assert.deepEqual(authorize(null, PROJECT_LIST, null), {
      allowed: false,
      status: 401,
      error: "Unauthorized",
    });
    assert.deepEqual(authorize({ id: "" }, PROJECT_CREATE, {}), {
      allowed: false,
      status: 401,
      error: "Unauthorized",
    });
  });

  it("denies an action that has no policy", () => {
    assert.deepEqual(authorize(actor(BUYER), "escrow.release", {}), {
      allowed: false,
      status: 403,
      error: "Forbidden",
    });
  });

  it("does not apply account status; Authentication denies that before authorize runs", () => {
    const decision = authorize(
      actor(BUYER, { status: "suspended" }),
      PROJECT_LOCK_MILESTONES,
      {
        buyer_user_id: BUYER,
        state: "draft",
        milestones_locked_at: null,
      }
    );
    assert.equal(decision.allowed, true);
  });
});
