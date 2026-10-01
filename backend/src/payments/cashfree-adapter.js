const crypto = require("crypto");
const { minorToMajorDecimal, decimalTokenToMinor, rawJsonNumber } = require("./money");

const CAPABILITIES = Object.freeze({
  separateAuthorization: false,
  webhookTimestamp: true,
});

const API_VERSION = "2023-08-01";

function configuration() {
  const appId = process.env.CASHFREE_CLIENT_ID;
  const secret = process.env.CASHFREE_CLIENT_SECRET;
  const environment = process.env.CASHFREE_ENV;
  if (
    typeof appId !== "string" || appId.length === 0
    || typeof secret !== "string" || secret.length === 0
    || (environment !== "sandbox" && environment !== "production")
  ) {
    const error = new Error("payment provider is not configured");
    error.code = "payment_provider_unconfigured";
    throw error;
  }
  const baseUrl = environment === "sandbox"
    ? "https://sandbox.cashfree.com/pg"
    : "https://api.cashfree.com/pg";
  return { appId, secret, baseUrl };
}

function orderBody(providerReference, amountMinor, exponent, currency) {
  const amount = minorToMajorDecimal(amountMinor, exponent);
  return `{"order_id":${JSON.stringify(providerReference)},"order_amount":${amount},"order_currency":${JSON.stringify(currency)}}`;
}

function allocateReference() {
  return `ord_${crypto.randomBytes(12).toString("hex")}`;
}

async function createFundingIntent({ providerReference, amountMinor, exponent, currency, idempotencyKey }) {
  const config = configuration();
  if (typeof providerReference !== "string" || providerReference.length === 0) {
    const error = new Error("payment provider did not accept the order");
    error.code = "payment_provider_rejected";
    throw error;
  }
  const body = orderBody(providerReference, amountMinor, exponent, currency);
  const response = await fetch(`${config.baseUrl}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-version": API_VERSION,
      "x-client-id": config.appId,
      "x-client-secret": config.secret,
      "x-idempotency-key": idempotencyKey,
    },
    body,
  });
  if (!response.ok) {
    const error = new Error("payment provider did not accept the order");
    error.code = "payment_provider_rejected";
    throw error;
  }
  const payload = await response.json();
  const sessionId = payload && typeof payload.payment_session_id === "string"
    ? payload.payment_session_id
    : null;
  if (!sessionId) {
    const error = new Error("payment provider did not accept the order");
    error.code = "payment_provider_rejected";
    throw error;
  }
  return {
    providerReference,
    continuation: { payment_session_id: sessionId },
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
  const config = configuration();
  const provided = headers["x-webhook-signature"];
  const timestamp = headers["x-webhook-timestamp"];
  if (typeof provided !== "string" || typeof timestamp !== "string" || !/^\d+$/.test(timestamp)) {
    return { ok: false };
  }
  const expected = crypto
    .createHmac("sha256", config.secret)
    .update(timestamp + rawBody.toString("utf8"))
    .digest("base64");
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
  const data = parsed && parsed.data && typeof parsed.data === "object" ? parsed.data : null;
  const order = data && data.order ? data.order : null;
  const payment = data && data.payment ? data.payment : null;
  const providerReference = order && typeof order.order_id === "string" ? order.order_id : null;
  const amountToken = rawJsonNumber(rawBody, "payment_amount") || rawJsonNumber(rawBody, "order_amount");
  const currency = payment && typeof payment.payment_currency === "string"
    ? payment.payment_currency
    : order && typeof order.order_currency === "string"
      ? order.order_currency
      : null;
  const paymentId = payment && (payment.cf_payment_id !== undefined && payment.cf_payment_id !== null)
    ? String(payment.cf_payment_id)
    : null;
  const eventType = typeof parsed.type === "string" ? parsed.type : "";
  const outcome = eventType === "PAYMENT_SUCCESS_WEBHOOK"
    ? "succeeded"
    : eventType === "PAYMENT_FAILED_WEBHOOK"
      ? "failed"
      : "ignored";
  const amountMinor = amountToken === null
    ? null
    : decimalTokenToMinor(amountToken, currency === "INR" ? 2 : -1);
  const occurredAt = payment && typeof payment.payment_time === "string" ? payment.payment_time : null;
  return {
    ok: true,
    event: {
      outcome,
      eventId: paymentId ? `${eventType}:${paymentId}` : eventType || null,
      type: eventType,
      providerReference,
      amountMinor: amountMinor === null ? null : amountMinor.toString(),
      currency,
      occurredAt,
    },
  };
}

function getPaymentStatus() {
  return { supported: false };
}

module.exports = {
  name: "cashfree",
  capabilities: CAPABILITIES,
  API_VERSION,
  orderBody,
  allocateReference,
  createFundingIntent,
  capturePayment,
  createRefund,
  createPayout,
  verifyWebhookSignature,
  getPaymentStatus,
};
