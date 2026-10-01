const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const {
  ensureMigrated,
  resetApplicationData,
  stopPool,
} = require("./harness");
const pool = require("../db/db");
const { hashRequest } = require("../src/infrastructure/canonical-json");
const { applyMilestoneTransition } = require("../src/milestones/transition-service");

let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

const BLOCKING_PREDECESSOR = ["planned", "funded", "in_progress", "delivered", "disputed", "suspended"];
const RESOLVED_PREDECESSOR = ["buyer_approved", "released", "refunded", "cancelled"];

describe("MVP-019 milestone activation", { concurrency: 1, timeout: 120000 }, () => {
  let baseUrl = "";
  let server;
  let buyer;
  let seller;
  let stranger;

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
    stranger = await signup("stranger");
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

  async function createAgreedProject(count, options = {}) {
    const milestones = [];
    for (let index = 0; index < count; index += 1) {
      milestones.push({
        title: `Milestone ${index + 1}`,
        amount: 100,
        due_at: new Date(Date.now() + (30 + index) * 24 * 60 * 60 * 1000).toISOString(),
        revision_allowance: 0,
        deliverable_definition: {
          required_deliverables: ["final_master_wav"],
          other_description: null,
        },
      });
    }
    const created = await fetch(`${baseUrl}/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${buyer.token}`,
      },
      body: JSON.stringify({
        seller_user_id: seller.userId,
        title: "Activation",
        requirements: "Masters",
        price_amount: 100 * count,
        delivery_days: 7,
        revision_limit: 0,
        milestones,
      }),
    });
    const text = await created.text();
    assert.equal(created.status, 201, text);
    const json = JSON.parse(text);
    const projectId = json.project.id;
    if (options.agree !== false) {
      await pool.query(
        `UPDATE project_milestones
         SET terms_status = 'frozen', current_term_version = 1
         WHERE project_id = $1`,
        [projectId]
      );
      await pool.query(
        `UPDATE project_milestones
         SET terms_status = 'agreed', current_term_version = 1
         WHERE project_id = $1`,
        [projectId]
      );
    }
    await pool.query(
      "UPDATE projects SET state = 'funded'::project_state WHERE id = $1",
      [projectId]
    );
    const invitation = await pool.query(
      `INSERT INTO project_invitations (
         external_id, project_id, inviter_user_id, invitee_user_id,
         proposal_version, proposal_hash, status, expires_at, decided_at
       )
       VALUES ($1, $2, $3, $4, 1, $5, 'accepted', clock_timestamp() + interval '1 day', clock_timestamp())
       RETURNING id`,
      [
        `inv_${crypto.randomBytes(10).toString("hex")}`,
        projectId,
        buyer.userId,
        seller.userId,
        "ab".repeat(32),
      ]
    );
    await pool.query(
      `INSERT INTO project_participants (
         external_id, project_id, user_id, category, status, source_invitation_id, accepted_at
       )
       VALUES ($1, $2, $3, 'seller', 'active', $4, clock_timestamp())`,
      [
        `ppt_${crypto.randomBytes(10).toString("hex")}`,
        projectId,
        seller.userId,
        invitation.rows[0].id,
      ]
    );
    const stored = await pool.query(
      `SELECT id, external_id, milestone_no, version
       FROM project_milestones
       WHERE project_id = $1
       ORDER BY milestone_no`,
      [projectId]
    );
    return { projectId, milestones: stored.rows };
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
    const project = await pool.query(
      "SELECT project_id FROM project_milestones WHERE id = $1",
      [milestoneId]
    );
    return applyMilestoneTransition({
      projectId: project.rows[0].project_id,
      milestoneId,
      action,
      actorType: actor.type,
      actorId: actor.id,
      expectedVersion: version,
      idempotencyKey: actor.type === "user" ? facts.key : undefined,
      facts,
    });
  }

  const sellerActor = () => ({ type: "user", id: seller.userId });
  const buyerActor = () => ({ type: "user", id: buyer.userId });
  const systemActor = () => ({ type: "system", id: "system" });

  async function succeed(milestoneId, action, actor, facts, version) {
    const result = await move(milestoneId, action, actor, facts, version);
    assert.equal(result.status, 200, `${action} ${JSON.stringify(result.body)}`);
    return result.body.milestone.version;
  }

  async function putPredecessor(milestoneId, state) {
    if (state === "planned") {
      return 1;
    }
    if (state === "cancelled") {
      return succeed(
        milestoneId,
        "project.cancel_milestone",
        systemActor(),
        { event_id: nextId("cancel"), funds_held: false },
        1
      );
    }
    let version = await succeed(
      milestoneId,
      "escrow.allocation_funded",
      systemActor(),
      money(nextId("fund")),
      1
    );
    if (state === "funded") {
      return version;
    }
    if (state === "refunded") {
      return succeed(
        milestoneId,
        "escrow.refund_confirmed",
        systemActor(),
        money(nextId("refund")),
        version
      );
    }
    if (state === "disputed") {
      return succeed(
        milestoneId,
        "dispute.open",
        systemActor(),
        { event_id: nextId("dispute") },
        version
      );
    }
    if (state === "suspended") {
      return succeed(
        milestoneId,
        "milestone.suspend",
        systemActor(),
        { event_id: nextId("suspend"), reason: "ADMIN_RISK" },
        version
      );
    }
    version = await succeed(
      milestoneId,
      "milestone.start",
      sellerActor(),
      { key: nextId("start") },
      version
    );
    if (state === "in_progress") {
      return version;
    }
    const submission = nextId("sub");
    version = await succeed(
      milestoneId,
      "delivery.ready",
      systemActor(),
      money(nextId("ready"), { submission_ref: submission, ready: true, safe: true }),
      version
    );
    if (state === "delivered") {
      return version;
    }
    version = await succeed(
      milestoneId,
      "project.delivery.approve",
      buyerActor(),
      { key: nextId("approve"), submission_ref: submission },
      version
    );
    if (state === "buyer_approved") {
      return version;
    }
    return succeed(
      milestoneId,
      "escrow.allocation_released",
      systemActor(),
      money(nextId("release")),
      version
    );
  }

  async function fund(milestoneId, version) {
    return succeed(
      milestoneId,
      "escrow.allocation_funded",
      systemActor(),
      money(nextId("fund")),
      version
    );
  }

  async function withFlag(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('musicapp.milestone_transition', 'on', true)");
      await fn(client);
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The statement that failed already aborted the transaction.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  it("lets the accepted seller start the first funded milestone and records the predecessor set", async () => {
    const { milestones } = await createAgreedProject(1);
    const milestone = milestones[0];
    const funded = await fund(milestone.id, 1);
    const started = await move(
      milestone.id,
      "milestone.start",
      sellerActor(),
      { key: "start-first" },
      funded
    );
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.equal(started.body.milestone.state, "in_progress");
    const row = await pool.query(
      "SELECT state, started_at FROM project_milestones WHERE id = $1",
      [milestone.id]
    );
    assert.equal(row.rows[0].state, "in_progress");
    assert.ok(row.rows[0].started_at);
    const audit = await pool.query(
      `SELECT event_type, change_hash FROM project_audit_events
       WHERE action = 'milestone.start' AND project_id = (
         SELECT project_id FROM project_milestones WHERE id = $1
       )`,
      [milestone.id]
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].event_type, "AUD-PROJECTS-010");
    assert.equal(audit.rows[0].change_hash, hashRequest({
      action: "milestone.start",
      milestone_id: milestone.external_id,
      predecessor_set: [],
      source: "funded",
      submission_ref: null,
      target: "in_progress",
      term_version: 1,
    }));
    const outbox = await pool.query(
      `SELECT event_type FROM outbox_messages
       WHERE event_type = 'EVT-PROJECTS-009' AND aggregate_id = $1`,
      [milestone.external_id]
    );
    assert.equal(outbox.rows.length, 1);
    const replay = await move(
      milestone.id,
      "milestone.start",
      sellerActor(),
      { key: "start-first" },
      funded
    );
    assert.equal(replay.status, 200);
    assert.equal(replay.body.milestone.state, "in_progress");
    const starts = await pool.query(
      `SELECT count(*)::int AS count FROM milestone_state_transitions
       WHERE milestone_id = $1 AND trigger_type = 'milestone.start'`,
      [milestone.id]
    );
    assert.equal(starts.rows[0].count, 1);
  });

  it("rejects start while a predecessor is planned, funded, in_progress, delivered, disputed, or suspended", async () => {
    for (const state of BLOCKING_PREDECESSOR) {
      const { milestones } = await createAgreedProject(2);
      await putPredecessor(milestones[0].id, state);
      const successorVersion = await fund(milestones[1].id, 1);
      const started = await move(
        milestones[1].id,
        "milestone.start",
        sellerActor(),
        { key: nextId("blocked") },
        successorVersion
      );
      assert.equal(started.status, 409, state);
      assert.equal(started.body.error, "Milestone predecessors are not resolved", state);
      const successor = await pool.query(
        "SELECT state FROM project_milestones WHERE id = $1",
        [milestones[1].id]
      );
      assert.equal(successor.rows[0].state, "funded", state);
    }
  });

  it("allows start when every predecessor is buyer_approved, released, refunded, or cancelled", async () => {
    for (const state of RESOLVED_PREDECESSOR) {
      const { milestones } = await createAgreedProject(2);
      await putPredecessor(milestones[0].id, state);
      const successorVersion = await fund(milestones[1].id, 1);
      const started = await move(
        milestones[1].id,
        "milestone.start",
        sellerActor(),
        { key: nextId("allowed") },
        successorVersion
      );
      assert.equal(started.status, 200, `${state} ${JSON.stringify(started.body)}`);
      assert.equal(started.body.milestone.state, "in_progress", state);
      if (state === "cancelled") {
        const audit = await pool.query(
          `SELECT change_hash FROM project_audit_events
           WHERE action = 'milestone.start' AND project_id = (
             SELECT project_id FROM project_milestones WHERE id = $1
           )`,
          [milestones[1].id]
        );
        assert.equal(audit.rows[0].change_hash, hashRequest({
          action: "milestone.start",
          milestone_id: milestones[1].external_id,
          predecessor_set: [{
            external_id: milestones[0].external_id,
            milestone_no: Number(milestones[0].milestone_no),
            state: "cancelled",
          }],
          source: "funded",
          submission_ref: null,
          target: "in_progress",
          term_version: 1,
        }));
      }
    }
  });

  it("rejects start while another milestone is in_progress or delivered", async () => {
    for (const activeState of ["in_progress", "delivered"]) {
      const { milestones } = await createAgreedProject(2);
      await fund(milestones[0].id, 1);
      await fund(milestones[1].id, 1);
      await withFlag(async (client) => {
        await client.query(
          "UPDATE project_milestones SET state = 'in_progress', started_at = clock_timestamp() WHERE id = $1",
          [milestones[1].id]
        );
        if (activeState === "delivered") {
          await client.query(
            "UPDATE project_milestones SET state = 'delivered', delivered_at = clock_timestamp() WHERE id = $1",
            [milestones[1].id]
          );
        }
      });
      const started = await move(
        milestones[0].id,
        "milestone.start",
        sellerActor(),
        { key: nextId("active") },
        2
      );
      assert.equal(started.status, 409, activeState);
      assert.equal(started.body.error, "Another milestone is already active", activeState);
      const earlier = await pool.query(
        "SELECT state FROM project_milestones WHERE id = $1",
        [milestones[0].id]
      );
      assert.equal(earlier.rows[0].state, "funded", activeState);
    }
  });

  it("rejects a second active milestone at the database", async () => {
    const { milestones } = await createAgreedProject(2);
    await fund(milestones[0].id, 1);
    await fund(milestones[1].id, 1);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('musicapp.milestone_transition', 'on', true)");
      await client.query(
        "UPDATE project_milestones SET state = 'in_progress' WHERE id = $1",
        [milestones[0].id]
      );
      await assert.rejects(
        client.query(
          "UPDATE project_milestones SET state = 'in_progress' WHERE id = $1",
          [milestones[1].id]
        ),
        /project_milestones_one_active/
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    const states = await pool.query(
      "SELECT state FROM project_milestones WHERE id = ANY($1::uuid[]) ORDER BY milestone_no",
      [[milestones[0].id, milestones[1].id]]
    );
    assert.deepEqual(states.rows.map((row) => row.state), ["funded", "funded"]);
  });

  it("denies the buyer, an unrelated user, an ended seller, and a non-active account", async () => {
    const { projectId, milestones } = await createAgreedProject(1);
    const version = await fund(milestones[0].id, 1);
    const buyerStart = await move(
      milestones[0].id,
      "milestone.start",
      buyerActor(),
      { key: nextId("buyer") },
      version
    );
    assert.equal(buyerStart.status, 409);
    assert.equal(buyerStart.body.error, "Invalid milestone transition");
    const strangerStart = await move(
      milestones[0].id,
      "milestone.start",
      { type: "user", id: stranger.userId },
      { key: nextId("stranger") },
      version
    );
    assert.equal(strangerStart.status, 409);
    assert.equal(strangerStart.body.error, "Invalid milestone transition");
    await pool.query(
      "UPDATE project_participants SET status = 'ended' WHERE project_id = $1 AND user_id = $2",
      [projectId, seller.userId]
    );
    const ended = await move(
      milestones[0].id,
      "milestone.start",
      sellerActor(),
      { key: nextId("ended") },
      version
    );
    assert.equal(ended.status, 409);
    assert.equal(ended.body.error, "Invalid milestone transition");
    await pool.query(
      "UPDATE project_participants SET status = 'active' WHERE project_id = $1 AND user_id = $2",
      [projectId, seller.userId]
    );
    for (const status of ["suspended", "deleted"]) {
      await pool.query("UPDATE users SET status = $2::user_status WHERE id = $1", [seller.userId, status]);
      try {
        const denied = await move(
          milestones[0].id,
          "milestone.start",
          sellerActor(),
          { key: nextId(status) },
          version
        );
        assert.equal(denied.status, 409, status);
        assert.equal(denied.body.error, "Invalid milestone transition", status);
      } finally {
        await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [seller.userId]);
      }
    }
    const allowed = await move(
      milestones[0].id,
      "milestone.start",
      sellerActor(),
      { key: nextId("restored") },
      version
    );
    assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
  });

  it("lets exactly one of two concurrent start commands win", async () => {
    const { milestones } = await createAgreedProject(2);
    const firstVersion = await fund(milestones[0].id, 1);
    const secondVersion = await fund(milestones[1].id, 1);
    const [first, second] = await Promise.all([
      move(milestones[0].id, "milestone.start", sellerActor(), { key: nextId("race-a") }, firstVersion),
      move(milestones[1].id, "milestone.start", sellerActor(), { key: nextId("race-b") }, secondVersion),
    ]);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(second.status, 409, JSON.stringify(second.body));
    assert.equal(second.body.error, "Milestone predecessors are not resolved");
    const same = await createAgreedProject(1);
    const version = await fund(same.milestones[0].id, 1);
    const [winner, loser] = await Promise.all([
      move(same.milestones[0].id, "milestone.start", sellerActor(), { key: nextId("same-a") }, version),
      move(same.milestones[0].id, "milestone.start", sellerActor(), { key: nextId("same-b") }, version),
    ]);
    const outcomes = [winner, loser].map((result) => result.status).sort();
    assert.deepEqual(outcomes, [200, 409]);
    const rejected = [winner, loser].find((result) => result.status === 409);
    assert.equal(rejected.body.error, "Milestone version is stale");
    const starts = await pool.query(
      `SELECT count(*)::int AS count FROM milestone_state_transitions
       WHERE milestone_id = $1 AND trigger_type = 'milestone.start'`,
      [same.milestones[0].id]
    );
    assert.equal(starts.rows[0].count, 1);
  });

  it("rejects start when the project is interrupted, not startable, or the milestone terms are not agreed", async () => {
    const interrupted = await createAgreedProject(1);
    const interruptedVersion = await fund(interrupted.milestones[0].id, 1);
    await pool.query(
      "UPDATE projects SET state = 'disputed', resume_state = 'funded' WHERE id = $1",
      [interrupted.projectId]
    );
    const disputedProject = await move(
      interrupted.milestones[0].id,
      "milestone.start",
      sellerActor(),
      { key: nextId("project-disputed") },
      interruptedVersion
    );
    assert.equal(disputedProject.status, 409);
    assert.equal(disputedProject.body.error, "Invalid milestone transition");

    const waiting = await createAgreedProject(1);
    const waitingVersion = await fund(waiting.milestones[0].id, 1);
    await pool.query(
      "UPDATE projects SET state = 'awaiting_funding' WHERE id = $1",
      [waiting.projectId]
    );
    const notStartable = await move(
      waiting.milestones[0].id,
      "milestone.start",
      sellerActor(),
      { key: nextId("awaiting") },
      waitingVersion
    );
    assert.equal(notStartable.status, 409);
    assert.equal(notStartable.body.error, "Invalid milestone transition");

    const running = await createAgreedProject(1);
    const runningVersion = await fund(running.milestones[0].id, 1);
    await pool.query(
      "UPDATE projects SET state = 'in_progress' WHERE id = $1",
      [running.projectId]
    );
    const projectInProgress = await move(
      running.milestones[0].id,
      "milestone.start",
      sellerActor(),
      { key: nextId("project-running") },
      runningVersion
    );
    assert.equal(projectInProgress.status, 200, JSON.stringify(projectInProgress.body));

    const draftTerms = await createAgreedProject(1, { agree: false });
    await withFlag(async (client) => {
      await client.query(
        "UPDATE project_milestones SET state = 'funded' WHERE id = $1",
        [draftTerms.milestones[0].id]
      );
    });
    const unagreed = await move(
      draftTerms.milestones[0].id,
      "milestone.start",
      sellerActor(),
      { key: nextId("draft-terms") },
      1
    );
    assert.equal(unagreed.status, 409);
    assert.equal(unagreed.body.error, "Milestone terms are not agreed");
  });

  it("rejects start from a suspended milestone", async () => {
    const { milestones } = await createAgreedProject(1);
    const version = await fund(milestones[0].id, 1);
    const suspended = await succeed(
      milestones[0].id,
      "milestone.suspend",
      systemActor(),
      { event_id: nextId("hold"), reason: "MODERATION" },
      version
    );
    const started = await move(
      milestones[0].id,
      "milestone.start",
      sellerActor(),
      { key: nextId("from-suspended") },
      suspended
    );
    assert.equal(started.status, 409);
    assert.equal(started.body.error, "Invalid milestone transition");
    const row = await pool.query(
      "SELECT state FROM project_milestones WHERE id = $1",
      [milestones[0].id]
    );
    assert.equal(row.rows[0].state, "suspended");
  });
});
