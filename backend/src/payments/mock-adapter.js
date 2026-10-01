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

function createFundingIntent() {
  secret();
  const providerReference = `mock_${crypto.randomBytes(10).toString("hex")}`;
  return {
    providerReference,
    continuation: { provider_reference: providerReference },
    status: "requires_action",
  };
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
    return { ok: false };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false };
  }
  return {
    ok: true,
    event: {
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
  createFundingIntent,
  capturePayment,
  createRefund,
  createPayout,
  verifyWebhookSignature,
  getPaymentStatus,
  sign,
};
