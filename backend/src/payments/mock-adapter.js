const crypto = require("crypto");

const CAPABILITIES = Object.freeze({
  separateAuthorization: false,
  webhookTimestamp: true,
});

function secret() {
  const value = process.env.MOCK_PAYMENT_WEBHOOK_SECRET;
  if (typeof value !== "string" || value.length < 16) {
    const error = new Error("payment provider is not configured");
    error.code = "payment_provider_unconfigured";
    throw error;
  }
  return value;
}

function sign(rawBody) {
  return crypto.createHmac("sha256", secret()).update(rawBody).digest("hex");
}

let uncertainThrown = false;

function allocateReference() {
  secret();
  return `mock_${crypto.randomBytes(10).toString("hex")}`;
}

async function createFundingIntent({ providerReference }) {
  secret();
  if (typeof providerReference !== "string" || providerReference.length === 0) {
    const error = new Error("payment provider did not accept the order");
    error.code = "payment_provider_rejected";
    throw error;
  }
  if (process.env.MOCK_PAYMENT_ASSERT_COMMITTED === "1") {
    const pool = require("../../db/db");
    const seen = await pool.query(
      "SELECT id FROM payments WHERE provider_payment_id = $1",
      [providerReference]
    );
    if (seen.rows.length !== 1) {
      const error = new Error("payment provider result is unknown");
      error.code = "payment_provider_uncertain";
      throw error;
    }
  }
  if (process.env.MOCK_PAYMENT_UNCERTAIN_ONCE === "1" && !uncertainThrown) {
    uncertainThrown = true;
    const error = new Error("payment provider result is unknown");
    error.code = "payment_provider_uncertain";
    throw error;
  }
  return {
    providerReference,
    continuation: { provider_reference: providerReference },
    status: "requires_action",
  };
}

function resetCreateFaults() {
  uncertainThrown = false;
}

function capturePayment() {
  return { supported: false };
}

function createRefund() {
  return { supported: false };
}

function createPayout() {
  return { supported: false };
}

function verifyWebhookSignature(rawBody, headers) {
  const provided = headers["x-musicapp-signature"];
  if (typeof provided !== "string" || provided.length === 0) {
    return { ok: false };
  }
  const expected = sign(rawBody);
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { ok: false };
  }
  let parsed;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { ok: true, event: { outcome: "ignored", eventId: null } };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: true, event: { outcome: "ignored", eventId: null } };
  }
  let outcome = "ignored";
  if (parsed.type === "payment.succeeded") {
    outcome = "succeeded";
  } else if (parsed.type === "payment.failed") {
    outcome = "failed";
  }
  return {
    ok: true,
    event: {
      outcome,
      eventId: parsed.event_id,
      type: parsed.type,
      providerReference: parsed.provider_reference,
      amountMinor: parsed.amount_minor,
      currency: parsed.currency,
      occurredAt: parsed.occurred_at,
    },
  };
}

function getPaymentStatus() {
  return { supported: false };
}

module.exports = {
  name: "mock",
  capabilities: CAPABILITIES,
  allocateReference,
  createFundingIntent,
  resetCreateFaults,
  capturePayment,
  createRefund,
  createPayout,
  verifyWebhookSignature,
  getPaymentStatus,
  sign,
};
