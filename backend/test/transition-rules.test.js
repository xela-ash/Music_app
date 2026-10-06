const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { findTransition, listedTargets } = require("../src/projects/transition-rules");

describe("project transition matrix", () => {
  it("rejects an edge the matrix does not name", () => {
    assert.equal(findTransition("draft", "accepted", "project.accept_invitation"), null);
    assert.equal(findTransition("completed", "draft", "project.propose"), null);
    assert.equal(findTransition("buyer_rated", "completed", "project.complete"), null);
  });

  it("names every source the matrix lists for a shared contract", () => {
    assert.ok(findTransition("delivery_pending", "in_progress", "delivery.request_revision"));
    assert.ok(findTransition("delivered", "in_progress", "delivery.request_revision"));
    assert.equal(findTransition("accepted", "in_progress", "delivery.request_revision"), null);
    assert.equal(listedTargets().length, 59);
  });
});
