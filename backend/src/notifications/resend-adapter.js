// Resend transport for the provider-neutral email adapter (D17, Notifications EQ1).
// This module is the only place that names Resend. Credentials come from the
// environment. A missing credential fails closed and does not fall back to the
// mock. Notification fan-out does not call this module (ENG-IMP-041).

const { setEmailProvider } = require("./email-adapter");

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

function createResendEmailProvider({ apiKey, from, fetchImpl } = {}) {
  const fetchFn = fetchImpl || globalThis.fetch;
  return {
    async send({ destination, content, subject, idempotencyKey } = {}) {
      if (typeof destination !== "string" || destination.length === 0) {
        return { ok: false, failure: "email destination is incomplete" };
      }
      if (typeof content !== "string" || typeof subject !== "string" || subject.length === 0) {
        return { ok: false, failure: "email content is incomplete" };
      }
      if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
        return { ok: false, failure: "email idempotency key is incomplete" };
      }
      if (typeof apiKey !== "string" || apiKey.length === 0 || typeof from !== "string" || from.length === 0) {
        return { ok: false, failure: "email provider is not configured" };
      }
      let response;
      try {
        response = await fetchFn(RESEND_EMAILS_URL, {
          method: "POST",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            from,
            to: [destination],
            subject,
            text: content,
          }),
        });
      } catch {
        return { ok: false, failure: "email provider failed" };
      }
      if (!response || response.ok !== true) {
        return { ok: false, failure: "email provider rejected the message" };
      }
      let body;
      try {
        body = await response.json();
      } catch {
        return { ok: false, failure: "email provider rejected the message" };
      }
      const id = body && typeof body.id === "string" ? body.id : "";
      if (id.length === 0) {
        return { ok: false, failure: "email provider rejected the message" };
      }
      return { ok: true, providerReference: id };
    },
  };
}

function installEmailProviderFromEnv(env = {}) {
  if (!env || env.EMAIL_PROVIDER !== "resend") {
    return;
  }
  const apiKey = typeof env.RESEND_API_KEY === "string" ? env.RESEND_API_KEY : "";
  const from = typeof env.RESEND_FROM === "string" ? env.RESEND_FROM : "";
  if (apiKey.length === 0 || from.length === 0) {
    setEmailProvider({
      send() {
        return { ok: false, failure: "email provider is not configured" };
      },
    });
    return;
  }
  setEmailProvider(createResendEmailProvider({ apiKey, from }));
}

module.exports = {
  createResendEmailProvider,
  installEmailProviderFromEnv,
  RESEND_EMAILS_URL,
};
