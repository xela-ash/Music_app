const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePreferences } = require("../src/notifications/preferences");
const { topicRecord } = require("../src/notifications/topics");

const MESSAGE = "New message";
const MARKET = "Marketplace recommendation";
const DISPUTE = "Dispute opened / response required / resolved";

function decide(topic, settings, eligibility) {
  return evaluatePreferences({
    record: topicRecord(topic),
    topic,
    settings,
    eligibility,
  });
}

const verifiedEmail = { inAppEligible: true, emailVerified: true };

describe("preference evaluation (REQ-NOTIFICATIONS-004, BR-NOTIFICATIONS-001, SEC-NOTIFICATIONS-004)", () => {
  it("uses the matrix default when no settings document is available", () => {
    assert.deepEqual(decide(MESSAGE, null), {
      IN_APP: "deliver",
      EMAIL: "skip",
      PUSH: "skip",
      SMS: "skip",
    });
    assert.deepEqual(decide(MARKET, null), {
      IN_APP: "skip",
      EMAIL: "skip",
      PUSH: "skip",
      SMS: "skip",
    });
    assert.equal(decide(DISPUTE, null).IN_APP, "deliver");
    assert.equal(decide(DISPUTE, null).EMAIL, "suppress");
    assert.equal(decide(DISPUTE, null, verifiedEmail).EMAIL, "deliver");
    assert.equal(topicRecord(MESSAGE).emailDefault, false);
    assert.equal(topicRecord(DISPUTE).emailDefault, true);
    assert.equal(topicRecord(MARKET).emailDefault, false);
  });

  it("suppresses only the configurable channel the user disabled", () => {
    const inAppOff = decide(MESSAGE, { in_app_enabled: false, email_enabled: true });
    assert.equal(inAppOff.IN_APP, "suppress");
    assert.equal(inAppOff.EMAIL, "skip");

    const emailOff = decide(MESSAGE, { email_enabled: false }, verifiedEmail);
    assert.equal(emailOff.IN_APP, "deliver");
    assert.equal(emailOff.EMAIL, "skip");

    const disputeEmailOff = decide(DISPUTE, { email_enabled: false, in_app_enabled: false }, verifiedEmail);
    assert.equal(disputeEmailOff.IN_APP, "deliver");
    assert.equal(disputeEmailOff.EMAIL, "suppress");
  });

  it("lets a topic override enable a default-off channel and a more restrictive value win", () => {
    assert.equal(decide(MARKET, { in_app_enabled: true }).IN_APP, "skip");
    assert.equal(
      decide(MARKET, { topic_overrides: { [MARKET]: { in_app: true } } }).IN_APP,
      "deliver"
    );
    assert.equal(
      decide(MARKET, {
        in_app_enabled: false,
        topic_overrides: { [MARKET]: { in_app: true } },
      }).IN_APP,
      "suppress"
    );
    assert.equal(
      decide(MESSAGE, {
        in_app_enabled: true,
        topic_overrides: { [MESSAGE]: { in_app: false } },
      }).IN_APP,
      "suppress"
    );
    assert.equal(
      decide(MARKET, { topic_overrides: { [MARKET]: { in_app: false } } }).IN_APP,
      "skip"
    );
  });

  it("never suppresses a mandatory in-app record", () => {
    const disabled = decide(DISPUTE, {
      in_app_enabled: false,
      topic_overrides: { [DISPUTE]: { in_app: false } },
    }, { inAppEligible: false });
    assert.equal(disabled.IN_APP, "deliver");
  });

  it("suppresses an eligible configurable channel the destination cannot receive", () => {
    assert.equal(decide(MESSAGE, null, { inAppEligible: false }).IN_APP, "suppress");
    assert.equal(
      decide(MESSAGE, { topic_overrides: { [MESSAGE]: { email: true } } }).EMAIL,
      "suppress"
    );
    assert.equal(
      decide(MESSAGE, { topic_overrides: { [MESSAGE]: { email: true } } }, verifiedEmail).EMAIL,
      "deliver"
    );
    assert.equal(decide(MESSAGE, { push_enabled: true }, { pushPermitted: true }).PUSH, "skip");
    assert.equal(
      decide(MESSAGE, { topic_overrides: { [MESSAGE]: { push: true } } }, { pushPermitted: true }).PUSH,
      "deliver"
    );
  });

  it("ignores a document that is not a settings object and ignores non-booleans", () => {
    assert.deepEqual(decide(MESSAGE, "nope"), decide(MESSAGE, null));
    assert.deepEqual(decide(MESSAGE, []), decide(MESSAGE, null));
    assert.deepEqual(decide(MESSAGE, { in_app_enabled: "false" }), decide(MESSAGE, null));
    assert.equal(
      decide(MESSAGE, {
        topic_overrides: "all-off",
        in_app_enabled: false,
      }).IN_APP,
      "suppress"
    );
    assert.equal(
      decide(MESSAGE, {
        topic_overrides: { "Not a topic": { in_app: false } },
      }).IN_APP,
      "deliver"
    );
  });
});
