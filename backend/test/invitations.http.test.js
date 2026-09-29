const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  ensureMigrated,
  resetApplicationData,
  startServer,
  closeServer,
  stopPool,
} = require("./harness");
const pool = require("../db/db");

let baseUrl = "";
let server;
let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function futureIso(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

const STABLE_EXPIRY = futureIso(7);

async function request(method, requestPath, { token, body, idempotencyKey } = {}) {
  const headers = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (idempotencyKey) {
    headers["idempotency-key"] = idempotencyKey;
  }
  let payload;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers,
    body: payload,
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: response.status, json, text };
}

function profileInput(tag) {
  return {
    handle: `${tag}-handle`,
    first_name: "Ada",
    last_name: "Lovelace",
    artist_name: `${tag} Artist`,
    display_name: `${tag} Display`,
    genres: ["classical"],
    city: "Chennai",
    country: "IN",
  };
}

async function signupAndLogin(tag) {
  const email = `${tag}@example.com`;
  const created = await request("POST", "/auth/signup", {
    body: { email, password: "password-1", ...profileInput(tag) },
  });
  assert.equal(created.status, 201, created.text);
  const loggedIn = await request("POST", "/auth/login", {
    body: { email, password: "password-1" },
  });
  assert.equal(loggedIn.status, 200, loggedIn.text);
  return { userId: created.json.user.id, token: loggedIn.json.token };
}

function projectBody(sellerUserId) {
  return {
    seller_user_id: sellerUserId,
    title: "Session",
    requirements: "Stems",
    price_amount: 100,
    delivery_days: 7,
    milestones: [{ title: "Only", amount: 100, due_at: futureIso(30) }],
  };
}

async function createProject(buyer, seller) {
  const created = await request("POST", "/projects", {
    token: buyer.token,
    body: projectBody(seller.userId),
  });
  assert.equal(created.status, 201, created.text);
  return created.json.project;
}

async function invite(buyer, project, seller, key, extra) {
  return request("POST", `/projects/${project.id}/invitations`, {
    token: buyer.token,
    idempotencyKey: key,
    body: {
      invitee_user_id: seller.userId,
      expires_at: STABLE_EXPIRY,
      expected_version: project.version,
      ...extra,
    },
  });
}

function responseBody(invitation) {
  return {
    expected_version: invitation.project_version,
    expected_proposal_version: invitation.proposal_version,
  };
}

async function participantCount(projectId, category) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM project_participants
     WHERE project_id = $1 AND category = $2::project_participant_category AND status = 'active'`,
    [projectId, category]
  );
  return result.rows[0].count;
}

async function auditCount(projectId, action, outcome) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM project_audit_events
     WHERE project_id = $1 AND action = $2 AND outcome = $3`,
    [projectId, action, outcome]
  );
  return result.rows[0].count;
}

describe("MVP-014 seller invitations", { concurrency: 1, timeout: 30000 }, () => {
  before(async () => {
    ensureMigrated();
    await resetApplicationData();
    const started = await startServer();
    server = started.server;
    baseUrl = started.baseUrl;
  });

  after(async () => {
    try {
      if (server) {
        await closeServer(server);
      }
      await resetApplicationData();
    } finally {
      await stopPool();
    }
  });

  it("keeps a named seller out of the project until that seller accepts", async () => {
    const buyer = await signupAndLogin(nextId("buyer"));
    const seller = await signupAndLogin(nextId("seller"));
    const project = await createProject(buyer, seller);
    assert.equal(await participantCount(project.id, "buyer"), 1);
    assert.equal(await participantCount(project.id, "seller"), 0);

    const sellerList = await request("GET", "/projects", { token: seller.token });
    assert.equal(sellerList.status, 200);
    assert.deepEqual(sellerList.json, { projects: [] });

    const invited = await invite(buyer, project, seller, "invite-accept-1");
    assert.equal(invited.status, 201, invited.text);
    assert.equal(invited.json.invitation.status, "pending");
    assert.equal(await participantCount(project.id, "seller"), 0);

    const replay = await invite(buyer, project, seller, "invite-accept-1");
    assert.equal(replay.status, 201);
    assert.deepEqual(replay.json, invited.json);

    const accepted = await request(
      "POST",
      `/projects/${project.id}/invitations/${invited.json.invitation.external_id}/accept`,
      {
        token: seller.token,
        idempotencyKey: "accept-1",
        body: responseBody(invited.json.invitation),
      }
    );
    assert.equal(accepted.status, 200, accepted.text);
    assert.equal(accepted.json.invitation.status, "accepted");
    assert.equal(accepted.json.participant.category, "seller");
    assert.equal(accepted.json.participant.status, "active");

    const acceptedAgain = await request(
      "POST",
      `/projects/${project.id}/invitations/${invited.json.invitation.external_id}/accept`,
      {
        token: seller.token,
        idempotencyKey: "accept-1",
        body: responseBody(invited.json.invitation),
      }
    );
    assert.deepEqual(acceptedAgain.json, accepted.json);
    assert.equal(await participantCount(project.id, "seller"), 1);
    assert.equal(await auditCount(project.id, "accept", "accepted"), 1);

    const stored = await pool.query(
      `SELECT state, seller_user_id, accepted_at IS NOT NULL AS accepted
       FROM projects WHERE id = $1`,
      [project.id]
    );
    assert.equal(stored.rows[0].state, "draft");
    assert.equal(stored.rows[0].seller_user_id, seller.userId);
    assert.equal(stored.rows[0].accepted, true);

    const sellerListAfter = await request("GET", "/projects", { token: seller.token });
    assert.equal(sellerListAfter.json.projects.length, 1);
    assert.equal(sellerListAfter.json.projects[0].id, project.id);
  });

  it("returns the established decline and withdraw outcomes without a second effect", async () => {
    const buyer = await signupAndLogin(nextId("buyer-dec"));
    const seller = await signupAndLogin(nextId("seller-dec"));
    const other = await signupAndLogin(nextId("seller-wd"));
    const declinedProject = await createProject(buyer, seller);
    const declinedInvite = await invite(buyer, declinedProject, seller, "invite-decline");
    assert.equal(declinedInvite.status, 201, declinedInvite.text);
    const declinePath = `/projects/${declinedProject.id}/invitations/${declinedInvite.json.invitation.external_id}/decline`;
    const declined = await request("POST", declinePath, {
      token: seller.token,
      idempotencyKey: "decline-1",
      body: responseBody(declinedInvite.json.invitation),
    });
    assert.equal(declined.status, 200, declined.text);
    assert.equal(declined.json.invitation.status, "declined");
    const declinedReplay = await request("POST", declinePath, {
      token: seller.token,
      idempotencyKey: "decline-2",
      body: {
        expected_version: declined.json.invitation.project_version,
        expected_proposal_version: declined.json.invitation.proposal_version,
      },
    });
    assert.equal(declinedReplay.status, 200, declinedReplay.text);
    assert.equal(declinedReplay.json.invitation.status, "declined");
    assert.equal(await participantCount(declinedProject.id, "seller"), 0);
    assert.equal(await auditCount(declinedProject.id, "decline", "declined"), 1);

    const withdrawnProject = await createProject(buyer, other);
    const withdrawnInvite = await invite(buyer, withdrawnProject, other, "invite-withdraw");
    assert.equal(withdrawnInvite.status, 201, withdrawnInvite.text);
    const withdrawPath = `/projects/${withdrawnProject.id}/invitations/${withdrawnInvite.json.invitation.external_id}/withdraw`;
    const withdrawn = await request("POST", withdrawPath, {
      token: buyer.token,
      idempotencyKey: "withdraw-1",
      body: { expected_version: withdrawnInvite.json.invitation.project_version },
    });
    assert.equal(withdrawn.status, 200, withdrawn.text);
    assert.equal(withdrawn.json.invitation.status, "withdrawn");
    const withdrawnReplay = await request("POST", withdrawPath, {
      token: buyer.token,
      idempotencyKey: "withdraw-1",
      body: { expected_version: withdrawnInvite.json.invitation.project_version },
    });
    assert.deepEqual(withdrawnReplay.json, withdrawn.json);
    assert.equal(await participantCount(withdrawnProject.id, "seller"), 0);
    assert.equal(await auditCount(withdrawnProject.id, "withdraw", "withdrawn"), 1);
  });

  it("expires a due invitation once and refuses acceptance afterward", async () => {
    const buyer = await signupAndLogin(nextId("buyer-exp"));
    const seller = await signupAndLogin(nextId("seller-exp"));
    const project = await createProject(buyer, seller);
    const invited = await invite(buyer, project, seller, "invite-expire");
    assert.equal(invited.status, 201, invited.text);
    await pool.query(
      `UPDATE project_invitations
       SET expires_at = created_at + interval '1 millisecond'
       WHERE external_id = $1`,
      [invited.json.invitation.external_id]
    );
    const path = `/projects/${project.id}/invitations/${invited.json.invitation.external_id}`;
    const reviewed = await request("GET", path, { token: seller.token });
    assert.equal(reviewed.status, 200, reviewed.text);
    assert.equal(reviewed.json.invitation.status, "expired");
    assert.equal(reviewed.json.proposal.title, "Session");
    const reviewedAgain = await request("GET", path, { token: seller.token });
    assert.equal(reviewedAgain.json.invitation.status, "expired");
    assert.equal(await auditCount(project.id, "expire", "expired"), 1);

    const accepted = await request("POST", `${path}/accept`, {
      token: seller.token,
      idempotencyKey: "accept-expired",
      body: {
        expected_version: reviewed.json.invitation.project_version,
        expected_proposal_version: reviewed.json.invitation.proposal_version,
      },
    });
    assert.equal(accepted.status, 409);
    assert.equal(accepted.json.error, "Invitation is no longer pending");
    assert.equal(await participantCount(project.id, "seller"), 0);
  });

  it("denies the wrong actor, a suspended invitee, and a second pending invitation", async () => {
    const buyer = await signupAndLogin(nextId("buyer-authz"));
    const seller = await signupAndLogin(nextId("seller-authz"));
    const outsider = await signupAndLogin(nextId("outsider-authz"));
    const project = await createProject(buyer, seller);
    const invited = await invite(buyer, project, seller, "invite-authz");
    assert.equal(invited.status, 201, invited.text);
    const path = `/projects/${project.id}/invitations/${invited.json.invitation.external_id}`;

    const sellerInvite = await invite(seller, project, outsider, "seller-cannot-invite");
    assert.equal(sellerInvite.status, 404);

    const outsiderReview = await request("GET", path, { token: outsider.token });
    assert.equal(outsiderReview.status, 404);
    assert.deepEqual(outsiderReview.json, { error: "Invitation not found" });

    const buyerAccept = await request("POST", `${path}/accept`, {
      token: buyer.token,
      idempotencyKey: "buyer-accept",
      body: responseBody(invited.json.invitation),
    });
    assert.equal(buyerAccept.status, 404);

    const self = await invite(buyer, project, buyer, "self-invite");
    assert.equal(self.status, 400);
    assert.equal(self.json.error, "You cannot invite yourself");

    const second = await request("POST", `/projects/${project.id}/invitations`, {
      token: buyer.token,
      idempotencyKey: "second-pending",
      body: {
        invitee_user_id: seller.userId,
        expires_at: futureIso(8),
        expected_version: invited.json.invitation.project_version,
      },
    });
    assert.equal(second.status, 409);
    assert.equal(second.json.error, "A pending invitation already exists");

    await pool.query("UPDATE users SET status = 'suspended'::user_status WHERE id = $1", [seller.userId]);
    const suspended = await request("POST", `${path}/accept`, {
      token: seller.token,
      idempotencyKey: "suspended-accept",
      body: responseBody(invited.json.invitation),
    });
    assert.equal(suspended.status, 401);
    const anonymous = await request("POST", `${path}/decline`, {
      idempotencyKey: "anon",
      body: responseBody(invited.json.invitation),
    });
    assert.equal(anonymous.status, 401);
  });

  it("rejects a stale project version, a changed proposal, and a reused idempotency key", async () => {
    const buyer = await signupAndLogin(nextId("buyer-stale"));
    const seller = await signupAndLogin(nextId("seller-stale"));
    const project = await createProject(buyer, seller);
    const missingKey = await request("POST", `/projects/${project.id}/invitations`, {
      token: buyer.token,
      body: {
        invitee_user_id: seller.userId,
        expires_at: futureIso(7),
        expected_version: project.version,
      },
    });
    assert.equal(missingKey.status, 400);

    const stale = await invite(buyer, project, seller, "stale-version", { expected_version: 99 });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.error, "Project version is stale");

    const invited = await invite(buyer, project, seller, "invite-stale");
    assert.equal(invited.status, 201, invited.text);
    const mismatch = await request("POST", `/projects/${project.id}/invitations`, {
      token: buyer.token,
      idempotencyKey: "invite-stale",
      body: {
        invitee_user_id: seller.userId,
        expires_at: futureIso(9),
        expected_version: project.version,
      },
    });
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.json.error, "Idempotency-Key was already used with a different request");

    await pool.query("UPDATE projects SET title = 'Changed' WHERE id = $1", [project.id]);
    const changed = await request(
      "POST",
      `/projects/${project.id}/invitations/${invited.json.invitation.external_id}/accept`,
      {
        token: seller.token,
        idempotencyKey: "accept-changed",
        body: responseBody(invited.json.invitation),
      }
    );
    assert.equal(changed.status, 409);
    assert.equal(changed.json.error, "Proposal changed since the invitation was created");
    assert.equal(await participantCount(project.id, "seller"), 0);

    await pool.query("UPDATE projects SET state = 'accepted'::project_state WHERE id = $1", [project.id]);
    const other = await signupAndLogin(nextId("seller-state"));
    const blocked = await createProject(buyer, other);
    await pool.query("UPDATE projects SET state = 'funded'::project_state WHERE id = $1", [blocked.id]);
    const notDraft = await invite(buyer, blocked, other, "not-draft");
    assert.equal(notDraft.status, 409);
    assert.equal(notDraft.json.error, "Proposal is not ready for invitation");
  });

  it("lets exactly one of accept and withdraw win", async () => {
    const buyer = await signupAndLogin(nextId("buyer-race"));
    const seller = await signupAndLogin(nextId("seller-race"));
    const project = await createProject(buyer, seller);
    const invited = await invite(buyer, project, seller, "invite-race");
    assert.equal(invited.status, 201, invited.text);
    const path = `/projects/${project.id}/invitations/${invited.json.invitation.external_id}`;
    const [accepted, withdrawn] = await Promise.all([
      request("POST", `${path}/accept`, {
        token: seller.token,
        idempotencyKey: "race-accept",
        body: responseBody(invited.json.invitation),
      }),
      request("POST", `${path}/withdraw`, {
        token: buyer.token,
        idempotencyKey: "race-withdraw",
        body: { expected_version: invited.json.invitation.project_version },
      }),
    ]);
    const statuses = [accepted.json.invitation && accepted.json.invitation.status, withdrawn.json.invitation && withdrawn.json.invitation.status]
      .filter(Boolean);
    assert.equal(new Set(statuses).size, 1);
    const winner = statuses[0];
    assert.ok(winner === "accepted" || winner === "withdrawn");
    const loser = accepted.status === 409 ? accepted : withdrawn.status === 409 ? withdrawn : null;
    assert.ok(loser);
    assert.equal(loser.json.error, "Invitation is no longer pending");
    assert.equal(await participantCount(project.id, "seller"), winner === "accepted" ? 1 : 0);
    const row = await pool.query("SELECT status FROM project_invitations WHERE external_id = $1", [
      invited.json.invitation.external_id,
    ]);
    assert.equal(row.rows[0].status, winner);
  });
});
