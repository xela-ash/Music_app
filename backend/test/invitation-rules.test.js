const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseInviteBody, parseResponseBody, proposalHash } = require("../src/projects/invitation-rules");

describe("invitation request parsing", () => {
  it("accepts a UTC expiry and a positive expected version", () => {
    const parsed = parseInviteBody({
      invitee_user_id: "22222222-2222-4222-8222-222222222222",
      expires_at: "2026-10-02T00:00:00.000Z",
      expected_version: 1,
    });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.expiresAt, "2026-10-02T00:00:00.000Z");
    assert.equal(parsed.value.expectedVersion, 1);
  });

  it("rejects a date-only expiry and a blank invitee", () => {
    assert.equal(parseInviteBody({ invitee_user_id: "nope", expires_at: "2026-10-02", expected_version: 1 }).ok, false);
    assert.equal(
      parseResponseBody({ expected_version: 1 }).error,
      "expected_proposal_version must be a positive integer"
    );
  });
});

describe("proposal hash", () => {
  const project = {
    title: "Session",
    requirements: "Stems",
    price_amount: 100,
    currency: "INR",
    delivery_days: 7,
    revision_limit: 0,
  };
  const milestones = [
    {
      milestone_no: 1,
      title: "Only",
      description: null,
      amount: 100,
      currency: "INR",
      currency_exponent: 2,
      deliverable_definition: {
        required_deliverables: ["final_master_wav"],
        other_description: null,
      },
      revision_allowance: 0,
      due_at: new Date("2026-10-02T00:00:00.000Z"),
    },
  ];

  it("is stable for the same commercial fields", () => {
    assert.equal(proposalHash(project, milestones), proposalHash(project, milestones));
    assert.equal(proposalHash(project, milestones).length, 64);
  });

  it("changes when a milestone amount changes", () => {
    const edited = [{ ...milestones[0], amount: 90 }];
    assert.notEqual(proposalHash(project, milestones), proposalHash(project, edited));
  });
});
