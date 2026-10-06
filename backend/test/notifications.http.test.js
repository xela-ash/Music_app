const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  ensureMigrated,
  resetApplicationData,
  startServer,
  closeServer,
  stopPool,
} = require("./harness");
const pool = require("../db/db");
const { submitVerifiedEvent } = require("../src/notifications/service");
const {
  resetNotificationSettingsReader,
  setNotificationSettingsReader,
} = require("../src/notifications/settings-reader");

let baseUrl = "";
let server;
let sequence = 0;

const MANDATORY_TOPIC = "Dispute opened / response required / resolved";
const CONFIGURABLE_TOPIC = "New message";
const DEFAULT_OFF_TOPIC = "Marketplace recommendation";

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

async function request(method, requestPath, { token, body } = {}) {
  const headers = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
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

async function signupAndLogin(tag) {
  const email = `${tag}@example.com`;
  const created = await request("POST", "/auth/signup", {
    body: {
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
    },
  });
  assert.equal(created.status, 201, created.text);
  const loggedIn = await request("POST", "/auth/login", {
    body: { email, password: "password-1" },
  });
  assert.equal(loggedIn.status, 200, loggedIn.text);
  return { userId: created.json.user.id, token: loggedIn.json.token };
}

async function counts(recipientUserId) {
  const intents = await pool.query(
    "SELECT COUNT(*)::int AS count FROM notification_intents WHERE recipient_user_id = $1",
    [recipientUserId]
  );
  const deliveries = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM notification_deliveries d
     JOIN notification_intents i ON i.id = d.intent_id
     WHERE i.recipient_user_id = $1`,
    [recipientUserId]
  );
  const audits = await pool.query(
    `SELECT event_type, COUNT(*)::int AS count
     FROM notification_audit_events
     WHERE recipient_user_id = $1
     GROUP BY event_type`,
    [recipientUserId]
  );
  const byType = Object.fromEntries(audits.rows.map((row) => [row.event_type, row.count]));
  return {
    intents: intents.rows[0].count,
    deliveries: deliveries.rows[0].count,
    intentAudits: byType["AUD-NOTIFICATIONS-001"] || 0,
    readAudits: byType["AUD-NOTIFICATIONS-002"] || 0,
  };
}

function installSettings(settings) {
  setNotificationSettingsReader(async () => ({ ok: true, settings }));
}

describe("in-app notifications (MVP-041)", { concurrency: 1, timeout: 30000 }, () => {
  before(async () => {
    ensureMigrated();
    await resetApplicationData();
    const started = await startServer();
    server = started.server;
    baseUrl = started.baseUrl;
  });

  beforeEach(() => {
    resetNotificationSettingsReader();
  });

  after(async () => {
    resetNotificationSettingsReader();
    try {
      if (server) {
        await closeServer(server);
      }
      await resetApplicationData();
    } finally {
      await stopPool();
    }
  });

  it("creates a durable in-app record for a mandatory topic even when a preference would disable it (BR-NOTIFICATIONS-001, SEC-NOTIFICATIONS-004)", async () => {
    const recipient = await signupAndLogin(nextId("mandatory"));
    const created = await submitVerifiedEvent({
      recipientUserId: recipient.userId,
      topic: MANDATORY_TOPIC,
      sourceDomain: "Disputes",
      sourceEventId: "dispute-1",
      preference: { in_app_enabled: false },
    });
    assert.equal(created.ok, true, created.error);
    assert.equal(created.created, true);
    assert.equal(created.mandatory_class, "MANDATORY");
    assert.equal(created.status, "SENT");
    assert.match(created.delivery_external_id, /^ndl_[0-9a-f]{20}$/);

    const stored = await pool.query(
      `SELECT d.status, d.channel, d.provider_reference, d.attempt_count, i.mandatory_class
       FROM notification_deliveries d
       JOIN notification_intents i ON i.id = d.intent_id
       WHERE d.external_id = $1`,
      [created.delivery_external_id]
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].status, "SENT");
    assert.equal(stored.rows[0].channel, "IN_APP");
    assert.equal(stored.rows[0].provider_reference, created.delivery_external_id);
    assert.equal(stored.rows[0].attempt_count, 1);
    assert.equal(stored.rows[0].mandatory_class, "MANDATORY");

    const listed = await request("GET", "/notifications", { token: recipient.token });
    assert.equal(listed.status, 200, listed.text);
    assert.equal(listed.json.notifications.length, 1);
    assert.equal(listed.json.notifications[0].external_id, created.delivery_external_id);
    assert.equal(listed.json.notifications[0].read_at, null);
    assert.equal(listed.json.notifications[0].topic, MANDATORY_TOPIC);
    assert.equal(Object.hasOwn(listed.json.notifications[0], "template_reference"), false);
    assert.equal(Object.hasOwn(listed.json.notifications[0], "source_event_id"), false);
  });

  it("acknowledges a duplicate source event without a second intent, delivery, or audit (REQ-NOTIFICATIONS-002, REQ-NOTIFICATIONS-007, AUD-NOTIFICATIONS-001)", async () => {
    const recipient = await signupAndLogin(nextId("dedupe"));
    const input = {
      recipientUserId: recipient.userId,
      topic: MANDATORY_TOPIC,
      sourceDomain: "Disputes",
      sourceEventId: "dispute-same",
      preference: { in_app_enabled: false },
    };
    const first = await submitVerifiedEvent(input);
    const second = await submitVerifiedEvent(input);
    assert.equal(first.ok, true, first.error);
    assert.equal(second.ok, true, second.error);
    assert.equal(second.created, false);
    assert.equal(second.intent_external_id, first.intent_external_id);
    assert.equal(second.delivery_external_id, first.delivery_external_id);
    const tally = await counts(recipient.userId);
    assert.deepEqual(tally, {
      intents: 1,
      deliveries: 1,
      intentAudits: 1,
      readAudits: 0,
    });
  });

  it("follows the matrix default when no preference store exists, and does not let a caller force delivery (BR-NOTIFICATIONS-003)", async () => {
    const recipient = await signupAndLogin(nextId("defaults"));
    const message = await submitVerifiedEvent({
      recipientUserId: recipient.userId,
      topic: CONFIGURABLE_TOPIC,
      sourceDomain: "Messaging",
      sourceEventId: "message-1",
      preference: { in_app_enabled: false },
    });
    assert.equal(message.ok, true, message.error);
    assert.equal(message.mandatory_class, "CONFIGURABLE");
    assert.equal(message.status, "SENT");

    const marketing = await submitVerifiedEvent({
      recipientUserId: recipient.userId,
      topic: DEFAULT_OFF_TOPIC,
      sourceDomain: "Marketplace",
      sourceEventId: "rec-1",
      preference: { in_app_enabled: true },
    });
    assert.equal(marketing.ok, true, marketing.error);
    assert.equal(marketing.delivery_external_id, null);
    assert.equal(marketing.status, null);

    const tally = await counts(recipient.userId);
    assert.equal(tally.intents, 2);
    assert.equal(tally.deliveries, 1);
    assert.equal(tally.intentAudits, 2);
  });

  it("shows a notification only to its recipient and marks read once (REQ-NOTIFICATIONS-006, BR-NOTIFICATIONS-002, SEC-NOTIFICATIONS-001, SEC-NOTIFICATIONS-005, AUD-NOTIFICATIONS-002)", async () => {
    const recipient = await signupAndLogin(nextId("reader"));
    const outsider = await signupAndLogin(nextId("outsider"));
    const created = await submitVerifiedEvent({
      recipientUserId: recipient.userId,
      topic: MANDATORY_TOPIC,
      sourceDomain: "Disputes",
      sourceEventId: "dispute-read",
    });
    assert.equal(created.ok, true, created.error);

    const outsiderList = await request("GET", "/notifications", { token: outsider.token });
    assert.equal(outsiderList.status, 200, outsiderList.text);
    assert.deepEqual(outsiderList.json, { notifications: [] });

    const outsiderRead = await request("GET", `/notifications/${created.delivery_external_id}`, {
      token: outsider.token,
    });
    assert.equal(outsiderRead.status, 404);
    assert.deepEqual(outsiderRead.json, { error: "Notification not found" });

    const outsiderMark = await request(
      "POST",
      `/notifications/${created.delivery_external_id}/mark-read`,
      { token: outsider.token }
    );
    assert.equal(outsiderMark.status, 404);
    assert.deepEqual(outsiderMark.json, { error: "Notification not found" });

    const read = await request("GET", `/notifications/${created.delivery_external_id}`, {
      token: recipient.token,
    });
    assert.equal(read.status, 200, read.text);
    assert.equal(read.json.notification.read_at, null);

    const marked = await request(
      "POST",
      `/notifications/${created.delivery_external_id}/mark-read`,
      { token: recipient.token }
    );
    assert.equal(marked.status, 200, marked.text);
    assert.ok(marked.json.notification.read_at);

    const again = await request(
      "POST",
      `/notifications/${created.delivery_external_id}/mark-read`,
      { token: recipient.token }
    );
    assert.equal(again.status, 200, again.text);
    assert.equal(again.json.notification.read_at, marked.json.notification.read_at);

    const tally = await counts(recipient.userId);
    assert.equal(tally.readAudits, 1);
    const audit = await pool.query(
      `SELECT topic, channel
       FROM notification_audit_events
       WHERE recipient_user_id = $1 AND event_type = 'AUD-NOTIFICATIONS-002'`,
      [recipient.userId]
    );
    assert.equal(audit.rows[0].topic, null);
    assert.equal(audit.rows[0].channel, "IN_APP");
  });

  it("rejects an unauthenticated caller, an inactive account, a bad id, and an oversized page", async () => {
    const recipient = await signupAndLogin(nextId("closed"));
    const anonymous = await request("GET", "/notifications");
    assert.equal(anonymous.status, 401);

    await pool.query("UPDATE users SET status = 'suspended' WHERE id = $1", [recipient.userId]);
    const suspended = await request("GET", "/notifications", { token: recipient.token });
    assert.equal(suspended.status, 401);
    assert.deepEqual(suspended.json, { error: "Unauthorized" });

    await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [recipient.userId]);
    const badId = await request("GET", "/notifications/not-an-id", { token: recipient.token });
    assert.equal(badId.status, 400);
    assert.deepEqual(badId.json, { error: "Notification id is invalid" });

    const missing = await request("GET", "/notifications/ndl_0123456789abcdef0123", {
      token: recipient.token,
    });
    assert.equal(missing.status, 404);

    const page = await request("GET", "/notifications?limit=101", { token: recipient.token });
    assert.equal(page.status, 400);
    assert.deepEqual(page.json, { error: "limit must be between 1 and 100" });
  });

  it("keeps one intent when two submissions race (REQ-NOTIFICATIONS-007)", async () => {
    const recipient = await signupAndLogin(nextId("race"));
    const input = {
      recipientUserId: recipient.userId,
      topic: MANDATORY_TOPIC,
      sourceDomain: "Disputes",
      sourceEventId: "dispute-race",
    };
    const [left, right] = await Promise.all([
      submitVerifiedEvent(input),
      submitVerifiedEvent(input),
    ]);
    assert.equal(left.ok, true, left.error);
    assert.equal(right.ok, true, right.error);
    assert.equal(left.intent_external_id, right.intent_external_id);
    const tally = await counts(recipient.userId);
    assert.equal(tally.intents, 1);
    assert.equal(tally.deliveries, 1);
    assert.equal(tally.intentAudits, 1);
  });

  it("suppresses a disabled configurable in-app channel and no other channel (REQ-NOTIFICATIONS-004)", async () => {
    const recipient = await signupAndLogin(nextId("pref-off"));
    installSettings({ in_app_enabled: false, email_enabled: true });
    const created = await submitVerifiedEvent({
      recipientUserId: recipient.userId,
      topic: CONFIGURABLE_TOPIC,
      sourceDomain: "Messaging",
      sourceEventId: "message-off",
      preference: { in_app_enabled: true },
    });
    assert.equal(created.ok, true, created.error);
    assert.equal(created.status, "SUPPRESSED");
    const again = await submitVerifiedEvent({
      recipientUserId: recipient.userId,
      topic: CONFIGURABLE_TOPIC,
      sourceDomain: "Messaging",
      sourceEventId: "message-off",
    });
    assert.equal(again.created, false);
    assert.equal(again.delivery_external_id, created.delivery_external_id);
    assert.equal(again.status, "SUPPRESSED");

    const stored = await pool.query(
      `SELECT d.status, d.channel, d.provider_reference, d.attempt_count
       FROM notification_deliveries d
       JOIN notification_intents i ON i.id = d.intent_id
       WHERE i.recipient_user_id = $1`,
      [recipient.userId]
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].channel, "IN_APP");
    assert.equal(stored.rows[0].status, "SUPPRESSED");
    assert.equal(stored.rows[0].provider_reference, null);
    assert.equal(stored.rows[0].attempt_count, 0);

    const listed = await request("GET", "/notifications", { token: recipient.token });
    assert.equal(listed.status, 200, listed.text);
    assert.deepEqual(listed.json, { notifications: [] });
    const read = await request("GET", `/notifications/${created.delivery_external_id}`, {
      token: recipient.token,
    });
    assert.equal(read.status, 404);
    const mark = await request(
      "POST",
      `/notifications/${created.delivery_external_id}/mark-read`,
      { token: recipient.token }
    );
    assert.equal(mark.status, 404);
    const tally = await counts(recipient.userId);
    assert.equal(tally.intents, 1);
    assert.equal(tally.deliveries, 1);
    assert.equal(tally.intentAudits, 1);
  });

  it("does not suppress in-app when only email is disabled (REQ-NOTIFICATIONS-004)", async () => {
    const recipient = await signupAndLogin(nextId("email-off"));
    installSettings({ email_enabled: false, in_app_enabled: true });
    const created = await submitVerifiedEvent({
      recipientUserId: recipient.userId,
      topic: CONFIGURABLE_TOPIC,
      sourceDomain: "Messaging",
      sourceEventId: "message-email-off",
      preference: { in_app_enabled: false },
    });
    assert.equal(created.ok, true, created.error);
    assert.equal(created.status, "SENT");
    const stored = await pool.query(
      `SELECT channel, status FROM notification_deliveries d
       JOIN notification_intents i ON i.id = d.intent_id
       WHERE i.recipient_user_id = $1`,
      [recipient.userId]
    );
    assert.deepEqual(stored.rows, [{ channel: "IN_APP", status: "SENT" }]);
  });

  it("never suppresses a mandatory in-app record when settings disable it (BR-NOTIFICATIONS-001, SEC-NOTIFICATIONS-004)", async () => {
    const recipient = await signupAndLogin(nextId("mandatory-pref"));
    installSettings({
      in_app_enabled: false,
      topic_overrides: { [MANDATORY_TOPIC]: { in_app: false } },
    });
    const created = await submitVerifiedEvent({
      recipientUserId: recipient.userId,
      topic: MANDATORY_TOPIC,
      sourceDomain: "Disputes",
      sourceEventId: "dispute-pref",
    });
    assert.equal(created.ok, true, created.error);
    assert.equal(created.status, "SENT");
    const listed = await request("GET", "/notifications", { token: recipient.token });
    assert.equal(listed.json.notifications.length, 1);
    assert.equal(listed.json.notifications[0].external_id, created.delivery_external_id);
  });

  it("applies a topic override without letting a global enable override a matrix default of off (REQ-NOTIFICATIONS-004)", async () => {
    const recipient = await signupAndLogin(nextId("override"));
    installSettings({
      in_app_enabled: true,
      topic_overrides: { [CONFIGURABLE_TOPIC]: { in_app: false } },
    });
    const message = await submitVerifiedEvent({
      recipientUserId: recipient.userId,
      topic: CONFIGURABLE_TOPIC,
      sourceDomain: "Messaging",
      sourceEventId: "message-override",
    });
    assert.equal(message.status, "SUPPRESSED");

    installSettings({ in_app_enabled: true });
    const stillOff = await submitVerifiedEvent({
      recipientUserId: recipient.userId,
      topic: DEFAULT_OFF_TOPIC,
      sourceDomain: "Marketplace",
      sourceEventId: "rec-global",
    });
    assert.equal(stillOff.delivery_external_id, null);

    installSettings({
      topic_overrides: { [DEFAULT_OFF_TOPIC]: { in_app: true } },
    });
    const enabled = await submitVerifiedEvent({
      recipientUserId: recipient.userId,
      topic: DEFAULT_OFF_TOPIC,
      sourceDomain: "Marketplace",
      sourceEventId: "rec-override",
    });
    assert.equal(enabled.ok, true, enabled.error);
    assert.equal(enabled.status, "SENT");
  });

  it("uses the matrix default when the preference read fails (INT-NOTIFICATIONS-002)", async () => {
    const recipient = await signupAndLogin(nextId("read-fail"));
    setNotificationSettingsReader(async () => {
      throw new Error("settings down");
    });
    const message = await submitVerifiedEvent({
      recipientUserId: recipient.userId,
      topic: CONFIGURABLE_TOPIC,
      sourceDomain: "Messaging",
      sourceEventId: "message-fail",
      preference: { in_app_enabled: false },
    });
    assert.equal(message.status, "SENT");

    setNotificationSettingsReader(async () => ({ ok: false, reason: "user_settings_unavailable" }));
    const marketing = await submitVerifiedEvent({
      recipientUserId: recipient.userId,
      topic: DEFAULT_OFF_TOPIC,
      sourceDomain: "Marketplace",
      sourceEventId: "rec-fail",
      preference: { in_app_enabled: true },
    });
    assert.equal(marketing.delivery_external_id, null);

    setNotificationSettingsReader(async () => ({ ok: true, settings: [] }));
    const stillDefault = await submitVerifiedEvent({
      recipientUserId: recipient.userId,
      topic: CONFIGURABLE_TOPIC,
      sourceDomain: "Messaging",
      sourceEventId: "message-garbage",
    });
    assert.equal(stillDefault.status, "SENT");
  });
});
