const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { sendInApp } = require("../src/notifications/in-app-adapter");
const {
  deliveryExternalIdIsValid,
  parseNotificationListQuery,
  parseVerifiedEvent,
} = require("../src/notifications/rules");
const {
  UNCLASSIFIED_TOPICS,
  createsDurableInApp,
  topicRecord,
} = require("../src/notifications/topics");

const RECIPIENT = "11111111-1111-4111-8111-111111111111";
const MANDATORY_TOPIC = "Dispute opened / response required / resolved";
const CONFIGURABLE_TOPIC = "New message";
const DEFAULT_OFF_TOPIC = "Marketplace recommendation";

describe("notification topic classification (BR-NOTIFICATIONS-001)", () => {
  it("classifies a durable-record topic as mandatory", () => {
    const record = topicRecord(MANDATORY_TOPIC);
    assert.equal(record.mandatoryClass, "MANDATORY");
    assert.equal(createsDurableInApp(record), true);
  });

  it("keeps a disableable in-app default configurable and still durable by default", () => {
    const record = topicRecord(CONFIGURABLE_TOPIC);
    assert.equal(record.mandatoryClass, "CONFIGURABLE");
    assert.equal(record.inAppDefault, true);
    assert.equal(createsDurableInApp(record), true);
  });

  it("does not create an in-app record for a topic whose matrix default is off", () => {
    const record = topicRecord(DEFAULT_OFF_TOPIC);
    assert.equal(record.mandatoryClass, "CONFIGURABLE");
    assert.equal(createsDurableInApp(record), false);
  });

  it("does not assign a class to the two matrix rows that do not choose one", () => {
    for (const topic of UNCLASSIFIED_TOPICS) {
      assert.equal(topicRecord(topic), null);
      assert.equal(parseVerifiedEvent({
        recipientUserId: RECIPIENT,
        topic,
        sourceDomain: "Ratings",
        sourceEventId: "evt-1",
      }).error, "Topic classification is not defined");
    }
  });
});

describe("verified event parsing (INT-NOTIFICATIONS-001, REQ-NOTIFICATIONS-002)", () => {
  it("accepts a classified topic and rejects an unknown one", () => {
    const parsed = parseVerifiedEvent({
      recipientUserId: RECIPIENT,
      topic: MANDATORY_TOPIC,
      sourceDomain: "Disputes",
      sourceEventId: "evt-1",
    });
    assert.equal(parsed.ok, true);
    assert.equal(parseVerifiedEvent({
      recipientUserId: RECIPIENT,
      topic: "Not a topic",
      sourceDomain: "Disputes",
      sourceEventId: "evt-1",
    }).error, "Topic is not classified");
  });

  it("rejects a recipient, source domain, or source event the schema cannot store", () => {
    assert.equal(parseVerifiedEvent({
      recipientUserId: "nope",
      topic: MANDATORY_TOPIC,
      sourceDomain: "Disputes",
      sourceEventId: "evt-1",
    }).ok, false);
    assert.equal(parseVerifiedEvent({
      recipientUserId: RECIPIENT,
      topic: MANDATORY_TOPIC,
      sourceDomain: "Unknown",
      sourceEventId: "evt-1",
    }).ok, false);
    assert.equal(parseVerifiedEvent({
      recipientUserId: RECIPIENT,
      topic: MANDATORY_TOPIC,
      sourceDomain: "Disputes",
      sourceEventId: "",
    }).ok, false);
  });
});

describe("in-app list query and adapter (INT-NOTIFICATIONS-004, REQ-NOTIFICATIONS-003)", () => {
  it("bounds the list the same way as the existing profile page", () => {
    assert.equal(parseNotificationListQuery({}).limit, 100);
    assert.equal(parseNotificationListQuery({}).offset, 0);
    assert.equal(parseNotificationListQuery({ limit: "101" }).ok, false);
    assert.equal(parseNotificationListQuery({ offset: "-1" }).ok, false);
  });

  it("accepts only a delivery external id", () => {
    assert.equal(deliveryExternalIdIsValid("ndl_0123456789abcdef0123"), true);
    assert.equal(deliveryExternalIdIsValid("ntf_0123456789abcdef0123"), false);
  });

  it("returns the delivery id as the local provider reference", () => {
    const sent = sendInApp({
      recipientUserId: RECIPIENT,
      deliveryExternalId: "ndl_0123456789abcdef0123",
      idempotencyKey: "in_app:abc",
    });
    assert.deepEqual(sent, {
      ok: true,
      providerReference: "ndl_0123456789abcdef0123",
    });
    assert.equal(sendInApp({ recipientUserId: "", deliveryExternalId: "ndl_x", idempotencyKey: "k" }).ok, false);
  });
});
