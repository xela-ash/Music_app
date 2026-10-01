const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { formatAmount } = require("../src/money/amount");
const { exceedsCapturedFunding, refundableMinor } = require("../src/escrow/refund-rules");

describe("MVP-029 refund bounds", () => {
  it("treats 125050 with exponent 2 as 1,250.50", () => {
    assert.equal(formatAmount(125050, 2), "1,250.50");
    assert.notEqual(formatAmount(125050, 2), "125,000.50");
    assert.equal(formatAmount("125050", 2), "1,250.50");
  });

  it("keeps a refund inside captured funding and the refundable remainder", () => {
    assert.equal(exceedsCapturedFunding(125050, 0, 125050), false);
    assert.equal(exceedsCapturedFunding(125050, 0, 125051), true);
    assert.equal(exceedsCapturedFunding(0, 0, 1), true);
    assert.equal(exceedsCapturedFunding(125050, 100000, 25051), true);
    assert.equal(exceedsCapturedFunding("125050", "0", "25050"), false);
    assert.equal(refundableMinor(125050, 0, 0, 0), 125050n);
    assert.equal(refundableMinor(125050, 0, 25050, 0), 100000n);
    assert.equal(refundableMinor(125050, 0, 0, 1), 125049n);
    assert.equal(refundableMinor(125050, 125050, 0, 0), 0n);
  });
});
