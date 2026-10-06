const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  resetEmailProvider,
  sendEmail,
} = require("../src/notifications/email-adapter");
const {
  RESEND_EMAILS_URL,
  createResendEmailProvider,
  installEmailProviderFromEnv,
} = require("../src/notifications/resend-adapter");

const INPUT = {
  destination: "ada@example.com",
  content: "A project invitation is waiting.",
  subject: "Project invitation",
  idempotencyKey: "email:intent-1",
};

function provider() {
  return createResendEmailProvider({
    apiKey: "re_test_key",
    from: "MusicApp <notify@example.com>",
    fetchImpl: fetchImpl,
  });
}

let calls;
let fetchImpl;

describe("Resend email transport (REQ-NOTIFICATIONS-003, INT-NOTIFICATIONS-003, D17)", () => {
  beforeEach(() => {
    resetEmailProvider();
    calls = [];
    fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({ id: "re_msg_1" }),
      };
    };
  });

  afterEach(() => {
    resetEmailProvider();
  });

  it("posts rendered content to Resend and returns the provider reference", async () => {
    const result = await provider().send(INPUT);
    assert.deepEqual(result, { ok: true, providerReference: "re_msg_1" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, RESEND_EMAILS_URL);
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.redirect, "error");
    assert.equal(calls[0].init.headers.Authorization, "Bearer re_test_key");
    assert.equal(calls[0].init.headers["Idempotency-Key"], INPUT.idempotencyKey);
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      from: "MusicApp <notify@example.com>",
      to: [INPUT.destination],
      subject: INPUT.subject,
      text: INPUT.content,
    });
  });

  it("does not call Resend when the subject is missing", async () => {
    const sent = provider();
    assert.deepEqual(await sent.send({ ...INPUT, subject: "" }), {
      ok: false,
      failure: "email content is incomplete",
    });
    assert.deepEqual(await sent.send({ ...INPUT, subject: undefined }), {
      ok: false,
      failure: "email content is incomplete",
    });
    assert.deepEqual(await sent.send({ ...INPUT, content: undefined }), {
      ok: false,
      failure: "email content is incomplete",
    });
    assert.deepEqual(calls, []);
  });

  it("does not call Resend when the destination or idempotency key is incomplete", async () => {
    const sent = provider();
    assert.deepEqual(await sent.send({ ...INPUT, destination: "" }), {
      ok: false,
      failure: "email destination is incomplete",
    });
    assert.deepEqual(await sent.send({ ...INPUT, idempotencyKey: "" }), {
      ok: false,
      failure: "email idempotency key is incomplete",
    });
    assert.deepEqual(calls, []);
  });

  it("fails closed without reading a rejected response body", async () => {
    fetchImpl = async () => ({
      ok: false,
      json: async () => {
        throw new Error("body must not be read: re_test_key");
      },
    });
    const result = await provider().send(INPUT);
    assert.deepEqual(result, {
      ok: false,
      failure: "email provider rejected the message",
    });
    assert.equal(JSON.stringify(result).includes("re_test_key"), false);
  });

  it("fails closed when Resend returns no delivery id", async () => {
    fetchImpl = async () => ({
      ok: true,
      json: async () => ({ message: "accepted without id" }),
    });
    assert.deepEqual(await provider().send(INPUT), {
      ok: false,
      failure: "email provider rejected the message",
    });
  });

  it("fails closed when the transport throws and does not echo the credential", async () => {
    fetchImpl = async () => {
      throw new Error("socket down re_test_key");
    };
    const result = await provider().send(INPUT);
    assert.deepEqual(result, { ok: false, failure: "email provider failed" });
    assert.equal(JSON.stringify(result).includes("re_test_key"), false);
  });

  it("does not call Resend when the credential or from address is missing", async () => {
    const missingKey = createResendEmailProvider({
      apiKey: "",
      from: "MusicApp <notify@example.com>",
      fetchImpl,
    });
    assert.deepEqual(await missingKey.send(INPUT), {
      ok: false,
      failure: "email provider is not configured",
    });
    const missingFrom = createResendEmailProvider({
      apiKey: "re_test_key",
      from: "",
      fetchImpl,
    });
    assert.deepEqual(await missingFrom.send(INPUT), {
      ok: false,
      failure: "email provider is not configured",
    });
    assert.deepEqual(calls, []);
  });

  it("installs nothing unless EMAIL_PROVIDER is resend", () => {
    installEmailProviderFromEnv({});
    assert.deepEqual(sendEmail(INPUT), {
      ok: false,
      failure: "email provider is not selected",
    });
    resetEmailProvider();
    installEmailProviderFromEnv({ EMAIL_PROVIDER: "mock", RESEND_API_KEY: "re_test_key", RESEND_FROM: "a@b.c" });
    assert.deepEqual(sendEmail(INPUT), {
      ok: false,
      failure: "email provider is not selected",
    });
  });

  it("fails closed without a network call when Resend is selected and a credential is missing", () => {
    installEmailProviderFromEnv({ EMAIL_PROVIDER: "resend", RESEND_FROM: "MusicApp <notify@example.com>" });
    assert.deepEqual(
      sendEmail({
        destination: INPUT.destination,
        content: INPUT.content,
        idempotencyKey: INPUT.idempotencyKey,
      }),
      { ok: false, failure: "email provider is not configured" },
    );
  });

  it("does not invent a subject on the neutral send path", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      installEmailProviderFromEnv({
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_test_key",
        RESEND_FROM: "MusicApp <notify@example.com>",
      });
      const result = await sendEmail({
        destination: INPUT.destination,
        content: INPUT.content,
        idempotencyKey: INPUT.idempotencyKey,
      });
      assert.deepEqual(result, { ok: false, failure: "email content is incomplete" });
      assert.deepEqual(calls, []);
    } finally {
      globalThis.fetch = original;
    }
  });
});
