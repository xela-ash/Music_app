const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../src/verification/rules");

const STATUSES = ["not_started", "submitted", "approved", "rejected"];

describe("verification transition matrix", () => {
  it("allows submit from not_started and an Administrator decision from submitted", () => {
    assert.deepEqual(rules.transition("not_started", "submitted"), { ok: true, command: "submit" });
    assert.deepEqual(rules.transition("submitted", "approved"), { ok: true, command: "decide" });
    assert.deepEqual(rules.transition("submitted", "rejected"), { ok: true, command: "decide" });
  });

  it("rejects every unlisted edge", () => {
    const listed = new Set(["not_started->submitted", "submitted->approved", "submitted->rejected"]);
    for (const fromStatus of STATUSES) {
      for (const toStatus of STATUSES) {
        if (listed.has(`${fromStatus}->${toStatus}`)) {
          continue;
        }
        const result = rules.transition(fromStatus, toStatus);
        assert.equal(result.ok, false, `${fromStatus}->${toStatus}`);
        assert.equal(result.status, 409);
      }
    }
    assert.equal(rules.transition("submitted", "expired").ok, false);
    assert.equal(rules.transition("approved", "revoked").ok, false);
  });

  it("opens a new attempt only when none is open", () => {
    assert.equal(rules.submitAllowed(null).ok, true);
    assert.equal(rules.submitAllowed("not_started").ok, true);
    assert.equal(rules.submitAllowed("rejected").ok, true);
    assert.equal(rules.submitAllowed("submitted").status, 409);
    assert.equal(rules.submitAllowed("approved").status, 409);
  });
});
