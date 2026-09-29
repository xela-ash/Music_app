// Provider-neutral email transport (Notifications §7.2, INT-NOTIFICATIONS-003).
// Notifications owns delivery and rendering. This module only transports.
// No email provider is selected (EQ1). The production provider stays unset,
// and send fails closed. Tests install a mock. This module does not name a
// vendor, read a credential, or open a network connection.

let provider = null;

function setEmailProvider(next) {
  if (next !== null && (typeof next !== "object" || typeof next.send !== "function")) {
    throw new Error("email provider must implement send");
  }
  provider = next;
}

function resetEmailProvider() {
  provider = null;
}

function sendEmail({ destination, content, idempotencyKey } = {}) {
  if (typeof destination !== "string" || destination.length === 0) {
    return { ok: false, failure: "email destination is incomplete" };
  }
  if (typeof content !== "string") {
    return { ok: false, failure: "email content is incomplete" };
  }
  if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
    return { ok: false, failure: "email idempotency key is incomplete" };
  }
  if (!provider) {
    return { ok: false, failure: "email provider is not selected" };
  }
  try {
    return provider.send({ destination, content, idempotencyKey });
  } catch (err) {
    console.error(err);
    return { ok: false, failure: "email provider failed" };
  }
}

module.exports = {
  sendEmail,
  setEmailProvider,
  resetEmailProvider,
};
