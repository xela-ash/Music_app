const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { formatAmount, parseMajorToMinor } = require("../src/money/amount");

describe("minor-unit amount interpretation", () => {
  it("reads 125050 with exponent 2 as 1,250.50", () => {
    const displayed = formatAmount(125050, 2);
    assert.equal(displayed, "1,250.50");
    assert.notEqual(displayed, "125,000.50");
    assert.notEqual(displayed, "125050.50");
    assert.notEqual(displayed, "125,050");
    assert.equal(parseMajorToMinor(displayed, 2), 125050n);
    assert.equal(parseMajorToMinor("1250.50", 2), 125050n);
    assert.equal(parseMajorToMinor("125,000.50", 2), 12500050n);
    assert.equal(formatAmount(12500050, 2), "125,000.50");
  });

  it("does not use floating-point scaling", () => {
    assert.equal(formatAmount(1, 2), "0.01");
    assert.equal(parseMajorToMinor("0.10", 2), 10n);
    assert.equal(formatAmount(125050, 0), "125,050");
    assert.equal(parseMajorToMinor("125050", 0), 125050n);
  });
});
