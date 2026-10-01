const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { minorToMajorDecimal, decimalTokenToMinor, rawJsonNumber } = require("../src/payments/money");
const cashfree = require("../src/payments/cashfree-adapter");

describe("MVP-025 payment amounts", () => {
  it("converts minor units to an exact decimal without a binary float", () => {
    assert.equal(minorToMajorDecimal(125050n, 2), "1250.50");
    assert.equal(minorToMajorDecimal(100000n, 2), "1000.00");
    assert.equal(decimalTokenToMinor("1250.50", 2), 125050n);
    assert.equal(decimalTokenToMinor("1250.500", 2), null);
  });

  it("builds a Cashfree order body with the decimal text", () => {
    const body = cashfree.orderBody("ord_abc", 125050n, 2, "INR");
    assert.equal(body.includes("1250.50"), true);
    assert.equal(rawJsonNumber(body, "order_amount"), "1250.50");
  });

  it("rejects a Cashfree webhook whose signature does not match", () => {
    process.env.CASHFREE_CLIENT_ID = "app_test";
    process.env.CASHFREE_CLIENT_SECRET = "secret_test_value";
    process.env.CASHFREE_ENV = "sandbox";
    const raw = Buffer.from('{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"order":{"order_id":"ord_abc","order_amount":1250.50,"order_currency":"INR"},"payment":{"cf_payment_id":"9","payment_amount":1250.50,"payment_currency":"INR","payment_time":"2026-10-01T00:00:00Z"}}}');
    const timestamp = "1700000000";
    const signature = crypto.createHmac("sha256", "secret_test_value").update(timestamp + raw.toString("utf8")).digest("base64");
    const verified = cashfree.verifyWebhookSignature(raw, {
      "x-webhook-signature": signature,
      "x-webhook-timestamp": timestamp,
    });
    assert.equal(verified.ok, true);
    assert.equal(verified.event.amountMinor, "125050");
    assert.equal(verified.event.currency, "INR");
    const forged = cashfree.verifyWebhookSignature(raw, {
      "x-webhook-signature": "not-a-signature",
      "x-webhook-timestamp": timestamp,
    });
    assert.equal(forged.ok, false);
  });
});
