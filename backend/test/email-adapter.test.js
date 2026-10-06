const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  resetEmailProvider,
  sendEmail,
  setEmailProvider,
} = require("../src/notifications/email-adapter");

const INPUT = {
  destination: "ada@example.com",
  content: "A project invitation is waiting.",
  idempotencyKey: "email:intent-1",
};

describe("email channel adapter (REQ-NOTIFICATIONS-003, INT-NOTIFICATIONS-003)", () => {
  beforeEach(() => {
    resetEmailProvider();
  });

  it("accepts a mock provider and returns its provider reference", () => {
    const calls = [];
    setEmailProvider({
      send(input) {
        calls.push(input);
        return { ok: true, providerReference: "mock-ref-1" };
      },
    });
    const result = sendEmail(INPUT);
    assert.deepEqual(result, { ok: true, providerReference: "mock-ref-1" });
    assert.deepEqual(calls, [INPUT]);
  });

  it("returns a mock provider failure without treating it as sent", () => {
    setEmailProvider({
      send() {
        return { ok: false, failure: "mock mailbox rejected the message" };
      },
    });
    assert.deepEqual(sendEmail(INPUT), {
      ok: false,
      failure: "mock mailbox rejected the message",
    });
  });

  it("fails closed when no provider is selected and does not call a later mock for an incomplete send", () => {
    assert.deepEqual(sendEmail(INPUT), {
      ok: false,
      failure: "email provider is not selected",
    });

    const calls = [];
    setEmailProvider({
      send(input) {
        calls.push(input);
        return { ok: true, providerReference: "should-not-send" };
      },
    });
    assert.deepEqual(sendEmail({ content: INPUT.content, idempotencyKey: INPUT.idempotencyKey }), {
      ok: false,
      failure: "email destination is incomplete",
    });
    assert.deepEqual(sendEmail({ destination: INPUT.destination, idempotencyKey: INPUT.idempotencyKey }), {
      ok: false,
      failure: "email content is incomplete",
    });
    assert.deepEqual(sendEmail({ destination: INPUT.destination, content: INPUT.content }), {
      ok: false,
      failure: "email idempotency key is incomplete",
    });
    assert.deepEqual(calls, []);
  });

  it("fails closed when the mock provider throws", () => {
    setEmailProvider({
      send() {
        throw new Error("mock transport down");
      },
    });
    assert.deepEqual(sendEmail(INPUT), { ok: false, failure: "email provider failed" });
  });
});
