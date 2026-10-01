const { toMinorBigInt } = require("../money/amount");

const ENTRY_PAIRS = {
  funded: [["EXTERNAL_BUYER", "ESCROW_UNALLOCATED"]],
  allocated_to_milestone: [["ESCROW_UNALLOCATED", "ESCROW_ALLOCATION"]],
  allocation_returned: [["ESCROW_ALLOCATION", "ESCROW_UNALLOCATED"]],
  released_to_seller: [["ESCROW_ALLOCATION", "SELLER_ENTITLEMENT"]],
  platform_fee: [
    ["ESCROW_ALLOCATION", "PLATFORM_REVENUE"],
    ["EXTERNAL_BUYER", "PLATFORM_REVENUE"],
  ],
  escrow_fee: [
    ["ESCROW_ALLOCATION", "PLATFORM_REVENUE"],
    ["EXTERNAL_BUYER", "PLATFORM_REVENUE"],
  ],
  refunded_to_buyer: [
    ["ESCROW_ALLOCATION", "REFUND_IN_TRANSIT"],
    ["ESCROW_UNALLOCATED", "REFUND_IN_TRANSIT"],
  ],
  refund_paid: [["REFUND_IN_TRANSIT", "EXTERNAL_BUYER"]],
  payout_initiated: [["SELLER_ENTITLEMENT", "PAYOUT_IN_TRANSIT"]],
  payout_paid: [["PAYOUT_IN_TRANSIT", "EXTERNAL_SELLER"]],
  funding_reversed: [
    ["ESCROW_UNALLOCATED", "EXTERNAL_BUYER"],
    ["ESCROW_ALLOCATION", "EXTERNAL_BUYER"],
  ],
};

function pairAllowed(entryType, sourceAccount, destinationAccount) {
  if (sourceAccount === destinationAccount) {
    return false;
  }
  if (entryType === "adjustment") {
    return typeof sourceAccount === "string" && typeof destinationAccount === "string";
  }
  if (entryType === "chargeback") {
    return destinationAccount === "CHARGEBACK_EXPOSURE";
  }
  const pairs = ENTRY_PAIRS[entryType];
  if (!pairs) {
    return false;
  }
  return pairs.some((pair) => pair[0] === sourceAccount && pair[1] === destinationAccount);
}

function journalIsBalanced(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return false;
  }
  let currency = null;
  let debit = 0n;
  let credit = 0n;
  for (const entry of entries) {
    if (!entry || entry.sourceAccount === entry.destinationAccount) {
      return false;
    }
    let amount;
    try {
      amount = toMinorBigInt(entry.amount);
    } catch {
      return false;
    }
    if (amount <= 0n) {
      return false;
    }
    if (typeof entry.currency !== "string" || entry.currency.length === 0) {
      return false;
    }
    if (currency === null) {
      currency = entry.currency;
    }
    if (entry.currency !== currency) {
      return false;
    }
    debit += amount;
    credit += amount;
  }
  return debit === credit && debit > 0n;
}

function projectionDelta(entries) {
  const totals = { funded: 0n, released: 0n, refunded: 0n };
  for (const entry of entries) {
    const amount = toMinorBigInt(entry.amount);
    if (entry.entryType === "funded") {
      totals.funded += amount;
    }
    if (entry.entryType === "funding_reversed") {
      totals.funded -= amount;
    }
    if (
      (entry.entryType === "released_to_seller"
        || entry.entryType === "platform_fee"
        || entry.entryType === "escrow_fee")
      && entry.sourceAccount === "ESCROW_ALLOCATION"
    ) {
      totals.released += amount;
    }
    if (entry.entryType === "refunded_to_buyer" && entry.sourceAccount === "ESCROW_ALLOCATION") {
      totals.refunded += amount;
    }
  }
  return totals;
}

module.exports = {
  ENTRY_PAIRS,
  pairAllowed,
  journalIsBalanced,
  projectionDelta,
};
