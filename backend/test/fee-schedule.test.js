const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  SCHEDULE_VERSION,
  FEE_LINES,
  sellerCommissionMinor,
  sellerEntitlementMinor,
} = require("../src/escrow/fee-schedule");

describe("MVP-027 fee schedule", () => {
  it("uses the recorded 10 percent seller commission and zero buyer and activation fees", () => {
    assert.equal(SCHEDULE_VERSION, "2026-10-01");
    assert.equal(FEE_LINES.length, 3);
    assert.equal(FEE_LINES[0].kind, "seller_commission");
    assert.equal(FEE_LINES[0].rate_bps, 1000);
    assert.equal(FEE_LINES[0].basis, "seller_award");
    assert.equal(FEE_LINES[0].refundable_on_buyer_refund, false);
    assert.equal(FEE_LINES[0].tax_hook, null);
    assert.equal(FEE_LINES[1].kind, "buyer_platform_fee");
    assert.equal(FEE_LINES[1].rate_bps, 0);
    assert.equal(FEE_LINES[2].kind, "activation_fee");
    assert.equal(FEE_LINES[2].rate_bps, 0);
    assert.equal(FEE_LINES.some((line) => line.tax_hook !== null), false);
  });

  it("rounds half up in integer minor units", () => {
    assert.equal(sellerCommissionMinor(100000n), 10000n);
    assert.equal(sellerEntitlementMinor(100000n), 90000n);
    assert.equal(sellerCommissionMinor(5n), 1n);
    assert.equal(sellerCommissionMinor(4n), 0n);
    assert.equal(sellerCommissionMinor(0n), 0n);
  });

  it("does not charge commission on a buyer refund with no seller award", () => {
    assert.equal(sellerCommissionMinor(0n), 0n);
    assert.equal(sellerEntitlementMinor(0n), 0n);
  });

  it("rejects a negative or non-integer award", () => {
    assert.throws(() => sellerCommissionMinor(-1n), /nonnegative/);
    assert.throws(() => sellerCommissionMinor(100000), /nonnegative/);
  });
});
