const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  AMENDMENT_STATUSES,
  amendmentTransition,
  parseProposeBody,
  projectGate,
} = require("../src/projects/amendment-rules");

const ACTIONS = ["accept", "reject", "withdraw", "expire", "supersede"];
const ACTORS = ["proposer", "counterparty", "system", "outsider"];

function propose(changes, extra = {}) {
  return parseProposeBody({
    expected_version: 1,
    expires_at: "2027-01-01T00:00:00.000Z",
    changes,
    ...extra,
  });
}

describe("amendment state matrix", () => {
  it("allows only the listed proposed edges", () => {
    const allowed = [];
    for (const from of AMENDMENT_STATUSES) {
      for (const action of ACTIONS) {
        for (const actor of ACTORS) {
          const to = amendmentTransition(from, action, actor);
          if (to) {
            allowed.push(`${from}:${actor}:${action}->${to}`);
          }
        }
      }
    }
    assert.deepEqual(allowed.sort(), [
      "proposed:counterparty:accept->accepted",
      "proposed:counterparty:reject->rejected",
      "proposed:proposer:withdraw->withdrawn",
      "proposed:system:expire->expired",
    ]);
  });
});

describe("amendment change allowlist", () => {
  it("keeps project-level snapshot fields and rejects money, catalog, and milestone fields", () => {
    const title = propose({ title: "New title" });
    assert.equal(title.ok, true);
    assert.deepEqual(title.value.changes, { title: "New title" });

    const several = propose({
      brief: "New brief",
      revision_limit: 2,
      start_at: "2027-02-01T00:00:00.000Z",
      due_at: null,
      service_snapshot: { service_id: "mix" },
    });
    assert.equal(several.ok, true);

    for (const changes of [
      {},
      { currency: "USD" },
      { total_amount: 100 },
      { price_amount: 100 },
      { genre_ids: ["g"] },
      { skill_ids: ["s"] },
      { milestones: [{ amount: 1 }] },
      { revision_allowance: 1 },
      { deliverable_definition: { text: "stems" } },
      { engagement_model: "one_shot" },
      { unknown: true },
      { title: "Ok", currency: "INR" },
    ]) {
      const parsed = propose(changes);
      assert.equal(parsed.ok, false, JSON.stringify(changes));
      assert.equal(parsed.status, 422);
      assert.equal(parsed.error, "Amendment changes are not allowed");
    }
  });

  it("rejects a blank title, a negative revision limit, and a non-object snapshot", () => {
    assert.equal(propose({ title: "" }).status, 400);
    assert.equal(propose({ revision_limit: -1 }).status, 400);
    assert.equal(propose({ revision_limit: 1.5 }).status, 400);
    assert.equal(propose({ service_snapshot: [] }).status, 400);
    assert.equal(propose({ start_at: "tomorrow" }).status, 400);
  });
});

describe("amendment project gate", () => {
  it("blocks pre-acceptance and holds", () => {
    assert.equal(projectGate({ state: "draft", agreed_term_version: null }).error, "Project is not accepted");
    assert.equal(projectGate({ state: "proposed", agreed_term_version: 1 }).error, "Project is not accepted");
    assert.equal(projectGate({ state: "accepted", agreed_term_version: null }).error, "Project is not accepted");
    assert.equal(projectGate({ state: "disputed", agreed_term_version: 2 }).error, "Project is held");
    assert.equal(projectGate({ state: "suspended", agreed_term_version: 2 }).error, "Project is held");
    assert.equal(projectGate({ state: "accepted", agreed_term_version: 2 }), null);
    assert.equal(projectGate({ state: "in_progress", agreed_term_version: 2 }), null);
  });
});
