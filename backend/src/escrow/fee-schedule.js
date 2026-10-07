const SCHEDULE_VERSION = "2026-10-01";
const SELLER_COMMISSION_BPS = 1000n;

const FEE_LINES = [
  {
    kind: "seller_commission",
    payer: "seller",
    beneficiary: "platform",
    basis: "seller_award",
    rate_bps: 1000,
    fixed_amount_minor: 0,
    timing: "release",
    refundable_on_buyer_refund: false,
    tax_hook: null,
    rounding_mode: "half_up",
  },
  {
    kind: "buyer_platform_fee",
    payer: "buyer",
    beneficiary: "platform",
    basis: "agreed_total",
    rate_bps: 0,
    fixed_amount_minor: 0,
    timing: "not_charged",
    refundable_on_buyer_refund: false,
    tax_hook: null,
    rounding_mode: "half_up",
  },
  {
    kind: "activation_fee",
    payer: "none",
    beneficiary: "platform",
    basis: "none",
    rate_bps: 0,
    fixed_amount_minor: 0,
    timing: "not_charged",
    refundable_on_buyer_refund: false,
    tax_hook: null,
    rounding_mode: "half_up",
  },
];

function sellerCommissionMinor(sellerAwardMinor) {
  if (typeof sellerAwardMinor !== "bigint" || sellerAwardMinor < 0n) {
    throw new Error("seller award must be a nonnegative integer minor amount");
  }
  return (sellerAwardMinor * SELLER_COMMISSION_BPS + 5000n) / 10000n;
}

function sellerEntitlementMinor(sellerAwardMinor) {
  return sellerAwardMinor - sellerCommissionMinor(sellerAwardMinor);
}

module.exports = {
  SCHEDULE_VERSION,
  FEE_LINES,
  sellerCommissionMinor,
  sellerEntitlementMinor,
};
