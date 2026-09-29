const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_MESSAGE_BODY_CHARACTERS,
  characterLength,
  parseSendBody,
} = require("../src/messaging/rules");

describe("message body maximum (Messaging §8.1)", () => {
  it("accepts 500 characters and an empty string, and rejects 501", () => {
    const accepted = parseSendBody({ body: "a".repeat(MAX_MESSAGE_BODY_CHARACTERS) });
    const empty = parseSendBody({ body: "" });
    const rejected = parseSendBody({ body: "a".repeat(MAX_MESSAGE_BODY_CHARACTERS + 1) });
    assert.equal(accepted.ok, true);
    assert.equal(empty.ok, true);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error, "Message body must be at most 500 characters");
  });

  it("counts Unicode code points, so 500 emoji fit and 501 do not", () => {
    const note = "🎵";
    assert.equal(characterLength(note), 1);
    assert.equal(note.length, 2);
    assert.equal(parseSendBody({ body: note.repeat(500) }).ok, true);
    assert.equal(parseSendBody({ body: note.repeat(501) }).ok, false);
  });

  it("ignores a client-supplied sender and rejects attachment fields", () => {
    const parsed = parseSendBody({
      body: "hello",
      sender_user_id: "11111111-1111-4111-8111-111111111111",
    });
    assert.deepEqual(parsed, { ok: true, value: { body: "hello" } });
    assert.equal(parseSendBody({ body: "hello", attachments: [] }).ok, false);
  });
});
