const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  ensureMigrated,
  resetApplicationData,
  stopPool,
} = require("./harness");
const pool = require("../db/db");
const { applyMilestoneTransition } = require("../src/milestones/transition-service");
const { EDGES } = require("../src/milestones/transition-rules");

let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

describe("MVP-018 milestone transitions M01–M17", { concurrency: 1, timeout: 120000 }, () => {
  let baseUrl = "";
  let server;
  let buyer;
  let seller;

  before(async () => {
    ensureMigrated();
    await resetApplicationData();
    const { app } = require("../Index");
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
    buyer = await signup("buyer");
    seller = await signup("seller");
  });

  after(async () => {
    if (server) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    await resetApplicationData();
    await stopPool();
  });

  async function signup(role) {
    const tag = nextId(role);
    const email = `${tag}@example.com`;
    const created = await fetch(`${baseUrl}/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: "password-1",
        handle: `${tag}-handle`,
        first_name: "Ada",
        last_name: "Lovelace",
        artist_name: `${tag} Artist`,
        display_name: `${tag} Display`,
        genres: ["classical"],
        city: "Chennai",
        country: "IN",
      }),
    });
    assert.equal(created.status, 201);
    const body = await created.json();
    const loggedIn = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password-1" }),
    });
    assert.equal(loggedIn.status, 200);
    const session = await loggedIn.json();
    return { userId: body.user.id, token: session.token };
  }

  async function createAgreedProject(allowance) {
    const created = await fetch(`${baseUrl}/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${buyer.token}`,
      },
      body: JSON.stringify({
        seller_user_id: seller.userId,
        title: "Session",
        requirements: "Stems",
        price_amount: 100,
        delivery_days: 7,
        revision_limit: 0,
        milestones: [{
          title: "Only",
          amount: 100,
          due_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          revision_allowance: allowance,
          deliverable_definition: {
            required_deliverables: ["final_master_wav"],
            other_description: null,
          },
        }],
      }),
    });
    const text = await created.text();
    assert.equal(created.status, 201, text);
    const json = JSON.parse(text);
    const projectId = json.project.id;
    const milestone = json.milestones[0];
    await pool.query(
      `UPDATE project_milestones
       SET terms_status = 'frozen', current_term_version = 1
       WHERE id = $1`,
      [milestone.id]
    );
    await pool.query(
      `UPDATE project_milestones
       SET terms_status = 'agreed', current_term_version = 1
       WHERE id = $1`,
      [milestone.id]
    );
    await pool.query(
      "UPDATE projects SET state = 'funded'::project_state WHERE id = $1",
      [projectId]
    );
    await pool.query(
      `INSERT INTO project_participants (
         external_id, project_id, user_id, category, status, accepted_at
       )
       VALUES ($1, $2, $3, 'seller', 'active', clock_timestamp())`,
      [`ppt_${require("crypto").randomBytes(10).toString("hex")}`, projectId, seller.userId]
    );
    return { projectId, milestoneId: milestone.id };
  }

  function money(eventId, extra) {
    return {
      event_id: eventId,
      amount: 100,
      currency: "INR",
      currency_exponent: 2,
      term_version: 1,
      ...extra,
    };
  }

  async function move(milestoneId, action, actor, facts, version) {
    return applyMilestoneTransition({
      projectId: (await pool.query("SELECT project_id FROM project_milestones WHERE id = $1", [milestoneId])).rows[0].project_id,
      milestoneId,
      action,
      actorType: actor.type,
      actorId: actor.id,
      expectedVersion: version,
      idempotencyKey: actor.type === "user" ? facts.key : undefined,
      facts,
    });
  }

  it("records M01 on create and rejects an unlisted or client-chosen edge", async () => {
    const { milestoneId } = await createAgreedProject(1);
    const created = await pool.query(
      `SELECT trigger_type, source_state, target_state
       FROM milestone_state_transitions
       WHERE milestone_id = $1 AND trigger_type = 'project.milestone.create'`,
      [milestoneId]
    );
    assert.equal(created.rows.length, 1);
    assert.equal(created.rows[0].source_state, null);
    assert.equal(created.rows[0].target_state, "planned");
    const audit = await pool.query(
      `SELECT event_type FROM project_audit_events
       WHERE action = 'project.milestone.create'
         AND change_hash IS NOT NULL`
    );
    assert.ok(audit.rows.some((row) => row.event_type === "AUD-PROJECTS-007"));

    await assert.rejects(
      pool.query("UPDATE project_milestones SET state = 'funded' WHERE id = $1", [milestoneId]),
      /transition service/
    );
    const unlisted = await move(milestoneId, "milestone.start", { type: "user", id: seller.userId }, { key: "start-too-soon" }, 1);
    assert.equal(unlisted.status, 409);
    assert.equal(unlisted.body.error, "Invalid milestone transition");
    const chosen = await move(
      milestoneId,
      "escrow.allocation_funded",
      { type: "system", id: "system" },
      money("fund-chosen", { target_state: "released" }),
      1
    );
    assert.equal(chosen.status, 409);
    assert.equal(chosen.body.error, "Clients cannot choose a milestone state");
    assert.equal(EDGES.filter((edge) => edge.from.includes("planned") && edge.to === "in_progress").length, 0);
  });

  it("walks funding, start, delivery, revision, approval, and release", async () => {
    const { milestoneId } = await createAgreedProject(1);
    const stale = await move(milestoneId, "escrow.allocation_funded", { type: "system", id: "system" }, money("fund-1"), 99);
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, "Milestone version is stale");
    const funded = await move(milestoneId, "escrow.allocation_funded", { type: "system", id: "system" }, money("fund-1"), 1);
    assert.equal(funded.status, 200, JSON.stringify(funded.body));
    assert.equal(funded.body.milestone.state, "funded");
    assert.equal(funded.body.milestone.version, 2);
    const again = await move(milestoneId, "escrow.allocation_funded", { type: "system", id: "system" }, money("fund-1"), 2);
    assert.equal(again.status, 200);
    assert.equal(again.body.duplicate, true);

    const buyerStart = await move(milestoneId, "milestone.start", { type: "user", id: buyer.userId }, { key: "buyer-start" }, 2);
    assert.equal(buyerStart.status, 409);
    const started = await move(milestoneId, "milestone.start", { type: "user", id: seller.userId }, { key: "seller-start" }, 2);
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.equal(started.body.milestone.state, "in_progress");

    const unsafe = await move(milestoneId, "delivery.ready", { type: "system", id: "system" }, money("sub-bad", { submission_ref: "sub-1", ready: false, safe: true }), 3);
    assert.equal(unsafe.status, 409);
    assert.equal(unsafe.body.error, "Milestone fact does not match");
    const delivered = await move(milestoneId, "delivery.ready", { type: "system", id: "system" }, money("evt-deliver-1", { submission_ref: "sub-1", ready: true, safe: true }), 3);
    assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
    assert.equal(delivered.body.milestone.state, "delivered");
    const deliveryRow = await pool.query(
      `SELECT source_fact_id FROM milestone_state_transitions
       WHERE milestone_id = $1 AND trigger_type = 'delivery.ready'`,
      [milestoneId]
    );
    assert.deepEqual(deliveryRow.rows.map((row) => row.source_fact_id), ["sub-1"]);

    const blank = await move(milestoneId, "delivery.request_revision", { type: "user", id: buyer.userId }, { key: "rev-blank", submission_ref: "sub-1", reason_code: "", detail: "louder" }, 4);
    assert.equal(blank.status, 409);
    const revised = await move(milestoneId, "delivery.request_revision", { type: "user", id: buyer.userId }, { key: "rev-1", submission_ref: "sub-1", reason_code: "mix", detail: "louder" }, 4);
    assert.equal(revised.status, 200, JSON.stringify(revised.body));
    assert.equal(revised.body.milestone.state, "in_progress");
    const resubmitted = await move(milestoneId, "delivery.ready", { type: "system", id: "system" }, money("evt-deliver-2", { submission_ref: "sub-2", ready: true, safe: true }), 5);
    assert.equal(resubmitted.status, 200, JSON.stringify(resubmitted.body));
    const exhausted = await move(milestoneId, "delivery.request_revision", { type: "user", id: buyer.userId }, { key: "rev-2", submission_ref: "sub-2", reason_code: "mix", detail: "again" }, 6);
    assert.equal(exhausted.status, 409);
    assert.equal(exhausted.body.error, "Revision allowance is exhausted");

    const approved = await move(milestoneId, "project.delivery.approve", { type: "user", id: buyer.userId }, { key: "approve-1", submission_ref: "sub-2" }, 6);
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.milestone.state, "buyer_approved");
    const releaseSignal = await pool.query(
      `SELECT payload FROM outbox_messages
       WHERE event_type = 'EVT-PROJECTS-010' AND aggregate_id = (
         SELECT external_id FROM project_milestones WHERE id = $1
       )`,
      [milestoneId]
    );
    assert.equal(releaseSignal.rows.length, 1);
    assert.equal(releaseSignal.rows[0].payload.submission_ref, "sub-2");
    assert.match(releaseSignal.rows[0].payload.approval_id, /^map_[0-9a-f]{20}$/);
    assert.equal(releaseSignal.rows[0].payload.amount, 100);
    const revisionAudit = await pool.query(
      `SELECT reason_code, change_hash FROM project_audit_events
       WHERE action = 'delivery.request_revision' AND project_id = (
         SELECT project_id FROM project_milestones WHERE id = $1
       )`,
      [milestoneId]
    );
    assert.equal(revisionAudit.rows[0].reason_code, "mix");
    assert.equal(JSON.stringify(revisionAudit.rows[0]).includes("louder"), false);
    const released = await move(milestoneId, "escrow.allocation_released", { type: "system", id: "system" }, money("release-1"), 7);
    assert.equal(released.status, 200, JSON.stringify(released.body));
    assert.equal(released.body.milestone.state, "released");
    const after = await move(milestoneId, "escrow.refund_confirmed", { type: "system", id: "system" }, money("refund-after-release"), 8);
    assert.equal(after.status, 409);
    assert.equal(after.body.error, "Invalid milestone transition");
  });

  it("covers reversal, dispute, suspension, cancellation, and refund edges", async () => {
    const reversed = await createAgreedProject(0);
    let version = 1;
    let moved = await move(reversed.milestoneId, "escrow.allocation_funded", { type: "system", id: "system" }, money("rev-fund"), version);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    version = moved.body.milestone.version;
    moved = await move(reversed.milestoneId, "escrow.funding_reversed", { type: "system", id: "system" }, { event_id: "rev-back" }, version);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.milestone.state, "planned");

    const refunded = await createAgreedProject(0);
    moved = await move(refunded.milestoneId, "escrow.allocation_funded", { type: "system", id: "system" }, money("refund-fund"), 1);
    moved = await move(refunded.milestoneId, "escrow.refund_confirmed", { type: "system", id: "system" }, money("refund-1"), moved.body.milestone.version);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.milestone.state, "refunded");

    const disputed = await createAgreedProject(0);
    moved = await move(disputed.milestoneId, "escrow.allocation_funded", { type: "system", id: "system" }, money("disp-fund"), 1);
    moved = await move(disputed.milestoneId, "dispute.open", { type: "system", id: "system" }, { event_id: "case-1" }, moved.body.milestone.version);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.milestone.state, "disputed");
    assert.equal(moved.body.milestone.resume_state, "funded");
    moved = await move(disputed.milestoneId, "dispute.resolve", { type: "system", id: "system" }, { event_id: "case-1-resolve", resume_state: "funded" }, moved.body.milestone.version);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.milestone.state, "funded");

    const settled = await createAgreedProject(0);
    moved = await move(settled.milestoneId, "escrow.allocation_funded", { type: "system", id: "system" }, money("set-fund"), 1);
    moved = await move(settled.milestoneId, "dispute.open", { type: "system", id: "system" }, { event_id: "case-2" }, moved.body.milestone.version);
    moved = await move(settled.milestoneId, "dispute.settle", { type: "system", id: "system" }, money("case-2-settle", { outcome: "cancelled" }), moved.body.milestone.version);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.milestone.state, "cancelled");
    moved = await move(settled.milestoneId, "escrow.refund_after_cancel", { type: "system", id: "system" }, money("case-2-refund"), moved.body.milestone.version);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.milestone.state, "refunded");

    const suspended = await createAgreedProject(0);
    moved = await move(suspended.milestoneId, "milestone.suspend", { type: "system", id: "system" }, { event_id: "sus-1", reason: "MODERATION" }, 1);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.milestone.state, "suspended");
    assert.equal(moved.body.milestone.resume_state, "planned");
    moved = await move(suspended.milestoneId, "milestone.restore_from_suspension", { type: "system", id: "system" }, { event_id: "sus-1-restore" }, moved.body.milestone.version);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.milestone.state, "planned");

    const cancelledFromHold = await createAgreedProject(0);
    moved = await move(cancelledFromHold.milestoneId, "milestone.suspend", { type: "system", id: "system" }, { event_id: "sus-2", reason: "CANCELLATION_PENDING" }, 1);
    moved = await move(cancelledFromHold.milestoneId, "escrow.suspension_settled", { type: "system", id: "system" }, { event_id: "sus-2-cancel", outcome: "cancelled" }, moved.body.milestone.version);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.milestone.state, "cancelled");

    const cancelled = await createAgreedProject(0);
    moved = await move(cancelled.milestoneId, "project.cancel_milestone", { type: "system", id: "system" }, { event_id: "cancel-1", funds_held: false }, 1);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.milestone.state, "cancelled");

    const reversedLate = await createAgreedProject(0);
    moved = await move(reversedLate.milestoneId, "escrow.allocation_funded", { type: "system", id: "system" }, money("late-fund"), 1);
    moved = await move(reversedLate.milestoneId, "milestone.start", { type: "user", id: seller.userId }, { key: "late-start" }, moved.body.milestone.version);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    moved = await move(reversedLate.milestoneId, "escrow.funding_reversed", { type: "system", id: "system" }, { event_id: "late-reverse" }, moved.body.milestone.version);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.milestone.state, "suspended");
    assert.equal(moved.body.milestone.resume_state, "in_progress");

    const refundInProgress = await createAgreedProject(0);
    moved = await move(refundInProgress.milestoneId, "escrow.allocation_funded", { type: "system", id: "system" }, money("rip-fund"), 1);
    moved = await move(refundInProgress.milestoneId, "milestone.start", { type: "user", id: seller.userId }, { key: "rip-start" }, moved.body.milestone.version);
    moved = await move(refundInProgress.milestoneId, "escrow.refund_confirmed", { type: "system", id: "system" }, money("rip-refund"), moved.body.milestone.version);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.milestone.state, "refunded");

    const held = await createAgreedProject(0);
    moved = await move(held.milestoneId, "escrow.allocation_funded", { type: "system", id: "system" }, money("hold-fund"), 1);
    moved = await move(held.milestoneId, "dispute.open", { type: "system", id: "system" }, { event_id: "hold-open" }, moved.body.milestone.version);
    const blockedRelease = await move(held.milestoneId, "escrow.allocation_released", { type: "system", id: "system" }, money("hold-release"), moved.body.milestone.version);
    assert.equal(blockedRelease.status, 409);
    assert.equal(blockedRelease.body.error, "Invalid milestone transition");
    const wrongResume = await move(held.milestoneId, "dispute.resolve", { type: "system", id: "system" }, { event_id: "hold-wrong", resume_state: "planned" }, moved.body.milestone.version);
    assert.equal(wrongResume.status, 409);
    const restored = await move(held.milestoneId, "dispute.resolve", { type: "system", id: "system" }, { event_id: "hold-right", resume_state: "funded" }, moved.body.milestone.version);
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal(restored.body.milestone.state, "funded");

    const draft = await fetch(`${baseUrl}/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${buyer.token}`,
      },
      body: JSON.stringify({
        seller_user_id: seller.userId,
        title: "Unfunded",
        requirements: "Stems",
        price_amount: 100,
        delivery_days: 7,
        revision_limit: 0,
        milestones: [{
          title: "Only",
          amount: 100,
          due_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          revision_allowance: 0,
          deliverable_definition: {
            required_deliverables: ["final_master_wav"],
            other_description: null,
          },
        }],
      }),
    });
    const draftJson = await draft.json();
    assert.equal(draft.status, 201);
    moved = await move(draftJson.milestones[0].id, "project.cancel_milestone", { type: "system", id: "system" }, { event_id: "cancel-draft", funds_held: false }, 1);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.milestone.state, "cancelled");
  });
});
