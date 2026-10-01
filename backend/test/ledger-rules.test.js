const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { formatAmount } = require("../src/money/amount");
const { pairAllowed, journalIsBalanced, projectionDelta } = require("../src/escrow/ledger-rules");

const funded = {
  entryType: "funded",
  amount: 125050,
  sourceAccount: "EXTERNAL_BUYER",
  destinationAccount: "ESCROW_UNALLOCATED",
  currency: "INR",
};

const reversed = {
  entryType: "funding_reversed",
  amount: 125050,
  sourceAccount: "ESCROW_UNALLOCATED",
  destinationAccount: "EXTERNAL_BUYER",
  currency: "INR",
};

describe("ledger posting rules", () => {
  it("treats 125050 with exponent 2 as 1,250.50", () => {
    assert.equal(formatAmount(125050, 2), "1,250.50");
    assert.equal(formatAmount("125050", 2), "1,250.50");
    assert.notEqual(formatAmount(125050, 2), "125,000.50");
    assert.equal(formatAmount(12500050, 2), "125,000.50");
  });

  it("accepts only the Section 13.2 account pair for a funded entry", () => {
    assert.equal(pairAllowed("funded", "EXTERNAL_BUYER", "ESCROW_UNALLOCATED"), true);
    assert.equal(pairAllowed("funded", "ESCROW_UNALLOCATED", "EXTERNAL_BUYER"), false);
    assert.equal(pairAllowed("funded", "EXTERNAL_BUYER", "EXTERNAL_BUYER"), false);
    assert.equal(pairAllowed("adjustment", "EXTERNAL_BUYER", "EXTERNAL_SELLER"), true);
    assert.equal(pairAllowed("chargeback", "ESCROW_UNALLOCATED", "CHARGEBACK_EXPOSURE"), true);
    assert.equal(pairAllowed("chargeback", "ESCROW_UNALLOCATED", "EXTERNAL_BUYER"), false);
  });

  it("accepts a balanced single-currency journal and rejects an unbalanced one", () => {
    assert.equal(journalIsBalanced([funded, reversed]), true);
    assert.equal(journalIsBalanced([]), false);
    assert.equal(journalIsBalanced([{ ...funded, amount: 0 }]), false);
    assert.equal(journalIsBalanced([{ ...funded, amount: -1 }]), false);
    assert.equal(journalIsBalanced([{ ...funded, amount: 1.5 }]), false);
    assert.equal(journalIsBalanced([{ ...funded, sourceAccount: "EXTERNAL_BUYER", destinationAccount: "EXTERNAL_BUYER" }]), false);
    assert.equal(journalIsBalanced([funded, { ...reversed, currency: "USD" }]), false);
  });

  it("keeps a created escrow's funded projection at zero when the journal nets to zero", () => {
    const even = projectionDelta([funded, reversed]);
    assert.equal(even.funded, 0n);
    assert.equal(even.released, 0n);
    assert.equal(even.refunded, 0n);
    const uneven = projectionDelta([funded, { ...reversed, amount: 1 }]);
    assert.equal(uneven.funded, 125049n);
  });
});
